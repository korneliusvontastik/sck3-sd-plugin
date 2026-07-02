// Shared property inspector bootstrap for this plugin's Elgato Stream Deck property inspectors.
// Centralizes the WebSocket connect/register/send logic so the context/uuid invariant below only
// has to be correct in one place, instead of being hand-copied into every *.html file.
window.PICommon = (function () {
  "use strict";

  let sd = null;
  let _action = "";
  let _context = "";
  let onMessage = () => {};
  let onStatusChange = () => {};

  function connect(port, uuid, registerEvent) {
    sd = new WebSocket("ws://localhost:" + port);

    sd.onopen = () => {
      sd.send(JSON.stringify({ event: registerEvent, uuid }));
      onStatusChange("Connected");
    };

    sd.onmessage = (raw) => {
      onMessage(JSON.parse(raw.data));
    };

    sd.onclose = () => { onStatusChange("Disconnected"); };
  }

  function send(payload) {
    if (!sd || sd.readyState !== WebSocket.OPEN) return;
    sd.send(JSON.stringify({ event: "sendToPlugin", action: _action, context: _context, payload }));
  }

  // Wires up window.connectElgatoStreamDeckSocket, the entry point Stream Deck calls once it
  // loads this property inspector.
  //   defaultAction — fallback action UUID if actionInfo can't be parsed.
  //   handlers.onMessage(ev) — called for every message received on the socket.
  //   handlers.onStatusChange(status) — called with "Connected"/"Disconnected".
  function init(defaultAction, handlers) {
    if (handlers?.onMessage) onMessage = handlers.onMessage;
    if (handlers?.onStatusChange) onStatusChange = handlers.onStatusChange;

    // Stream Deck registers this websocket connection as a property inspector using `uuid` (the
    // 2nd arg) — that same value is what it expects back as `context` on outgoing sendToPlugin
    // messages. Using actionInfo.context instead (a different id) makes Stream Deck's native app
    // log "Received messageType 'sendToPlugin' from the wrong context" and silently drop it.
    window.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, info, actionInfoStr) {
      _context = uuid;
      _action = defaultAction;
      try {
        const actionInfo = JSON.parse(actionInfoStr);
        _action = actionInfo.action ?? _action;
      } catch (e) {
        // Fall back to the default above
      }
      connect(port, uuid, registerEvent);
    };
  }

  return { init, send };
})();
