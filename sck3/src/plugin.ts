import streamDeck from "@elgato/streamdeck";

import { KeybindAutoFill } from "./actions/keybind-auto-fill.js";
import { ChannelIndicator } from "./actions/channel-indicator.js";
import { OpenLogs } from "./actions/open-logs.js";

streamDeck.actions.registerAction(new KeybindAutoFill());
streamDeck.actions.registerAction(new ChannelIndicator());
streamDeck.actions.registerAction(new OpenLogs());

streamDeck.connect();
