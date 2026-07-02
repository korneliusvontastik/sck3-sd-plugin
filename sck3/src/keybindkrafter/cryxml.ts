/**
 * CryXmlB → plain XML conversion.
 *
 * CryXmlB is CIG/CryEngine's binary XML encoding used inside Data.p4k for
 * files like defaultProfile.xml. This parser is adapted from
 * Markemp/CryXmlViewer's CryXmlSerializer (TypeScript), which itself traces
 * to dolkensp/unp4k's CryXmlSerializer.cs — the original reverse-engineering
 * of the format. See ACKNOWLEDGEMENTS.md.
 *
 * Deviations from the upstream reference: output is XML-escaped (the
 * original does not escape attribute values, which can produce invalid XML
 * for values containing &, <, >, or "), and a missing root node throws
 * instead of silently returning an empty string.
 */

const CRYXML_MAGIC = Buffer.from('CryXmlB\0', 'utf8')

const NODE_SIZE = 28
const REFERENCE_SIZE = 8

interface HeaderInfo {
	nodeTableOffset: number
	nodeTableCount: number
	referenceTableOffset: number
	referenceTableCount: number
	contentOffset: number
}

interface Node {
	nodeNameOffset: number
	attributeCount: number
	parentNodeId: number
}

interface Reference {
	nameOffset: number
	valueOffset: number
}

interface XmlElement {
	tagName: string
	attributes: [string, string][]
	children: XmlElement[]
}

export function isCryXml(buf: Buffer): boolean {
	return buf.subarray(0, CRYXML_MAGIC.length).equals(CRYXML_MAGIC)
}

function readHeader(buf: Buffer): HeaderInfo {
	let offset = CRYXML_MAGIC.length
	offset += 4 // FileLength — unused

	const nodeTableOffset = buf.readInt32LE(offset)
	offset += 4
	const nodeTableCount = buf.readInt32LE(offset)
	offset += 4
	const referenceTableOffset = buf.readInt32LE(offset)
	offset += 4
	const referenceTableCount = buf.readInt32LE(offset)
	offset += 4
	offset += 4 // OrderTableOffset — unused
	offset += 4 // OrderTableCount — unused
	const contentOffset = buf.readInt32LE(offset)

	return { nodeTableOffset, nodeTableCount, referenceTableOffset, referenceTableCount, contentOffset }
}

function readNodeTable(buf: Buffer, header: HeaderInfo): Node[] {
	const nodes: Node[] = []
	let offset = header.nodeTableOffset

	for (let i = 0; i < header.nodeTableCount; i++) {
		nodes.push({
			nodeNameOffset: buf.readInt32LE(offset),
			attributeCount: buf.readInt16LE(offset + 8),
			parentNodeId: buf.readInt32LE(offset + 12),
		})
		offset += NODE_SIZE
	}

	return nodes
}

function readReferenceTable(buf: Buffer, header: HeaderInfo): Reference[] {
	const references: Reference[] = []
	let offset = header.referenceTableOffset

	for (let i = 0; i < header.referenceTableCount; i++) {
		references.push({
			nameOffset: buf.readInt32LE(offset),
			valueOffset: buf.readInt32LE(offset + 4),
		})
		offset += REFERENCE_SIZE
	}

	return references
}

// Strings are null-terminated UTF-8, keyed by their byte offset relative to
// the content table start (matches how node/attribute name & value offsets
// are encoded in the format).
function buildStringTable(buf: Buffer, header: HeaderInfo): Map<number, string> {
	const table = new Map<number, string>()
	let offset = header.contentOffset

	while (offset < buf.length) {
		const start = offset
		let end = offset
		while (end < buf.length && buf[end] !== 0x00) end++

		table.set(start - header.contentOffset, buf.toString('utf8', start, end))
		offset = end + 1
	}

	return table
}

function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function toXmlString(el: XmlElement): string {
	const attrs = el.attributes.map(([name, value]) => `${name}="${escapeXmlAttr(value)}"`).join(' ')
	const openAttrs = attrs ? ` ${attrs}` : ''

	if (el.children.length === 0) {
		return `<${el.tagName}${openAttrs}/>`
	}

	const childrenXml = el.children.map(toXmlString).join('')
	return `<${el.tagName}${openAttrs}>${childrenXml}</${el.tagName}>`
}

export function cryXmlToXml(buf: Buffer): string {
	if (!isCryXml(buf)) {
		throw new Error('Buffer is not CryXmlB-encoded')
	}

	const header = readHeader(buf)
	const nodes = readNodeTable(buf, header)
	const references = readReferenceTable(buf, header)
	const strings = buildStringTable(buf, header)

	const elements: XmlElement[] = nodes.map((node) => ({
		tagName: strings.get(node.nodeNameOffset) ?? 'unknown',
		attributes: [],
		children: [],
	}))

	// Attribute references are consumed sequentially in node order — the
	// format has no per-node attribute start index, so this mirrors the
	// upstream parser's running-counter approach.
	let attributeIndex = 0
	nodes.forEach((node, i) => {
		for (let a = 0; a < node.attributeCount; a++) {
			const ref = references[attributeIndex++]
			if (!ref) continue
			elements[i].attributes.push([strings.get(ref.nameOffset) ?? '', strings.get(ref.valueOffset) ?? ''])
		}
	})

	nodes.forEach((node, i) => {
		const parent = elements[node.parentNodeId]
		if (node.parentNodeId >= 0 && parent) {
			parent.children.push(elements[i])
		}
	})

	const root = elements[0]
	if (!root) {
		throw new Error('CryXmlB buffer has no root node')
	}

	return `<?xml version="1.0" encoding="utf-8"?>\n${toXmlString(root)}`
}
