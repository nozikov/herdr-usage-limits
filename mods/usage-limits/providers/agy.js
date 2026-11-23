import { makeWindow, okReport, unavailableReport, toEpoch, jsonLines } from "../lib/report.js";

const SOURCE = "agy status line";
const NOTHING_SAVED = "Open agy once to see its limits";
const NO_LIMITS = "No limits in agy's quota";
const HOUR_S = 3600;
const WEEK_S = 7 * 24 * HOUR_S;

const OWN_MODELS = "gemini";
const THIRD_PARTY = "3p";
const THIRD_PARTY_NAME = "others";
const SPANS = { "5h": { short: "5h", long: "5-hour", durationSec: 5 * HOUR_S }, weekly: { short: "wk", long: "Weekly", durationSec: WEEK_S } };
const ORDER = ["gemini-5h", "gemini-weekly", "3p-5h", "3p-weekly"];
const PLAN_PREFIX = /^Antigravity\s+/i;
const PLAN_SUFFIX = /\s+Quota$/i;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const usedPercent = (b) => (1 - b.remaining_fraction) * 100;
const hasReading = (b) => isObject(b) && typeof b.remaining_fraction === "number" && Number.isFinite(b.remaining_fraction);

function splitKey(key) {
  const dash = key.indexOf("-");
  return dash < 0 ? { group: null, span: key } : { group: key.slice(0, dash), span: key.slice(dash + 1) };
}

function groupName(group) {
  if (group === OWN_MODELS) return null;
  return group === THIRD_PARTY ? THIRD_PARTY_NAME : group;
}

function resetOf(b, at) {
  const reset = toEpoch(b.reset_time);
  if (reset != null) return reset;
  const inSeconds = Number(b.reset_in_seconds);
  return Number.isFinite(inSeconds) && inSeconds > 0 ? at + inSeconds : null;
}

function windowFrom(key, b, at) {
  const { group, span } = splitKey(key);
  const known = SPANS[span] ?? { short: span, long: span, durationSec: null };
  const name = groupName(group);
  const resetsAt = resetOf(b, at);
  return makeWindow({
    id: key,
    short: name ? `${name} ${known.short}` : known.short,
    long: name ? `${known.long} · ${name}` : known.long,
    percent: usedPercent(b),
    resetsAt,
    durationSec: known.durationSec,
    offBarByDefault: group === THIRD_PARTY,
  });
}

const rank = (key) => (ORDER.includes(key) ? ORDER.indexOf(key) : ORDER.length);
const byRank = (a, b) => rank(a) - rank(b) || a.localeCompare(b);

function planOf(plan) {
  if (typeof plan !== "string") return null;
  return plan.replace(PLAN_PREFIX, "").replace(PLAN_SUFFIX, "").trim() || null;
}

export function parse(text, now) {
  const saved = jsonLines(text).find((m) => isObject(m.quota));
  if (!saved) return unavailableReport(SOURCE, NOTHING_SAVED, now);
  const at = Number.isFinite(saved.at) ? Math.min(saved.at, now) : now;
  const windows = Object.keys(saved.quota)
    .filter((key) => hasReading(saved.quota[key]))
    .sort(byRank)
    .map((key) => windowFrom(key, saved.quota[key], at));
  if (windows.length === 0) return unavailableReport(SOURCE, NO_LIMITS, now);
  return okReport(SOURCE, now, windows, planOf(saved.plan), at);
}

export default {
  id: "agy",
  name: "Antigravity",
  icon: "icons/antigravity.svg",
  helper: "helpers/agy-limits.sh",
  parse,
};
