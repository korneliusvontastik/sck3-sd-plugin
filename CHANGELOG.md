# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0.5] - 2026-07-21

### Fixed

- **Keybind Auto-Fill** custom-profile export (`Controls/Mappings/*.xml`) is now built from the same merge result as the live `actionmaps.xml` instead of a separate, independent construction — pre-existing joystick/gamepad/mouse rebinds (e.g. a multi-joystick HOTAS setup) are now preserved in the exported profile instead of being silently dropped, and the profile's `<devices>` block only advertises device categories it actually carries content for (previously it always claimed Mouse and Joystick even when empty, which risked wiping a player's real bindings if they mapped a physical device to one of those slots on import). Also adds the `<options type="keyboard">` element real SC exports carry (Microsoft's fixed `GUID_SysKeyboard` constant, or copied from the player's own `actionmaps.xml` when available), which the plugin previously omitted entirely. Investigative fix for #3 — pending confirmation from affected reporters.
- **Keybind Auto-Fill** no longer coerces every CIG activation mode it doesn't recognize down to `press`. The parser's whitelist was missing several real modes CIG uses (`delayed_press`, `delayed_press_medium`, `delayed_hold`, `delayed_hold_long`, `delayed_hold_no_retrigger`, `double_tap_nonblocking`, `all`) — most visibly affecting every `vehicle_mfd` `_long` action (MFD navigation hold-actions), whose real default is `delayed_press` but was being generated as `press`. Verified against the full real `defaultProfile.xml` (1,100+ actions): 0 dropped actions, 0 activationMode mismatches, 0 unhandled modes.
- **Keybind Auto-Fill** no longer generates `lctrl+X` combos in `spaceship_vehicles`, `foot`, or `ui` for any action. `lctrl` alone is always a held CIG action in these contexts (`v_strafe_down`/"lower" in ships, `prone` on foot, spectator/mapui pan-down in ui) — CIG's engine doesn't suppress that action just because a chord is registered on top of it, so any generated `lctrl+X` bind ghost-fired the held action instead. Previously this was only skipped for the `foot` group, plus a narrow set of movement keys in `spaceship_vehicles`; confirmed in-game the ghost-fire isn't limited to either (reported: `lctrl+q`/`lctrl+e` silently ate roll input while strafing down — #1).
- **Keybind Auto-Fill** now cross-lists `player` into the `spaceship_vehicles` context group. MobiGlas/comm actions like `ship_recall` stay reachable while seated in a ship, but were only tracked as occupying `foot` — so the generator could hand them a combo `spaceship_vehicles` already used (reported: `lshift+u` was independently assigned to both `ship_recall` and `v_toggle_all_doorlocks`, so pressing it ejected the pilot instead of toggling door locks).

### Known Issues

- **MFD (and MobiGlas/Stopwatch/Hacking/Character Customizer/RemoteRigidEntityController) binds don't register via Star Citizen's own in-game "Options > Keybindings > Load profile from file" import**, regardless of what the generated custom profile (`Controls/Mappings/*.xml`) contains — confirmed this is a Star Citizen bug (CIG issue council), not something wrong in our output. Several schema differences were tried and ruled out (a stray `device="keyboard"` attribute, activation-mode content) with no change in behavior. **Workaround:** run Keybind Auto-Fill with Star Citizen closed — it writes directly into the live `actionmaps.xml`, which SC reads correctly at launch — instead of relying on the in-game custom-profile import for these actionmaps.

## [0.1.0.4] - 2026-07-13

### Fixed

- **Keybind Auto-Fill** no longer hands `np_enter` (Numpad Enter) to an unrelated action. CIG declares `enter`/`np_enter` as keyboard alternates on a few actions (`focus_on_chat_textinput`, `flashui_return`, `ui_textfield_enter`) via two `<inputdata>` entries, but only the first was tracked as occupied — so the generator could freely assign `np_enter` elsewhere, making physical Numpad Enter fire two actions at once (reported: it also triggered a weapon change).
- **Keybind Auto-Fill** no longer assigns `` grave `` (the backtick/tilde key) to any action, under any modifier. CIG hardcodes it as the dev console toggle at the engine level — it has no entry in `defaultProfile.xml` at all, so the generator had no way to know it was taken. Previously it could assign combos like `lctrl+grave` to an unbound action (reported: `v_deploy_landing_system`), which still opened the console in-game instead of the intended action.
- **Keybind Auto-Fill** no longer double-books `lalt+2`/`lalt+3`-style combos between the interaction-wheel ("PIT") menu and ship/vehicle actions. `player_choice`'s `pc_pit_*` actions (ship systems, flight systems, vehicle actions, remote turrets, mining mode) are reachable while seated in a ship, but were only tracked as occupying the `foot` context — so the generator could hand them combos CIG already reserves in `spaceship_vehicles` (reported: pressing `lalt+2`/`lalt+3` opened the PIT menu instead of toggling targeting pins 2/3).

## [0.1.0.3] - 2026-07-13

### Fixed

- **Keybind Auto-Fill** custom-profile export now matches Star Citizen's actual export formatting: self-closing tags, no XML declaration, `keyboard`/`mouse`/`joystick` always listed under `devices`, a `categories` block, and actions sorted alphabetically within each actionmap — verified against a real in-game export.
- **Keybind Auto-Fill** now correctly reads keyboard defaults declared via `<keyboard><inputdata input="..."/></keyboard>` (used by a handful of actions like `focus_on_chat_textinput`), instead of treating them as unbound and overwriting them.

## [0.1.0.2] - 2026-07-10

### Fixed

- **Keybind Auto-Fill** custom-profile export (`Controls/Mappings/*.xml`) now uses Star Citizen's actual importable-profile schema — a flat `<ActionMaps>` root with a `CustomisationUIHeader`/`devices` block — instead of the nested `<ActionMaps><ActionProfiles>` shape meant for the live `actionmaps.xml`. The previous shape imported silently with no error but never showed up as an importable profile in-game.

## [0.1.0.1] - 2026-07-09

### Fixed

- **Keybind Auto-Fill** no longer generates a keyboard bind for analog axis actions (ship pitch/yaw/roll/strafe, FPS mouse-look, gamepad thumbsticks). Previously it treated "no CIG keyboard default" as "needs one," which overrode the mouse/joystick/gamepad axis default and broke default mouse flight and look controls. See `docs/keybinds.md` § Axis Actions Are Never Auto-Filled.

## [0.1.0] - 2026-07-02

Initial public alpha.

### Added

- **Keybind Auto-Fill** action — parses Star Citizen's `defaultProfile.xml` (full action master list) and the player's `actionmaps.xml`/custom mapping files, generates a complete keybind profile, and writes it back to `actionmaps.xml`.
- **Channel Indicator** action — displays the active Star Citizen channel (LIVE, PTU, EPTU) on the key face and cycles between installed channels on press.
- **Open Logs** action — opens the plugin's log folder for troubleshooting.
- SC installation path auto-discovery, with automatic re-detection across LIVE/PTU/EPTU channels.
- Property Inspector dashboards for all three actions.
- Key-face rendering (custom text/label drawing) for on-device feedback.
