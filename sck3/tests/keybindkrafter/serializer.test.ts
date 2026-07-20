import { describe, it, expect } from 'vitest'
import { serializeCustomProfile, mergeGeneratedIntoActionMaps } from '../../src/keybindkrafter/serializer.js'
import type { SCAction, ParsedBindings, GeneratedBind, Binding, BindingSource } from '../../src/keybindkrafter/types.js'

function kb(input: string, source: BindingSource): Binding {
  const parts = input.split('+')
  return { device: 'keyboard', input, modifiers: parts.slice(0, -1), key: parts.at(-1)!, source }
}

function makeAction(name: string, mapName: string, binding: Binding | null): SCAction {
  return {
    name,
    label: name,
    description: '',
    mapName,
    mapLabel: mapName,
    mapCategory: '',
    activationMode: 'press',
    isToggleCandidate: false,
    isAxisAction: false,
    bindings: { keyboard: binding, mouse: null, joystick: null, gamepad: null },
  }
}

describe('serializeCustomProfile', () => {
  // Mirrors production: allActions' user-sourced keyboard bindings are themselves derived
  // from parsing this same raw actionmaps.xml, so a realistic test supplies both in sync —
  // serializeCustomProfile now reshapes the *merged* result rather than rebuilding
  // independently from the SCAction model, so a pre-existing bind absent from this raw XML
  // would no longer show up in the output (see buildMergedDoc).
  const originalXml = `<?xml version="1.0" encoding="utf-8"?>
<ActionMaps>
 <ActionProfiles version="1" optionsVersion="2" rebindVersion="2" profileName="default">
  <actionmap name="spaceship_movement">
   <action name="a_user">
    <rebind input="kb1_f2" activationMode="press"/>
    <rebind input="js1_button1"/>
   </action>
   <action name="a_two_joysticks">
    <rebind input="js1_button2"/>
    <rebind input="js2_button3"/>
   </action>
  </actionmap>
 </ActionProfiles>
</ActionMaps>`

  const actions = [
    makeAction('a_cig', 'spaceship_movement', kb('f1', 'cig')),
    makeAction('a_user', 'spaceship_movement', kb('f2', 'user')),
    makeAction('a_two_joysticks', 'spaceship_movement', null),
    makeAction('a_gen', 'spaceship_movement', null),
  ]
  const parsed: ParsedBindings = {
    scVersion: 'LIVE',
    actionMaps: [{ name: 'spaceship_movement', label: '', category: 'foo', actions }],
    defaultBoundCount: 1,
    userBoundCount: 1,
  }
  const generated: GeneratedBind[] = [
    { actionName: 'a_gen', mapName: 'spaceship_movement', input: 'f3', flagForTesting: false },
  ]

  it('omits CIG-sourced actions, includes user-sourced and generated keyboard binds', () => {
    const xml = serializeCustomProfile(parsed, actions, generated, 'SCK3_Generated', originalXml)

    expect(xml).not.toContain('"a_cig"')
    expect(xml).toContain('"a_user"')
    expect(xml).toContain('kb1_f2')
    expect(xml).toContain('"a_gen"')
    expect(xml).toContain('kb1_f3')
  })

  it('preserves pre-existing joystick rebinds verbatim, including an action with no keyboard content', () => {
    const xml = serializeCustomProfile(parsed, actions, generated, 'SCK3_Generated', originalXml)

    expect(xml).toContain('js1_button1')
    expect(xml).toContain('"a_two_joysticks"')
    expect(xml).toContain('js1_button2')
    expect(xml).toContain('js2_button3')
  })

  it('builds <devices> from actual content, including both joystick instances, without a hardcoded mouse entry', () => {
    const xml = serializeCustomProfile(parsed, actions, generated, 'SCK3_Generated', originalXml)

    expect(xml).toContain('<keyboard instance="1"/>')
    expect(xml).toContain('<joystick instance="1"/>')
    expect(xml).toContain('<joystick instance="2"/>')
    expect(xml).not.toContain('<mouse')
  })

  it('falls back to the GUID_SysKeyboard <options> constant when the source has none', () => {
    const xml = serializeCustomProfile(parsed, actions, generated, 'SCK3_Generated', originalXml)

    expect(xml).toContain('<options type="keyboard" instance="1" Product="Keyboard  {6F1D2B61-D5A0-11CF-BFC7-444553540000}"/>')
  })

  it('copies an existing keyboard <options> entry verbatim instead of the fallback', () => {
    const xmlWithOptions = originalXml.replace(
      '<actionmap name="spaceship_movement">',
      '<options type="keyboard" instance="1" Product="Keyboard  {REAL-MACHINE-GUID}"/><actionmap name="spaceship_movement">',
    )
    const xml = serializeCustomProfile(parsed, actions, generated, 'SCK3_Generated', xmlWithOptions)

    expect(xml).toContain('{REAL-MACHINE-GUID}')
    expect(xml).not.toContain('{6F1D2B61-D5A0-11CF-BFC7-444553540000}')
  })

  it('works from a fresh install with no existing actionmaps.xml', () => {
    const freshActions = [makeAction('a_gen', 'spaceship_movement', null)]
    const freshParsed: ParsedBindings = {
      scVersion: 'LIVE',
      actionMaps: [{ name: 'spaceship_movement', label: '', category: 'foo', actions: freshActions }],
      defaultBoundCount: 0,
      userBoundCount: 0,
    }
    const xml = serializeCustomProfile(freshParsed, freshActions, generated)

    expect(xml).toContain('kb1_f3')
    expect(xml).toContain('<options type="keyboard" instance="1" Product="Keyboard  {6F1D2B61-D5A0-11CF-BFC7-444553540000}"/>')
    expect(xml).not.toContain('<joystick')
  })
})

