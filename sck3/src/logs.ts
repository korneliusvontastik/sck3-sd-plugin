import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export const LOG_DIR = join(process.cwd(), "logs");
export const LOG_PATH = join(LOG_DIR, "com.kvt.sck3.0.log");

/** Reads the last N lines of the plugin's own (current) log file. Returns [] if not found. */
export function tailPluginLog(maxLines = 100): string[] {
	try {
		return readFileSync(LOG_PATH, "utf8")
			.split(/\r?\n/)
			.filter(Boolean)
			.slice(-maxLines);
	} catch {
		return [];
	}
}

export type OpenPathResult = { ok: boolean; error?: string };

/**
 * Opens a file (in its default associated app) or folder (in Explorer) via cmd's `start`
 * builtin. Uses execFileSync with an argv array — not string-interpolated execSync — so paths
 * containing quotes or shell metacharacters can't break out into arbitrary command execution.
 * Any thrown error (spawn failure, non-zero exit, or timeout) is reported as a failure — Node's
 * child_process only sets `.status` (not `.code`) for a non-zero exit, so treating `.code` as the
 * sole failure signal silently misreports a real "couldn't open this" (e.g. a stale/deleted path)
 * as success.
 */
export function openPath(path: string): OpenPathResult {
	try {
		execFileSync("cmd.exe", ["/c", "start", "", path], { timeout: 3000 });
		return { ok: true };
	} catch (err) {
		return { ok: false, error: String(err) };
	}
}
