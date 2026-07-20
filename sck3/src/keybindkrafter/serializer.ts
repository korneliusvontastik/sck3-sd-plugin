import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import type { ParsedBindings, SCAction, GeneratedBind } from './types.js'

const PARSER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  ignoreDeclaration: true, // we always prepend our own XML_DECL on write — don't round-trip the input's
  isArray: (name: string) => ['actionmap', 'action', 'rebind', 'options'].includes(name),
}

// Minimal stand-in for a player's actionmaps.xml when none exists yet (fresh install /
// deleted by the user) — lets serializeCustomProfile and mergeGeneratedIntoActionMaps
// share one merge path unconditionally, rather than a separate from-scratch branch.
const EMPTY_ACTIONMAPS_XML =
  '<ActionMaps><ActionProfiles version="1" optionsVersion="2" rebindVersion="2" profileName="default"/></ActionMaps>'

// GUID_SysKeyboard — DirectInput's fixed "system keyboard" product GUID (dinput.h:
// DEFINE_GUID(GUID_SysKeyboard, 0x6F1D2B61, ...)). Unlike a joystick's Product GUID, this
// is identical on every Windows machine regardless of actual hardware — confirmed across
// three independent real SC exports (two machines, two different joystick makes) that all
// carry this exact value, while their joystick GUIDs correctly differ. Used only as a
// fallback when the player's own actionmaps.xml doesn't already have a keyboard <options>
// entry to copy (e.g. very first run, nothing written yet).
const KEYBOARD_OPTIONS_FALLBACK = {
  '@type': 'keyboard',
  '@instance': '1',
  '@Product': 'Keyboard  {6F1D2B61-D5A0-11CF-BFC7-444553540000}',
}

const BUILDER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  format: true,
  indentBy: ' ',
  suppressEmptyNode: false,
}

// SC's own exported custom profiles (Options > Keybindings > Export) self-close empty elements
// (<modifiers/>, <rebind .../>) and carry no XML declaration — confirmed against a real in-game
// export. Matching that byte-for-byte isn't required for import to work, but it keeps our output
// indistinguishable from a genuine SC export, which is the point of this format.
const CUSTOM_PROFILE_BUILDER_OPTS = {
  ...BUILDER_OPTS,
  suppressEmptyNode: true,
}

const XML_DECL = `<?xml version="1.0" encoding="utf-8"?>\n`

// Action names are only unique *within* an actionmap — 74 names in the real defaultProfile.xml
// (e.g. "v_view_yaw", "v_open_all_doors") appear in two or more different actionmaps as distinct
// actions. Every lookup here must key on the (mapName, actionName) pair, never the name alone, or
// binds for one of the colliding actions silently overwrite/shadow the other's.
function actionKey(mapName: string, actionName: string): string {
  return `${mapName}::${actionName}`
}

/**
 * Builds a map of final keyboard binds we're willing to write out: (mapName, actionName) →
 * { kb1_input, activationMode }. Deliberately excludes CIG-default-sourced binds — neither the live
 * actionmaps.xml nor the standalone importable profile should ever restate an action's untouched
 * CIG default; SC already applies those on its own. Only genuine prior user rebinds and this run's
 * generated fills are included. User binds keep their own activationMode; generated binds inherit
 * it from the original SCAction.
 */
function buildFinalKbMap(
  allActions: SCAction[],
  generated: GeneratedBind[],
): Map<string, { input: string; mode: string }> {
  const actionByKey = new Map(allActions.map(a => [actionKey(a.mapName, a.name), a]))
  const result = new Map<string, { input: string; mode: string }>()

  for (const action of allActions) {
    const kb = action.bindings.keyboard
    if (kb && kb.source !== 'cig') {
      result.set(actionKey(action.mapName, action.name), {
        input: `kb1_${kb.input}`,
        mode: action.activationMode,
      })
    }
  }

  for (const gen of generated) {
    const key = actionKey(gen.mapName, gen.actionName)
    const action = actionByKey.get(key)
    result.set(key, {
      input: `kb1_${gen.input}`,
      mode: action?.activationMode ?? 'press',
    })
  }

  return result
}

/**
 * Merges generated keyboard binds into a parsed actionmaps.xml document, preserving all
 * non-keyboard device binds (joystick, gamepad, mouse) and everything else in the document
 * (hardware <options>, <deviceoptions> deadzones, etc.) by mutating the parsed DOM in place
 * rather than rebuilding it — the one thing this codebase doesn't try to understand or
 * reconstruct is exactly the thing in-place mutation preserves for free.
 *
 * Two passes: first, update/preserve entries already present in the original document (dropping any
 * keyboard rebind that's no longer wanted, e.g. a CIG default the user never actually chose). Then,
 * for generated binds whose action had **no** existing entry in the original file (the common case —
 * an action nobody had rebound before), add a brand-new <action> node, creating its <actionmap>
 * node too if needed.
 *
 * Shared by both output paths: mergeGeneratedIntoActionMaps wraps this for the live
 * actionmaps.xml, serializeCustomProfile reshapes the same merged result into the
 * standalone importable schema. Keeping one merge implementation means a joystick/gamepad
 * bind preserved in the live file is *always* also preserved in the custom profile — they
 * can't silently drift apart the way two independent constructions could (and did).
 */
