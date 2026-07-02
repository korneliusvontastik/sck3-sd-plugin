import streamDeck from "@elgato/streamdeck";
import { listScInstalls, channelName, resolveActiveChannelPaths, type ScPaths } from "./keybindkrafter/pathsfinder.js";

export type GlobalChannelSettings = {
	activeChannel: string | null;
};

type ActiveChannelListener = (name: string | null) => void | Promise<void>;

// In-process pub/sub for "the active channel changed" — used instead of Stream Deck's own
// didReceiveGlobalSettings broadcast, which Elgato's SDK only documents as guaranteed to fire for
// getGlobalSettings(), not for a plugin's own setGlobalSettings() echoing back to itself. Every
// action in this plugin lives in the same Node process, so a plain in-memory subscription is both
// simpler and actually reliable, unlike depending on unverified platform echo behavior.
const listeners = new Set<ActiveChannelListener>();

/** Called whenever the active channel changes, from any action in this plugin. */
export function onActiveChannelChanged(listener: ActiveChannelListener): void {
	listeners.add(listener);
}

let cached: string | null | undefined = undefined;

/** Reads the plugin-wide selected channel name (e.g. "LIVE", "PTU"), or null if never set. */
export async function getActiveChannel(): Promise<string | null> {
	if (cached !== undefined) return cached;
	const settings = await streamDeck.settings.getGlobalSettings<GlobalChannelSettings>();
	cached = settings.activeChannel ?? null;
	return cached;
}

/**
 * Sets the plugin-wide selected channel. Only ever called with a name re-validated against a
 * fresh listScInstalls() scan by the caller — never trusts an unchecked string straight through.
 * Updates the cache and notifies in-process listeners immediately, then persists to Stream Deck's
 * global settings so the value survives a plugin restart.
 */
export async function setActiveChannel(name: string): Promise<void> {
	cached = name;
	for (const listener of listeners) void listener(name);
	await streamDeck.settings.setGlobalSettings<GlobalChannelSettings>({ activeChannel: name });
}

/** Resolves the ScPaths for the currently active channel (see resolveActiveChannelPaths()). */
export async function resolveActivePaths(): Promise<ScPaths> {
	const active = await getActiveChannel();
	return resolveActiveChannelPaths(active);
}

/** Discovered channel names, freshly scanned — used to validate a requested channel switch. */
export function discoveredChannelNames(): string[] {
	return listScInstalls().map(channelName);
}
