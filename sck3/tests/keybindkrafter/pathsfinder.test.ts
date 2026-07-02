import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Mocks must be declared before the module under test is imported.
// Vitest hoists vi.mock() calls above static imports automatically.
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}))
vi.mock('node:os', () => ({
  homedir: vi.fn().mockReturnValue('C:\\Users\\TestUser'),
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { discoverScPaths, isStarCitizenRunning, resolveActiveChannelPaths, listScInstalls, channelName } from '../../src/keybindkrafter/pathsfinder.js'

const FAKE_ROOT = 'C:\\SC\\LIVE'
const FAKE_DATA_P4K = `${FAKE_ROOT}\\Data.p4k`
const FAKE_LOG_PATH = 'C:\\Users\\TestUser\\AppData\\Roaming\\rsilauncher\\logs\\log.log'
const FAKE_SETTINGS_PATH = 'C:\\Users\\TestUser\\AppData\\Roaming\\rsilauncher\\settings.json'

const existsAt = (...paths: string[]) => (p: unknown) =>
  typeof p === 'string' && paths.some(allowed => p.toLowerCase() === allowed.toLowerCase())

// Minimal Dirent-shaped stand-ins for readdirSync(dir, { withFileTypes: true }).
const direntsFor = (names: string[]) => names.map(name => ({ name, isDirectory: () => true }))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env['SCK3_SC_ROOT']
})

afterEach(() => {
  delete process.env['SCK3_SC_ROOT']
})

// ─── discoverScPaths ─────────────────────────────────────────────────────────

describe('discoverScPaths', () => {
  describe('SCK3_SC_ROOT env override', () => {
    it('returns derived paths when root is valid', () => {
      process.env['SCK3_SC_ROOT'] = FAKE_ROOT
      vi.mocked(existsSync).mockImplementation(existsAt(FAKE_DATA_P4K))

      const paths = discoverScPaths()

      expect(paths.root).toBe(FAKE_ROOT)
      expect(paths.dataP4k).toBe(FAKE_DATA_P4K)
      expect(paths.actionMapsPath).toContain('actionmaps.xml')
      expect(paths.mappingsDir).toContain('Mappings')
    })

    it('throws when SCK3_SC_ROOT has no Data.p4k', () => {
      process.env['SCK3_SC_ROOT'] = FAKE_ROOT
      vi.mocked(existsSync).mockReturnValue(false)

      expect(() => discoverScPaths()).toThrow(/SCK3_SC_ROOT/)
    })
  })

  describe('Priority 1 — RSI Launcher log', () => {
    it('extracts root from last matching log line', () => {
      vi.mocked(existsSync).mockImplementation(existsAt(FAKE_LOG_PATH, FAKE_DATA_P4K))
      vi.mocked(readFileSync).mockReturnValue(
        'startup\nLaunching Star Citizen LIVE from (C:\\\\old\\\\path)\nLaunching Star Citizen LIVE from (C:\\\\SC\\\\LIVE)\nother stuff'
      )

      const paths = discoverScPaths()
      expect(paths.root).toBe('C:\\SC\\LIVE')
    })

    it('skips launcher log if log file does not exist', () => {
      // Log file absent, settings also absent, common fallback present
      vi.mocked(existsSync).mockImplementation(
        existsAt('C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k')
      )

      const paths = discoverScPaths()
      expect(paths.root).toBe('C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE')
    })

    it('skips a log-found path that has no Data.p4k (falls through)', () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        if (typeof p !== 'string') return false
        // Log exists, but Data.p4k not at log-found path — found at common fallback
        if (p.endsWith('log.log')) return true
        if (p === 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k') return true
        return false
      })
      vi.mocked(readFileSync).mockReturnValue(
        'Launching Star Citizen LIVE from (C:\\\\BadPath\\\\LIVE)'
      )

      const paths = discoverScPaths()
      expect(paths.root).toBe('C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE')
    })
  })

  describe('Priority 2 — RSI Launcher settings.json (NEEDS VERIFICATION)', () => {
    it('derives root from gameLibraryFolder key', () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        if (typeof p !== 'string') return false
        // No log file; settings.json exists; Data.p4k at derived path
        if (p.endsWith('settings.json')) return true
        if (p === 'C:\\Games\\StarCitizen\\LIVE\\Data.p4k') return true
        return false
      })
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ gameLibraryFolder: 'C:\\Games' })
      )

      const paths = discoverScPaths()
      expect(paths.root).toBe('C:\\Games\\StarCitizen\\LIVE')
    })

    it('skips settings.json if key is absent', () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        if (typeof p !== 'string') return false
        if (p.endsWith('settings.json')) return true
        if (p === 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k') return true
        return false
      })
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ otherKey: 'value' }))

      const paths = discoverScPaths()
      // Falls through to common path
      expect(paths.root).toBe('C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE')
    })
  })

  describe('Priority 4 — common fallback paths', () => {
    it('finds root at Program Files fallback', () => {
      vi.mocked(existsSync).mockImplementation(
        existsAt('C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k')
      )

      const paths = discoverScPaths()
      expect(paths.root).toBe('C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE')
    })

    it('finds root at Program Files (x86) fallback', () => {
      vi.mocked(existsSync).mockImplementation(
        existsAt('C:\\Program Files (x86)\\Roberts Space Industries\\StarCitizen\\LIVE\\Data.p4k')
      )

      const paths = discoverScPaths()
      expect(paths.root).toBe('C:\\Program Files (x86)\\Roberts Space Industries\\StarCitizen\\LIVE')
    })
  })

  describe('no discovery path succeeds', () => {
    it('throws with a user-readable error message', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      expect(() => discoverScPaths()).toThrow(/Star Citizen install not found/)
    })
  })

  describe('derived paths', () => {
    it('constructs all expected sub-paths from the root', () => {
      process.env['SCK3_SC_ROOT'] = FAKE_ROOT
      vi.mocked(existsSync).mockImplementation(existsAt(FAKE_DATA_P4K))

      const paths = discoverScPaths()

      expect(paths.dataP4k).toBe(`${FAKE_ROOT}\\Data.p4k`)
      expect(paths.actionMapsPath).toBe(`${FAKE_ROOT}\\USER\\Client\\0\\Profiles\\default\\actionmaps.xml`)
      expect(paths.mappingsDir).toBe(`${FAKE_ROOT}\\USER\\Client\\0\\Controls\\Mappings`)
    })
  })
})

