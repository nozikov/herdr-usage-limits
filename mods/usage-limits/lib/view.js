// What the bar and its hover card show, as plain data. Pure: no Herdr imports.
import { timeLeft, resetClock, level, pace, ago } from "./format.js";
import { isShown } from "./prefs.js";
import { PROVIDERS } from "../providers/index.js";

const STALE_AFTER = 15 * 60; // s

// text is the full reading; brief is what's left when the bar runs out of room:
// an amber or red window keeps its time, a calm one gives it up.
export function segmentView(w, now, showResetTime = false) {
  if (w.resetsAt != null && w.resetsAt <= now) {
    return { id: w.id, short: w.short, text: "—", brief: "—", level: "ok", fill: 0, tick: null, expired: true };
  }
  const lv = level(w.percent);
  const left = w.resetsAt != null ? ` · ${timeLeft(w.resetsAt - now)}` : "";
  const brief = `${w.percent}%${lv !== "ok" ? left : ""}`;
  return {
    id: w.id,
    short: w.short,
    text: showResetTime ? `${w.percent}%${left}` : brief,
    brief,
    level: lv,
    fill: Math.min(1, Math.max(0, w.percent / 100)),
    tick: pace(w, now)?.elapsed ?? null,
    expired: false,
  };
}

function windowLine(w, now) {
  if (w.resetsAt != null && w.resetsAt <= now) return `${w.long} — reset, waiting for a new reading`;
  const parts = [`${w.long} — ${w.percent}%`];
  if (w.resetsAt != null) {
    // Round like resetClock does, so "in 2d 6h" and "Fri 14:00" agree for a 13:59:59.6 reset.
    const left = Math.round((w.resetsAt - now) / 60) * 60;
    parts.push(`resets in ${timeLeft(left)} (${resetClock(w.resetsAt, now)})`);
  }
  const p = pace(w, now);
  if (p) parts.push(p.verdict);
  return parts.join(" · ");
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// state: { report, lastGood, installed } (see barModel).
export function tooltipText(provider, state, now) {
  const { report, lastGood, installed } = state;
  if (installed === false) return `${provider.name} · not installed`;
  if (!report) return `${provider.name} · loading…`;
  if (report.status === "ok") {
    const head = [provider.name, report.plan ? cap(report.plan) : null, `updated ${ago(report.observedAt, now)}`].filter(Boolean).join(" · ");
    return [head, ...report.windows.map((w) => windowLine(w, now))].join("\n");
  }
  const lines = [`${provider.name} · ${report.message ?? report.status}`];
  if (lastGood) {
    lines.push(`Last reading ${ago(lastGood.observedAt, now)}:`, ...lastGood.windows.map((w) => windowLine(w, now)));
  }
  return lines.join("\n");
}

// ProviderState: { report: Report|null, lastGood: Report|null, installed: true|false|null }
export function barModel(states, prefs, now, providers = PROVIDERS) {
  const groups = [];
  for (const p of providers) {
    if (!isShown(prefs, p.id)) continue;
    const st = states[p.id] ?? { report: null, lastGood: null, installed: null };
    if (st.installed === false) continue;
    let mark = null;
    let source = st.report;
    if (!st.report) {
      mark = "…";
      source = null;
    } else if (st.report.status !== "ok") {
      mark = "!";
      source = st.lastGood;
    }
    const segments = (source?.windows ?? [])
      .filter((w) => isShown(prefs, p.id, w.id))
      .map((w) => segmentView(w, now, prefs.showResetTime));
    const dim = mark === "!" || (source != null && now - source.observedAt > STALE_AFTER);
    groups.push({ providerId: p.id, name: p.name, icon: p.icon, mark, dim, segments });
  }
  return { groups, empty: groups.length === 0 };
}

// Rough text widths at 11.8px (labels 10.5px): enough to pick a density, not to lay out.
const GROUP = 20; // icon + gaps
function segmentWidth(s, density) {
  const text = 7 * (density === 3 ? s.brief : s.text).length + 12;
  if (density >= 2) return text;
  const label = 8 + 6.5 * s.short.length;
  return density === 1 ? label + text : label + 30 + text;
}

// 0 = label + bar + percent, 1 = no bars, 2 = no labels, 3 = no time on calm windows.
export function chooseDensity(model, widthPx) {
  for (const d of [0, 1, 2, 3]) {
    const need = model.groups.reduce((sum, g) => sum + GROUP + g.segments.reduce((a, s) => a + segmentWidth(s, d), 0), 0);
    if (need <= widthPx) return d;
  }
  return 3;
}
