import {
	action,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	PropertyInspectorDidAppearEvent,
	PropertyInspectorDidDisappearEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	streamDeck,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import {
	parseBindings,
	flattenActions,
	generateMissingBinds,
	validateFinal,
	formatReport,
	type RunResult,
	type RunPhase,
} from "../keybindkrafter/index.js";
import { serializeCustomProfile, mergeGeneratedIntoActionMaps } from "../keybindkrafter/serializer.js";
import { isStarCitizenRunning, channelName, getBuildInfo } from "../keybindkrafter/pathsfinder.js";
import { resolveActivePaths, onActiveChannelChanged } from "../global-channel.js";
import { extractEntry } from "../keybindkrafter/p4k.js";
import { isCryXml, cryXmlToXml } from "../keybindkrafter/cryxml.js";
import { RUN_PHASES, buildDoneOkIcon, buildDoneWarnIcon, buildErrorIcon, buildPhaseIcon } from "./keybind-auto-fill-icons.js";
import { LOG_DIR, openPath } from "../logs.js";

const logger = streamDeck.logger.createScope("KeybindAutoFill");

const DEFAULT_PROFILE_ENTRY = "Data/Libs/Config/defaultProfile.xml";

// Phases like extract/read/generate often finish within a few ms, which makes the icon flicker
// through them unreadably fast. Holding each phase's icon on screen for a beat makes the run feel
// like a sequence of steps rather than a glitch.
const PHASE_DISPLAY_DELAY_MS = 400;
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Action-instance ids seen since this process started. Settings (including lastResult) persist
// across plugin restarts, but the process doesn't — the first onWillAppear for a given context
// after a restart is treated as an implicit soft-restart so a stale DONE/FAILED face doesn't
// survive a `streamdeck restart`.
const seenContexts = new Set<string>();

// Contexts with a run currently in flight. The physical key and the property inspector's "Run"
// box both funnel into runOrSoftRestart independently — without this, a second trigger arriving
// before the first run's initial phase round-trip completes (the only thing the PI's client-side
// isRunning flag waits for) would start a second concurrent run() writing to the same files and
// racing on which one's result ends up in settings.
const runningContexts = new Set<string>();

type KeybindAutoFillSettings = {
	lastResult: RunResult | null;
	autoReplace: boolean;
};

function defaults(s: Partial<KeybindAutoFillSettings>): KeybindAutoFillSettings {
	return {
		lastResult: s.lastResult ?? null,
		autoReplace: s.autoReplace ?? true,
	};
}

async function currentChannelInfo(): Promise<{ name: string; version: string | null } | null> {
	try {
		const paths = await resolveActivePaths();
		return { name: channelName(paths), version: getBuildInfo(paths)?.version ?? null };
	} catch {
		return null;
	}
}

// The property inspector currently open, if any — used to re-push its state when the globally
// selected channel changes elsewhere (e.g. a Channel Indicator button switch), without needing
// per-instance settings to flow through a context-less global-settings event.
let openPiAction: KeyAction<KeybindAutoFillSettings> | null = null;

onActiveChannelChanged(async () => {
	if (!openPiAction) return;
	const settings = defaults((await openPiAction.getSettings()) as Partial<KeybindAutoFillSettings>);
	await pushToPropertyInspector(settings);
});

/** Compact local-time timestamp for filenames, e.g. 2026-07-01 21:32:41 -> "260701213241". */
function filenameTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		pad(d.getFullYear() % 100) +
		pad(d.getMonth() + 1) +
		pad(d.getDate()) +
		pad(d.getHours()) +
		pad(d.getMinutes()) +
		pad(d.getSeconds())
	);
}

async function extractDefaultProfile(dataP4kPath: string): Promise<string> {
	const raw = await extractEntry(dataP4kPath, DEFAULT_PROFILE_ENTRY);
	return isCryXml(raw) ? cryXmlToXml(raw) : raw.toString("utf8");
}

function iconForStatus(status: RunResult["status"], conflictCount: number): string {
	if (status === "ok") return buildDoneOkIcon();
	if (status === "warn") return buildDoneWarnIcon(conflictCount);
	return buildErrorIcon();
}

// Input-side collisions (default/default, user/default, user/user) are pre-existing state we
// didn't cause and can't fix — only errors (output collisions, coverage gaps) reflect problems
// with this run's own output, so only those count toward the badge and ok/warn status.
function conflictCountOf(result: RunResult): number {
	return result.validation?.issues.filter(i => i.severity === "error").length ?? 0;
}

async function pushToPropertyInspector(settings: KeybindAutoFillSettings): Promise<void> {
	const channel = await currentChannelInfo();
	await streamDeck.ui.sendToPropertyInspector({
		type: "settings",
		payload: {
			...settings,
			currentChannel: channel?.name ?? null,
			currentChannelVersion: channel?.version ?? null,
			channelCheckedAt: new Date().toISOString(),
		},
	});
}

