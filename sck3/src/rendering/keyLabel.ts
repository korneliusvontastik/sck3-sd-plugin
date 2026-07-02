import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseFont, type Font } from "opentype.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const FONT_FALLBACK = "Consolas, 'Courier New', monospace";
const VIEWBOX = 72;
// 5px margin on every side — the label area is smaller than the full key canvas.
const MARGIN = 5;
const MAX_TEXT_WIDTH = VIEWBOX - MARGIN * 2;
const MAX_TEXT_HEIGHT = VIEWBOX - MARGIN * 2;
// Design spec:
const MAX_FONT_SIZE = 10;
const MIN_FONT_SIZE = 10;
const MAX_LINES = 5;
// Explicit "\n" breaks (e.g. stacked status icons) are author-controlled, so they get more
// headroom than auto word-wrap — MAX_LINES exists to stop wrapping from producing an
// unreadably tall stack of short lines, which doesn't apply when the caller chose the breaks.
const MAX_FORCED_LINES = 5;
const LINE_HEIGHT_RATIO = 1.15;
// Font size used to measure advance width before scaling to fit MAX_TEXT_WIDTH.
const REFERENCE_SIZE = 100;

let font: Font | null | undefined; // undefined = not attempted yet, null = load/parse failed

// Two candidate locations for the bundled font: relative to the compiled bin/ directory at
// runtime (com.kvt.sck3.sdPlugin/bin/plugin.js -> ../fonts), and relative to this source file
// when running unbundled (e.g. under Vitest, straight from src/rendering/).
const FONT_CANDIDATES = [
	join(__dirname, "..", "fonts", "UAV-OSD-Mono.ttf"),
	join(__dirname, "..", "..", "com.kvt.sck3.sdPlugin", "fonts", "UAV-OSD-Mono.ttf"),
];

function getFont(): Font | null {
	if (font !== undefined) return font;
	for (const fontPath of FONT_CANDIDATES) {
		try {
			font = parseFont(readFileSync(fontPath));
			return font;
		} catch {
			// try the next candidate
		}
	}
	font = null;
	return font;
}

function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Font size (clamped to [MIN_FONT_SIZE, MAX_FONT_SIZE]) that fits `text` within MAX_TEXT_WIDTH. */
function fitSizeForWidth(f: Font, text: string): number {
	const referenceWidth = f.getAdvanceWidth(text, REFERENCE_SIZE);
	const fitted = referenceWidth > 0 ? (MAX_TEXT_WIDTH / referenceWidth) * REFERENCE_SIZE : MAX_FONT_SIZE;
	return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fitted));
}

/** Shortens `text` to fit `maxWidth` at `size`, appending an ellipsis if anything was cut. */
function truncateToWidth(f: Font, text: string, size: number, maxWidth: number): string {
	const ELLIPSIS = "…";
	if (f.getAdvanceWidth(text, size) <= maxWidth) return text;
	let truncated = text;
	while (truncated.length > 0) {
		truncated = truncated.slice(0, -1).trimEnd();
		if (f.getAdvanceWidth(`${truncated}${ELLIPSIS}`, size) <= maxWidth) return `${truncated}${ELLIPSIS}`;
	}
	return ELLIPSIS;
}

/** Greedily packs words onto lines that fit MAX_TEXT_WIDTH at `size`, capped at MAX_LINES. */
function wrapWords(f: Font, words: string[], size: number): string[] {
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (!current || f.getAdvanceWidth(candidate, size) <= MAX_TEXT_WIDTH) {
			current = candidate;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	if (lines.length <= MAX_LINES) return lines;

	// More words than fit on MAX_LINES: rather than letting the overflow bleed off the key
	// (contradicting the "never bleed" guarantee below), truncate the final line to width.
	const kept = lines.slice(0, MAX_LINES - 1);
	const overflow = lines.slice(MAX_LINES - 1).join(" ");
	kept.push(truncateToWidth(f, overflow, size, MAX_TEXT_WIDTH));
	return kept;
}

/** Plain <text> fallback for the rare case the bundled TTF fails to load/parse. */
function renderFallback(label: string, color: string): string {
	const fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, MAX_TEXT_WIDTH / (label.length * 0.6)));
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWBOX}" height="${VIEWBOX}">` +
		`<text x="${VIEWBOX / 2}" y="${VIEWBOX / 2 + fontSize * 0.35}" font-family="${FONT_FALLBACK}" ` +
		`font-size="${fontSize}" fill="${color}" text-anchor="middle">${escapeXml(label)}</text>` +
		`</svg>`
	);
}

