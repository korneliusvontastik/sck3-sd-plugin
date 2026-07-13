# SC Keybind System — How It Works

**Project:** SCK3 — Star Citizen Kommand Kontrol Kit  
**Author:** Kornelius Von Tastik | KVT Korp  
**SC Version:** 4.8 | **Updated:** 2026-07-09

For the machine implementation of all rules (key pools, modifier combos, deny lists, context groups) see `sck3/src/keybindkrafter/config.ts`.

---

## How Star Citizen Keybinds Work

SC uses CryEngine's [**DirectInput**](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee416842(v=vs.85)) layer for all keyboard input. DirectInput operates at the scan code level — it sees physical key positions, not the characters the OS produces.

```xml
<rebind input="kb1_lshift+a"/>
```

`kb1_` = keyboard device 1. Everything after is a DirectInput scan code name.

**Key consequence: all DirectInput keys work identically regardless of keyboard layout.** The character printed on the key is irrelevant. `a` on an AZERTY keyboard is still `q` to DirectInput — a different label, same scan code.

- Number row `1`–`0` → works on AZERTY (user presses `&` key, DirectInput sends DIK_1)
- Letters `a`–`z` → works everywhere (AZERTY Q key = DirectInput DIK_A = SC key `a`)
- Punctuation → works everywhere via scan codes

**The XML is fully portable across all keyboard layouts.**

### The one exception: ralt (AltGr)

`ralt` is intercepted at the hardware/OS level *before* DirectInput. On European keyboards (AZERTY, QWERTZ, Nordic, UK), pressing right Alt sends a simultaneous `lctrl + ralt` signal to the OS — this is AltGr. Windows processes it before any application sees it.

**`ralt` is banned as a modifier.** It is the only key where the layout genuinely matters.

---

## How Elgato Stream Deck Fits In

The Stream Deck plugin sends key combos to the OS via standard keyboard simulation. Because SC reads DirectInput scan codes, Stream Deck can trigger any valid SC keybind as long as it sends the correct scan code sequence. This means:

- Stream Deck buttons can trigger any `kb1_` bind in SC's XML
- The plugin generates and writes a complete `actionmaps.xml` with every SC action mapped
- On button press, the SD button triggers the bound combo — SC receives it as a keyboard input

---

## Terminology: CIG vs KVT Engine

| Term | Who uses it | What it means | Example |
|---|---|---|---|
| *UICategory* | CIG | Top-level tab in SC's controls UI. Display label only — no gameplay logic. | `@ui_CCSpaceFlight` → "Space Flight" tab |
| **actionmap** | CIG + engine (`mapName`) | A named group of related actions. SC loads/unloads whole actionmaps by game state. | `spaceship_movement`, `player` |
| **action** | CIG + engine (`action.name`) | A single bindable input event inside one actionmap. | `v_pitch`, `moveleft` |
| **context group** | KVT engine only | Our collision domain. Defines which actionmaps are active simultaneously. Two actions in the same context group cannot share a combo. Not related to CIG's UICategory. | `spaceship_vehicles`, `foot`, `ui` |

The context group is the core concept behind the generator: SC loads multiple actionmaps at once depending on game state (flying a ship loads ~25 actionmaps simultaneously). Actions in the same context group must have unique combos. Actions in *different* context groups can safely share a combo — they are never active at the same time.

---

## Axis Actions Are Never Auto-Filled

