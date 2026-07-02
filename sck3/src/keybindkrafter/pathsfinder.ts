import { existsSync, readdirSync, readFileSync } from 'node:fs'
// Star Citizen only installs on Windows, so its paths are always backslash-style
// regardless of the host OS this code runs on (e.g. the Linux CI runner). Use the
// win32 path module explicitly rather than the platform-dependent default.
import { basename, dirname, join } from 'node:path/win32'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'

export interface ScPaths {
  root: string          // SC LIVE install root
  dataP4k: string       // {root}\Data.p4k
  actionMapsPath: string // {root}\USER\Client\0\Profiles\default\actionmaps.xml
  mappingsDir: string   // {root}\USER\Client\0\Controls\Mappings\
}

const COMMON_ROOTS = [
  'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE',
  'C:\\Program Files (x86)\\Roberts Space Industries\\StarCitizen\\LIVE',
]

function derivePaths(root: string): ScPaths {
  return {
    root,
    dataP4k: join(root, 'Data.p4k'),
    actionMapsPath: join(root, 'USER', 'Client', '0', 'Profiles', 'default', 'actionmaps.xml'),
    mappingsDir: join(root, 'USER', 'Client', '0', 'Controls', 'Mappings'),
  }
}

function isValidRoot(root: string): boolean {
  return existsSync(join(root, 'Data.p4k'))
}

/** Priority 1: Last "Launching Star Citizen LIVE from <path>" line in RSI Launcher log */
function tryLauncherLog(): string | null {
  try {
    const logPath = join(homedir(), 'AppData', 'Roaming', 'rsilauncher', 'logs', 'log.log')
    if (!existsSync(logPath)) return null
    const content = readFileSync(logPath, 'utf8')
    // Log lines wrap the path in parens and JSON-escape backslashes, e.g.:
    // "...Launching Star Citizen LIVE from (E:\\Roberts Space Industries\\StarCitizen\\LIVE)"
    const pattern = /Launching Star Citizen LIVE from \(([^)]+)\)/g
    let match: RegExpExecArray | null
    let lastPath: string | null = null
    while ((match = pattern.exec(content)) !== null) {
      lastPath = match[1].trim().replace(/\\\\/g, '\\')
    }
    if (lastPath && isValidRoot(lastPath)) return lastPath
    return null
  } catch {
    return null
  }
}

/**
 * Priority 2: RSI Launcher settings.json
 * NEEDS VERIFICATION — key name 'gameLibraryFolder' is unconfirmed.
 * Inspect %AppData%\rsilauncher\settings.json manually to confirm structure.
 */
function tryLauncherSettings(): string | null {
  try {
    const settingsPath = join(homedir(), 'AppData', 'Roaming', 'rsilauncher', 'settings.json')
    if (!existsSync(settingsPath)) return null
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
    const libFolder = settings['gameLibraryFolder'] as string | undefined
    if (!libFolder) return null
    const candidate = join(libFolder, 'StarCitizen', 'LIVE')
    if (isValidRoot(candidate)) return candidate
    return null
  } catch {
    return null
  }
}

/**
 * Priority 3: Windows registry
 * NEEDS VERIFICATION — RSI Launcher may not create Uninstall registry entries for SC.
 * Alternative key: HKCU:\SOFTWARE\Roberts Space Industries\RSI Launcher
 */
function tryRegistry(): string | null {
  try {
    const ps = `(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Star Citizen' -ErrorAction SilentlyContinue).InstallLocation`
    const result = execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
      timeout: 3000,
      encoding: 'utf8',
    }).trim()
    if (result && isValidRoot(result)) return result
    return null
  } catch {
    return null
  }
}

/** Priority 4: Common default install paths */
function tryCommonPaths(): string | null {
  for (const root of COMMON_ROOTS) {
    if (isValidRoot(root)) return root
  }
  return null
}

