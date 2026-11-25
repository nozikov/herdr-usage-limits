import { makeWindow, okReport, errorReport, unavailableReport, toEpoch, jsonLines } from "../lib/report.js";

const SOURCE = "agy CLI";
const NO_REPLY = "No reply from agy";
const USAGE_FAILED = "agy could not read usage";
const NO_LIMITS = "No limits in agy's quota";
const PROBLEMS = {
  "old-version": (now) => unavailableReport(SOURCE, "Needs agy 1.1.11 or newer", now),
  "signed-out": (now) => unavailableReport(SOURCE, "Sign in to agy to see its limits", now),
  unreachable: (now) => errorReport(SOURCE, "agy couldn't reach Antigravity", now),
};
const HOUR_S = 3600;
const WEEK_S = 7 * 24 * HOUR_S;

const OWN_MODELS = "gemini";
const THIRD_PARTY = "3p";
const THIRD_PARTY_NAME = "others";
const SPANS = { "5h": { short: "5h", long: "5-hour", durationSec: 5 * HOUR_S }, weekly: { short: "wk", long: "Weekly", durationSec: WEEK_S } };
const ORDER = ["gemini-5h", "gemini-weekly", "3p-5h", "3p-weekly"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const usedPercent = (b) => (1 - b.remaining_fraction) * 100;
const listOf = (v) => (Array.isArray(v) ? v : []);
const hasReading = (b) => isObject(b) && typeof b.id === "string" && typeof b.remaining_fraction === "number" && Number.isFinite(b.remaining_fraction);

function splitKey(key) {
  const dash = key.indexOf("-");
  return dash < 0 ? { group: null, span: key } : { group: key.slice(0, dash), span: key.slice(dash + 1) };
}

function groupName(group) {
  if (group === OWN_MODELS) return null;
  return group === THIRD_PARTY ? THIRD_PARTY_NAME : group;
}

function windowFrom(b) {
  const { group, span } = splitKey(b.id);
  const known = SPANS[span] ?? { short: span, long: span, durationSec: null };
  const name = groupName(group);
  return makeWindow({
    id: b.id,
    short: name ? `${name} ${known.short}` : known.short,
    long: name ? `${known.long} · ${name}` : known.long,
    percent: usedPercent(b),
    resetsAt: toEpoch(b.reset_time),
    durationSec: known.durationSec,
    offBarByDefault: group === THIRD_PARTY,
  });
}

const rank = (key) => (ORDER.includes(key) ? ORDER.indexOf(key) : ORDER.length);
const byRank = (a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);

const bucketsOf = (reply) => listOf(reply.command?.data?.groups).flatMap((g) => listOf(g?.buckets));

export function parse(text, now) {
  const reply = jsonLines(text).find((m) => m.problem || m.status);
  if (!reply) return errorReport(SOURCE, NO_REPLY, now);
  if (reply.problem) return PROBLEMS[reply.problem]?.(now) ?? errorReport(SOURCE, NO_REPLY, now);
  if (reply.status !== "SUCCESS") return errorReport(SOURCE, USAGE_FAILED, now);
  const windows = bucketsOf(reply).filter(hasReading).sort(byRank).map(windowFrom);
  if (windows.length === 0) return unavailableReport(SOURCE, NO_LIMITS, now);
  return okReport(SOURCE, now, windows);
}

export default {
  id: "agy",
  name: "Antigravity",
  icon: "icons/antigravity.svg",
  helper: "helpers/agy-limits.sh",
  parse,
};
