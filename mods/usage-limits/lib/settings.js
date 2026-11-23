import { inPanel, isShown, spendOnBar } from "./prefs.js";
import { hasLimits, limitsSettled } from "./view.js";
import { PROVIDERS } from "../providers/index.js";

export const NOT_INSTALLED = "not installed";
const IDLE = "no use in 7 days";

export const spendBarOn = (prefs, states, providerId, providers = PROVIDERS) => spendOnBar(prefs, providerId, limitsSettled(states, prefs, providers) && !hasLimits(states, providers));

const shownReading = (s) => (s.report?.status === "ok" ? s.report : s.lastGood);
const failureMessage = (s) => (s.report && s.report.status !== "ok" ? s.report.message : null);

function spendReason(missing, idle, s) {
  if (missing) return NOT_INSTALLED;
  if (idle) return IDLE;
  return failureMessage(s);
}

function spendRow(p, s, prefs, states, providers) {
  const missing = s.installed === false;
  const idle = !missing && shownReading(s)?.spend?.week === 0;
  return { kind: "spend", provider: p, on: spendBarOn(prefs, states, p.id, providers), dim: missing || idle, reason: spendReason(missing, idle, s), inPanel: inPanel(prefs, p.id), windows: [] };
}

function limitsRow(p, s, prefs) {
  const missing = s.installed === false;
  const on = isShown(prefs, p.id);
  const windows = (shownReading(s)?.windows ?? []).map((w) => {
    const offBarByDefault = w.offBarByDefault === true;
    return { id: w.id, long: w.long, offBarByDefault, on: on && isShown(prefs, p.id, w.id, offBarByDefault) };
  });
  return { kind: "limits", provider: p, on, dim: missing, reason: missing ? NOT_INSTALLED : failureMessage(s), inPanel: inPanel(prefs, p.id), windows };
}

export function settingsRows(prefs, states, providers = PROVIDERS) {
  return providers.map((p) => {
    const s = states[p.id] ?? {};
    return p.kind === "spend" ? spendRow(p, s, prefs, states, providers) : limitsRow(p, s, prefs);
  });
}
