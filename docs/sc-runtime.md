# SC Runtime — Discovery & I/O

How the plugin finds Star Citizen's install root, discovers every installed channel, derives all required paths, checks whether the game is running, and writes generated keybinds back to disk.

---

## Auto-Discovery Chain

`discoverScPaths()` tries each source in order and returns the first valid root it finds.
A root is valid if `{root}\Data.p4k` exists on disk.

| Priority | Source | Notes |
|----------|--------|-------|
| 1 | **RSI Launcher log** | Most reliable. Last `Launching Star Citizen LIVE from (<path>)` line in `%AppData%\rsilauncher\logs\log.log`. Path is wrapped in literal parens and backslashes are JSON-escaped (doubled). **Verified working.** |
| 2 | **RSI Launcher settings** | `%AppData%\rsilauncher\settings.json` → `gameLibraryFolder` key → `{value}\StarCitizen\LIVE`. **Key name unverified** — check manually on your install. |
| 3 | **Windows registry** | `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Star Citizen` → `InstallLocation`. **May not exist** — RSI Launcher may not register SC as an Uninstall entry. |
| 4 | **Common install paths** | `C:\Program Files\Roberts Space Industries\StarCitizen\LIVE` and the `(x86)` variant. |
| — | **Throw** | "Star Citizen install not found. Set SCK3_SC_ROOT env var or configure the path in plugin settings." |

**Dev override:** Set `SCK3_SC_ROOT=<path>` to skip auto-discovery entirely.

---

## Multi-Channel Discovery

`discoverScPaths()` above only ever finds one root (historically LIVE). `listScInstalls()` finds
*every* installed channel — used by the Channel Indicator button and its Property Inspector:

1. Runs the same 4-step chain to find any one valid SC install (whichever channel that happens to
   be), then takes its parent directory (e.g. `…\StarCitizen\LIVE` → `…\StarCitizen`).
2. Lists every subdirectory of that parent and keeps any one that has a valid `Data.p4k` —
   **not** a fixed name allowlist. This matters: CIG's channel folder names aren't stable
   (`LIVE`, `PTU`, `EPTU`, `HOTFIX`, `TECH-PREVIEW`, or a bare `PREVIEW` seen in the wild) and a
   name-based check silently misses anything it doesn't already know about.
3. Never throws — returns `[]` if the parent directory can't be listed or nothing validates.

`channelName(paths)` is just `basename(paths.root)`; `getBuildInfo(paths)` reads
`build_manifest.id` at the root for the exact version/branch (returns `null` if missing/malformed
— purely informational, channel detection doesn't depend on it).

**Which channel is "active"** is plugin-wide state, not per-button — see `src/global-channel.ts`.
It wraps Stream Deck's global settings (shared across every action instance and Property
Inspector) and exposes `resolveActiveChannelPaths(activeChannel)` — a pure function in
`pathsfinder.ts` that resolves the requested channel name to `ScPaths`, falling back to the first
discovered install, then to `discoverScPaths()`, if the requested channel isn't found or unset.

---

## Paths Derived from Install Root

```
{root}\                                                   ← install root
{root}\Data.p4k                                           ← game archive (defaultProfile.xml inside)
{root}\USER\Client\0\Profiles\default\actionmaps.xml      ← user's current keyboard binds
{root}\USER\Client\0\Controls\Mappings\                   ← custom profile drop folder
```

### Annotated

| Path | Variable | Purpose |
|------|----------|---------|
| `{root}` | `ScPaths.root` | SC LIVE install root |
| `{root}\Data.p4k` | `ScPaths.dataP4k` | Read by `p4k.ts` (`extractEntry`) → `defaultProfile.xml` extracted + CryXmlB decoded by `cryxml.ts` |
| `{root}\USER\Client\0\Profiles\default\actionmaps.xml` | `ScPaths.actionMapsPath` | Read: user's current binds. Write (BONUS): direct replacement when SC is closed |
| `{root}\USER\Client\0\Controls\Mappings\SCK3_Generated_Keybinds_<timestamp>.xml` | — | PRIMARY output, always written. Import via Options > Keybindings > Load from file |

---

## Game Process Detection

`isStarCitizenRunning()` runs a PowerShell one-liner with a 2-second timeout:

```powershell
(Get-Process -Name StarCitizen -ErrorAction SilentlyContinue) -ne $null
```

Returns `false` on any error or timeout — erring on the side of not overwriting `actionmaps.xml`.

---

## Output Delivery Logic

```
Button pressed
  → resolveActivePaths()                       # globally-selected channel, falls back to discoverScPaths()
  → extractDefaultProfile(paths.dataP4k)       # via p4k.ts + cryxml.ts
  → read actionmaps.xml
  → parse + generate + validate
  ↓
  PRIMARY (always):
    write SCK3_Generated_Keybinds_<timestamp>.xml → paths.mappingsDir
    User imports: Options > Keybindings > Load from file
  ↓
  BONUS (only when SC is not running):
    write merged actionmaps.xml → paths.actionMapsPath
    Binds active on next SC launch, no user action needed
```

**Why the conditional:** SC overwrites `actionmaps.xml` when the user opens Options > Keybindings,
discarding any direct changes made while the game was running. The custom profile path is safe at all times.
