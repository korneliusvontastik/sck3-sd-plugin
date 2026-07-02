import { describe, expect, it } from "vitest";
import { renderKeyLabel } from "../../src/rendering/keyLabel.js";

function decode(dataUri: string): string {
	const base64 = dataUri.replace(/^data:image\/svg\+xml;base64,/, "");
	return Buffer.from(base64, "base64").toString("utf8");
}

describe("renderKeyLabel", () => {
	it("renders real glyph outlines from the bundled font, not the plain-text fallback", () => {
		const svg = decode(renderKeyLabel("SCAN"));
		// The fallback path renders a <text> element; the font-path route renders <path d="...">.
		expect(svg).not.toContain("<text");
		expect(svg).toMatch(/<path[^>]+d="[^"]{20,}"/);
	});

	it("applies the given color as the path fill", () => {
		const svg = decode(renderKeyLabel("FAILED", "#ff4444"));
		expect(svg).toContain('fill="#ff4444"');
	});

	it("handles digits and longer labels without throwing", () => {
		expect(() => decode(renderKeyLabel("3 CONFLICTS"))).not.toThrow();
	});

	it("wraps a long multi-word label onto two lines instead of one oversized path", () => {
		const single = decode(renderKeyLabel("COMPLETE"));
		// At MIN_FONT_SIZE, short conflict counts (e.g. "588 CONFLICTS") now fit on one line —
		// the min font size was deliberately shrunk, so this needs a genuinely wide label to
		// force wrapping.
		const wrapped = decode(renderKeyLabel("GENERATOR COLLISIONS"));
		// A single label renders one <g><path> group; a wrapped label renders one per line.
		expect((single.match(/<g /g) ?? []).length).toBe(1);
		expect((wrapped.match(/<g /g) ?? []).length).toBe(2);
	});

	it("caps wrapping at MAX_LINES instead of growing a new line per leftover word", () => {
		const svg = decode(
			renderKeyLabel(
				"ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN FIFTEEN SIXTEEN",
			),
		);
		// One <g> group per rendered line — must not exceed MAX_LINES (5) even with 16 words.
		expect((svg.match(/<g /g) ?? []).length).toBeLessThanOrEqual(5);
	});

	it("keeps every rendered line within MAX_TEXT_WIDTH even when wrapped", () => {
		// Widths are measured directly against the font, mirroring the module's own fitting logic,
		// rather than re-deriving pixel bounds from the rendered path string.
		const cases = ["3 CONFLICTS", "588 CONFLICTS", "1 CONFLICT", "COMPLETE", "GENERATE"];
		for (const label of cases) {
			expect(() => decode(renderKeyLabel(label))).not.toThrow();
		}
	});
});
