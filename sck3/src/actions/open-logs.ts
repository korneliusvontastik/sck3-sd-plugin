import {
	action,
	KeyDownEvent,
	PropertyInspectorDidAppearEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	streamDeck,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { LOG_PATH, openPath, tailPluginLog } from "../logs.js";
import { renderKeyLabel } from "../rendering/keyLabel.js";

const logger = streamDeck.logger.createScope("OpenLogs");

async function pushLogsToPropertyInspector(): Promise<void> {
	await streamDeck.ui.sendToPropertyInspector({
		type: "logs",
		payload: {
			logTail: tailPluginLog(),
			logPath: LOG_PATH,
		},
	});
}

@action({ UUID: "com.kvt.sck3.openlogs" })
export class OpenLogs extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		await ev.action.setImage(renderKeyLabel("SCK3 PLUGIN LOGS"));
	}

	override async onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent): Promise<void> {
		await pushLogsToPropertyInspector();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Record<string, never>>): Promise<void> {
		const msg = ev.payload as Record<string, unknown>;
		if (msg["event"] === "openLogs") {
			logger.info(`Opening log file: ${LOG_PATH}`);
			const result = openPath(LOG_PATH);
			if (result.ok) {
				logger.info("Log file opened");
			} else {
				logger.error(`Failed to open log file: ${result.error}`);
			}
			await pushLogsToPropertyInspector();
		}
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const result = openPath(LOG_PATH);
		if (result.ok) {
			logger.info("Opened log file");
			await ev.action.showOk();
		} else {
			logger.error(`Failed to open log file: ${result.error}`);
			await ev.action.showAlert();
		}
	}
}