/**
 * Auto-discover the SC LIVE install root using a 4-step fallback chain.
 * Override with env var SCK3_SC_ROOT for dev/testing.
 */
export function discoverScPaths(): ScPaths {
  const envRoot = process.env['SCK3_SC_ROOT']
  if (envRoot) {
    if (!isValidRoot(envRoot)) throw new Error(`SCK3_SC_ROOT is not a valid SC root (no Data.p4k): ${envRoot}`)
    return derivePaths(envRoot)
  }

  const root =
    tryLauncherLog() ??
    tryLauncherSettings() ??
    tryRegistry() ??
    tryCommonPaths()

  if (!root) {
    throw new Error(
      'Star Citizen install not found. ' +
      'Set SCK3_SC_ROOT env var or configure the path in plugin settings.'
    )
  }

  return derivePaths(root)
}

/**
 * Returns ScPaths for every SC channel found alongside the discovered install — LIVE, PTU, EPTU,
 * HOTFIX, TECH-PREVIEW, or any other folder name CIG has used or invents later (e.g. a bare
 * "PREVIEW"). Lists every subdirectory of the channels folder rather than checking a fixed name
 * allowlist, so an unrecognized-but-valid channel folder is still discovered (just uncategorized
 * for coloring purposes elsewhere). Never throws — returns an empty array if nothing is found.
 */
export function listScInstalls(): ScPaths[] {
  let anyRoot: string | null = null
  try {
    anyRoot = tryLauncherLog() ?? tryLauncherSettings() ?? tryRegistry() ?? tryCommonPaths()
  } catch { /* ignore */ }
  if (!anyRoot) return []

  const channelsDir = dirname(anyRoot)
  let entries: string[]
  try {
    entries = readdirSync(channelsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
  } catch {
    return []
  }

  return entries
    .map(name => join(channelsDir, name))
    .filter(isValidRoot)
    .map(derivePaths)
}

/** Returns the channel name (LIVE, PTU, EPTU…) from an ScPaths object. */
export function channelName(paths: ScPaths): string {
  return basename(paths.root)
}

/**
 * Resolves which install to use given a possibly-stale/unset globally-selected channel name.
 * Falls back to the first discovered install if the requested channel isn't found, then to
 * discoverScPaths() (which still honors SCK3_SC_ROOT and throws its existing helpful error)
 * if no installs were discovered at all.
 */
export function resolveActiveChannelPaths(activeChannel: string | null): ScPaths {
  if (process.env['SCK3_SC_ROOT']) return discoverScPaths()
  const installs = listScInstalls()
  if (installs.length === 0) return discoverScPaths()
  const match = activeChannel ? installs.find(p => channelName(p) === activeChannel) : null
  return match ?? installs[0]
}

export interface ScBuildInfo {
  version: string  // e.g. "4.8.184.2887"
  branch: string   // e.g. "sc-alpha-4.8.0"
}

/**
 * Reads build_manifest.id at the install root — a JSON file (despite the .id extension) written by
 * the RSI Launcher with the exact game build. Returns null if missing or malformed rather than
 * throwing, since this is purely informational (channel detection doesn't depend on it).
 */
export function getBuildInfo(paths: ScPaths): ScBuildInfo | null {
  try {
    const manifestPath = join(paths.root, 'build_manifest.id')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { Data?: { Version?: string; Branch?: string } }
    const version = manifest.Data?.Version
    const branch = manifest.Data?.Branch
    if (!version) return null
    return { version, branch: branch ?? '' }
  } catch {
    return null
  }
}

/** Returns true if StarCitizen.exe is currently running. Returns false on any error. */
export function isStarCitizenRunning(): boolean {
  try {
    const ps = `(Get-Process -Name StarCitizen -ErrorAction SilentlyContinue) -ne $null`
    const result = execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
      timeout: 2000,
      encoding: 'utf8',
    }).trim()
    return result.toLowerCase() === 'true'
  } catch {
    return false
  }
}
