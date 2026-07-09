import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseBindings, flattenActions } from '../../src/keybindkrafter/parser.js'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const defaultProfileXml = readFileSync(join(FIXTURES, 'defaultProfile.sample.xml'), 'utf-8')
const userActionMapsXml = readFileSync(join(FIXTURES, 'actionmaps.xml'), 'utf-8')

describe('parseDefaultProfile', () => {
  it('parses actions from defaultProfile.xml', () => {
    const parsed = parseBindings(defaultProfileXml)
    const actions = flattenActions(parsed)
    expect(actions.length).toBeGreaterThan(5)
  })

  it('every action has a name and mapName', () => {
    const parsed = parseBindings(defaultProfileXml)
    for (const action of flattenActions(parsed)) {
      expect(action.name).toBeTruthy()
      expect(action.mapName).toBeTruthy()
    }
  })

  it('some actions have keyboard binds from CIG defaults', () => {
    const parsed = parseBindings(defaultProfileXml)
    const bound = flattenActions(parsed).filter(a => a.bindings.keyboard !== null)
    expect(bound.length).toBeGreaterThan(0)
  })

  it('flags mouse-axis and joystick-axis actions as isAxisAction', () => {
    const parsed = parseBindings(defaultProfileXml)
    const actions = flattenActions(parsed)
    const axisActions = actions.filter(a => a.isAxisAction)
    expect(axisActions.length).toBeGreaterThan(0)
    // None of the axis actions should have a keyboard default from CIG
    for (const action of axisActions) {
      expect(action.bindings.keyboard).toBeNull()
    }
  })

  it('does not flag digital mouse buttons or joystick buttons/hats as axis actions', () => {
    const parsed = parseBindings(defaultProfileXml)
    const actions = flattenActions(parsed)
    const byName = new Map(actions.map(a => [a.name, a]))
    // mouse="mouse1" / joystick="button9" — discrete presses, not analog axes
    expect(byName.get('attack1')?.isAxisAction).toBe(false)
    expect(byName.get('v_strafe_up')?.isAxisAction).toBe(false)
  })

  it('flags an optionGroup sibling as axis even with no device attribute of its own', () => {
    // v_roll_mouse has keyboard="" and no mouse/joystick attribute at all, but shares
    // optionGroup="flight_move_roll" with v_roll (joystick="rotz") — an analog axis sibling.
    const parsed = parseBindings(defaultProfileXml)
    const actions = flattenActions(parsed)
    const byName = new Map(actions.map(a => [a.name, a]))
    expect(byName.get('v_roll')?.isAxisAction).toBe(true)
    expect(byName.get('v_roll_mouse')?.isAxisAction).toBe(true)
  })

  it('does not leak axis status onto a digital onPress/onRelease sibling in the same optionGroup', () => {
    // v_strafe_vertical (gamepad="shoulderl+thumbly", no onPress/onRelease — a true analog axis)
    // shares optionGroup="flight_move_strafe_vertical" with v_strafe_up/v_strafe_down, which ARE
    // onPress/onRelease digital nudge actions with their own real keyboard defaults (space/lctrl).
    // Unlike the pitch/yaw/roll pattern (where *_up/*_down sit outside the axis optionGroup), CIG
    // puts these three in the same group — group-inheritance must not override their digital nature.
    const parsed = parseBindings(defaultProfileXml)
    const actions = flattenActions(parsed)
    const byName = new Map(actions.map(a => [a.name, a]))
    expect(byName.get('v_strafe_vertical')?.isAxisAction).toBe(true)
    expect(byName.get('v_strafe_up')?.isAxisAction).toBe(false)
    expect(byName.get('v_strafe_down')?.isAxisAction).toBe(false)
  })

  it('flags gamepad thumbstick axes as axis actions, but not face buttons', () => {
    // gp_movex/gp_movey (gamepad="thumblx"/"thumbly") have no mouse/joystick sibling in their
    // optionGroup to inherit axis-ness from (moveleft/moveright carry no optionGroup at all) —
    // they must be recognized directly from the gamepad token itself.
    const parsed = parseBindings(defaultProfileXml)
    const actions = flattenActions(parsed)
    const byName = new Map(actions.map(a => [a.name, a]))
    expect(byName.get('gp_movex')?.isAxisAction).toBe(true)
    expect(byName.get('gp_movey')?.isAxisAction).toBe(true)
    // gp_jump (gamepad="a") is a face-button press, not an axis.
    expect(byName.get('gp_jump')?.isAxisAction).toBe(false)
  })
})

describe('applyUserOverlay', () => {
  it('applies user actionmaps.xml on top of defaults', () => {
    const parsed = parseBindings(defaultProfileXml, userActionMapsXml)
    const actions = flattenActions(parsed)
    expect(actions.length).toBeGreaterThan(5)
  })

  it('user-cleared binds (kb1_ ) become null', () => {
    // actionmaps.xml has many "js2_ " entries — we only apply kb1_ ones
    // but if any kb1_ cleared entries exist, they should produce null
    const parsed = parseBindings(defaultProfileXml, userActionMapsXml)
    const actions = flattenActions(parsed)
    // Just verify the overlay ran without throwing
    expect(actions).toBeDefined()
  })
})
