// Dev-only tool. Extracts the full, live defaultProfile.xml from a local Star Citizen
// install's Data.p4k using the plugin's own ZIP64/CryXmlB reader, and writes it to
// reference/defaultProfile.xml for manual inspection (mouse/axis action structure, etc.).
// NOT part of the shipped plugin.
//
// Usage (from scripts/, after `npm install` once):
//   npx tsx extract-default-profile.ts [path/to/Data.p4k]
// Defaults to E:\Roberts Space Industries\StarCitizen\LIVE\Data.p4k

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractEntry } from '../sck3/src/keybindkrafter/p4k.js'
import { isCryXml, cryXmlToXml } from '../sck3/src/keybindkrafter/cryxml.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

async function main() {
  const p4kArg = process.argv[2]
  const p4kPath = p4kArg ?? String.raw`E:\Roberts Space Industries\StarCitizen\LIVE\Data.p4k`

  console.log(`Reading ${p4kPath} ...`)
  const buf = await extractEntry(p4kPath, 'Data/Libs/Config/defaultProfile.xml')
  console.log(`Extracted entry: ${buf.length} bytes`)

  const xml = isCryXml(buf) ? cryXmlToXml(buf) : buf.toString('utf-8')
  console.log(`Decoded XML: ${xml.length} chars`)

  const outDir = resolve(REPO_ROOT, 'reference')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'defaultProfile.xml')
  writeFileSync(outPath, xml, 'utf-8')
  console.log(`Written: ${outPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
