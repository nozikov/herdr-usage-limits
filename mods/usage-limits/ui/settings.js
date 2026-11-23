import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { SESSION_TITLE, iconButton, providerIcon, rule } from "./kit.js";
import { panelShell } from "./panel.js";
import { inPanel, isOnBar } from "../lib/prefs.js";
import { settingsRows } from "../lib/settings.js";

const PANEL_BOX_W = 40;
const WINDOW_INDENT = 21;
const SESSION_NUMBERS = ["Context", "Calls", "Compactions"];
const DATA_NOTE = "Data: claude, codex, agy, opencode, opencode go and pi, from their local files and OpenCode's usage endpoint.";

function checkBox(on, t) {
  return div().size(13).rounded(3).border(1).border_color(on ? t.accent : t.input).bg(on ? t.accent : t.popover)
    .flex().items_center().justify_center().text_size(9).text_color(t.accent_foreground).child(on ? "✓" : "");
}

function toggling(onToggle) {
  return (_e, cx) => {
    onToggle();
    cx.notify();
  };
}

function withBox(row, { on, label, extra, onToggle }, t) {
  return row.gap(8).items_center().py(3).cursor_pointer()
    .on_click(toggling(onToggle))
    .child(checkBox(on, t))
    .children(label)
    .when(extra != null, (e) => e.child(div().text_color(t.dim).truncate().child(extra)));
}

function panelBox({ id, on, onToggle, inRow = false }, t) {
  return div().id(id).w(PANEL_BOX_W).flex_none().flex().justify_end().when(inRow, (e) => e.items_center().py(3)).cursor_pointer()
    .on_click(toggling(onToggle))
    .child(checkBox(on, t));
}

function check(box, t) {
  const { id, indent = 0, panel = null } = box;
  if (panel == null) return withBox(h_flex().id(id).pl(indent).rounded(4).hover((s) => s.bg(t.hover)), box, t);
  return h_flex().id(id).items_stretch().pl(indent).rounded(4)
    .hover((s) => s.bg(t.hover))
    .child(withBox(h_flex().id(`${id}-bar`).flex_1().min_w(0), box, t))
    .child(panelBox({ id: `${id}-panel`, on: panel.on, onToggle: panel.onToggle, inRow: true }, t));
}

const text = (content, color) => div().text_color(color).child(content);

function providerChecks(row, act, t) {
  const p = row.provider;
  const color = row.dim ? t.dim : t.foreground;
  const panel = { on: row.inPanel, onToggle: () => act.togglePanel(p.id) };
  const onToggle = row.kind === "spend" ? () => act.toggleSpendBar(p.id) : () => act.toggleProvider(p.id);
  const head = check({ id: `p-${p.id}`, on: row.on, label: [providerIcon(p.id, p.icon, color), text(p.name, color)], onToggle, extra: row.reason, panel }, t);
  const windows = row.windows.map((w) => check({
    id: `w-${p.id}-${w.id}`, on: w.on, label: [text(w.long, row.on ? t.muted : t.dim)], onToggle: () => act.toggleWindow(p.id, w.id, w.offBarByDefault), indent: WINDOW_INDENT,
  }, t));
  return [head, ...windows];
}

function header(canGoBack, act, t) {
  return h_flex().gap(6).items_center().h(24)
    .when(canGoBack, (e) => e.child(iconButton({ id: "ul-back", icon: "back", label: "Back to limits", enabled: true, onClick: (cx) => act.show("limits", cx) }, t)))
    .child(div().font_semibold().child("Settings"));
}

function sessionChecks(prefs, act, t) {
  return v_flex().gap(1)
    .child(h_flex().items_center().pb(3)
      .child(div().flex_1().font_semibold().child(SESSION_TITLE))
      .child(panelBox({ id: "panel-session", on: inPanel(prefs, "session"), onToggle: () => act.togglePanel("session") }, t)))
    .children(SESSION_NUMBERS.map((name) => {
      const id = name.toLowerCase();
      return check({ id: `s-${id}`, on: isOnBar(prefs, id), label: [text(name, t.foreground)], onToggle: () => act.toggleOnBar(id) }, t);
    }));
}

export function settingsPanel(canGoBack, states, panel) {
  const { t, act, prefs } = panel;
  return panelShell(panel)
    .child(header(canGoBack, act, t))
    .child(h_flex().items_center().text_size(11).text_color(t.dim)
      .child(div().child("Bar")).child(div().flex_1()).child(div().child("Panel")))
    .child(v_flex().gap(1).children(settingsRows(prefs, states, panel.providers).flatMap((row) => providerChecks(row, act, t))))
    .child(rule(t))
    .child(check({ id: "opt-reset-time", on: prefs.showResetTime, label: [text("Always show time to reset", t.foreground)], onToggle: act.toggleResetTime }, t))
    .child(check({ id: "opt-bars", on: prefs.showBars, label: [text("Show bars", t.foreground)], onToggle: act.toggleBars }, t))
    .child(rule(t))
    .child(sessionChecks(prefs, act, t))
    .child(div().text_size(10.5).text_color(t.dim).child(DATA_NOTE));
}
