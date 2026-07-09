# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
