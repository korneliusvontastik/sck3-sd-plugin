# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- **Keybind Auto-Fill** custom-profile export (`Controls/Mappings/*.xml`) is now built from the same merge result as the live `actionmaps.xml` instead of a separate, independent construction — pre-existing joystick/gamepad/mouse rebinds (e.g. a multi-joystick HOTAS setup) are now preserved in the exported profile instead of being silently dropped, and the profile's `<devices>` block only advertises device categories it actually carries content for (previously it always claimed Mouse and Joystick even when empty, which risked wiping a player's real bindings if they mapped a physical device to one of those slots on import). Also adds the `<options type="keyboard">` element real SC exports carry (Microsoft's fixed `GUID_SysKeyboard` constant, or copied from the player's own `actionmaps.xml` when available), which the plugin previously omitted entirely. Investigative fix for #3 — pending confirmation from affected reporters.

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
