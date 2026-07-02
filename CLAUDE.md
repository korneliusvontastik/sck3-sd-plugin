# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Built by Kornelius Von Tastik / KVT Korp. TypeScript + Node.js using the official Elgato Stream Deck SDK.

**Goal:** The first Star Citizen Stream Deck plugin on the official Elgato Marketplace. Enables seamless interaction with Star Citizen actions via Stream Deck buttons — without any game API (Star Citizen exposes none). All interaction is via keyboard input simulation mapped through the game's keybind system.

**Core mechanic:** The plugin reads Star Citizen's XML files to discover every available game action and its assigned keybind, then bridges them to Stream Deck buttons — keeping the deck in sync with the player's actual game settings.

**Paired with:** KVT Korp's SCK3 profiles for a plug-and-play experience.

### Star Citizen XML Files

| File | Location | Purpose |
|---|---|---|
| `defaultProfile.xml` | `Data/Libs/Config/defaultProfile.xml` | All available game actions (the master list) within encrypted data.p4k |
| `actionmaps.xml` | `/StarCitizen/LIVE/USER/Client/0/Profiles/default` | Player's assigned keybinds |
| `[custom].xml` | `/StarCitizen/LIVE/USER/Client/0/Controls/Mappings/` | Player's custom keybinds |

### Prior Art & Inspiration

Community creators who built Star Citizen + Stream Deck tools before this plugin existed. See `ACKNOWLEDGEMENTS.md`.

## Official References

| Resource | URL |
|---|---|
| Getting Started | https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/ |
| Actions Guide | https://docs.elgato.com/streamdeck/sdk/guides/actions |
| Property Inspectors (UI) | https://docs.elgato.com/streamdeck/sdk/guides/ui |
| Manifest Reference | https://docs.elgato.com/streamdeck/sdk/references/manifest |
| CLI Reference | https://docs.elgato.com/streamdeck/cli/intro |
| SDK GitHub Repo | https://github.com/elgatosf/streamdeck |
| Plugin Samples | https://github.com/elgatosf/streamdeck-plugin-samples |

## Prerequisites

- Node.js 24+ (install via nvm-windows: `nvm install 24` then `nvm use 24`)
- Stream Deck app 7.1+
- A Stream Deck device (or Stream Deck Mobile)

## Commands

All `npm` commands run from inside `sck3/`.

```bash
# Install dependencies
npm install

# Run tests
npm run test
npm run test:watch

# Development — rebuilds and hot-reloads plugin on save
npm run watch

# Production build
npm run build

# Link plugin folder to Stream Deck for testing
streamdeck link [path]

# Restart a running plugin
streamdeck restart com.kvt.sck3

# Validate plugin structure before packaging
streamdeck validate

# Package for distribution (builds, strips logs/, then packs — see docs/architecture.md §12)
npm run pack

# Enable developer/debug mode
streamdeck dev
```

The `streamdeck` command can be shortened to `sd` (e.g., `sd restart com.kvt.sck3`).

## Repo Structure

**Golden rule:** nothing outside `sck3/` ships. `sck3/` is the entire Elgato Stream Deck deliverable — everything else (`docs/`, `reference/`, `scripts/`, `assets/`, `.github/`, `plan.md`, and the repo-root Markdown files) is scaffolding for you, the developer.

See `docs/architecture.md` §4 "Repo folder map" for the full, single-source-of-truth layout — don't duplicate it here.

## Feature Module Pattern

Each plugin feature has two parts:
1. **`sck3/src/<feature>/`** — pure TypeScript, zero `@elgato/streamdeck` imports. Can be extracted or reused independently.
2. **`sck3/src/actions/<feature>.ts`** — thin SD glue layer. Calls SD APIs, delegates logic to the feature module.

The plugin currently ships three actions built on this pattern: Keybind Auto-Fill (the main **keybindkrafter** engine — generates SC keybind profiles; key rules and data are the single source of truth in `sck3/src/keybindkrafter/config.ts`, explained in `docs/keybinds.md`), Channel Indicator, and Open Logs. See `docs/architecture.md` for the full file-by-file breakdown of all three.

## Architecture

`sck3/src/` is the TypeScript source you edit; `sck3/com.kvt.sck3.sdPlugin/` is the actual plugin folder Stream Deck loads (only `bin/` is generated — `manifest.json`, `imgs/`, `fonts/`, `ui/` are hand-edited in place). Rollup bundles `src/` into `sdPlugin/bin/plugin.js`.

See `docs/architecture.md` for the full breakdown — repo folder map, the source/build relationship, file-by-file engine walkthrough, and the context-groups model — instead of duplicating it here.

## Key Concepts

**Actions** are the building blocks. Each button/dial behavior on the Stream Deck is one action. Actions are TypeScript classes that extend `SingletonAction` and override event handlers:

- `onWillAppear` — button appears on the canvas
- `onKeyDown` — user presses a key
- `onDialRotate` — user turns a dial (Stream Deck +)
- `onDidReceiveSettings` — user changes settings in the Property Inspector
- `onPropertyInspectorDidAppear` — settings panel opens

**Manifest** (`manifest.json`) is the plugin's identity card. It declares the plugin UUID (reverse-DNS format, e.g. `com.kvt.sck3`), lists all actions with their own UUIDs (e.g. `com.kvt.sck3.keybindautofill`), and specifies icons and OS requirements. UUIDs must never change after a plugin is published.

**Property Inspector** is the settings UI shown when a user long-presses a button. It's an HTML file that communicates with the plugin via `sendToPlugin` / `onSendToPropertyInspector` events.

**SDKVersion** should be `3` in the manifest.

## UUID Convention

```
Plugin:  com.kvt.sck3
Actions: com.kvt.sck3.<action-name>
```
