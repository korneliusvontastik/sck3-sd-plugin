import { describe, it, expect } from 'vitest'
import { validateFinal } from '../../src/keybindkrafter/validator.js'
import type { SCAction, GeneratedBind, Binding, BindingSource } from '../../src/keybindkrafter/types.js'

function makeAction(name: string, mapName: string, binding: Binding | null): SCAction {
  return {
    name,
    label: name,
    description: '',
    mapName,
    mapLabel: '',
    mapCategory: '',
    activationMode: 'press',
    isToggleCandidate: false,
    bindings: { keyboard: binding, mouse: null, joystick: null, gamepad: null },
  }
}

function kb(input: string, source: BindingSource): Binding {
  const parts = input.split('+')
  return { device: 'keyboard', input, modifiers: parts.slice(0, -1), key: parts.at(-1)!, source }
}

describe('validateFinal — conflict categorization', () => {
  it('flags cig/cig collisions as default/default', () => {
    const actions = [
      makeAction('a1', 'spaceship_movement', kb('f1', 'cig')),
      makeAction('a2', 'spaceship_movement', kb('f1', 'cig')),
    ]
    const result = validateFinal(actions, [])
    expect(result.stats.conflicts.defaultDefault).toBe(1)
    expect(result.stats.conflicts.userDefault).toBe(0)
    expect(result.stats.conflicts.userUser).toBe(0)
    const issue = result.issues.find(i => i.kind === 'default')
    expect(issue).toBeDefined()
  })

  it('flags cig/user collisions as user/default regardless of order', () => {
    const actions = [
      makeAction('a1', 'spaceship_movement', kb('f1', 'cig')),
      makeAction('a2', 'spaceship_movement', kb('f1', 'user')),
    ]
    const result = validateFinal(actions, [])
    expect(result.stats.conflicts.userDefault).toBe(1)
    expect(result.stats.conflicts.defaultDefault).toBe(0)
    expect(result.stats.conflicts.userUser).toBe(0)
    expect(result.issues.find(i => i.kind === 'user')).toBeDefined()
  })

  it('flags user/user collisions as user/user', () => {
    const actions = [
      makeAction('a1', 'spaceship_movement', kb('f1', 'user')),
      makeAction('a2', 'spaceship_movement', kb('f1', 'user')),
    ]
    const result = validateFinal(actions, [])
    expect(result.stats.conflicts.userUser).toBe(1)
    expect(result.stats.conflicts.defaultDefault).toBe(0)
    expect(result.stats.conflicts.userDefault).toBe(0)
  })

  it('allows the same combo across unrelated groups', () => {
    const actions = [
      makeAction('a1', 'spaceship_movement', kb('f1', 'cig')),
      makeAction('a2', 'mapui', kb('f1', 'cig')),
    ]
    const result = validateFinal(actions, [])
    expect(result.stats.conflicts.total).toBe(0)
  })

  it('flags a generated bind colliding with a pre-existing bind as outputVsExisting', () => {
    const actions = [
      makeAction('a1', 'spaceship_movement', kb('f2', 'cig')),
      makeAction('a2', 'spaceship_movement', null),
    ]
    const generated: GeneratedBind[] = [
      { actionName: 'a2', mapName: 'spaceship_movement', input: 'f2', flagForTesting: false },
    ]
    const result = validateFinal(actions, generated)
    expect(result.stats.conflicts.outputVsExisting).toBe(1)
    expect(result.stats.conflicts.outputVsGenerated).toBe(0)
    expect(result.issues.find(i => i.kind === 'generated')).toBeDefined()
  })

  it('flags two colliding generated binds as outputVsGenerated', () => {
    const actions = [
      makeAction('a1', 'spaceship_movement', null),
      makeAction('a2', 'spaceship_movement', null),
    ]
    const generated: GeneratedBind[] = [
      { actionName: 'a1', mapName: 'spaceship_movement', input: 'f2', flagForTesting: false },
      { actionName: 'a2', mapName: 'spaceship_movement', input: 'f2', flagForTesting: false },
    ]
    const result = validateFinal(actions, generated)
    expect(result.stats.conflicts.outputVsGenerated).toBe(1)
    expect(result.stats.conflicts.outputVsExisting).toBe(0)
  })

  it('passes defaultBoundCount and userBoundCount straight through to stats', () => {
    const actions = [makeAction('a1', 'spaceship_movement', kb('f1', 'cig'))]
    const result = validateFinal(actions, [], 42, 7)
    expect(result.stats.defaultBound).toBe(42)
    expect(result.stats.userBound).toBe(7)
  })

  it('computes filled as total minus unbound', () => {
    const actions = [
      makeAction('a1', 'spaceship_movement', kb('f1', 'cig')),
      makeAction('a2', 'spaceship_movement', null),
    ]
    const result = validateFinal(actions, [])
    expect(result.stats.total).toBe(2)
    expect(result.stats.filled).toBe(1)
  })

  it('sums all conflict categories into conflicts.total', () => {
    const actions = [
      makeAction('a1', 'spaceship_movement', kb('f1', 'cig')),
      makeAction('a2', 'spaceship_movement', kb('f1', 'cig')),
      makeAction('a3', 'spaceship_movement', kb('f3', 'user')),
      makeAction('a4', 'spaceship_movement', kb('f3', 'user')),
    ]
    const result = validateFinal(actions, [])
    const c = result.stats.conflicts
    expect(c.total).toBe(c.defaultDefault + c.userDefault + c.userUser + c.outputVsExisting + c.outputVsGenerated)
    expect(c.total).toBe(2)
  })
})
