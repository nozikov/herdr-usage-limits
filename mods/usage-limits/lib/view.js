// What the bar and its hover card show, as plain data. Pure: no Herdr imports.
import { timeLeft, resetClock, level, pace, ago } from "./format.js";

export function segmentView(w, now) {
  if (w.resetsAt != null && w.resetsAt <= now) {
    return { id: w.id, short: w.short, text: "—", level: "ok", fill: 0, tick: null, expired: true };
  }
  const lv = level(w.percent);
  const left = lv !== "ok" && w.resetsAt != null ? ` · ${timeLeft(w.resetsAt - now)}` : "";
  return {
    id: w.id,
    short: w.short,
    text: `${w.percent}%${left}`,
    level: lv,
    fill: Math.min(1, Math.max(0, w.percent / 100)),
    tick: pace(w, now)?.elapsed ?? null,
    expired: false,
  };
}

function windowLine(w, now) {
  if (w.resetsAt != null && w.resetsAt <= now) return `${w.long} — reset, waiting for a new reading`;
  const parts = [`${w.long} — ${w.percent}%`];
  if (w.resetsAt != null) parts.push(`resets ${resetClock(w.resetsAt, now)}`);
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
