process.env.TZ = "UTC";
import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentView, tooltipText } from "../lib/view.js";
import claude from "../providers/claude.js";
import { read } from "./_util.js";

const NOW = Date.UTC(2026, 10, 4, 8, 0, 0) / 1000;
const W = (o) => ({ id: "x", short: "wk", long: "Weekly", percent: 50, resetsAt: NOW + 58 * 3600, durationSec: 604800, ...o });

test("ok segment: percent only, fill and tick", () => {
  const s = segmentView(W(), NOW);
  assert.equal(s.text, "50%");
  assert.equal(s.level, "ok");
  assert.equal(s.fill, 0.5);
  assert.ok(Math.abs(s.tick - 0.6548) < 0.001);
  assert.equal(s.expired, false);
  assert.equal(s.short, "wk");
});

test("hot segment appends time to reset", () => {
  const s = segmentView(W({ percent: 92, resetsAt: NOW + 38 * 60, durationSec: 18000 }), NOW);
  assert.equal(s.text, "92% · 38m");
  assert.equal(s.level, "hot");
});

test("warn segment appends time to reset", () => {
  assert.equal(segmentView(W({ percent: 74 }), NOW).text, "74% · 2d 10h");
});

test("segment of a passed window is '—' with no tick", () => {
  const s = segmentView(W({ percent: 95, resetsAt: NOW - 1 }), NOW);
  assert.deepEqual([s.text, s.fill, s.tick, s.level, s.expired], ["—", 0, null, "ok", true]);
});

test("fill is clamped to 0–1", () => {
  assert.equal(segmentView(W({ percent: 130 }), NOW).fill, 1);
});

test("tooltip lists every window with long labels", () => {
  const report = { ...claude.parse(read("claude-get-usage.max.json"), NOW - 60), observedAt: NOW - 60 };
  const text = tooltipText(claude, { report, lastGood: report, installed: true }, NOW);
  const lines = text.split("\n");
  assert.equal(lines[0], "Claude · Max · updated just now");
  assert.match(lines[1], /^5-hour — 6% · resets in 1h 0m \(09:00\)/);
  assert.match(lines[2], /^Weekly — 50% · resets in 2d 6h \(Fri 14:00\) · /);
  assert.match(lines[3], /^Weekly · Fable — 3% · resets in 2d 6h \(Fri 14:00\)/);
  assert.equal(lines.length, 4);
});

test("tooltip for a failing provider shows the error and the last reading's age", () => {
  const good = { ...claude.parse(read("claude-get-usage.max.json"), NOW - 1200), observedAt: NOW - 1200 };
  const bad = { status: "error", message: "Not logged in", plan: null, observedAt: NOW, source: "claude CLI", windows: [] };
  const lines = tooltipText(claude, { report: bad, lastGood: good, installed: true }, NOW).split("\n");
  assert.equal(lines[0], "Claude · Not logged in");
  assert.equal(lines[1], "Last reading 20 min ago:");
  assert.equal(lines.length, 5);
});

test("tooltip for a missing or loading provider", () => {
  assert.equal(tooltipText(claude, { report: null, lastGood: null, installed: false }, NOW), "Claude · not installed");
  assert.equal(tooltipText(claude, { report: null, lastGood: null, installed: null }, NOW), "Claude · loading…");
});

// ---- barModel / chooseDensity (Task 4) ----
import { barModel, chooseDensity } from "../lib/view.js";
import codex from "../providers/codex.js";

const PREFS = { hidden: [], hiddenWindows: [] };
const ok = (p, file, at = NOW) => ({ ...p.parse(read(file), at), observedAt: at });
const STATES = () => ({
  claude: { report: ok(claude, "claude-get-usage.max.json"), lastGood: ok(claude, "claude-get-usage.max.json"), installed: true },
  codex: { report: ok(codex, "codex-app-server.plus.json"), lastGood: ok(codex, "codex-app-server.plus.json"), installed: true },
});

test("barModel: both providers, all windows, in registry order", () => {
  const m = barModel(STATES(), PREFS, NOW);
  assert.equal(m.empty, false);
  assert.deepEqual(m.groups.map((g) => [g.providerId, g.name, g.icon, g.mark, g.dim]), [
    ["claude", "Claude", "icons/claude.svg", null, false],
    ["codex", "Codex", "icons/codex.svg", null, false],
  ]);
  assert.deepEqual(m.groups[0].segments.map((s) => s.short), ["5h", "wk", "Fable"]);
});

