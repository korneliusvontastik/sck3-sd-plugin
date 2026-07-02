import { open, type FileHandle } from 'node:fs/promises'
import { inflateRawSync, zstdDecompressSync } from 'node:zlib'
import { createDecipheriv } from 'node:crypto'

// CIG encrypts some entries with AES-128-CBC using the CryEngine public key (the same
// key embedded in all CryEngine-based games and documented by community tools such as
// dolkensp/unp4k and StarCitizenToolBox/unp4k_rs).
const P4K_AES_KEY = Buffer.from([0x5e, 0x7a, 0x20, 0x02, 0x30, 0x2e, 0xeb, 0x1a, 0x3b, 0xb6, 0x17, 0xc3, 0x0f, 0xde, 0x1e, 0x47])
const P4K_AES_IV = Buffer.alloc(16, 0) // all zeros

function decryptP4k(data: Buffer): Buffer {
	// CIG uses zero-padding (not PKCS7) to the 16-byte AES block boundary, so disable
	// Node's auto-padding to avoid a spurious "bad decrypt" error on the final block.
	const decipher = createDecipheriv('aes-128-cbc', P4K_AES_KEY, P4K_AES_IV)
	decipher.setAutoPadding(false)
	return Buffer.concat([decipher.update(data), decipher.final()])
}

// Data.p4k declares a valid Zip64 End Of Central Directory comment but CIG appends a
// few extra bytes after it, which strict zip readers (e.g. yauzl) reject outright.
// This reader locates the EOCD by scanning backward instead of requiring it to sit
// at the exact end of the file, then walks the central directory ourselves.

const EOCD_SIG = 0x06054b50
const EOCD64_LOCATOR_SIG = 0x07064b50
const EOCD64_SIG = 0x06064b50
const CENTRAL_DIR_SIG = 0x02014b50
const LOCAL_FILE_SIG = 0x04034b50
const ZIP64_EXTRA_TAG = 0x0001

const EOCD_SEARCH_WINDOW = 4 * 1024 * 1024 // generous tail window to tolerate trailing junk

interface CentralDirLocation {
	offset: number
	size: number
}

async function locateCentralDirectory(fh: FileHandle, fileSize: number): Promise<CentralDirLocation> {
	const windowSize = Math.min(EOCD_SEARCH_WINDOW, fileSize)
	const tail = Buffer.alloc(windowSize)
	await fh.read(tail, 0, windowSize, fileSize - windowSize)

	let eocdOffsetInTail = -1
	for (let i = tail.length - 22; i >= 0; i--) {
		if (tail.readUInt32LE(i) === EOCD_SIG) {
			eocdOffsetInTail = i
			break
		}
	}
	if (eocdOffsetInTail === -1) {
		throw new Error('Could not locate End Of Central Directory record — file may not be a valid zip archive')
	}
	const eocdFileOffset = fileSize - windowSize + eocdOffsetInTail

	const cdOffset32 = tail.readUInt32LE(eocdOffsetInTail + 16)
	const cdSize32 = tail.readUInt32LE(eocdOffsetInTail + 12)
	const totalEntries16 = tail.readUInt16LE(eocdOffsetInTail + 10)
	const looksLikeZip64 = cdOffset32 === 0xffffffff || cdSize32 === 0xffffffff || totalEntries16 === 0xffff

	if (!looksLikeZip64) {
		return { offset: cdOffset32, size: cdSize32 }
	}

	// Zip64 EOCD Locator (20 bytes) immediately precedes the standard EOCD record.
	const locatorOffset = eocdFileOffset - 20
	const locator = Buffer.alloc(20)
	await fh.read(locator, 0, 20, locatorOffset)
	if (locator.readUInt32LE(0) !== EOCD64_LOCATOR_SIG) {
		throw new Error('Expected Zip64 End Of Central Directory Locator was not found before the EOCD record')
	}
	const eocd64Offset = Number(locator.readBigUInt64LE(8))

	// Fixed portion of the Zip64 EOCD record: sig(4) + size(8) + verMadeBy(2) + verNeeded(2)
	// + diskNum(4) + diskWithCD(4) + entriesOnDisk(8) + totalEntries(8) + cdSize(8) + cdOffset(8) = 56 bytes
	const eocd64 = Buffer.alloc(56)
	await fh.read(eocd64, 0, 56, eocd64Offset)
	if (eocd64.readUInt32LE(0) !== EOCD64_SIG) {
		throw new Error('Expected Zip64 End Of Central Directory record was not found at the offset given by its locator')
	}
	const cdSize = Number(eocd64.readBigUInt64LE(40))
	const cdOffset = Number(eocd64.readBigUInt64LE(48))
	return { offset: cdOffset, size: cdSize }
}

interface CentralDirEntry {
	fileName: string
	compressionMethod: number
	compressedSize: number
	localHeaderOffset: number
}