// ─── resolveActiveChannelPaths ───────────────────────────────────────────────

describe('resolveActiveChannelPaths', () => {
  const LIVE_ROOT = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE'
  const PTU_ROOT = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\PTU'

  it('returns the matching install when the requested channel is found', () => {
    vi.mocked(existsSync).mockImplementation(existsAt(`${LIVE_ROOT}\\Data.p4k`, `${PTU_ROOT}\\Data.p4k`))
    vi.mocked(readdirSync).mockReturnValue(direntsFor(['LIVE', 'PTU']) as unknown as ReturnType<typeof readdirSync>)

    const paths = resolveActiveChannelPaths('PTU')
    expect(paths.root).toBe(PTU_ROOT)
  })

  it('falls back to the first discovered install when the requested channel is not found', () => {
    vi.mocked(existsSync).mockImplementation(existsAt(`${LIVE_ROOT}\\Data.p4k`, `${PTU_ROOT}\\Data.p4k`))
    vi.mocked(readdirSync).mockReturnValue(direntsFor(['LIVE', 'PTU']) as unknown as ReturnType<typeof readdirSync>)

    const paths = resolveActiveChannelPaths('EPTU')
    expect(paths.root).toBe(LIVE_ROOT)
  })

  it('falls back to the first discovered install when no channel is selected', () => {
    vi.mocked(existsSync).mockImplementation(existsAt(`${LIVE_ROOT}\\Data.p4k`, `${PTU_ROOT}\\Data.p4k`))
    vi.mocked(readdirSync).mockReturnValue(direntsFor(['LIVE', 'PTU']) as unknown as ReturnType<typeof readdirSync>)

    const paths = resolveActiveChannelPaths(null)
    expect(paths.root).toBe(LIVE_ROOT)
  })

  it('falls back to discoverScPaths() when no installs are found at all', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    expect(() => resolveActiveChannelPaths('LIVE')).toThrow(/Star Citizen install not found/)
  })

  it('honors SCK3_SC_ROOT even when a channel is requested', () => {
    process.env['SCK3_SC_ROOT'] = LIVE_ROOT
    vi.mocked(existsSync).mockImplementation(existsAt(`${LIVE_ROOT}\\Data.p4k`))

    const paths = resolveActiveChannelPaths('PTU')
    expect(paths.root).toBe(LIVE_ROOT)
  })
})

// ─── listScInstalls ──────────────────────────────────────────────────────────

describe('listScInstalls', () => {
  const BASE = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen'

  it('discovers a channel folder with an unrecognized name (e.g. a bare PREVIEW)', () => {
    vi.mocked(existsSync).mockImplementation(existsAt(`${BASE}\\LIVE\\Data.p4k`, `${BASE}\\PREVIEW\\Data.p4k`))
    vi.mocked(readdirSync).mockReturnValue(direntsFor(['LIVE', 'PREVIEW']) as unknown as ReturnType<typeof readdirSync>)

    const installs = listScInstalls()
    expect(installs.map(p => channelName(p))).toEqual(['LIVE', 'PREVIEW'])
  })

  it('skips directory entries without a Data.p4k', () => {
    vi.mocked(existsSync).mockImplementation(existsAt(`${BASE}\\LIVE\\Data.p4k`))
    vi.mocked(readdirSync).mockReturnValue(direntsFor(['LIVE', 'SomeUnrelatedFolder']) as unknown as ReturnType<typeof readdirSync>)

    const installs = listScInstalls()
    expect(installs.map(p => channelName(p))).toEqual(['LIVE'])
  })

  it('returns an empty array when readdirSync throws', () => {
    vi.mocked(existsSync).mockImplementation(existsAt(`${BASE}\\LIVE\\Data.p4k`))
    vi.mocked(readdirSync).mockImplementation(() => { throw new Error('EPERM') })

    expect(listScInstalls()).toEqual([])
  })
})

// ─── isStarCitizenRunning ────────────────────────────────────────────────────

describe('isStarCitizenRunning', () => {
  it('returns true when PowerShell reports True', () => {
    vi.mocked(execSync).mockReturnValue('True\r\n')
    expect(isStarCitizenRunning()).toBe(true)
  })

  it('returns false when PowerShell reports False', () => {
    vi.mocked(execSync).mockReturnValue('False\r\n')
    expect(isStarCitizenRunning()).toBe(false)
  })

  it('returns false when execSync throws', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('timeout') })
    expect(isStarCitizenRunning()).toBe(false)
  })
})