test("barModel: hidden provider and hidden window are dropped", () => {
  const m = barModel(STATES(), { hidden: ["codex"], hiddenWindows: ["claude:session"] }, NOW);
  assert.deepEqual(m.groups.map((g) => g.providerId), ["claude"]);
  assert.deepEqual(m.groups[0].segments.map((s) => s.id), ["weekly_all", "weekly_scoped:Fable"]);
});

test("barModel: failing provider keeps last good reading, dimmed, with '!'", () => {
  const s = STATES();
  s.claude.report = { status: "error", message: "offline", plan: null, observedAt: NOW, source: "claude CLI", windows: [] };
  const g = barModel(s, PREFS, NOW).groups[0];
  assert.deepEqual([g.mark, g.dim, g.segments.length], ["!", true, 3]);
});

test("barModel: failing provider with no last reading → '!' and no segments", () => {
  const s = STATES();
  s.codex = { report: { status: "error", message: "x", plan: null, observedAt: NOW, source: "s", windows: [] }, lastGood: null, installed: true };
  const g = barModel(s, PREFS, NOW).groups[1];
  assert.deepEqual([g.mark, g.segments.length], ["!", 0]);
});

test("barModel: not installed → absent; loading → '…'", () => {
  const s = STATES();
  s.codex = { report: null, lastGood: null, installed: false };
  s.claude = { report: null, lastGood: null, installed: null };
  const m = barModel(s, PREFS, NOW);
  assert.deepEqual(m.groups.map((g) => [g.providerId, g.mark, g.segments.length]), [["claude", "…", 0]]);
});

test("barModel: reading older than 15 min is dimmed", () => {
  const s = STATES();
  s.codex.report = { ...s.codex.report, observedAt: NOW - 901 };
  assert.equal(barModel(s, PREFS, NOW).groups[1].dim, true);
});

test("barModel: everything hidden → empty", () => {
  assert.equal(barModel(STATES(), { hidden: ["claude", "codex"], hiddenWindows: [] }, NOW).empty, true);
  assert.equal(barModel({}, PREFS, NOW).empty, false, "unknown state = loading groups");
});

test("chooseDensity: full at 600px, no bars at 400px, percents only at 140px", () => {
  const m = barModel(STATES(), PREFS, NOW);
  assert.equal(chooseDensity(m, 600), 0);
  assert.equal(chooseDensity(m, 400), 1);
  assert.equal(chooseDensity(m, 140), 3);
});

// ---- reset time always on ----

test("showResetTime: a calm window shows its time too", () => {
  assert.equal(segmentView(W(), NOW, true).text, "50% · 2d 10h");
});

test("showResetTime off: a calm window stays percent only", () => {
  assert.equal(segmentView(W(), NOW, false).text, "50%");
});

test("brief drops the time of a calm window only", () => {
  assert.equal(segmentView(W(), NOW, true).brief, "50%");
  assert.equal(segmentView(W({ percent: 74 }), NOW, true).brief, "74% · 2d 10h");
});

test("showResetTime: no reset known, or already passed, adds no time", () => {
  assert.equal(segmentView(W({ resetsAt: null }), NOW, true).text, "50%");
  const s = segmentView(W({ resetsAt: NOW - 1 }), NOW, true);
  assert.deepEqual([s.text, s.brief], ["—", "—"]);
});

test("barModel: applies showResetTime from prefs", () => {
  const texts = (prefs) => barModel(STATES(), prefs, NOW).groups[0].segments.map((s) => s.text);
  assert.ok(texts({ ...PREFS, showResetTime: true }).every((t) => t.includes(" · ")));
  assert.ok(!texts(PREFS).some((t) => t.includes(" · ")));
});

test("chooseDensity: times of calm windows go last, so providers still fit", () => {
  const on = barModel(STATES(), { ...PREFS, showResetTime: true }, NOW);
  assert.equal(chooseDensity(on, 2000), 0);
  assert.equal(chooseDensity(on, 300), 3);
});