function parseCentralDirectory(buf: Buffer): CentralDirEntry[] {
	const entries: CentralDirEntry[] = []
	let pos = 0
	while (pos + 46 <= buf.length && buf.readUInt32LE(pos) === CENTRAL_DIR_SIG) {
		const compressionMethod = buf.readUInt16LE(pos + 10)
		const uncompressedSize32 = buf.readUInt32LE(pos + 24)
		let compressedSize = buf.readUInt32LE(pos + 20)
		const fileNameLength = buf.readUInt16LE(pos + 28)
		const extraFieldLength = buf.readUInt16LE(pos + 30)
		const fileCommentLength = buf.readUInt16LE(pos + 32)
		let localHeaderOffset = buf.readUInt32LE(pos + 42)

		const fileNameStart = pos + 46
		// Data.p4k uses backslashes as path separators (non-standard); normalize to forward slashes
		const fileName = buf.toString('utf8', fileNameStart, fileNameStart + fileNameLength).replaceAll('\\', '/')

		const extraStart = fileNameStart + fileNameLength
		const extraEnd = extraStart + extraFieldLength
		if (compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
			let extraPos = extraStart
			while (extraPos + 4 <= extraEnd) {
				const tag = buf.readUInt16LE(extraPos)
				const size = buf.readUInt16LE(extraPos + 2)
				if (tag === ZIP64_EXTRA_TAG) {
					// Fields appear in this order, each present only if its 32-bit
					// counterpart above was the 0xFFFFFFFF sentinel.
					let zip64Pos = extraPos + 4
					if (uncompressedSize32 === 0xffffffff) zip64Pos += 8
					if (compressedSize === 0xffffffff) {
						compressedSize = Number(buf.readBigUInt64LE(zip64Pos))
						zip64Pos += 8
					}
					if (localHeaderOffset === 0xffffffff) {
						localHeaderOffset = Number(buf.readBigUInt64LE(zip64Pos))
						zip64Pos += 8
					}
				}
				extraPos += 4 + size
			}
		}

		entries.push({ fileName, compressionMethod, compressedSize, localHeaderOffset })
		pos = extraEnd + fileCommentLength
	}
	return entries
}

/**
 * Reads a single named entry out of Data.p4k (a ~150 GB ZIP64 archive) without
 * scanning the whole file. Only the central directory (a small index near the
 * end of the file) and the requested entry's compressed bytes are read.
 */
export async function extractEntry(p4kPath: string, entryPath: string): Promise<Buffer> {
	const fh = await open(p4kPath, 'r')
	try {
		const { size: fileSize } = await fh.stat()
		const { offset: cdOffset, size: cdSize } = await locateCentralDirectory(fh, fileSize)

		const cdBuf = Buffer.alloc(cdSize)
		await fh.read(cdBuf, 0, cdSize, cdOffset)
		const entries = parseCentralDirectory(cdBuf)

		const entry = entries.find((e) => e.fileName === entryPath)
		if (!entry) {
			throw new Error(`Entry not found in ${p4kPath}: ${entryPath}`)
		}

		const localHeader = Buffer.alloc(30)
		await fh.read(localHeader, 0, 30, entry.localHeaderOffset)
		if (localHeader.readUInt32LE(0) !== LOCAL_FILE_SIG) {
			throw new Error(`Local file header signature mismatch for entry: ${entryPath}`)
		}
		const generalPurposeFlag = localHeader.readUInt16LE(6)
		if ((generalPurposeFlag & 0x0001) !== 0) {
			throw new Error(`Entry is encrypted, extraction not supported: ${entryPath}`)
		}
		const localNameLen = localHeader.readUInt16LE(26)
		const localExtraLen = localHeader.readUInt16LE(28)
		const dataOffset = entry.localHeaderOffset + 30 + localNameLen + localExtraLen

		const compressed = Buffer.alloc(entry.compressedSize)
		await fh.read(compressed, 0, entry.compressedSize, dataOffset)

		switch (entry.compressionMethod) {
			case 0:
				return compressed
			case 8:
				return inflateRawSync(compressed)
			case 93:
				return zstdDecompressSync(compressed)
			case 100: {
				// CIG custom method: ZStd, optionally AES-128-CBC encrypted.
				// If the compressed data starts with the ZStd magic (0xFD2FB528 LE),
				// it is unencrypted and can be decompressed directly. Otherwise it is
				// AES encrypted — pad to the 16-byte block boundary, decrypt, then
				// decompress. (Same logic as dolkensp/unp4k and unp4k_rs.)
				const ZSTD_MAGIC = 0xfd2fb528
				if (compressed.length >= 4 && compressed.readUInt32LE(0) === ZSTD_MAGIC) {
					return zstdDecompressSync(compressed)
				}
				const paddedSize = Math.ceil(entry.compressedSize / 16) * 16
				if (paddedSize === entry.compressedSize) {
					return zstdDecompressSync(decryptP4k(compressed))
				}
				const padded = Buffer.alloc(paddedSize)
				compressed.copy(padded)
				await fh.read(padded, entry.compressedSize, paddedSize - entry.compressedSize, dataOffset + entry.compressedSize)
				return zstdDecompressSync(decryptP4k(padded))
			}
			default:
				throw new Error(`Unsupported compression method ${entry.compressionMethod} for entry: ${entryPath}`)
		}
	} finally {
		await fh.close()
	}
}
