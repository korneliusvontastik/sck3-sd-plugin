# Architecture — How This Whole Repo Works

**Audience:** you, six months from now, having forgotten everything. No prior Stream Deck or Star Citizen modding knowledge assumed.

**Companion docs:** `docs/keybinds.md` (the Star Citizen keybind system explained), `docs/sc-runtime.md` (finding the game install files, channels, and writing output back), `docs/dependencies.md` (what's in `package.json`), `plan.md` (roadmap/status for development).

---

### Keybind Auto-Fill — the main key

## 1. The one-sentence version

You press a Stream Deck button → the plugin reads Star Citizen's key-binding files → fills in every action that has no keybind yet → writes the result back so the game picks it up.

---

## 2. The big picture

```
                     ┌─────────────────────────┐
                     │   Physical Stream Deck   │
                     │   (or SD Mobile app)     │
                     └────────────┬─────────────┘
                                  │ button press
                                  ▼
                     ┌─────────────────────────┐
                     │   com.kvt.sck3.sdPlugin  │   ← the "shipped" folder
                     │   (built by rollup)      │      Elgato actually runs this
                     └────────────┬─────────────┘
                                  │ runs
                                  ▼
                     ┌─────────────────────────┐
                     │   sck3/src/  (TypeScript)│   ← you edit THIS
                     │   plugin.ts → actions/   │
                     │   → keybindkrafter/      │
                     └────────────┬─────────────┘
                                  │ reads/writes
                                  ▼
                     ┌─────────────────────────┐
                     │   Star Citizen install   │
                     │   Data.p4k, actionmaps.xml│
                     └─────────────────────────┘
```

**Golden rule of this repo:** nothing outside `sck3/` ships. `sck3/` is the entire Elgato Stream Deck deliverable - the plugin. Everything else (`docs/`, `reference/`, `plan.md`) is scaffolding for you, the developer.

---

## 3. Two worlds: "source" vs. "built"

This trips people up the most, so it gets its own section. There are really **two separate relationships** here — don't read them as one diagram.

**Relationship 1 — compiled (many files → one file, one-way, never hand-edit the output):**

```
sck3/src/                              sck3/com.kvt.sck3.sdPlugin/bin/
  plugin.ts                 ┐
  actions/keybind-auto-fill.ts │  rollup    plugin.js    ← generated. Never hand-edit.
  keybindkrafter/*.ts       ├──bundles──▶ package.json ← generated ({"type":"module"})
  rendering/keyLabel.ts     ┘
  (TypeScript, human-edited)              (JavaScript, machine-generated)
```

**Relationship 2 — hand-authored directly inside the bundle (no `src/` equivalent at all):**

```
sck3/com.kvt.sck3.sdPlugin/
  manifest.json   ← you edit this directly, here
  imgs/           ← you edit these directly, here
  fonts/          ← you edit these directly, here
  ui/*.html       ← you edit these directly, here
```

- **`sck3/src/`** — you write and edit TypeScript here. This is "the code." Nothing in here ships by itself — it only matters via what rollup produces from it.
- **`sck3/com.kvt.sck3.sdPlugin/`** — this is the actual plugin folder Stream Deck loads (per Elgato's SDK, a plugin is a folder ending in `.sdPlugin`). Only `bin/` is generated. `manifest.json`, `imgs/`, `fonts/`, and `ui/` are **not** compiled from anything — they live here permanently and you edit them in place.
- **Rollup** is the bridge for relationship 1 only: it reads `src/plugin.ts` (and everything it imports) and bundles it all into one file, `bin/plugin.js`. Run `npm run watch` and this happens automatically every time you save.

That's what `plugin.js` is: **the compiled output of your entire `src/` tree, squashed into one JS file, which is what Elgato's `manifest.json` points at (`"CodePath": "bin/plugin.js"`) and what actually executes.**

---

## 4. Repo folder map

```
sck3-sd-plugin/                       ← repo root (NOT shipped)
│
├── sck3/                             ← THE PLUGIN (this ships)
│   ├── com.kvt.sck3.sdPlugin/        ← Elgato bundle
│   │   ├── manifest.json             ← plugin's ID card (UUID, actions list, icons)
│   │   ├── bin/plugin.js             ← compiled output (don't hand-edit)
│   │   ├── ui/keybind-auto-fill.html ← the settings panel UI
│   │   ├── imgs/                     ← icons (plugin + per-action)
│   │   ├── fonts/                    ← bundled OSD monospace font for key labels
│   │   └── logs/                     ← runtime logs (auto-created)
│   │
│   ├── src/                          ← TypeScript source
│   │   ├── plugin.ts                 ← entry point
│   │   ├── actions/                  ← thin Stream-Deck-facing wrappers
│   │   ├── keybindkrafter/           ← the actual engine (no SD imports)
│   │   └── rendering/                ← draws text/icons onto key faces
│   │
│   ├── tests/keybindkrafter/
│   │   ├── *.test.ts                 ← Vitest unit tests
│   │   └── fixtures/                 ← small, tracked XML fixtures used by tests (and scripts/export-csv.ts's
│   │                                    default): actionmaps.xml (virgin/empty template), defaultProfile.sample.xml
│   │                                    (a genuine 2-actionmap/248-action excerpt of CIG's data — see below)
│   ├── package.json                  ← scripts + dependencies
│   ├── rollup.config.mjs             ← bundler config
│   └── tsconfig.json
│
├── docs/                             ← human documentation (this file lives here, NOT shipped)
├── reference/                        ← NOT shipped; only holds defaultProfile.xml (gitignored, NOT tracked) —
│                                        CIG's full ~1,100-action proprietary extract, kept locally so
│                                        scripts/export-csv.ts can generate a complete keymap CSV. The small,
│                                        genuinely public-safe fixtures tests need live in sck3/tests/.../fixtures/
│                                        instead — see above.
├── scripts/                          ← standalone dev tooling, own package.json (NOT shipped)
├── assets/branding/                  ← README/marketplace images: banner, logos (NOT shipped)
├── .github/                          ← issue templates, PR template, CI workflow, FUNDING.yml (NOT shipped)
├── plan.md                           ← roadmap / status tracker, local-only, gitignored (NOT shipped)
├── README.md                         ← GitHub-facing project overview (NOT shipped)
├── LICENSE                           ← MIT license (NOT shipped)
├── CHANGELOG.md                      ← release history (NOT shipped)
└── ACKNOWLEDGEMENTS.md               ← credit to prior Star Citizen Stream Deck creators and community (NOT shipped)
```

Everything below `sck3/` in this tree is repo/GitHub-facing scaffolding only — issue templates, CI, funding config, branding images, docs — never part of the `sck3/com.kvt.sck3.sdPlugin` bundle that actually ships to Stream Deck.

---

## 5. What problem is this plugin actually solving?

# What problem is Keybind Auto-Fill actually solving?

Star Citizen has **no public API**. The only way any Stream Deck plugin can control the game is by faking keyboard key-presses that match whatever the player has bound in-game.

That creates a chore: to make "press this Stream Deck button = "Open All Doors" on your ship," you first have to go into Star Citizen's options and manually bind `v_open_all_doors` or whatever to a key or key combo, one at a time, for 1,000+ actions. CIG is not shipping many pre-binded actions and most players never bind more than a handful. This leads to a lack of control in game and tedious work setting these up.

**Keybind Auto-Fill's job:** look at all ~1,100 possible SC actions, see which ones the player has already bound (by CIG default or by the user), and auto-generate sensible, collision-free keybinds for every action that's still empty — so the *entire* action list becomes keyboard-triggerable, and therefore Stream-Deck-triggerable.

```
   defaultProfile.xml          actionmaps.xml
   (CIG's master list of         (player's current
    ~1,100 possible actions)      binds if any — mostly/usually empty)
            │                          │
            └──────────┬───────────────┘
                        ▼
              ┌───────────────────┐
              │   KeybindKrafter   │   fills every gap with a
              │   engine           │   free, rule-abiding key combo
              └─────────┬─────────┘
                        ▼
        ┌───────────────┴──────────────────────────────┐
        ▼                                              ▼
  Custom profile XML                            actionmaps.xml
  (always written,                              (only overwritten if
   user imports it via                          SC isn't running —
   Settings > Keybindings > Advanced)           takes effect on next launch)
```

---

## 6. The pipeline, end to end

## Keybind Auto-Fill — Button Press

This is what happens the instant you press the "Keybind Auto-Fill" button on the Stream Deck. It's a 5-phase pipeline, all orchestrated by `sck3/src/actions/keybind-auto-fill.ts`.

```
①  DISCOVER  →  ②  EXTRACT   →  ③  READ    →  ④  GENERATE   →  ⑤  WRITE
   find the       pull SC's       read the       fill every        save
   SC install      full action    player's        gap with a        the
   on disk         list out of    current         free, legal       result
                   the game's     keybinds        key combo         to disk
                   encrypted
                   archive
```

| Phase | What happens | Which file does it |
|---|---|---|
| ① Discover | Find where Star Citizen is installed (tries RSI launcher logs, launcher settings, registry, common paths) | `keybindkrafter/pathsfinder.ts` |
| ② Extract | Pull `defaultProfile.xml` (CIG's ~1,100-action master list) live out of `Data.p4k`, decode CIG's proprietary binary XML format | `keybindkrafter/p4k.ts` + `keybindkrafter/cryxml.ts` |
| ③ Read | Read the player's `actionmaps.xml` off disk — whatever they've already bound by hand | plain `fs.readFileSync`, then `keybindkrafter/parser.ts` |
| ④ Generate | Merge CIG defaults + player binds → find every unbound action → assign it a free, rule-legal key combo | `keybindkrafter/parser.ts`, `generator.ts`, `validator.ts` |
| ⑤ Write | Always write a new "custom profile" XML (safe to import anytime). If SC isn't currently running, *also* overwrite `actionmaps.xml` directly so it's active on next launch | `keybindkrafter/serializer.ts` |

While this runs, the key face itself shows live progress text — `SCAN`, `EXTRACT`, `READ`, `GENERATE`, `WRITE`, one per phase — rendered white-on-transparent by `rendering/keyLabel.ts` (phase labels defined in `actions/keybind-auto-fill-icons.ts`'s `RUN_PHASES`). It finishes with a persistent `COMPLETE` / `WARNING` (or conflict count) / `FAILED` text face in green/amber/red, also built by `keybind-auto-fill-icons.ts`. The Property Inspector — the settings panel shown in the Stream Deck app when you select the button (see §9) — mirrors the same phase info in more detail.

---

## 7. File-by-file: `sck3/src/`

### `plugin.ts` — the entry point

The very first code that runs. Its whole job: register the three actions this plugin has, then open the connection to the physical Stream Deck.

```
plugin.ts
  ├── register KeybindAutoFill   (UUID: com.kvt.sck3.keybindautofill)
  ├── register ChannelIndicator  (UUID: com.kvt.sck3.channelindicator)
  ├── register OpenLogs          (UUID: com.kvt.sck3.openlogs)
  └── streamDeck.connect()       ← opens the WebSocket to the device
```

### `actions/` — the Stream-Deck-facing layer

Each file here is a thin "glue" class. It knows about Stream Deck events (button pressed, settings changed, etc.) but hands the actual work off to `keybindkrafter/`.

- **`keybind-auto-fill.ts`** — the main button. Handles:
  - `onWillAppear` — shows the last run's result (green/amber/red) when the button becomes visible
  - `onKeyDown` — **this is the big one** — runs the full 5-phase pipeline described above
  - `onDidReceiveSettings` / `onPropertyInspectorDidAppear` / `onSendToPlugin` — keeps the settings panel in sync (toggling "auto-replace," opening the logs folder, etc.)

- **`channel-indicator.ts`** — a second button that shows which SC "channel" (LIVE / PTU / EPTU / HOTFIX / any other name CIG uses — think of these as SC's release tracks: stable vs. test builds) is currently active, and lets you switch it. The key face renders `NAME` + the dotted build version split across lines (e.g. `LIVE` / `4.8.` / `184.` / `2887`) via `renderKeyLabel()`, colored per channel (green LIVE, yellow PTU, orange EPTU, red HOTFIX, purple for anything else — e.g. a bare `PREVIEW`). `onWillAppear` renders whatever channel is currently active (`src/global-channel.ts`, plugin-wide, not per-button); `onKeyDown` cycles to the next discovered install and switches it. Its Property Inspector (`ui/channel-indicator.html`) mirrors the same state: a dot + colored `NAME VERSION` dropdown to jump directly to any discovered channel, a discovered-channels list (path, version, last-checked time), and a brief "✓ Switched to X" confirmation banner. `keybind-auto-fill.html`'s own read-only channel row shares the same dot-color/label logic via `ui/channel-widget.js`/`.css` so the two Property Inspectors can't drift out of sync with each other.

- **`keybind-auto-fill-icons.ts`** — defines the 5 phase labels (`RUN_PHASES`) shown during a run, and builds the "done" key faces: green `COMPLETE`, amber `WARNING`/conflict-count, red `FAILED` — all rendered as text via `renderKeyLabel`, not icons/emoji.

- **`open-logs.ts`** — third, standalone button (UUID `com.kvt.sck3.openlogs`) that opens the plugin's `logs/` folder in Windows Explorer on press, and mirrors a tail of the log file to its own Property Inspector (`ui/open-logs.html`). Shares `../logs.js` with `keybind-auto-fill.ts` rather than duplicating log-path/open logic.

### `logs.ts` — shared log-file helpers

Lives directly under `sck3/src/` (not inside `actions/` or `keybindkrafter/`) because it's used by more than one action: `LOG_PATH`/`LOG_DIR` (both point at `logs/` next to the compiled plugin), `tailPluginLog()` (last N lines of the plugin's own log), and `openPath()` (opens a file/folder in Explorer via `cmd /c start`, using an argv array rather than a shell string so paths can't break out into arbitrary command execution). Both `keybind-auto-fill.ts` and `open-logs.ts` import from here instead of duplicating this logic.

### `keybindkrafter/` — the engine (the actual brains)

This folder has **zero imports from the Stream Deck SDK** — by design. It's pure TypeScript that could theoretically run in a CLI, a test, or a totally different app. `actions/keybind-auto-fill.ts` is the only thing that calls into it today (other actions may reuse this same engine in the future).

```
keybindkrafter/
  index.ts        ← barrel file: re-exports everything below
  types.ts        ← the shapes of the data (SCAction, Binding, etc.)
  config.ts       ← the RULEBOOK: which keys are allowed, in what order
  pathsfinder.ts  ← finds the SC install on disk
  p4k.ts          ← reads Star Citizen's giant encrypted archive file
  cryxml.ts       ← decodes CIG's custom binary XML format
  parser.ts       ← turns raw XML into a clean list of SCAction objects
  generator.ts    ← the algorithm that fills in missing keybinds
  validator.ts    ← checks the result for mistakes/collisions
  serializer.ts   ← turns the result back into XML files
  run-result.ts   ← the "receipt" type describing what a run did
  report.ts       ← formats a RunResult into a plain-text report file
```

Let's go one at a time.

#### `types.ts` — the vocabulary

Defines the shapes everything else speaks in. The most important one:

```typescript
SCAction {
  name            // e.g. "v_pitch"
  label, description
  mapName         // which actionmap it belongs to, e.g. "spaceship_movement"
  activationMode  // press / hold / toggle / double-tap / etc.
  bindings: { keyboard, mouse, joystick, gamepad }
}
```

Every other file in this folder ultimately works with arrays of `SCAction`.

#### `config.ts` — the rulebook (single source of truth)

If `docs/keybinds.md` describes the rules in prose, this file *is* the rules, in code. Nothing about key priority or forbidden combos should live anywhere else.

- **`CANDIDATE_KEYS`** — ~76 keys, grouped into 7 "tiers" (letters first, then numbers, punctuation, function keys, numpad, nav cluster, arrows). Tier 1 gets tried before tier 7 — this is why generated binds tend to be short and memorable.
- **`MODIFIER_PRIORITY`** — 32 modifier combinations (nothing → shift → ctrl → ctrl+shift → … up to all 5 modifiers stacked), tried in that order.
- **`FORBIDDEN_KEYS`** — keys that can never be a main key (space, tab, enter, `ralt`, F13–F24, etc.)
- **`DENY_COMBOS`** — specific combos that are always off-limits (e.g. `lalt+f4` closes windows, `lctrl+lalt+delete` is a Windows security combo).
- **`CONTEXT_GROUPS`** — the cleverest part. See section 8 below.

#### `pathsfinder.ts` — "where even is Star Citizen?"

Runs a 4-step fallback chain to find the game install, cheapest/most-reliable first:

```
1. RSI Launcher's own log file       (most reliable — it just launched the game)
2. RSI Launcher's settings.json      (where the user told it to install things)
3. Windows Registry uninstall entry  (may not exist)
4. Common hardcoded install paths    (last resort guess)
   ↓ (all fail)
   throw a clear error, or set SCK3_SC_ROOT env var to skip discovery entirely
```

Also exposes `isStarCitizenRunning()` (asks Windows via PowerShell, "is `StarCitizen.exe` running?"), `listScInstalls()` (finds *every* installed channel — LIVE, PTU, etc. — for the Channel Indicator button), and `resolveActiveChannelPaths(activeChannel)` (pure fallback rule: requested channel → first discovered install → `discoverScPaths()`). Full details in `docs/sc-runtime.md`.

Which channel is "active" is plugin-wide state, not something either action stores itself — see `src/global-channel.ts` below.

### `global-channel.ts` — the plugin-wide active channel

Sits directly under `sck3/src/` (like `logs.ts`) since it's shared by more than one action. Persists the active channel via the Stream Deck SDK's *global* settings (`getGlobalSettings()`/`setGlobalSettings()`, unlike per-action settings) so the choice survives a plugin restart — but does **not** rely on Stream Deck's `didReceiveGlobalSettings` broadcast to keep things in sync at runtime; Elgato's SDK only documents that event as guaranteed for `getGlobalSettings()`, not for a plugin's own `setGlobalSettings()` echoing back to itself; depending on it left switching silently "stuck" the first time this was tried. Instead:

- `setActiveChannel()` updates an in-memory cache immediately (so every subsequent `getActiveChannel()` call in the process — including the very next key-cycle calculation — sees the new value right away) and notifies a plain in-process `onActiveChannelChanged()` subscriber list, since every action here runs in the same Node process anyway.
- `channel-indicator.ts` owns the switch itself, so its own key face/PI update inline, synchronously with the switch — no listener needed for its own actions.
- `keybind-auto-fill.ts` subscribes via `onActiveChannelChanged()` purely to live-refresh its own Property Inspector *if already open* when the channel changes elsewhere (e.g. a physical Channel Indicator key-press while Keybind Auto-Fill's PI happens to be the one on screen); otherwise it just picks up the new channel next time it reads it (`resolveActivePaths()`), since the cache is shared process-wide.

#### `p4k.ts` — reading a ~150GB encrypted zip file

Star Citizen ships almost all its game data inside one giant file, `Data.p4k`, which is basically a ZIP file with some non-standard quirks and CIG-specific encryption. This file is a **hand-written reader** (no third-party zip library — none of them tolerate CIG's quirks) that can pull out *one specific file* without reading the other 150GB.

```
Data.p4k (huge file)
  ...
  [thousands of entries]
  ...
  Data/Libs/Config/defaultProfile.xml   ← the one entry we actually want
  ...
  [End Of Central Directory record]     ← reader starts HERE, scans backward
```

It jumps to the end of the file, finds the "index" (Central Directory), locates just the one entry we want (`defaultProfile.xml`), and decompresses only that. It handles 4 compression flavors CIG uses, including their custom "method 100" which is ZStd compression optionally wrapped in AES encryption.

#### `cryxml.ts` — decoding CIG's binary XML

Even after you extract `defaultProfile.xml` from the archive, it isn't plain text XML — it's CryEngine's compact binary format ("CryXmlB"). This file walks that binary structure (a table of element names, a table of attributes, a table of strings) and rebuilds normal, readable XML from it.

#### `parser.ts` — XML → clean data

Takes the two raw XML sources and merges them into one clean list:

```
defaultProfile.xml (CIG's ~1,100 actions)
         +
actionmaps.xml (player's own binds, if any)
         ↓
   parseBindings()
         ↓
   flattenActions()
         ↓
    SCAction[]   ← one flat array, ready for the generator
```

Player binds always win over CIG defaults where both exist; if the player explicitly cleared a bind, that's respected too (not treated as "still has the CIG default").

#### `generator.ts` — the fill-in-the-gaps algorithm

For every `SCAction` that still has no keyboard bind:

```
for each unbound action:
  for each modifier combo (none → shift → ... → all 5, in priority order):
    for each candidate key (letters → numbers → punctuation → F-keys → ...):
      is this key forbidden?              → skip
      is this combo on the deny list?      → skip
      is this combo already taken in any   → skip
        context group this action is in?
      → otherwise: assign it, mark it taken, move to next action
```

Simplicity wins — the loop order means letters-with-no-modifier get tried before, say, `ctrl+shift+f9`, so generated binds tend to be clean and memorable.

#### `validator.ts` — the safety net

Runs after generation to double-check the work:
- Did every action end up with a bind? (coverage)
- Any two actions sharing a bind in the same context group? (collision — an error)
- Any bind using `rshift`/`rctrl`? (flagged, not blocked — some hardware handles these keys oddly, so it's worth the player testing manually)
- Produces a stats summary (total actions, how many came from CIG, from the player, freshly generated, still unbound)

#### `serializer.ts` — data → XML again

The mirror image of `parser.ts`. Builds the two output files:
1. **Custom profile XML** — a complete, standalone profile the player can import anytime via Options > Keybindings > Load from file. Always written, regardless of game state.
2. **Merged `actionmaps.xml`** — takes the player's *original* file and surgically replaces only the keyboard binds, leaving joystick/gamepad/mouse binds and all other settings untouched. Only written if Star Citizen isn't currently running (the game holds a lock on this file while it's open).

#### `run-result.ts` — the receipt

A plain data type (`RunResult`) describing what a single button-press did: status (ok/warn/error), timestamps, which channel, which phases completed, 5 file events (defaultProfile extracted, actionmaps read, custom profile written, actionmaps overwritten, report written — each with a timestamp+path), the validation report, and how many binds got generated. This is what gets saved into the button's settings and shown in the Property Inspector.

#### `report.ts` — the full write-up

Formats a `RunResult` into a plain-text report (`formatReport()`) — channel, status, counts, and the full validation issue list. Written to `logs/` (not the SC mappings folder) on every run, success or failure, since the Property Inspector's report box is too small to read a large conflict list comfortably; the PI's "Open report" button opens this file directly.

### `rendering/keyLabel.ts` — drawing on the key face

Stream Deck keys are just small images. This file takes a short string (like "③/5 read…") and renders it as an SVG — auto-shrinking the font size if the text is too long to fit — using a bundled monospace font, then returns it as a data URI the SDK can display directly on the button.

---

## 8. The trickiest concept: Context Groups

This is the one idea in the whole codebase worth slowing down for.

Star Citizen doesn't have one global list of "all keybinds are unique." Instead, it loads a *bunch* of actionmaps simultaneously depending on what you're doing:

- Sitting in a ship cockpit → ~25 actionmaps active at once (movement, weapons, targeting, radar...)
- Walking around on foot → ~9 actionmaps active (movement, interaction, inventory...)
- Sitting in a UI menu → ~7 actionmaps active

**Two actions only conflict if they can ever be active at the same time.** So the engine defines "context groups" — `spaceship_vehicles`, `foot`, `ui` — and only checks for collisions *within* a group.

This isn't hypothetical — CIG's own `defaultProfile.xml` already does exactly this. The `spaceship_movement` actionmap and the `player` (on-foot) actionmap both default to plain `w`/`a`/`s`/`d`:

```
   actionmap: spaceship_movement      actionmap: player (on-foot)
   ┌───────────────────────────┐      ┌───────────────────────────┐
   │  v_strafe_forward → w     │      │  moveforward → w          │  ← same keys!
   │  v_strafe_left    → a     │      │  moveleft    → a          │     totally fine,
   │  v_strafe_back    → s     │      │  moveback    → s          │     these context
   │  v_strafe_right   → d     │      │  moveright   → d          │     groups
   └───────────────────────────┘      └───────────────────────────┘     never overlap
```

You'll never be flying a ship *and* walking on foot at the same instant, so `w` can safely mean "strafe forward" in one context and "move forward" in the other. This is what lets the generator assign short, simple keys to *far* more actions than a naive "everything must be globally unique" approach ever could.

---

## 9. The Property Inspector (settings panel)

**This is not a physical-device gesture.** There is no long-press on the hardware Stream Deck that opens anything — a physical key only ever fires `onKeyDown` (section 6/7). The Property Inspector is a piece of the **Stream Deck desktop app's UI**: click the button's tile in the app's grid to select it, and the app opens `sck3/com.kvt.sck3.sdPlugin/ui/keybind-auto-fill.html` in a panel alongside the grid. Per Elgato's own docs, `onPropertyInspectorDidAppear` fires "when the user selected an action in the Stream Deck application" — selection in the software, not a press on the device.

`keybind-auto-fill.html` is a plain HTML/JS file (no framework). Once the app opens it, it talks to the running plugin over a WebSocket the SDK sets up automatically:

```
   keybind-auto-fill.ts (plugin side)  keybind-auto-fill.html (UI side)
   ┌─────────────────────────┐         ┌─────────────────────────┐
   │                         │  push   │                         │
   │  sendToPropertyInspector├────────▶│  "here's current state" │
   │                         │         │  "here's live progress" │
   │                         │         │                         │
   │      onSendToPlugin     │◀────────┤  sendToPlugin           │
   │                         │  pull   │  "toggle auto-replace"  │
   │                         │         │  "open the logs folder" │
   └─────────────────────────┘         └─────────────────────────┘
```

`keybind-auto-fill.ts` reacts to two lifecycle events tied to this panel (see `sck3/src/actions/keybind-auto-fill.ts`):
- `onPropertyInspectorDidAppear` — fires the moment the panel opens; the plugin immediately pushes the last-known state (`pushToPropertyInspector`) so the UI isn't blank.
- `onSendToPlugin` — fires when the UI sends a message back (`setAutoReplace`, `openLogs`); the plugin acts on it and persists via `ev.action.setSettings`.

While a run is in progress, every phase transition (`enterPhase` in `onKeyDown`) also pushes a `type: "phase"` message to the panel, so if it happens to be open while you press the physical key, it updates live instead of just showing the final result.

It shows: the active SC channel, a table of the 5 file events with timestamps (including an "Open report" button once the run has written one), a stats grid, the full validation report (errors/warnings/info), a tail of the raw log file, and the "auto-replace actionmaps.xml" toggle.

---

## 10. Tests (`sck3/tests/keybindkrafter/`)

Each engine file above has a matching test:

| Test file | Proves |
|---|---|
| `parser.test.ts` | Parsing `defaultProfile.xml` + `actionmaps.xml` produces a sane, flattened action list; user binds correctly override CIG defaults |
| `generator.test.ts` | Every unbound action gets a bind; no two actions in the same context group ever collide; denied combos never appear |
| `p4k.test.ts` | The custom ZIP64 reader correctly extracts a known entry from a test archive and fails loudly on bad input |
| `cryxml.test.ts` | The binary XML decoder correctly rebuilds XML from known CryXmlB byte sequences |
| `pathsfinder.test.ts` | The 4-step discovery chain falls through correctly, and the `SCK3_SC_ROOT` override works |

Run them with `npm run test` (from inside `sck3/`).

---

## 11. Build tooling quick reference

| Command | What it does |
|---|---|
| `npm install` | Downloads everything listed in `package.json` into `node_modules/` |
| `npm run watch` | Rollup rebuilds `bin/plugin.js` on every save, then auto-restarts the plugin on your Stream Deck |
| `npm run build` | One-shot production bundle (minified via terser) |
| `npm run test` | Runs all Vitest tests once |
| `streamdeck link` | Tells the Stream Deck app where this `.sdPlugin` folder lives, for local testing |
| `streamdeck restart com.kvt.sck3` | Force-reloads the plugin without unplugging the device |
| `streamdeck validate` | Checks the manifest/folder structure is valid before packaging |
| `npm run pack` | Builds, strips `logs/`, then produces the distributable `.streamDeckPlugin` — use this, not raw `streamdeck pack` (see §12) |

See `docs/dependencies.md` for what each package in `package.json` actually is.

---

## 12. Distribution — what actually gets submitted/shared

`npm run pack` (wraps `streamdeck pack`) zips `com.kvt.sck3.sdPlugin/` into one file: **`com.kvt.sck3.streamDeckPlugin`**. That file *is* the deliverable, in both cases below.

- **Sharing directly** (beta testers, the SCK3 community): just hand out the `.streamDeckPlugin` file (GitHub Release, Discord, etc.) — double-clicking it opens Stream Deck's install prompt, no Marketplace involvement.
- **Marketplace submission**: create/use a Maker account via Elgato's developer portal (linked from the Getting Started doc), then upload the same `.streamDeckPlugin` file through the submission flow, filling in Marketplace-specific listing metadata (description, screenshots, category) separate from `manifest.json`.

**Why `npm run pack` and not `streamdeck pack` directly:** `com.kvt.sck3.sdPlugin/logs/` (§4) is where the running plugin writes its own debug log + `Open Logs`/`Keybind Auto-Fill` report files. It's gitignored, but `streamdeck pack` has no ignore mechanism — it just zips whatever's sitting in the live plugin folder, so any local test-run logs would ship inside the package. `npm run pack` runs `clean:logs` first so the artifact never contains stale runtime data.

**Version format:** the Elgato manifest schema requires `Version` in 4-part `{major}.{minor}.{patch}.{build}` form (e.g. `0.1.0.0`), which is *not* valid npm semver — that's why `sck3/com.kvt.sck3.sdPlugin/manifest.json`'s `Version` and `sck3/package.json`'s `version` are deliberately different formats, not out of sync. Convention: keep the first three numbers identical, manifest just appends `.0` (or a real build number) as the 4th segment. `UUID`s (`com.kvt.sck3`, per-action) must never change once published — see the UUID Convention section of the root `CLAUDE.md`.

---

## 13. Where things came from (credit)

Star Citizen has no public API, so *everyone* building Stream Deck tools for it has had to reverse-engineer the same things. This plugin's `p4k.ts` and `cryxml.ts` are adapted from prior community work (`unp4k`, `CryXmlViewer`, `unp4k_rs`) — full credit in `ACKNOWLEDGEMENTS.md`. Nothing else in the engine (parser, generator, validator, serializer, the context-group model) is borrowed — that logic is original to this project.