Ship pitch/yaw/roll/strafe and FPS mouse-look are **analog axes**, not key presses — by default they're driven by the mouse or a joystick/gamepad stick, continuously, not by a discrete `kb1_` combo. A Stream Deck button press can't replace that (it's a single digital pulse, not a smoothly varying value), and generating a keyboard bind for one of these actions adds an unwanted `kb1_` override on top of the working analog default — this broke default mouse flight/look in the field and is why this rule exists.

CIG models each analog control as **two separate actions sharing an `optionGroup`**: a digital/HOTAS variant and a dedicated `_mouse` variant that carries the real axis token, e.g.:

```xml
<action name="v_pitch"       gamepad="thumbry" joystick="y" optionGroup="flight_move_pitch"/>
<action name="v_pitch_mouse" mouse="maxis_y"                optionGroup="flight_move_pitch"/>
```

Neither has a `keyboard=` attribute — CIG never gave them one. Naively treating "no keyboard default" as "needs a generated one" is exactly the bug: it stomps `v_pitch_mouse`'s mouse axis with a synthetic key press.

**Detection (`isAxisBinding()` in `config.ts`):** an action's own `mouse`/`joystick`/`gamepad` attribute is checked against CIG's known analog tokens — mouse `maxis_x`/`maxis_y`/`maxis_z`, bare joystick axis names (`x`, `y`, `z`, `rotx`, `roty`, `rotz`, `slider*`), and gamepad thumbstick axes (`thumblx`, `thumbly`, `thumbrx`, `thumbry` — bare `x`/`y` are face *buttons*, not axes, so those are deliberately excluded). This also inherits across `optionGroup` siblings (`parser.ts`), so a sibling with a currently-blank device slot (e.g. `v_roll_mouse`, or the ground-vehicle `v_pitch_mouse`) is still recognized as an axis action rather than looking like an ordinary unbound one.

**The one guard on that inheritance:** if the sibling itself declares `onPress`/`onRelease` — CIG's own signal for "this is a discrete digital control" — it never inherits the axis flag, no matter what else is in its `optionGroup`. This matters because CIG isn't fully consistent: pitch/yaw/roll keep their digital nudge actions (`v_pitch_up`/`v_pitch_down`, `v_yaw_left`/`v_yaw_right`) *outside* the axis `optionGroup` entirely, but strafe's `v_strafe_up`/`v_strafe_down` (real CIG defaults: `space`/`lctrl`) sit *inside* the same `optionGroup` as the analog `v_strafe_vertical`. Without the guard, those two — despite being ordinary, already-keyboard-bound buttons — would incorrectly inherit "axis" from their sibling.

**Where it's enforced:** `parser.ts` computes `isAxisAction: boolean` once per `SCAction`. `generator.ts`'s unbound filter and `validator.ts`'s coverage check both skip anything flagged, so axis actions are never assigned a combo and never reported as a coverage gap.

**Test coverage:** `parser.test.ts`/`generator.test.ts` cover this against the small committed fixture (portable, runs in CI). `parser.real.test.ts` opportunistically re-runs the same assertions against the *entire* real `defaultProfile.xml` (~1100 actions) when a dev has extracted one locally via `scripts/extract-default-profile.ts` — CIG's data is proprietary and never committed (see `.gitignore`), so this suite skips itself cleanly when the file isn't present.

---

## CIG Actions With More Than One Default Key (`reservedCombos`)

A handful of CIG default actions declare more than one `<inputdata>` alternate for the same
keyboard bind, e.g.:

```xml
<action name="focus_on_chat_textinput" ...>
  <keyboard><inputdata input="enter"/><inputdata input="np_enter"/></keyboard>
</action>
```

Both `enter` and `np_enter` fire this action in-game — CIG treats them as interchangeable. Exactly
three real actions use this pattern: `flashui_return` and `focus_on_chat_textinput` (actionmap
`default`) and `ui_textfield_enter` (actionmap `ui_textfield`).

`parser.ts` keeps the *first* `<inputdata>` as the action's real, assignable `Binding` — unchanged
from before — but now also records every remaining alternate in `SCAction.reservedCombos`. This
field is occupancy-only: it's never assigned to another action, never serialized, never shown as
"the" bind for that action. The generator (`buildOccupancyFromExisting` in `generator.ts`) and both
validator passes (`validator.ts`) mark every `reservedCombos` entry as occupied in the same context
groups as the action's primary bind, so a later action can never be handed a key that's secretly
already wired to something else.

This is why `np_enter` is absent from `FORBIDDEN_KEYS` (config.ts) despite bare `enter` being banned
there outright: `default` is cross-listed into every context group (see below), so once
`reservedCombos` correctly flags `np_enter` as occupied for `focus_on_chat_textinput`, it's
unavailable everywhere the generator runs — without a static ban that would also block it in some
hypothetical future profile where CIG drops the alternate.

---

## Assignment Logic (overview)

The generator iterates every unbound action and finds the first available combo:

```
for each unbound action:
  for each candidate key (Tier 1 letters → Tier 7 arrows):
    for each modifier combo (none → P32):
      skip if key is forbidden
      skip if combo is on the deny list
      skip if combo is occupied in any context group this action belongs to
      skip if combo is reserved (a CIG default's secondary keyboard alternate) in any context group this action belongs to
      → assign and mark occupied across all relevant groups
```

Simpler combos (bare letters, low tiers) are assigned first, producing readable binds. Context isolation means the same combo (e.g. `f1`) can appear in both `spaceship_vehicles` and `foot` actions — they never conflict.

All specific values — key tiers, modifier priority order, forbidden keys, deny list, context group membership — live in `sck3/src/keybindkrafter/config.ts`.
