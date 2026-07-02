import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractEntry } from '../../src/keybindkrafter/p4k.js'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample.zip')

describe('extractEntry', () => {
	it('returns the contents of the requested entry', async () => {
		const buf = await extractEntry(FIXTURE, 'Data/Libs/Config/sample.xml')
		expect(buf.toString('utf8')).toBe('<Root attr="value"/>')
	})

	it('ignores entries that do not match the requested path', async () => {
		const buf = await extractEntry(FIXTURE, 'Other/readme.txt')
		expect(buf.toString('utf8')).toBe('not the file we want')
	})

	it('rejects when the entry does not exist in the archive', async () => {
		await expect(extractEntry(FIXTURE, 'Data/Libs/Config/missing.xml')).rejects.toThrow(/not found/)
	})

	it('rejects when the archive itself does not exist', async () => {
		await expect(extractEntry(join(dirname(FIXTURE), 'does-not-exist.zip'), 'x')).rejects.toThrow()
	})
})
