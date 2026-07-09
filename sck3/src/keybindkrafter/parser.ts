import { XMLParser } from 'fast-xml-parser'
import type { SCAction, ActionMap, ParsedBindings, ActivationMode, Binding } from './types.js'
import { isAxisBinding } from './config.js'

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
    const rawActions = am.action ?? []

    // CIG groups alternate input schemes for the same analog axis (HOTAS/mouse/gamepad) under a
    // shared optionGroup, e.g. "v_pitch" (joystick="y") and "v_pitch_mouse" (mouse="maxis_y") both
    // carry optionGroup="flight_move_pitch". Some contexts (e.g. ground vehicles) ship the mouse
    // variant with a blank device slot — still an axis action, just unbound in that context — so a
    // sibling's axis token proves the whole optionGroup is an axis family.
    const axisOptionGroups = new Set<string>()
    for (const action of rawActions) {
      const og: string | undefined = action['@optionGroup']
      if (og && isAxisBinding(action['@mouse'], action['@joystick'], action['@gamepad'])) {
        axisOptionGroups.add(og)
      }
    }

    for (const action of rawActions) {
      const actionName: string = action['@name'] ?? ''
      const modeName: string | undefined = action['@activationMode']
      const kbRaw: string | undefined = action['@keyboard']
      const kbBinding = kbRaw ? parseKeyboardInput(kbRaw, 'cig') : null
      if (kbBinding) defaultBoundCount++

      const og: string | undefined = action['@optionGroup']
      // CIG sometimes puts a digital, onPress/onRelease-triggered nudge action (e.g. v_strafe_up/
      // v_strafe_down, keyboard="space"/"lctrl") in the *same* optionGroup as its analog sibling
      // (v_strafe_vertical, gamepad="shoulderl+thumbly") — unlike the pitch/yaw/roll pattern, where
      // the digital *_up/*_down/*_left/*_right actions sit outside the axis optionGroup entirely.
      // Group-inherited axis status must not leak onto an action that is structurally digital
      // (declares onPress/onRelease) — only its own direct device token counts for those.
      const isDigitalPress = action['@onPress'] !== undefined || action['@onRelease'] !== undefined
      const isAxisAction =
        isAxisBinding(action['@mouse'], action['@joystick'], action['@gamepad']) ||
        (!!og && axisOptionGroups.has(og) && !isDigitalPress)

      actions.push({
        name: actionName,
        label: action['@UILabel'] ?? actionName,
        description: action['@UIDescription'] ?? '',
        mapName,
        mapLabel,
        mapCategory,
        activationMode: parseActivationMode(modeName),
        isToggleCandidate: isToggleCandidate(modeName),
        isAxisAction,
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
