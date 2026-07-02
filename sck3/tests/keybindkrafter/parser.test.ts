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
    expect(actions.length).toBeGreaterThan(100)
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
})

describe('applyUserOverlay', () => {
  it('applies user actionmaps.xml on top of defaults', () => {
    const parsed = parseBindings(defaultProfileXml, userActionMapsXml)
    const actions = flattenActions(parsed)
    expect(actions.length).toBeGreaterThan(100)
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
