import { makeWindow, okReport, errorReport, toEpoch } from "../lib/report.js";

const SOURCE = "OpenCode Go";
const HOUR = 3600;
const WEEK = 7 * 24 * HOUR;

const METERS = [
  { key: "rolling", id: "session", short: "5h", long: "5-hour", durationSec: 5 * HOUR },
  { key: "weekly", id: "weekly", short: "wk", long: "Weekly", durationSec: WEEK },
  { key: "monthly", id: "monthly", short: "mo", long: "Monthly", durationSec: null },
];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isPercent = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

function meterWindow(m, meter) {
  const resetsAt = toEpoch(meter?.resetsAt);
  if (!isObj(meter) || !isPercent(meter.percent) || resetsAt == null) return null;
  return makeWindow({ id: m.id, short: m.short, long: m.long, percent: meter.percent, resetsAt, durationSec: m.durationSec });
}

export function parse(text, now) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch {
    data = null;
  }
  if (isObj(data?.error)) return errorReport(SOURCE, String(data.error.message ?? "No reply from OpenCode Go"), now);
  const usage = data?.usage;
  if (!isObj(usage)) return errorReport(SOURCE, "No usage from OpenCode Go", now);
  const windows = METERS.map((m) => meterWindow(m, usage[m.key]));
  if (windows.includes(null)) return errorReport(SOURCE, "Incomplete usage from OpenCode Go", now);
  return okReport(SOURCE, now, windows);
}

export default {
  id: "opencode-go",
  name: "OpenCode Go",
  icon: "icons/opencode.svg",
  helper: "helpers/opencode-go.sh",
  oneColorGlyph: true,
  parse,
};
