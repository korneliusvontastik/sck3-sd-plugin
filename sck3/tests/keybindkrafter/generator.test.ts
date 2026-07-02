import { describe, it, expect } from 'vitest'
import { generateMissingBinds } from '../../src/keybindkrafter/generator.js'
import { validate } from '../../src/keybindkrafter/validator.js'
import type { SCAction } from '../../src/keybindkrafter/types.js'

function makeAction(name: string, mapName: string, hasKeyboard = false): SCAction {
  return {
    name,
    label: name,
    description: '',
    category: '',
    mapName,
    mapLabel: '',
    activationMode: 'press',
    isToggleCandidate: false,
    bindings: {
      keyboard: hasKeyboard ? { device: 'keyboard', input: 'f1', modifiers: [], key: 'f1' } : null,
      mouse: null,
      joystick: null,
      gamepad: null,
    },
  }
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
