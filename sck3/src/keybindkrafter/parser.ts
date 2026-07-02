import { XMLParser } from 'fast-xml-parser'
import type { SCAction, ActionMap, ParsedBindings, ActivationMode, Binding } from './types.js'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  isArray: (name) => ['actionmap', 'action', 'rebind', 'ActivationMode'].includes(name),
})

// ─── DefaultProfile parsing ──────────────────────────────────────────────────

function parseActivationMode(name: string | undefined): ActivationMode {
  const valid: ActivationMode[] = [
    'press', 'hold', 'hold_no_retrigger', 'release',
    'tap', 'hold_toggle', 'smart_toggle', 'double_tap',
  ]
  return valid.includes(name as ActivationMode) ? (name as ActivationMode) : 'press'
}

function isToggleCandidate(modeName: string | undefined): boolean {
  return modeName === 'hold_toggle' || modeName === 'smart_toggle'
}

// Parse a keyboard input string into a Binding.
// Input looks like: "lshift+f1" or just "f1" or "ralt+y"
function parseKeyboardInput(input: string, source: import('./types.js').BindingSource): Binding | null {
  const parts = input.trim().split('+').filter(Boolean)
  if (parts.length === 0) return null
  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)
  return { device: 'keyboard', input, modifiers, key, source }
}

export function parseDefaultProfile(xmlText: string): ParsedBindings {
  const doc = xmlParser.parse(xmlText)
  const profile = doc.profile

  const actionMaps: ActionMap[] = []
  let defaultBoundCount = 0

  for (const am of profile.actionmap ?? []) {
    const mapName: string     = am['@name']        ?? ''
    const mapLabel: string    = am['@UILabel']      ?? mapName
    const mapCategory: string = am['@UICategory']   ?? ''
    const actions: SCAction[] = []

    for (const action of am.action ?? []) {
      const actionName: string = action['@name'] ?? ''
      const modeName: string | undefined = action['@activationMode']
      const kbRaw: string | undefined = action['@keyboard']
      const kbBinding = kbRaw ? parseKeyboardInput(kbRaw, 'cig') : null
      if (kbBinding) defaultBoundCount++

      actions.push({
        name: actionName,
        label: action['@UILabel'] ?? actionName,
        description: action['@UIDescription'] ?? '',
        mapName,
        mapLabel,
        mapCategory,
        activationMode: parseActivationMode(modeName),
        isToggleCandidate: isToggleCandidate(modeName),
        bindings: { keyboard: kbBinding, mouse: null, joystick: null, gamepad: null },
      })
    }

    if (actions.length > 0) {
      actionMaps.push({ name: mapName, label: mapLabel, category: mapCategory, actions })
    }
  }

  return { scVersion: 'LIVE', actionMaps, defaultBoundCount, userBoundCount: 0 }
}

// ─── User actionmaps.xml overlay ─────────────────────────────────────────────

interface UserRebind {
  mapName: string
  actionName: string
  input: string  // raw e.g. "kb1_lshift+f1" or "kb1_ " (cleared)
}

function stripDevicePrefix(raw: string): string {
  // "kb1_lshift+f1" → "lshift+f1",  "kb1_ " → " "
  return raw.replace(/^(kb\d+_|mo\d+_|js\d+_|gp\d+_)/, '')
}

function isCleared(normalized: string): boolean {
  return normalized.trim() === ''
}

function parseUserActionMaps(xmlText: string): UserRebind[] {
  const doc = xmlParser.parse(xmlText)

  // Support both <ActionMaps><ActionProfiles>... and flat <ActionMaps>...
  const profiles = doc.ActionMaps?.ActionProfiles ?? doc.ActionMaps
  const actionmaps = profiles?.actionmap ?? []
  const rebinds: UserRebind[] = []

  for (const am of actionmaps) {
    const mapName: string = am['@name'] ?? ''
    for (const action of am.action ?? []) {
      const actionName: string = action['@name'] ?? ''
      const rebindList = action.rebind ?? []
      for (const rebind of rebindList) {
        const raw: string = rebind['@input'] ?? ''
        if (raw.startsWith('kb1_') || raw.startsWith('kb2_')) {
          rebinds.push({ mapName, actionName, input: raw })
        }
      }
    }
  }

  return rebinds
}

function applyUserOverlay(parsed: ParsedBindings, rebinds: UserRebind[]): number {
  // Build lookup: mapName → actionName → SCAction
  const lookup = new Map<string, SCAction>()
  for (const am of parsed.actionMaps) {
    for (const action of am.actions) {
      lookup.set(`${action.mapName}/${action.name}`, action)
    }
  }

  const touchedActions = new Set<string>()

  for (const rebind of rebinds) {
    const key = `${rebind.mapName}/${rebind.actionName}`
    const action = lookup.get(key)
    if (!action) continue
    touchedActions.add(key)

    const normalized = stripDevicePrefix(rebind.input)
    if (isCleared(normalized)) {
      action.bindings.keyboard = null
    } else {
      action.bindings.keyboard = parseKeyboardInput(normalized, 'user')
    }
  }

  return touchedActions.size
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseBindings(defaultProfileXml: string, userActionMapsXml?: string): ParsedBindings {
  const parsed = parseDefaultProfile(defaultProfileXml)
  if (userActionMapsXml) {
    const rebinds = parseUserActionMaps(userActionMapsXml)
    parsed.userBoundCount = applyUserOverlay(parsed, rebinds)
  }
  return parsed
}

export function flattenActions(parsed: ParsedBindings): SCAction[] {
  return parsed.actionMaps.flatMap(am => am.actions)
}
