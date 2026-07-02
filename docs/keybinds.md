# SC Keybind System — How It Works

**Project:** SCK3 — Star Citizen Kommand Kontrol Kit  
**Author:** Kornelius Von Tastik | KVT Korp  
**SC Version:** 4.8 | **Updated:** 2026-06-30

For the machine implementation of all rules (key pools, modifier combos, deny lists, context groups) see `sck3/src/keybindkrafter/config.ts`.

---

## How Star Citizen Keybinds Work

SC uses CryEngine's **DirectInput** layer for all keyboard input. DirectInput operates at the scan code level — it sees physical key positions, not the characters the OS produces.

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

## Assignment Logic (overview)

The generator iterates every unbound action and finds the first available combo:

```
for each unbound action:
  for each candidate key (Tier 1 letters → Tier 7 arrows):
    for each modifier combo (none → P32):
      skip if key is forbidden
      skip if combo is on the deny list
      skip if combo is occupied in any context group this action belongs to
      → assign and mark occupied across all relevant groups
```

Simpler combos (bare letters, low tiers) are assigned first, producing readable binds. Context isolation means the same combo (e.g. `f1`) can appear in both `spaceship_vehicles` and `foot` actions — they never conflict.

All specific values — key tiers, modifier priority order, forbidden keys, deny list, context group membership — live in `sck3/src/keybindkrafter/config.ts`.
