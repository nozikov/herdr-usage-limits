// OpenCode: tokens spent, as counted by OpenCode itself (helpers/opencode-spend.sh prints
// {"today": <opencode stats --days 0 --json>, "week": <... --days 7 ...>}). The CLI
// decides the days: today since local midnight, the week today and the six days before.
import { spendReport, errorReport } from "../lib/report.js";

const SOURCE = "opencode stats";

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

// input + output + reasoning + cache read + cache write; null without a tokens object.
function total(reply) {
  const t = reply?.tokens;
  if (!t || typeof t !== "object") return null;
  return num(t.input) + num(t.output) + num(t.reasoning) + num(t.cache?.read) + num(t.cache?.write);
}

export function parse(text, now) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch {
    data = null;
  }
  const today = total(data?.today);
  const week = total(data?.week);
  if (today === null || week === null) return errorReport(SOURCE, "No stats from OpenCode", now);
  return spendReport(SOURCE, now, today, week);
}

export default {
  id: "opencode",
  name: "OpenCode",
  icon: "icons/opencode.svg",
  kind: "spend",
  helper: "helpers/opencode-spend.sh",
  parse,
};