function buildMergedDoc(
  originalXml: string,
  allActions: SCAction[],
  generated: GeneratedBind[],
): Record<string, unknown> {
  const kbFinal = buildFinalKbMap(allActions, generated)
  const seenActions = new Set<string>()

  const parser = new XMLParser(PARSER_OPTS)
  const doc = parser.parse(originalXml) as Record<string, unknown>

  // Handle both <ActionMaps><ActionProfiles>... and flat <ActionMaps>...
  const root = doc['ActionMaps'] as Record<string, unknown>
  const profiles = (root?.['ActionProfiles'] as Record<string, unknown>) ?? root
  const actionmaps = (profiles?.['actionmap'] as Record<string, unknown>[] ?? [])
  profiles['actionmap'] = actionmaps

  for (const am of actionmaps) {
    const mapName = am['@name'] as string ?? ''
    for (const action of (am['action'] as Record<string, unknown>[] ?? [])) {
      const actionName = action['@name'] as string ?? ''
      seenActions.add(actionKey(mapName, actionName))
      const bind = kbFinal.get(actionKey(mapName, actionName))

      // Remove existing keyboard rebinds, keep all other device rebinds
      const existingRebinds = (action['rebind'] as Record<string, string>[] | undefined) ?? []
      const nonKbRebinds = existingRebinds.filter(r => {
        const input = r['@input'] ?? ''
        return !input.startsWith('kb1_') && !input.startsWith('kb2_')
      })

      if (bind) {
        action['rebind'] = [
          ...nonKbRebinds,
          { '@input': bind.input, '@activationMode': bind.mode },
        ]
      } else if (nonKbRebinds.length > 0) {
        action['rebind'] = nonKbRebinds
      } else {
        delete action['rebind']
      }
    }
  }

  const actionmapByName = new Map(actionmaps.map(am => [am['@name'] as string, am]))
  for (const gen of generated) {
    const key = actionKey(gen.mapName, gen.actionName)
    if (seenActions.has(key)) continue
    const bind = kbFinal.get(key)
    if (!bind) continue

    let am = actionmapByName.get(gen.mapName)
    if (!am) {
      am = { '@name': gen.mapName, action: [] }
      actionmaps.push(am)
      actionmapByName.set(gen.mapName, am)
    }
    const actionList = (am['action'] as Record<string, unknown>[] | undefined) ?? []
    actionList.push({ '@name': gen.actionName, rebind: [{ '@input': bind.input, '@activationMode': bind.mode }] })
    am['action'] = actionList
    seenActions.add(key)
  }

  return doc
}

/**
 * Merges generated keyboard binds into the user's original actionmaps.xml, preserving
 * all non-keyboard device binds (joystick, gamepad, mouse) and hardware options.
 * See buildMergedDoc for the actual merge logic — this just serializes it back to the
 * nested <ActionMaps><ActionProfiles>...<options>...</ActionProfiles></ActionMaps> shape
 * SC itself writes to actionmaps.xml.
 */
export function mergeGeneratedIntoActionMaps(
  originalXml: string,
  allActions: SCAction[],
  generated: GeneratedBind[],
): string {
  const doc = buildMergedDoc(originalXml, allActions, generated)
  return XML_DECL + new XMLBuilder(BUILDER_OPTS).build(doc)
}

// Extracts the device+instance prefix from a rebind input string, e.g. "js2_rctrl+button5"
// → "joystick" instance "2". Falls back to null for anything that doesn't match (shouldn't
// happen for well-formed rebinds, but a malformed/manually-edited entry shouldn't crash export).
const DEVICE_TAG_BY_PREFIX: Record<string, string> = { kb: 'keyboard', mo: 'mouse', js: 'joystick', gp: 'gamepad' }
function deviceInstance(input: string): { tag: string; instance: string } | null {
  const match = /^(kb|mo|js|gp)(\d+)_/.exec(input)
  if (!match) return null
  const tag = DEVICE_TAG_BY_PREFIX[match[1]]
  return tag ? { tag, instance: match[2] } : null
}

