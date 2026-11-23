import { test } from "node:test";
import assert from "node:assert/strict";
import { barModel, cardModel } from "../lib/view.js";
import { settingsRows } from "../lib/settings.js";
import { effectivePrefs, toggleWindow } from "../lib/prefs.js";
import agy from "../providers/agy.js";
import { PROVIDERS } from "../providers/index.js";
import { NOW } from "./_util.js";

const LATER = new Date((NOW + 3 * 86400) * 1000).toISOString();
const bucket = (remaining) => ({ remaining_fraction: remaining, reset_time: LATER });
const reading = (at = NOW - 300) => agy.parse(JSON.stringify({
  at, plan: "Antigravity Starter Quota",
  quota: { "gemini-5h": bucket(0.9), "gemini-weekly": bucket(0.4), "3p-5h": bucket(0.5), "3p-weekly": bucket(1) },
}), NOW);
const gone = { report: null, lastGood: null, installed: false };
const STATES = (report = reading()) => ({
  claude: gone, codex: gone, opencode: gone, "opencode-go": gone, pi: gone,
  agy: { report, lastGood: report.status === "ok" ? report : null, installed: true },
});
const DEFAULTS = effectivePrefs(null, undefined);
const agyBar = (prefs, st = STATES()) => barModel(st, prefs, NOW, PROVIDERS).groups.find((g) => g.providerId === "agy");
const agyRow = (prefs, st = STATES()) => settingsRows(prefs, st, PROVIDERS).find((r) => r.provider.id === "agy");

test("bar: Gemini's two windows by default, the others' off; drawn with its own icon", () => {
  const g = agyBar(DEFAULTS);
  assert.deepEqual([g.name, g.icon, g.mark, g.dim], ["Antigravity", "icons/antigravity.svg", null, false]);
  assert.deepEqual(g.segments.map((s) => [s.short, s.text]), [["5h", "10%"], ["wk", "60%"]]);
});

test("bar: an others' window ticked on joins the bar, and unticked leaves it", () => {
  const on = toggleWindow(DEFAULTS, "agy", "3p-5h", true);
  assert.deepEqual(agyBar(on).segments.map((s) => s.short), ["5h", "wk", "others 5h"]);
  assert.deepEqual(agyBar(toggleWindow(on, "agy", "3p-5h", true)).segments.map((s) => s.short), ["5h", "wk"]);
});

test("settings: every window listed, the others' boxes unticked until ticked, and each says how it toggles", () => {
  const row = agyRow(DEFAULTS);
  assert.deepEqual(row.windows.map((w) => [w.id, w.long, w.on, w.offBarByDefault]), [
    ["gemini-5h", "5-hour", true, false],
    ["gemini-weekly", "Weekly", true, false],
    ["3p-5h", "5-hour · others", false, true],
    ["3p-weekly", "Weekly · others", false, true],
  ]);
  assert.equal(agyRow(toggleWindow(DEFAULTS, "agy", "3p-weekly", true)).windows[3].on, true);
});

test("panel: every window, the others' too, with the plan and the reading's age", () => {
  const g = cardModel(STATES(), NOW, PROVIDERS, DEFAULTS).groups.find((x) => x.providerId === "agy");
  assert.deepEqual([g.plan, g.status, g.dim], ["Starter", "updated 5 min ago", false]);
  assert.deepEqual(g.rows.map((r) => [r.long, r.percent]), [["5-hour", "10%"], ["Weekly", "60%"], ["5-hour · others", "50%"], ["Weekly · others", "0%"]]);
});

test("an old reading is dimmed on the bar and in the panel", () => {
  const st = STATES(reading(NOW - 3600));
  assert.equal(agyBar(DEFAULTS, st).dim, true);
  assert.equal(cardModel(st, NOW, PROVIDERS, DEFAULTS).groups.find((x) => x.providerId === "agy").dim, true);
});

test("installed, no reading saved yet: the panel says to open agy", () => {
  const st = STATES(agy.parse("", NOW));
  const g = cardModel(st, NOW, PROVIDERS, DEFAULTS).groups.find((x) => x.providerId === "agy");
  assert.deepEqual([g.status, g.failed, g.rows], ["Open agy once to see its limits", true, []]);
  assert.equal(agyRow(DEFAULTS, st).reason, "Open agy once to see its limits");
});

test("not installed: nowhere on the bar or in the panel, greyed in the settings like any other", () => {
  const st = { ...STATES(), agy: gone };
  assert.equal(agyBar(DEFAULTS, st), undefined);
  assert.equal(cardModel(st, NOW, PROVIDERS, DEFAULTS).groups.some((x) => x.providerId === "agy"), false);
  assert.deepEqual([agyRow(DEFAULTS, st).dim, agyRow(DEFAULTS, st).reason], [true, "not installed"]);
});
