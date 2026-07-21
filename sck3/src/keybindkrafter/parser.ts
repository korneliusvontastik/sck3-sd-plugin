import { XMLParser } from 'fast-xml-parser'
import type { SCAction, ActionMap, ParsedBindings, ActivationMode, Binding } from './types.js'
import { isAxisBinding, comboKey } from './config.js'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  isArray: (name) => ['actionmap', 'action', 'rebind', 'ActivationMode', 'inputdata'].includes(name),
})

// ─── DefaultProfile parsing ──────────────────────────────────────────────────

// Every activationMode value CIG's own real defaultProfile.xml actually uses (confirmed by
// scanning the full ~1,100-action extract, not guessed). Missing any of these silently coerced
// that action's mode to 'press' — confirmed to break vehicle_mfd's *_long actions, whose real
// default is 'delayed_press': the generator was writing activationMode="press" for all 26 of
// them instead of preserving 'delayed_press'. A real, worth-fixing bug on its own, but not the
// cause of vehicle_mfd's binds failing to register via SC's in-game custom-profile import — that
// turned out to be a Star Citizen bug unrelated to anything in our output, see docs/keybinds.md
// § "Known SC Bug".
function parseActivationMode(name: string | undefined): ActivationMode {
  const valid: ActivationMode[] = [
    'press', 'hold', 'hold_no_retrigger', 'release',
    'tap', 'hold_toggle', 'smart_toggle', 'double_tap',
    'delayed_press', 'delayed_press_medium',
    'delayed_hold', 'delayed_hold_long', 'delayed_hold_no_retrigger',
    'double_tap_nonblocking', 'all',
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
      // A handful of default actions (e.g. focus_on_chat_textinput, ui_textfield_enter) declare
      // their keyboard default as a <keyboard><inputdata input="enter"/>...</keyboard> child
      // element instead of a keyboard="..." attribute — take the first inputdata as the primary
      // bind. Without this, those actions look unbound and the generator overwrites their
      // (correct) default with a freshly assigned combo.
      const inputDataList = action.keyboard?.inputdata as { '@input'?: string }[] | undefined
      const kbRaw: string | undefined = action['@keyboard'] ?? inputDataList?.[0]?.['@input']
      const kbBinding = kbRaw ? parseKeyboardInput(kbRaw, 'cig') : null
      if (kbBinding) defaultBoundCount++

      // CIG sometimes declares more than one <inputdata> as alternates for the same action, e.g.
      // <inputdata input="enter"/><inputdata input="np_enter"/> — both keys trigger it in-game.
      // The primary Binding above only captures the first; the rest are recorded here so the
      // generator/validator's occupancy tracking knows those keys are already spoken for, even
      // though we never assign, serialize, or display them as this action's "real" bind.
      const reservedCombos = (inputDataList ?? [])
        .slice(1)
        .map(d => d['@input'])
        .filter((raw): raw is string => !!raw)
        .map(raw => parseKeyboardInput(raw, 'cig'))
        .filter((b): b is Binding => b !== null)
        .map(b => comboKey(b.modifiers, b.key))

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
        reservedCombos: reservedCombos.length ? reservedCombos : undefined,
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
