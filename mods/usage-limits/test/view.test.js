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
  assert.match(lines[1], /^5-hour — 6% · resets 09:00/);
  assert.match(lines[2], /^Weekly — 50% · resets Fri 14:00 · /);
  assert.match(lines[3], /^Weekly · Fable — 3% · resets Fri 14:00/);
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
