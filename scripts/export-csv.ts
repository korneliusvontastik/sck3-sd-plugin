// Dev-only tool. NOT part of the shipped plugin (sck3/com.kvt.sck3.sdPlugin) — never imported
// from sck3/src/actions. Reuses the pure keybindkrafter engine to turn a run's final bind set into
// a CSV, since a spreadsheet is much easier to scan than the .xml profile or .txt report when
// reviewing key coverage across hundreds of actions.
//
// Usage (from scripts/, after `npm install` once):
//   npm run csv -- [path/to/actionmaps.xml]
// Defaults to sck3/tests/keybindkrafter/fixtures/actionmaps.xml (virgin template) if no path is given.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBindings, flattenActions } from '../sck3/src/keybindkrafter/parser.js'
import { generateMissingBinds } from '../sck3/src/keybindkrafter/generator.js'
import { getGroups, CANDIDATE_KEYS, MODIFIER_PRIORITY } from '../sck3/src/keybindkrafter/config.js'
import type { SCAction, GeneratedBind } from '../sck3/src/keybindkrafter/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const KEY_TIER_LABEL: Record<string, string> = (() => {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('')
  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  const punct = ['minus', 'equals', 'lbracket', 'rbracket', 'backslash', 'semicolon', 'apostrophe', 'grave', 'comma', 'period', 'slash']
  const fkeys = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12']
  const numpad = ['np_0', 'np_1', 'np_2', 'np_3', 'np_4', 'np_5', 'np_6', 'np_7', 'np_8', 'np_9', 'np_period', 'np_divide', 'np_multiply', 'np_subtract', 'np_add', 'np_enter']
  const nav = ['insert', 'delete', 'home', 'end', 'pgup', 'pgdn']
  const arrows = ['up', 'down', 'left', 'right']
  const out: Record<string, string> = {}
  for (const k of letters) out[k] = '1_letters'
  for (const k of numbers) out[k] = '2_numbers'
  for (const k of punct) out[k] = '3_punct'
  for (const k of fkeys) out[k] = '4_fkeys'
  for (const k of numpad) out[k] = '5_numpad'
  for (const k of nav) out[k] = '6_nav'
  for (const k of arrows) out[k] = '7_arrows'
  return out
})()

function buildKeyMapCsv(allActions: SCAction[], generated: GeneratedBind[]): string {
  type Row = {
    tier: string; key: string; modifier: string; combo: string
    source: string; cig_category: string; actionmap: string; cig_actionmap_label: string
    action: string; cig_action_label: string
    context_group: string; flag_for_testing: string
    sort: [number, number, number]
  }

  const generatedMap = new Map<string, GeneratedBind>()
  for (const g of generated) generatedMap.set(`${g.mapName}/${g.actionName}`, g)

  const rows: Row[] = []

  for (const action of allActions) {
    const genBind = generatedMap.get(`${action.mapName}/${action.name}`)
    let combo = '', tier = '', key = '', modifier = '', source = '', flagForTesting = ''
    let sort: [number, number, number] = [999, 999, 999]

    if (genBind) {
      combo = genBind.input
      source = 'generated'
      flagForTesting = genBind.flagForTesting ? 'yes' : ''
    } else if (action.bindings.keyboard) {
      combo = action.bindings.keyboard.input
      source = action.bindings.keyboard.source
    } else {
      source = action.isAxisAction ? 'axis' : 'unbound'
    }

    if (combo) {
      const parts = combo.split('+')
      key = parts[parts.length - 1]
      modifier = parts.slice(0, -1).sort().join('+')
      const tierLabel = KEY_TIER_LABEL[key] ?? '9_unknown'
      const tierIdx = parseInt(tierLabel[0]) - 1
      const keyIdx = CANDIDATE_KEYS.indexOf(key)
      const modIdx = MODIFIER_PRIORITY.findIndex(mods => [...mods].sort().join('+') === modifier)
      tier = tierLabel.slice(2)
      sort = [tierIdx, keyIdx === -1 ? 999 : keyIdx, modIdx === -1 ? 999 : modIdx]
    }

    rows.push({
      tier, key, modifier, combo, source,
      cig_category: action.mapCategory,
      actionmap: action.mapName,
      cig_actionmap_label: action.mapLabel,
      action: action.name,
      cig_action_label: action.label,
      context_group: getGroups(action.mapName).join('+') || 'unclassified',
      flag_for_testing: flagForTesting,
      sort,
    })
  }

  rows.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.sort[i] !== b.sort[i]) return a.sort[i] - b.sort[i]
    }
    return a.actionmap.localeCompare(b.actionmap) || a.action.localeCompare(b.action)
  })

  const headers = ['tier', 'key', 'modifier', 'combo', 'source', 'cig_category', 'actionmap', 'cig_actionmap_label', 'action', 'cig_action_label', 'context_group', 'flag_for_testing']
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([r.tier, r.key, r.modifier, r.combo, r.source, r.cig_category, r.actionmap, r.cig_actionmap_label, r.action, r.cig_action_label, r.context_group, r.flag_for_testing].map(escapeCsv).join(','))
  }
  return lines.join('\r\n')
}

function main() {
  const userXmlArg = process.argv[2]
  const defaultProfilePath = resolve(REPO_ROOT, 'reference/defaultProfile.xml')
  const userXmlPath = resolve(REPO_ROOT, userXmlArg ?? 'sck3/tests/keybindkrafter/fixtures/actionmaps.xml')

  const defaultXml = readFileSync(defaultProfilePath, 'utf-8')
  let userXml: string | undefined
  try {
    userXml = readFileSync(userXmlPath, 'utf-8')
  } catch {
    console.log(`No actionmaps.xml at ${userXmlPath} — using CIG defaults only`)
  }

  const parsed = parseBindings(defaultXml, userXml)
  const actions = flattenActions(parsed)
  const generated = generateMissingBinds(actions)

  const outDir = resolve(__dirname, 'output')
  mkdirSync(outDir, { recursive: true })
  const csvPath = resolve(outDir, `SCK3_Keymap_${timestamp()}.csv`)
  writeFileSync(csvPath, buildKeyMapCsv(actions, generated), 'utf-8')

  console.log(`Total actions: ${actions.length}, generated: ${generated.length}`)
  console.log(`Written: ${csvPath}`)
}

main()
