import {
	action,
	KeyAction,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
	streamDeck,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { listScInstalls, channelName, getBuildInfo } from "../keybindkrafter/pathsfinder.js";
import type { ScPaths } from "../keybindkrafter/pathsfinder.js";
import { getActiveChannel, setActiveChannel, discoveredChannelNames } from "../global-channel.js";
import { openPath } from "../logs.js";
import { renderKeyLabel } from "../rendering/keyLabel.js";

const logger = streamDeck.logger.createScope("ChannelIndicator");

const COLOR_LIVE = "#44ff77";
const COLOR_PTU = "#ffcc00";
const COLOR_EPTU = "#ff8800";
const COLOR_HOTFIX = "#ff4444";
// Any channel name that isn't one of the four known ones above — e.g. TECH-PREVIEW or a future
// CIG-named preview branch — gets this color rather than a per-name entry.
const COLOR_OTHER = "#cc66ff";
const COLOR_NONE = "#888888";

type ChannelInfo = { name: string; path: string; version: string | null; branch: string | null };

// Key-face instances currently on screen, keyed by context id — kept in sync so a channel switch
// triggered by ANY of them (or by the property inspector) updates every one of them at once.
const visibleActions = new Map<string, KeyAction>();

let lastSwitch: { channel: string; at: string } | null = null;

function channelColor(name: string): string {
	switch (name) {
		case "LIVE":
			return COLOR_LIVE;
		case "PTU":
			return COLOR_PTU;
		case "EPTU":
			return COLOR_EPTU;
		case "HOTFIX":
			return COLOR_HOTFIX;
		default:
			return COLOR_OTHER;
	}
}

/**
 * Splits a dotted build version (e.g. "4.8.184.2887") into key-face lines: major.minor grouped
 * onto one line, then each remaining segment on its own line — "4.8.", "184.", "2887" — so the
 * full version stays legible on the key face instead of overflowing or shrinking to fit one line.
 */
function versionLines(version: string): string[] {
	const parts = version.split(".");
	if (parts.length < 3) return [version];
	const [major, minor, ...rest] = parts;
	const last = rest.pop()!; // parts.length >= 3 checked above, so rest always has >= 1 element
	return [`${major}.${minor}.`, ...rest.map(p => `${p}.`), last];
}

function describeInstall(paths: ScPaths): ChannelInfo {
	const build = getBuildInfo(paths);
	return { name: channelName(paths), path: paths.root, version: build?.version ?? null, branch: build?.branch ?? null };
}

/** Resolves which install is "active" given a possibly-stale channel name — same fallback rule as resolveActiveChannelPaths(). */
function computeActiveInfo(activeChannel: string | null): ChannelInfo | null {
	const installs = listScInstalls();
	const match = activeChannel ? installs.find(p => channelName(p) === activeChannel) : null;
	const active = match ?? installs[0] ?? null;
	return active ? describeInstall(active) : null;
}

async function applyChannelDisplay(
	action: { setTitle(t: string): Promise<void>; setImage(i: string): Promise<void> },
	info: ChannelInfo | null
): Promise<void> {
	const label = info ? [info.name, ...(info.version ? versionLines(info.version) : [])].join("\n") : "NO SC\nFOUND";
	const color = info ? channelColor(info.name) : COLOR_NONE;
	await action.setTitle("");
	await action.setImage(renderKeyLabel(label, color));
}

async function refreshAllVisible(activeChannel: string | null): Promise<void> {
	const info = computeActiveInfo(activeChannel);
	for (const action of visibleActions.values()) {
		await applyChannelDisplay(action, info);
	}
}

async function pushState(activeChannel: string | null): Promise<void> {
	const now = new Date().toISOString();
	const channels = listScInstalls().map(paths => ({ ...describeInstall(paths), checkedAt: now }));
	await streamDeck.ui.sendToPropertyInspector({
		type: "channels",
		payload: { activeChannel, channels, checkedAt: now, lastSwitch },
	});
}

/**
 * Switches the active channel and updates everything ourselves immediately — this action owns the
 * switch, so it doesn't need to wait on any broadcast to know it happened. Shared by the physical
 * key press and the property inspector's dropdown.
 */
async function performSwitch(name: string): Promise<void> {
	await setActiveChannel(name);
	lastSwitch = { channel: name, at: new Date().toISOString() };
	await refreshAllVisible(name);
	await pushState(name);
}

@action({ UUID: "com.kvt.sck3.channelindicator" })
export class ChannelIndicator extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (!ev.action.isKey()) return;
		visibleActions.set(ev.action.id, ev.action);
		const active = await getActiveChannel();
		logger.info(`Found ${listScInstalls().length} SC install(s)`);
		await applyChannelDisplay(ev.action, computeActiveInfo(active));
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		visibleActions.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const installs = listScInstalls();
		if (installs.length === 0) {
			await applyChannelDisplay(ev.action, null);
			logger.info("No SC installs found");
			return;
		}

		const active = await getActiveChannel();
		const names = installs.map(channelName);
		const currentIdx = active ? names.indexOf(active) : -1;
		const next = names[(currentIdx + 1) % installs.length];

		await performSwitch(next);
		await ev.action.showOk();
		logger.info(`Switched to channel: ${next}`);
	}

	override async onPropertyInspectorDidAppear(): Promise<void> {
		const active = await getActiveChannel();
		await pushState(active);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Record<string, never>>): Promise<void> {
		const msg = ev.payload as Record<string, unknown>;

		if (msg["event"] === "setActiveChannel") {
			const requested = msg["channel"];
			if (typeof requested === "string" && discoveredChannelNames().includes(requested)) {
				await performSwitch(requested);
				logger.info(`Switched to channel: ${requested} (via property inspector)`);
			} else {
				logger.error(`Rejected channel switch request: ${String(requested)}`);
			}
		}

		if (msg["event"] === "openPath") {
			// Only ever opens a path this plugin itself discovered, re-resolved server-side from a
			// fresh scan by channel name — never trusts a raw path string from the property inspector.
			const requested = msg["channel"];
			const install = typeof requested === "string" ? listScInstalls().find(p => channelName(p) === requested) : undefined;
			if (install) {
				logger.info(`Opening channel folder: ${install.root}`);
				const result = openPath(install.root);
				if (!result.ok) logger.error(`Failed to open channel folder: ${result.error}`);
			}
		}
	}
}
