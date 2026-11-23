export function makeWindow({ id, short, long, percent, resetsAt = null, durationSec = null, offBarByDefault = false }) {
  return {
    id,
    short,
    long: long ?? short,
    percent: Math.round(Number(percent)),
    resetsAt: resetsAt == null ? null : Math.floor(Number(resetsAt)),
    durationSec,
    ...(offBarByDefault ? { offBarByDefault: true } : {}),
  };
}

export function okReport(source, now, windows, plan = null, observedAt = now) {
  return { status: "ok", message: null, plan, observedAt, source, windows };
}

export function spendReport(source, now, today, week, observedAt = now) {
  return { status: "ok", message: null, plan: null, observedAt, source, windows: [], spend: { today, week } };
}

export function errorReport(source, message, now) {
  return { status: "error", message, plan: null, observedAt: now, source, windows: [] };
}

export function unavailableReport(source, message, now) {
  return { status: "unavailable", message, plan: null, observedAt: now, source, windows: [] };
}

export function toEpoch(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.floor(value) : null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export function jsonLines(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try {
      out.push(JSON.parse(s));
    } catch {}
  }
  return out;
}
