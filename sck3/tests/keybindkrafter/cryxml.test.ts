import { describe, it, expect } from 'vitest'
import { isCryXml, cryXmlToXml } from '../../src/keybindkrafter/cryxml.js'

interface AttrSpec {
	name: string
	value: string
}

interface NodeSpec {
	tagName: string
	attrs: AttrSpec[]
	children: NodeSpec[]
}

// Builds a real CryXmlB buffer from a tree spec, so tests exercise the
// actual binary layout (header, node table, reference table, string table)
// rather than mocking the parser.
function buildCryXmlBuffer(root: NodeSpec): Buffer {
	type FlatNode = { tagName: string; attrs: AttrSpec[]; parentId: number }
	const flat: FlatNode[] = []

	function walk(node: NodeSpec, parentId: number): void {
		const id = flat.length
		flat.push({ tagName: node.tagName, attrs: node.attrs, parentId })
		for (const child of node.children) walk(child, id)
	}
	walk(root, -1)

	const strings: string[] = []
	const offsetOf = new Map<string, number>()
	let contentLength = 0
	function intern(s: string): number {
		const existing = offsetOf.get(s)
		if (existing !== undefined) return existing
		const offset = contentLength
		offsetOf.set(s, offset)
		strings.push(s)
		contentLength += Buffer.byteLength(s, 'utf8') + 1
		return offset
	}

	const nodeNameOffsets = flat.map((n) => intern(n.tagName))
	const references: { nameOffset: number; valueOffset: number }[] = []
	for (const node of flat) {
		for (const attr of node.attrs) {
			references.push({ nameOffset: intern(attr.name), valueOffset: intern(attr.value) })
		}
	}

	const HEADER_SIZE = 44
	const NODE_SIZE = 28
	const REF_SIZE = 8

	const nodeTableOffset = HEADER_SIZE
	const referenceTableOffset = nodeTableOffset + flat.length * NODE_SIZE
	const contentOffset = referenceTableOffset + references.length * REF_SIZE
	const fileLength = contentOffset + contentLength

	const buf = Buffer.alloc(fileLength)
	buf.write('CryXmlB\0', 0, 'utf8')
	let o = 8
	buf.writeInt32LE(fileLength, o); o += 4
	buf.writeInt32LE(nodeTableOffset, o); o += 4
	buf.writeInt32LE(flat.length, o); o += 4
	buf.writeInt32LE(referenceTableOffset, o); o += 4
	buf.writeInt32LE(references.length, o); o += 4
	buf.writeInt32LE(0, o); o += 4 // OrderTableOffset — unused
	buf.writeInt32LE(0, o); o += 4 // OrderTableCount — unused
	buf.writeInt32LE(contentOffset, o); o += 4
	buf.writeInt32LE(contentLength, o); o += 4

	let attrIndex = 0
	o = nodeTableOffset
	flat.forEach((node, i) => {
		buf.writeInt32LE(nodeNameOffsets[i]!, o)
		buf.writeInt32LE(0, o + 4) // ItemType — unused
		buf.writeInt16LE(node.attrs.length, o + 8)
		buf.writeInt16LE(0, o + 10) // ChildCount — unused
		buf.writeInt32LE(node.parentId, o + 12)
		buf.writeInt32LE(attrIndex, o + 16) // FirstAttributeIndex — unused by parser
		buf.writeInt32LE(-1, o + 20) // FirstChildIndex — unused
		buf.writeInt32LE(0, o + 24) // Reserved
		attrIndex += node.attrs.length
		o += NODE_SIZE
	})

	o = referenceTableOffset
	for (const ref of references) {
		buf.writeInt32LE(ref.nameOffset, o)
		buf.writeInt32LE(ref.valueOffset, o + 4)
		o += REF_SIZE
	}

	o = contentOffset
	for (const s of strings) {
		o += buf.write(s, o, 'utf8')
		buf.writeUInt8(0, o)
		o += 1
	}

	return buf
}

describe('isCryXml', () => {
	it('detects the CryXmlB magic header', () => {
		const buf = buildCryXmlBuffer({ tagName: 'Root', attrs: [], children: [] })
		expect(isCryXml(buf)).toBe(true)
	})

	it('returns false for plain XML', () => {
		expect(isCryXml(Buffer.from('<Root/>', 'utf8'))).toBe(false)
	})
})

describe('cryXmlToXml', () => {
	it('converts a tree with attributes and nested children', () => {
		const buf = buildCryXmlBuffer({
			tagName: 'ActionMaps',
			attrs: [{ name: 'version', value: '1' }],
			children: [
				{ tagName: 'action', attrs: [{ name: 'name', value: 'v_eject' }], children: [] },
				{
					tagName: 'action',
					attrs: [
						{ name: 'name', value: 'v_target_nearest' },
						{ name: 'desc', value: 'Target Nearest' },
					],
					children: [],
				},
			],
		})

		expect(cryXmlToXml(buf)).toBe(
			'<?xml version="1.0" encoding="utf-8"?>\n' +
				'<ActionMaps version="1">' +
				'<action name="v_eject"/>' +
				'<action name="v_target_nearest" desc="Target Nearest"/>' +
				'</ActionMaps>',
		)
	})

	it('escapes special characters in attribute values', () => {
		const buf = buildCryXmlBuffer({
			tagName: 'Root',
			attrs: [{ name: 'label', value: 'A & B <C> "D"' }],
			children: [],
		})

		expect(cryXmlToXml(buf)).toBe(
			'<?xml version="1.0" encoding="utf-8"?>\n<Root label="A &amp; B &lt;C&gt; &quot;D&quot;"/>',
		)
	})

	it('handles multi-byte UTF-8 attribute values without misaligning the string table', () => {
		const buf = buildCryXmlBuffer({
			tagName: 'Root',
			attrs: [
				{ name: 'label', value: 'héllo wörld' },
				{ name: 'next', value: 'ok' },
			],
			children: [],
		})

		expect(cryXmlToXml(buf)).toBe(
			'<?xml version="1.0" encoding="utf-8"?>\n<Root label="héllo wörld" next="ok"/>',
		)
	})

	it('throws on a non-CryXmlB buffer', () => {
		expect(() => cryXmlToXml(Buffer.from('not cryxml', 'utf8'))).toThrow(/CryXmlB/)
	})
})
