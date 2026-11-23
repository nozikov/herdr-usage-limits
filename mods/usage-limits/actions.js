import { setShared, shared } from "herdr";
import { PANEL_CLOSE_DELAY_MS } from "./lib/mod.js";
import { KEY_BINDINGS } from "./lib/session-binding.js";
import { closedSinceLeft, hoveredAfter, panelOnEnter } from "./lib/view.js";
import { spendBarOn } from "./lib/settings.js";
import { toggleFolded, toggleOnBar, togglePanel, toggleProvider, toggleShowBars, toggleShowResetTime, toggleSpendOnBar, toggleWindow } from "./lib/prefs.js";

export const KEY_STATE = "usage-limits.state";
export const KEY_PREFS = "usage-limits.prefs";
export const KEY_REFRESH = "usage-limits.refresh";
const REFRESH_COOLDOWN_S = 30;
const SESSION_REREAD_ON_HOVER_MS = 10 * 1000;

export const nowS = () => Math.floor(Date.now() / 1000);
export const states = () => shared(KEY_STATE) ?? {};
export const refreshCooling = () => nowS() - Math.floor((shared(KEY_REFRESH) ?? 0) / 1000) < REFRESH_COOLDOWN_S;

function sessionActions(view) {
  const reread = (cx) => {
    view.sessionRevision += 1;
    view.readSession(cx);
    cx.notify();
  };
  return {
    togglePicker(cx) {
      view.sessionChoosing = !view.sessionChoosing;
      cx.notify();
    },
    chooseSession(row, cx) {
      const choices = view.sessionChoices;
      if (!view.terminal || !choices?.choices.includes(row)) return;
      setShared(KEY_BINDINGS, { ...(shared(KEY_BINDINGS) ?? {}), [view.terminal]: { pid: choices.pid, identity: choices.identity, id: row.id } });
      view.sessionChoices = null;
      view.sessionChoosing = false;
      reread(cx);
    },
    changeSession(cx) {
      const { [view.terminal]: _dropped, ...bindings } = shared(KEY_BINDINGS) ?? {};
      setShared(KEY_BINDINGS, bindings);
      view.session = null;
      view.sessionManual = false;
      reread(cx);
    },
  };
}

function pointerActions(view) {
  const hover = (on, cx) => {
    if (!on) {
      view.leftAtMs = Date.now();
      return;
    }
    if (closedSinceLeft(view.leftAtMs, Date.now(), PANEL_CLOSE_DELAY_MS)) view.hovered = null;
    view.panel = panelOnEnter(view.panel, view.leftAtMs, Date.now(), PANEL_CLOSE_DELAY_MS);
    view.leftAtMs = null;
    if (Date.now() - view.sessionReadAtMs >= SESSION_REREAD_ON_HOVER_MS) view.readSession(cx);
    cx.notify();
  };
  return {
    hover,
    hoverPanel(on, cx) {
      if (!on && view.hovered != null) {
        view.hovered = null;
        cx.notify();
      }
      hover(on, cx);
    },
    hoverHeader(id, on, cx) {
      view.hovered = hoveredAfter(view.hovered, id, on);
      cx.notify();
    },
    resize(size, cx) {
      view.width = size.width;
      cx.notify();
    },
  };
}

function panelActions(view) {
  return {
    show(panel, cx) {
      view.panel = panel;
      cx.notify();
    },
    refresh(cx) {
      if (!refreshCooling()) setShared(KEY_REFRESH, Date.now());
      cx.notify();
    },
    fold(id, cx) {
      setShared(KEY_PREFS, toggleFolded(view.prefs(), id));
      cx.notify();
    },
  };
}

function prefsActions(view) {
  const save = (change) => setShared(KEY_PREFS, change(view.prefs()));
  return {
    togglePanel: (id) => save((p) => togglePanel(p, id)),
    toggleProvider: (id) => save((p) => toggleProvider(p, id)),
    toggleWindow: (providerId, windowId, offBarByDefault) => save((p) => toggleWindow(p, providerId, windowId, offBarByDefault)),
    toggleSpendBar: (id) => save((p) => toggleSpendOnBar(p, id, spendBarOn(p, states(), id, view.providers))),
    toggleResetTime: () => save(toggleShowResetTime),
    toggleBars: () => save(toggleShowBars),
    toggleOnBar: (row) => save((p) => toggleOnBar(p, row)),
  };
}

export function viewActions(view) {
  return { ...sessionActions(view), ...pointerActions(view), ...panelActions(view), ...prefsActions(view) };
}