/**
 * Renders `text` centered on a Stream Deck key using the bundled OSD font. Rather than embedding
 * the font via @font-face (unreliable — Stream Deck's key-image rasterizer doesn't consistently
 * support custom fonts even when the font data loads correctly), the text is converted to raw SVG
 * path outlines ourselves via opentype.js. The result depends on no font support at the render
 * target at all. No background is drawn — the key's existing image shows through.
 *
 * Text that doesn't fit on one line at MIN_FONT_SIZE is word-wrapped onto up to MAX_LINES lines
 * instead of being allowed to shrink further or bleed off the key — MIN_FONT_SIZE is treated as
 * an actual legibility floor, not just a starting point for shrinking.
 *
 * Returns a data: URI suitable for `action.setImage()`.
 */
export function renderKeyLabel(text: string, color = "#ffffff"): string {
	const label = text.toUpperCase();
	const f = getFont();
	if (!f) {
		const fallbackLabel = label.replace(/\n/g, " ");
		return `data:image/svg+xml;base64,${Buffer.from(renderFallback(fallbackLabel, color)).toString("base64")}`;
	}

	// An explicit "\n" is a hard line break (e.g. a phase name stacked over its "n/total"
	// counter) — skip auto word-wrap so the two segments never get packed onto one line.
	let lines: string[];
	if (label.includes("\n")) {
		lines = label.split("\n").filter(Boolean).slice(0, MAX_FORCED_LINES);
	} else {
		const words = label.split(/\s+/).filter(Boolean);
		const singleLineFits = words.length <= 1 || f.getAdvanceWidth(label, MIN_FONT_SIZE) <= MAX_TEXT_WIDTH;
		lines = singleLineFits ? [label] : wrapWords(f, words, MIN_FONT_SIZE);
	}

	// Pick the largest size (up to MAX_FONT_SIZE) that still fits every resulting line —
	// short wrapped lines (e.g. a lone digit) can often render bigger than MIN_FONT_SIZE.
	let fontSize = Math.max(MIN_FONT_SIZE, Math.min(...lines.map(line => fitSizeForWidth(f, line))));

	// Keep the whole stacked block within the vertical margin too — matters most when
	// MAX_LINES lines are all near MAX_FONT_SIZE.
	const blockHeight = lines.length * fontSize * LINE_HEIGHT_RATIO;
	if (blockHeight > MAX_TEXT_HEIGHT) {
		fontSize = Math.max(MIN_FONT_SIZE, fontSize * (MAX_TEXT_HEIGHT / blockHeight));
	}
	const lineHeight = fontSize * LINE_HEIGHT_RATIO;

	const rendered = lines.map((line, i) => {
		const path = f.getPath(line, 0, i * lineHeight, fontSize);
		path.fill = color;
		const bbox = path.getBoundingBox();
		return { path, bbox, dx: VIEWBOX / 2 - (bbox.x1 + bbox.x2) / 2 };
	});

	const yMin = Math.min(...rendered.map(r => r.bbox.y1));
	const yMax = Math.max(...rendered.map(r => r.bbox.y2));
	const dy = VIEWBOX / 2 - (yMin + yMax) / 2;

	const pathMarkup = rendered
		.map(r => `<g transform="translate(${r.dx.toFixed(2)}, ${dy.toFixed(2)})">${r.path.toSVG(2)}</g>`)
		.join("");

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWBOX}" height="${VIEWBOX}">${pathMarkup}</svg>`;

	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
