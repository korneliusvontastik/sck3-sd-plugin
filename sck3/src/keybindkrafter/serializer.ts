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
 */
export function serializeCustomProfile(
  parsed: ParsedBindings,
  allActions: SCAction[],
  generated: GeneratedBind[],
  profileName = 'SCK3_Generated',
): string {
  const kbFinal = buildFinalKbMap(allActions, generated)

  const actionmapNodes = []
  for (const am of parsed.actionMaps) {
    const actionNodes = []
    for (const action of am.actions) {
      const bind = kbFinal.get(actionKey(am.name, action.name))
      if (!bind) continue
      actionNodes.push({
        '@name': action.name,
        rebind: [{ '@input': bind.input, '@activationMode': bind.mode }],
      })
    }
    if (actionNodes.length > 0) {
      actionmapNodes.push({ '@name': am.name, action: actionNodes })
    }
  }

  const doc = {
    ActionMaps: {
      ActionProfiles: {
        '@version': '1',
        '@optionsVersion': '2',
        '@rebindVersion': '2',
        '@profileName': profileName,
        options: [{ '@type': 'keyboard', '@instance': '1', '@Product': 'Keyboard  {6F1D2B61-D5A0-11CF-BFC7-444553540000}' }],
        actionmap: actionmapNodes,
      },
    },
  }

  return XML_DECL + new XMLBuilder(BUILDER_OPTS).build(doc)
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
