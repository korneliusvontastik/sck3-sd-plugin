import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import type { ParsedBindings, SCAction, GeneratedBind } from './types.js'

const PARSER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  ignoreDeclaration: true, // we always prepend our own XML_DECL on write — don't round-trip the input's
  isArray: (name: string) => ['actionmap', 'action', 'rebind', 'options'].includes(name),
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
 * Serializes a custom profile XML (importable via SC Options > Keybindings > Load from file).
 * Contains only genuine custom binds — pre-existing user overrides + this run's generated fills.
 * CIG defaults are omitted; SC continues to apply those on its own for untouched actions.
 *
 * This is a *different* schema from the live actionmaps.xml (see mergeGeneratedIntoActionMaps):
 * a flat <ActionMaps> root carrying the version/profileName attributes directly, with a
 * <CustomisationUIHeader><devices>...<categories>...</CustomisationUIHeader> block — not the nested
 * <ActionMaps><ActionProfiles>...<options>...</ActionProfiles></ActionMaps> shape SC itself writes
 * to actionmaps.xml. Reusing that nested shape here silently fails to import — confirmed against a
 * known-good hand file (SC gives no error, it just doesn't show up as importable).
 *
 * <devices> always declares keyboard+mouse+joystick instance 1, regardless of what's actually
 * plugged in — SC only uses this to know which device namespaces to expect, not to validate
 * hardware, and a real export lists all three unconditionally. <categories> lists each included
 * actionmap's UICategory (from defaultProfile.xml), deduped, in first-seen order — this drives
 * which tabs SC's own rebind UI shows when the profile is loaded there. Deliberately omits the
 * top-level <options type="keyboard|joystick" Product="..."/> block real exports carry: those
 * encode the exporting machine's actual hardware GUIDs, which we have no way to know and would be
 * actively wrong to fabricate.
 */
export function serializeCustomProfile(
  parsed: ParsedBindings,
  allActions: SCAction[],
  generated: GeneratedBind[],
  profileName = 'SCK3_Generated',
): string {
  const kbFinal = buildFinalKbMap(allActions, generated)

  const actionmapNodes = []
  const categories: string[] = []
  const seenCategories = new Set<string>()
  for (const am of parsed.actionMaps) {
    const actionNodes = []
    // SC's own exports list an actionmap's <action> entries alphabetically by name, not in
    // defaultProfile.xml's declaration order — confirmed against a real in-game export.
    const sortedActions = [...am.actions].sort((a, b) => a.name.localeCompare(b.name))
    for (const action of sortedActions) {
      const bind = kbFinal.get(actionKey(am.name, action.name))
      if (!bind) continue
      actionNodes.push({
        '@name': action.name,
        rebind: [{ '@device': 'keyboard', '@activationMode': bind.mode, '@input': bind.input }],
      })
    }
    if (actionNodes.length > 0) {
      actionmapNodes.push({ '@name': am.name, action: actionNodes })
      if (!seenCategories.has(am.category)) {
        seenCategories.add(am.category)
        categories.push(am.category)
      }
    }
  }

  const doc = {
    ActionMaps: {
      '@version': '1',
      '@optionsVersion': '2',
      '@rebindVersion': '2',
      '@profileName': profileName,
      CustomisationUIHeader: {
        '@label': profileName,
        '@description': '',
        '@image': '',
        devices: {
          keyboard: [{ '@instance': '1' }],
          mouse: [{ '@instance': '1' }],
          joystick: [{ '@instance': '1' }],
        },
        categories: {
          category: categories.map(label => ({ '@label': label })),
        },
      },
      modifiers: '',
      actionmap: actionmapNodes,
    },
  }

  return new XMLBuilder(CUSTOM_PROFILE_BUILDER_OPTS).build(doc)
}

/**
 * Merges generated keyboard binds into the user's original actionmaps.xml, preserving
 * all non-keyboard device binds (joystick, gamepad, mouse) and hardware options.
 *
 * Two passes: first, update/preserve entries already present in the original document (dropping any
 * keyboard rebind that's no longer wanted, e.g. a CIG default the user never actually chose). Then,
 * for generated binds whose action had **no** existing entry in the original file (the common case —
 * an action nobody had rebound before), add a brand-new <action> node, creating its <actionmap>
 * node too if needed — otherwise those binds would be silently absent from the live file even
 * though they're correctly reflected in the separate importable profile.
 */
export function mergeGeneratedIntoActionMaps(
  originalXml: string,
  allActions: SCAction[],
  generated: GeneratedBind[],
): string {
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

  return XML_DECL + new XMLBuilder(BUILDER_OPTS).build(doc)
}
