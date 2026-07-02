import type { RunPhase } from "../keybindkrafter/index.js";
import { renderKeyLabel } from "../rendering/keyLabel.js";

export const RUN_PHASES: { key: RunPhase; label: string }[] = [
	{ key: "discover", label: "SCAN" },
	{ key: "extract", label: "EXTRACT" },
	{ key: "read", label: "READ" },
	{ key: "generate", label: "GENERATE" },
	{ key: "write", label: "WRITE" },
];

const COLOR_OK = "#44ff77";
const COLOR_WARN = "#ffcc00";
const COLOR_ERROR = "#ff4444";

/** In-progress face for a run phase, e.g. "SCAN" stacked over "1/5". */
export function buildPhaseIcon(phaseIndex: number, label: string): string {
	return renderKeyLabel(`${label}\n${phaseIndex + 1}/${RUN_PHASES.length}`);
}

/** Persistent green-text face shown after a run with no issues at all. */
export function buildDoneOkIcon(): string {
	return renderKeyLabel("KBIND\nAUTO\nFILL\nDONE", COLOR_OK);
}

/** Persistent amber-text face shown after a run with warnings/conflicts. */
export function buildDoneWarnIcon(conflictCount: number): string {
	const middle = conflictCount > 0 ? `${conflictCount} CONFLICT${conflictCount === 1 ? "" : "S"}` : "WARNING";
	return renderKeyLabel(`DONE\n${middle}\nCHECK LOGS`, COLOR_WARN);
}

/** Persistent red-text face shown after a run that threw. */
export function buildErrorIcon(): string {
	return renderKeyLabel("FAILED", COLOR_ERROR);
}