describe('mergeGeneratedIntoActionMaps', () => {
  const originalXml = `<?xml version="1.0" encoding="utf-8"?>
<ActionMaps>
 <ActionProfiles version="1" optionsVersion="2" rebindVersion="2" profileName="default">
  <actionmap name="spaceship_movement">
   <action name="a_user">
    <rebind input="kb1_f2" activationMode="press"/>
    <rebind input="js1_button1"/>
   </action>
  </actionmap>
 </ActionProfiles>
</ActionMaps>`

  it('preserves pre-existing user rebinds and non-keyboard rebinds', () => {
    const actions = [makeAction('a_user', 'spaceship_movement', kb('f2', 'user'))]
    const xml = mergeGeneratedIntoActionMaps(originalXml, actions, [])

    expect(xml).toContain('"a_user"')
    expect(xml).toContain('kb1_f2')
    expect(xml).toContain('js1_button1')
  })

  it('adds a new <action> entry for a generated bind absent from the original file', () => {
    const actions = [
      makeAction('a_user', 'spaceship_movement', kb('f2', 'user')),
      makeAction('a_gen', 'spaceship_movement', null),
    ]
    const generated: GeneratedBind[] = [
      { actionName: 'a_gen', mapName: 'spaceship_movement', input: 'f9', flagForTesting: false },
    ]
    const xml = mergeGeneratedIntoActionMaps(originalXml, actions, generated)

    expect(xml).toContain('"a_gen"')
    expect(xml).toContain('kb1_f9')
    // still preserves the pre-existing entry
    expect(xml).toContain('"a_user"')
    expect(xml).toContain('kb1_f2')
  })

  it('creates a new <actionmap> node when the generated bind belongs to a map not yet in the file', () => {
    const actions = [makeAction('b_gen', 'player', null)]
    const generated: GeneratedBind[] = [
      { actionName: 'b_gen', mapName: 'player', input: 'f4', flagForTesting: false },
    ]
    const xml = mergeGeneratedIntoActionMaps(originalXml, actions, generated)

    expect(xml).toContain('"player"')
    expect(xml).toContain('"b_gen"')
    expect(xml).toContain('kb1_f4')
  })

  it('does not accumulate a second XML declaration on repeated merges', () => {
    const actions = [makeAction('a_user', 'spaceship_movement', kb('f2', 'user'))]
    const round1 = mergeGeneratedIntoActionMaps(originalXml, actions, [])
    const round2 = mergeGeneratedIntoActionMaps(round1, actions, [])

    expect((round1.match(/<\?xml/g) ?? []).length).toBe(1)
    expect((round2.match(/<\?xml/g) ?? []).length).toBe(1)
  })

  it('keeps two different actionmaps\' same-named actions independent (name is only unique per-map)', () => {
    const xmlWithSharedName = `<?xml version="1.0" encoding="utf-8"?>
<ActionMaps>
 <ActionProfiles version="1" optionsVersion="2" rebindVersion="2" profileName="default">
  <actionmap name="map_a">
   <action name="shared_name">
    <rebind input="kb1_f2" activationMode="press"/>
   </action>
  </actionmap>
 </ActionProfiles>
</ActionMaps>`
    const actions = [
      makeAction('shared_name', 'map_a', kb('f2', 'user')),
      makeAction('shared_name', 'map_b', null),
    ]
    const generated: GeneratedBind[] = [
      { actionName: 'shared_name', mapName: 'map_b', input: 'f9', flagForTesting: false },
    ]
    const xml = mergeGeneratedIntoActionMaps(xmlWithSharedName, actions, generated)

    // map_a's pre-existing bind must be untouched...
    expect(xml).toContain('kb1_f2')
    // ...and map_b's generated bind for the same action name must also be present, in its own map
    expect(xml).toContain('kb1_f9')
    expect(xml).toContain('"map_b"')
  })
})