/**
 * Serializes a custom profile XML (importable via SC Options > Keybindings > Load from file):
 * the same merged result as mergeGeneratedIntoActionMaps (see buildMergedDoc), reshaped into
 * the flat, standalone-importable schema instead of the nested one SC writes to actionmaps.xml.
 * Deliberately *not* an independent construction from SCAction/GeneratedBind — building this from
 * scratch is exactly what let it drift out of sync with the live file and drop joystick/gamepad/
 * mouse binds that were never in scope for regeneration but should never have been lost either.
 *
 * <options type="..."> entries are copied verbatim from the player's own actionmaps.xml when
 * present — real hardware data beats invented data. Only the keyboard case gets a hardcoded
 * fallback (KEYBOARD_OPTIONS_FALLBACK, Microsoft's fixed GUID_SysKeyboard constant — confirmed
 * hardware-independent, see the constant's own comment) when there's no existing actionmaps.xml
 * to copy from yet (e.g. very first run). Joystick/gamepad/mouse <options> are never fabricated —
 * if the source document doesn't have one, none is written. Whether SC's import needs a matching
 * <options> entry to correctly apply a *preserved* joystick/gamepad rebind, or whether the
 * <devices> declaration and the rebind itself are sufficient, is unconfirmed — flagged for
 * real-world testing.
 *
 * <devices> is built from whatever device+instance combinations actually appear in the final
 * rebinds (e.g. two distinct joystick instances → two <joystick> entries) rather than a hardcoded
 * one-of-each — advertising a device profile backed by zero actual content risked a real user
 * mapping a physical device to an empty slot and having SC wipe their existing binds for it.
 * <keyboard instance="1"> is always included regardless, since generating keyboard binds is this
 * profile's whole purpose. <categories> lists each included actionmap's UICategory (from
 * defaultProfile.xml), deduped, in first-seen order — this drives which tabs SC's own rebind UI
 * shows when the profile is loaded there.
 *
 * The keyboard rebind's `device="keyboard"` attribute is a known, intentional deviation from real
 * SC exports (which never set it) — re-added here on top of the shared merge result, which
 * otherwise never included it (mergeGeneratedIntoActionMaps has no need for it). Left in rather
 * than removed: nothing points to it causing import problems, and it predates this refactor.
 */
export function serializeCustomProfile(
  parsed: ParsedBindings,
  allActions: SCAction[],
  generated: GeneratedBind[],
  profileName = 'SCK3_Generated',
  originalActionMapsXml = '',
): string {
  const doc = buildMergedDoc(originalActionMapsXml || EMPTY_ACTIONMAPS_XML, allActions, generated)
  const root = doc['ActionMaps'] as Record<string, unknown>
  const profiles = (root?.['ActionProfiles'] as Record<string, unknown>) ?? root
  const mergedActionMaps = (profiles?.['actionmap'] as Record<string, unknown>[]) ?? []
  const existingOptions = (profiles?.['options'] as Record<string, unknown>[]) ?? []
  const deviceOptions = profiles?.['deviceoptions']

  const categoryByMapName = new Map(parsed.actionMaps.map(am => [am.name, am.category]))

  const actionmapNodes = []
  const categories: string[] = []
  const seenCategories = new Set<string>()
  const devicesUsed = new Map<string, Set<string>>() // tag → set of instance numbers
  devicesUsed.set('keyboard', new Set(['1']))

  for (const am of mergedActionMaps) {
    const mapName = am['@name'] as string ?? ''
    const rawActions = (am['action'] as Record<string, unknown>[]) ?? []
    const actionNodes = []
    // SC's own exports list an actionmap's <action> entries alphabetically by name, not in
    // defaultProfile.xml's declaration order — confirmed against a real in-game export.
    const sortedActions = [...rawActions].sort((a, b) =>
      ((a['@name'] as string) ?? '').localeCompare((b['@name'] as string) ?? ''))

    for (const action of sortedActions) {
      const rebinds = (action['rebind'] as Record<string, string>[] | undefined) ?? []
      if (rebinds.length === 0) continue

      const rebindNodes = rebinds.map(r => {
        const input = r['@input'] ?? ''
        const di = deviceInstance(input)
        if (di) {
          devicesUsed.set(di.tag, (devicesUsed.get(di.tag) ?? new Set()).add(di.instance))
          if (di.tag === 'keyboard') return { '@device': 'keyboard', ...r }
        }
        return r
      })

      actionNodes.push({ '@name': action['@name'], rebind: rebindNodes })
    }

    if (actionNodes.length > 0) {
      actionmapNodes.push({ '@name': mapName, action: actionNodes })
      const category = categoryByMapName.get(mapName) ?? ''
      if (!seenCategories.has(category)) {
        seenCategories.add(category)
        categories.push(category)
      }
    }
  }

  const devices: Record<string, { '@instance': string }[]> = {}
  for (const [tag, instances] of devicesUsed) {
    devices[tag] = [...instances].sort().map(instance => ({ '@instance': instance }))
  }

  const options = [...existingOptions]
  if (devicesUsed.has('keyboard') && !options.some(o => o['@type'] === 'keyboard')) {
    options.push(KEYBOARD_OPTIONS_FALLBACK)
  }

  const outputDoc: Record<string, unknown> = {
    ActionMaps: {
      '@version': '1',
      '@optionsVersion': '2',
      '@rebindVersion': '2',
      '@profileName': profileName,
      CustomisationUIHeader: {
        '@label': profileName,
        '@description': '',
        '@image': '',
        devices,
        categories: {
          category: categories.map(label => ({ '@label': label })),
        },
      },
      ...(deviceOptions ? { deviceoptions: deviceOptions } : {}),
      options,
      modifiers: '',
      actionmap: actionmapNodes,
    },
  }

  return new XMLBuilder(CUSTOM_PROFILE_BUILDER_OPTS).build(outputDoc)
}
