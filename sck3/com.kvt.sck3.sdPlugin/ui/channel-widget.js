// Shared "active channel" display logic for this plugin's property inspectors. Centralizes the
// channel -> color/class/label mapping so channel-indicator.html (the interactive owner — its
// dropdown is the only place a channel switch actually happens) and keybind-auto-fill.html (a
// read-only consumer of whichever channel is globally active) can't drift out of visual sync with
// each other, or with the equivalent channelColor() in src/actions/channel-indicator.ts.
window.ChannelWidget = (function () {
  "use strict";

  const CLASSES = { LIVE: "live", PTU: "ptu", EPTU: "eptu", HOTFIX: "hotfix" };
  const COLORS = { LIVE: "#44ff77", PTU: "#ffcc00", EPTU: "#ff8800", HOTFIX: "#ff4444" };
  const COLOR_OTHER = "#cc66ff";

  function dotClass(name) {
    return "channel-dot" + (name ? " " + (CLASSES[name] ?? "other") : "");
  }

  function color(name) {
    return name ? (COLORS[name] ?? COLOR_OTHER) : null;
  }

  function label(entry) {
    if (!entry) return null;
    return entry.version ? `${entry.name} ${entry.version}` : entry.name;
  }

  /** Renders a plain "dot + NAME VERSION" pair into existing elements — no interaction. */
  function renderReadOnly(dotEl, textEl, name, entry) {
    dotEl.className = dotClass(name);
    textEl.textContent = label(entry) ?? name ?? "—";
    textEl.style.color = color(name) ?? "";
  }

  return { dotClass, color, label, renderReadOnly };
})();
