// Opt-in tests against the real, full defaultProfile.xml extracted from a local Star Citizen
// install (see scripts/extract-default-profile.ts). CIG's data is proprietary and never pushed
// (see .gitignore) — the fixture in fixtures/defaultProfile.sample.xml covers CI and normal
// `npm test` runs. This file adds extra confidence against the *entire* real action set (~1100
// actions across every actionmap, not just the hand-picked sample) whenever a dev has extracted
// their own copy. It skips itself cleanly — never fails — when reference/defaultProfile.xml is
// absent, so it's always safe to leave in the suite.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBindings, flattenActions } from '../../src/keybindkrafter/parser.js'
import { generateMissingBinds } from '../../src/keybindkrafter/generator.js'
import { validateFinal } from '../../src/keybindkrafter/validator.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const REAL_PROFILE_PATH = resolve(REPO_ROOT, 'reference', 'defaultProfile.xml')
const hasRealProfile = existsSync(REAL_PROFILE_PATH)

if (!hasRealProfile) {
  console.log(
    `[parser.real.test] Skipping — ${REAL_PROFILE_PATH} not found. ` +
    `Run "npx tsx scripts/extract-default-profile.ts" to enable these tests locally.`
  )
}

// Known axis actions confirmed by hand against the real profile — see docs/keybinds.md.
const KNOWN_AXIS_ACTIONS = [
  ['spaceship_movement', 'v_pitch'], ['spaceship_movement', 'v_pitch_mouse'],
  ['spaceship_movement', 'v_yaw'], ['spaceship_movement', 'v_yaw_mouse'],
  ['spaceship_movement', 'v_roll'], ['spaceship_movement', 'v_roll_mouse'],
  ['spaceship_movement', 'v_strafe_vertical'], ['spaceship_movement', 'v_strafe_lateral'],
  ['spaceship_movement', 'v_strafe_longitudinal'],
  ['vehicle_driver', 'v_pitch'], ['vehicle_driver', 'v_pitch_mouse'],
  ['vehicle_driver', 'v_yaw'], ['vehicle_driver', 'v_yaw_mouse'],
  ['player', 'rotateyaw'], ['player', 'rotatepitch'],
  ['player', 'gp_movex'], ['player', 'gp_movey'], ['player', 'gp_rotateyaw'], ['player', 'gp_rotatepitch'],
] as const

// Known digital siblings that share an optionGroup with an axis action but must NOT inherit the
// axis flag — the mixed-group case (v_strafe_up/down) that motivated the onPress/onRelease guard.
const KNOWN_DIGITAL_ACTIONS = [
  ['spaceship_movement', 'v_strafe_up'], ['spaceship_movement', 'v_strafe_down'],
  ['spaceship_movement', 'v_strafe_left'], ['spaceship_movement', 'v_strafe_right'],
  ['spaceship_movement', 'v_pitch_up'], ['spaceship_movement', 'v_pitch_down'],
  ['spaceship_movement', 'v_yaw_left'], ['spaceship_movement', 'v_yaw_right'],
  ['spaceship_movement', 'v_roll_left'], ['spaceship_movement', 'v_roll_right'],
  ['player', 'gp_jump'],
] as const

// The 3 real CIG actions confirmed to declare enter + np_enter as keyboard alternates — see
// docs/keybinds.md § "CIG Actions With More Than One Default Key".
const KNOWN_ENTER_ALTERNATE_ACTIONS = [
  ['default', 'flashui_return'],
  ['default', 'focus_on_chat_textinput'],
  ['ui_textfield', 'ui_textfield_enter'],
] as const

describe.skipIf(!hasRealProfile)('parseDefaultProfile — real defaultProfile.xml', () => {
  const xml = hasRealProfile ? readFileSync(REAL_PROFILE_PATH, 'utf-8') : ''

  it('parses a realistically large action set', () => {
    const actions = flattenActions(parseBindings(xml))
    expect(actions.length).toBeGreaterThan(900)
  })

  it('flags every known axis action as isAxisAction', () => {
    const actions = flattenActions(parseBindings(xml))
    const byKey = new Map(actions.map(a => [`${a.mapName}/${a.name}`, a]))
    for (const [mapName, name] of KNOWN_AXIS_ACTIONS) {
      expect(byKey.get(`${mapName}/${name}`)?.isAxisAction, `${mapName}/${name}`).toBe(true)
    }
  })

  it('does not flag known digital siblings as axis, even when they share an optionGroup with one', () => {
    const actions = flattenActions(parseBindings(xml))
    const byKey = new Map(actions.map(a => [`${a.mapName}/${a.name}`, a]))
    for (const [mapName, name] of KNOWN_DIGITAL_ACTIONS) {
      expect(byKey.get(`${mapName}/${name}`)?.isAxisAction, `${mapName}/${name}`).toBe(false)
    }
  })

  it('never generates a keyboard bind for a known axis action', () => {
    const actions = flattenActions(parseBindings(xml))
    const generated = generateMissingBinds(actions)
    const generatedKeys = new Set(generated.map(g => `${g.mapName}/${g.actionName}`))
    for (const [mapName, name] of KNOWN_AXIS_ACTIONS) {
      expect(generatedKeys.has(`${mapName}/${name}`), `${mapName}/${name}`).toBe(false)
    }
  })

  it('records np_enter as a reservedCombo on every known enter/np_enter alternate action', () => {
    const actions = flattenActions(parseBindings(xml))
    const byKey = new Map(actions.map(a => [`${a.mapName}/${a.name}`, a]))
    for (const [mapName, name] of KNOWN_ENTER_ALTERNATE_ACTIONS) {
      const action = byKey.get(`${mapName}/${name}`)
      expect(action?.bindings.keyboard?.key, `${mapName}/${name} primary`).toBe('enter')
      expect(action?.reservedCombos, `${mapName}/${name} reservedCombos`).toContain('np_enter')
    }
  })

  it('never generates np_enter for any action — regression test for the reported weapon-change bug', () => {
    const actions = flattenActions(parseBindings(xml))
    const generated = generateMissingBinds(actions)
    expect(generated.some(g => g.input === 'np_enter')).toBe(false)
  })

  it('produces no coverage errors against the full real action set', () => {
    const parsed = parseBindings(xml)
    const actions = flattenActions(parsed)
    const generated = generateMissingBinds(actions)
    const result = validateFinal(actions, generated, parsed.defaultBoundCount, parsed.userBoundCount)
    const coverageErrors = result.issues.filter(
      i => i.severity === 'error' && i.message.startsWith('No keyboard bind')
    )
    expect(coverageErrors).toHaveLength(0)
  })
})
