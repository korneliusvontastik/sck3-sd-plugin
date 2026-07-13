# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