@action({ UUID: "com.kvt.sck3.keybindautofill" })
export class KeybindAutoFill extends SingletonAction<KeybindAutoFillSettings> {
	override async onWillAppear(ev: WillAppearEvent<KeybindAutoFillSettings>): Promise<void> {
		const settings = defaults(ev.payload.settings as Partial<KeybindAutoFillSettings>);
		const isFreshProcess = !seenContexts.has(ev.action.id);
		seenContexts.add(ev.action.id);

		if (settings.lastResult && isFreshProcess) {
			await ev.action.setSettings({ ...settings, lastResult: null });
			await ev.action.setImage();
			return;
		}

		if (settings.lastResult) {
			await ev.action.setImage(iconForStatus(settings.lastResult.status, conflictCountOf(settings.lastResult)));
		} else {
			await ev.action.setImage();
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeybindAutoFillSettings>): Promise<void> {
		await pushToPropertyInspector(defaults(ev.payload.settings));
	}

	override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<KeybindAutoFillSettings>): Promise<void> {
		if (ev.action.isKey()) openPiAction = ev.action;
		const settings = defaults((await ev.action.getSettings()) as Partial<KeybindAutoFillSettings>);
		await pushToPropertyInspector(settings);
	}

	override onPropertyInspectorDidDisappear(ev: PropertyInspectorDidDisappearEvent<KeybindAutoFillSettings>): void {
		if (openPiAction?.id === ev.action.id) openPiAction = null;
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, KeybindAutoFillSettings>): Promise<void> {
		const msg = ev.payload as Record<string, unknown>;
		const saved = defaults((await ev.action.getSettings()) as Partial<KeybindAutoFillSettings>);

		if (msg["event"] === "setAutoReplace") {
			await ev.action.setSettings({ ...saved, autoReplace: Boolean(msg["value"]) });
		}
		if (msg["event"] === "openPath") {
			// Only ever opens paths this plugin itself wrote, looked up from the authoritative
			// lastResult — never trusts a raw path string from the property inspector.
			const kind = msg["kind"];
			const events = saved.lastResult?.events;
			const path = events && typeof kind === "string" && kind in events ? events[kind as keyof typeof events]?.path : undefined;
			if (path) {
				logger.info(`Opening file: ${path}`);
				const result = openPath(path);
				if (!result.ok) logger.error(`Failed to open file: ${result.error}`);
			}
		}
		if (msg["event"] === "run" && ev.action.isKey()) {
			await this.runOrSoftRestart(ev.action, saved);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<KeybindAutoFillSettings>): Promise<void> {
		const settings = defaults(ev.payload.settings as Partial<KeybindAutoFillSettings>);
		await this.runOrSoftRestart(ev.action, settings);
	}

	// Shared by the physical key press and the "Run" box in the property inspector — both trigger
	// the exact same behavior: soft restart if a persisted result face is showing, otherwise run.
	private async runOrSoftRestart(action: KeyAction<KeybindAutoFillSettings>, settings: KeybindAutoFillSettings): Promise<void> {
		// If the button is currently showing a persisted result face (DONE/WARN/FAILED), this
		// press is a soft restart: reset to the base icon and wait for the next press to
		// actually run, rather than immediately re-running on top of the old result.
		if (settings.lastResult) {
			const resetSettings: KeybindAutoFillSettings = { ...settings, lastResult: null };
			await action.setSettings(resetSettings);
			await action.setImage();
			await pushToPropertyInspector(resetSettings);
			logger.info("Soft restart — back to base icon");
			return;
		}

		if (runningContexts.has(action.id)) {
			logger.info("Run already in progress — ignoring duplicate trigger");
			return;
		}
		runningContexts.add(action.id);
		try {
			await this.run(action, settings);
		} finally {
			runningContexts.delete(action.id);
		}
	}

	private async run(action: KeyAction<KeybindAutoFillSettings>, settings: KeybindAutoFillSettings): Promise<void> {
		logger.info("Key pressed");

		const result: RunResult = {
			status: "error",
			startedAt: new Date().toISOString(),
			finishedAt: "",
			channel: null,
			phases: [],
			events: {
				defaultProfileExtracted: null,
				actionMapsRead: null,
				customProfileWritten: null,
				actionMapsWritten: null,
				reportWritten: null,
			},
			validation: null,
			bindsGenerated: 0,
			errorMessage: null,
		};

		const enterPhase = async (phaseIndex: number, phaseKey: RunPhase, label: string): Promise<void> => {
			result.phases.push(phaseKey);
			await action.setImage(buildPhaseIcon(phaseIndex, label));
			await streamDeck.ui.sendToPropertyInspector({
				type: "phase",
				payload: { phase: phaseKey, label, index: phaseIndex, total: RUN_PHASES.length },
			});
			await sleep(PHASE_DISPLAY_DELAY_MS);
		};

		try {
			// Phase 1 — discover SC install
			await enterPhase(0, "discover", RUN_PHASES[0].label);
			const paths = await resolveActivePaths();
			const channel = channelName(paths);
			result.channel = channel;
			logger.info(`SC root: ${paths.root} (${channel})`);

			// Phase 2 — extract defaultProfile.xml from Data.p4k
			await enterPhase(1, "extract", RUN_PHASES[1].label);
			const defaultProfileXml = await extractDefaultProfile(paths.dataP4k);
			result.events.defaultProfileExtracted = { timestamp: new Date().toISOString(), path: paths.dataP4k };
			logger.info(`defaultProfile.xml: ${defaultProfileXml.length} chars`);

			// Phase 3 — read the player's current actionmaps.xml (may not exist yet — fresh install
			// or the player never launched the game; treat as "no existing binds" rather than failing)
			await enterPhase(2, "read", RUN_PHASES[2].label);
			let userActionMapsXml = "";
			try {
				userActionMapsXml = readFileSync(paths.actionMapsPath, "utf8");
				result.events.actionMapsRead = { timestamp: new Date().toISOString(), path: paths.actionMapsPath };
			} catch {
				logger.info(`actionmaps.xml not found at ${paths.actionMapsPath} — starting from CIG defaults only`);
			}

			// Phase 4 — parse + generate + validate
			await enterPhase(3, "generate", RUN_PHASES[3].label);
			const parsed = parseBindings(defaultProfileXml, userActionMapsXml);
			const actions = flattenActions(parsed);
			const generated = generateMissingBinds(actions);
			result.validation = validateFinal(actions, generated, parsed.defaultBoundCount, parsed.userBoundCount);
			result.bindsGenerated = generated.length;
			logger.info(`Generated ${generated.length} binds`);

			// Phase 5 — write files
			await enterPhase(4, "write", RUN_PHASES[4].label);
			mkdirSync(paths.mappingsDir, { recursive: true });
			const timestamp = filenameTimestamp(new Date());
			const outputFile = `SCK3_Generated_Keybinds_${timestamp}.xml`;
			const customProfilePath = join(paths.mappingsDir, outputFile);
			writeFileSync(customProfilePath, serializeCustomProfile(parsed, actions, generated, "SCK3_Generated", userActionMapsXml), "utf8");
			result.events.customProfileWritten = { timestamp: new Date().toISOString(), path: customProfilePath };
			logger.info(`Written: ${customProfilePath}`);

			if (settings.autoReplace && !isStarCitizenRunning()) {
				// No existing actionmaps.xml to overlay onto (fresh install / deleted by user) —
				// write a brand new one from the same final bind set instead of merging.
				const actionMapsXml = userActionMapsXml
					? mergeGeneratedIntoActionMaps(userActionMapsXml, actions, generated)
					: serializeCustomProfile(parsed, actions, generated, "default");
				mkdirSync(dirname(paths.actionMapsPath), { recursive: true });
				writeFileSync(paths.actionMapsPath, actionMapsXml, "utf8");
				result.events.actionMapsWritten = { timestamp: new Date().toISOString(), path: paths.actionMapsPath };
				logger.info(userActionMapsXml ? "actionmaps.xml updated" : "actionmaps.xml created (none existed)");
			}

			result.status = result.validation.valid ? "ok" : "warn";
			result.finishedAt = new Date().toISOString();

			// Written to the plugin's own log folder, not the SC mappings folder — that folder is
			// reserved for .xml keybind profiles only. Shares its timestamp with the generated profile;
			// the PI's report box is too small to read a large conflict list, so this is meant to be
			// opened in a real text editor.
			mkdirSync(LOG_DIR, { recursive: true });
			const reportPath = join(LOG_DIR, `SCK3_Generated_Keybinds_${timestamp}.report.txt`);
			writeFileSync(reportPath, formatReport(result), "utf8");
			result.events.reportWritten = { timestamp: new Date().toISOString(), path: reportPath };
			logger.info(`Report written: ${reportPath}`);

			const newSettings: KeybindAutoFillSettings = { ...settings, lastResult: result };
			await action.setSettings(newSettings);
			await pushToPropertyInspector(newSettings);

			const conflictCount = conflictCountOf(result);
			if (result.status === "ok") {
				await action.showOk();
			} else {
				await action.showAlert();
			}
			await action.setImage(iconForStatus(result.status, conflictCount));
			logger.info("Done");
		} catch (err) {
			result.status = "error";
			result.finishedAt = new Date().toISOString();
			result.errorMessage = String(err);
			logger.error(`Failed: ${err}`);

			try {
				mkdirSync(LOG_DIR, { recursive: true });
				const reportPath = join(LOG_DIR, `SCK3_Run_Failed_${filenameTimestamp(new Date())}.report.txt`);
				writeFileSync(reportPath, formatReport(result), "utf8");
				result.events.reportWritten = { timestamp: new Date().toISOString(), path: reportPath };
			} catch {
				// Best-effort — don't let report writing mask the original error.
			}

			const newSettings: KeybindAutoFillSettings = { ...settings, lastResult: result };
			await action.setSettings(newSettings);
			await pushToPropertyInspector(newSettings);

			await action.setImage(buildErrorIcon());
		}
	}
}
