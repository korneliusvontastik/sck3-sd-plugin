import { describe, it, expect } from 'vitest'
import { generateMissingBinds } from '../../src/keybindkrafter/generator.js'
import { validate } from '../../src/keybindkrafter/validator.js'
import { isAxisBinding, CANDIDATE_KEYS } from '../../src/keybindkrafter/config.js'
import type { SCAction } from '../../src/keybindkrafter/types.js'

function makeAction(
  name: string,
  mapName: string,
  hasKeyboard = false,
  isAxisAction = false,
  reservedCombos?: string[],
): SCAction {
  return {
    name,
    label: name,
    description: '',
    mapCategory: '',
    mapName,
    mapLabel: '',
    activationMode: 'press',
    isToggleCandidate: false,
    isAxisAction,
    bindings: {
      keyboard: hasKeyboard ? { device: 'keyboard', input: 'f1', modifiers: [], key: 'f1', source: 'cig' } : null,
      mouse: null,
      joystick: null,
      gamepad: null,
    },
    reservedCombos,
  }
}

// A bound action occupying an exact bare key, for tests that need to fill specific candidate slots.
function makeBoundAction(name: string, mapName: string, key: string): SCAction {
  const action = makeAction(name, mapName, true)
  action.bindings.keyboard = { device: 'keyboard', input: key, modifiers: [], key, source: 'cig' }
  return action
}

describe('generateMissingBinds', () => {
  it('assigns a bind to every unbound action', () => {
    const actions: SCAction[] = [
      makeAction('v_pitch', 'spaceship_movement'),
      makeAction('v_roll', 'spaceship_movement'),
      makeAction('v_yaw', 'spaceship_movement'),
    ]
    const generated = generateMissingBinds(actions)
    expect(generated).toHaveLength(3)
  })

  it('does not reassign already-bound actions', () => {
    const actions: SCAction[] = [
      makeAction('v_pitch', 'spaceship_movement', true),
      makeAction('v_roll', 'spaceship_movement'),
    ]
    const generated = generateMissingBinds(actions)
    expect(generated).toHaveLength(1)
    expect(generated[0].actionName).toBe('v_roll')
  })

  it('produces no collisions within the same context group', () => {
    const actions: SCAction[] = Array.from({ length: 20 }, (_, i) =>
      makeAction(`action_${i}`, 'spaceship_movement')
    )
    const generated = generateMissingBinds(actions)
    const combos = generated.map(g => g.input)
    const unique = new Set(combos)
    expect(unique.size).toBe(combos.length)
  })

  it('allows same combo across different groups', () => {
    const actions: SCAction[] = [
      makeAction('ship_action', 'spaceship_movement'),
      makeAction('foot_action', 'player'),
    ]
    const generated = generateMissingBinds(actions)
    // Both should get f1 (simplest) since they're in different groups
    expect(generated[0].input).toBe(generated[1].input)
  })

  it('never assigns a bind to a mouse/joystick axis action', () => {
    const actions: SCAction[] = [
      makeAction('v_pitch_mouse', 'spaceship_movement', false, true),
      makeAction('v_yaw_mouse', 'spaceship_movement', false, true),
      makeAction('v_roll', 'spaceship_movement', false, true),
      makeAction('v_strafe_up', 'spaceship_movement'),
    ]
    const generated = generateMissingBinds(actions)
    expect(generated).toHaveLength(1)
    expect(generated[0].actionName).toBe('v_strafe_up')
  })

  it('never assigns a combo reserved as a CIG default keyboard alternate', () => {
    // Occupy every bare-key candidate before "np_enter" in CANDIDATE_KEYS order, then reserve
    // "np_enter" itself via reservedCombos (mirrors CIG's real enter/np_enter alternate pair on
    // focus_on_chat_textinput). The next unbound action must skip straight past it.
    const npEnterIndex = CANDIDATE_KEYS.indexOf('np_enter')
    const occupied = CANDIDATE_KEYS.slice(0, npEnterIndex)
    const nextFreeKey = CANDIDATE_KEYS[npEnterIndex + 1]

    const actions: SCAction[] = [
      ...occupied.map((key, i) => makeBoundAction(`occupy_${i}`, 'spaceship_movement', key)),
      makeAction('focus_on_chat_textinput', 'spaceship_movement', true, false, ['np_enter']),
      makeAction('some_weapon_action', 'spaceship_movement'),
    ]

    const generated = generateMissingBinds(actions)
    expect(generated).toHaveLength(1)
    expect(generated[0].actionName).toBe('some_weapon_action')
    expect(generated[0].input).toBe(nextFreeKey)
    expect(generated.map(g => g.input)).not.toContain('np_enter')
  })

  it('never generates a denied combo', () => {
    const actions: SCAction[] = Array.from({ length: 50 }, (_, i) =>
      makeAction(`action_${i}`, 'spaceship_movement')
    )
    const generated = generateMissingBinds(actions)
    // Hard deny only — lctrl+letter combos moved to CAUTION_COMBOS (soft flag, not blocked)
    const denied = ['lalt+f4', 'lalt+tab', 'lctrl+lalt+delete', 'lshift+delete']
    for (const combo of denied) {
      expect(generated.map(g => g.input)).not.toContain(combo)
    }
  })
})

describe('isAxisBinding', () => {
  it('recognizes mouse and joystick axis tokens', () => {
    expect(isAxisBinding('maxis_y', undefined)).toBe(true)
    expect(isAxisBinding('lalt+maxis_z', undefined)).toBe(true)
    expect(isAxisBinding('mouse1', undefined)).toBe(false)
    expect(isAxisBinding(undefined, 'rotz')).toBe(true)
    expect(isAxisBinding(undefined, 'hat1_left')).toBe(false)
  })

  it('recognizes bare gamepad thumbstick axes, including with a shoulder modifier', () => {
    expect(isAxisBinding(undefined, undefined, 'thumblx')).toBe(true)
    expect(isAxisBinding(undefined, undefined, 'thumbry')).toBe(true)
    expect(isAxisBinding(undefined, undefined, 'shoulderl+thumblx')).toBe(true)
  })

  it('does not flag gamepad face buttons or stick clicks/directions as axes', () => {
    // Bare "x"/"y" are the Xbox-style face buttons — not axes, unlike joystick's bare x/y.
    expect(isAxisBinding(undefined, undefined, 'x')).toBe(false)
    expect(isAxisBinding(undefined, undefined, 'y')).toBe(false)
    expect(isAxisBinding(undefined, undefined, 'thumbl')).toBe(false)
    expect(isAxisBinding(undefined, undefined, 'thumbl_left')).toBe(false)
    expect(isAxisBinding(undefined, undefined, 'shoulderl+thumbl')).toBe(false)
  })
})

describe('validate', () => {
  it('passes when all actions are bound and no collisions', () => {
    const actions: SCAction[] = [
      makeAction('v_pitch', 'spaceship_movement'),
    ]
    const generated = generateMissingBinds(actions)
    const result = validate(actions, generated)
    expect(result.valid).toBe(true)
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })
})
