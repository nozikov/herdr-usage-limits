// Text and numbers shown to the person. Pure: no Herdr imports.

const WARN = 70;
const HOT = 90;
const PACE_MARGIN = 10; // percentage points before "ahead" / "under"
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function timeLeft(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return "<1m";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function tokens(n) {
  if (n < 1000) return String(n);
  if (n < 999500) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
}

const pad = (n) => String(n).padStart(2, "0");

// Local clock: "17:00" today, "Fri 17:00" on another day.
export function resetClock(epoch, now) {
  // Resets land a fraction of a second off the minute (13:59:59.6): round, don't truncate.
  const at = new Date(Math.round(epoch / 60) * 60 * 1000);
  const today = new Date(now * 1000);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toDateString() === today.toDateString() ? time : `${DAYS[at.getDay()]} ${time}`;
}

export function level(percent) {
  if (percent >= HOT) return "hot";
  if (percent >= WARN) return "warn";
  return "ok";
}

// How much of the window's time has passed, and whether usage runs ahead of it.
export function pace(w, now) {
  if (w.resetsAt == null || !w.durationSec) return null;
  const elapsed = Math.min(1, Math.max(0, 1 - (w.resetsAt - now) / w.durationSec));
  const clock = elapsed * 100;
  const verdict = w.percent > clock + PACE_MARGIN ? "ahead" : w.percent < clock - PACE_MARGIN ? "under" : "on pace";
  return { elapsed, verdict };
}

export function ago(epoch, now) {
  const s = Math.max(0, now - epoch);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
