import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePrefs, isShown, toggleProvider, toggleShowResetTime, toggleWindow } from "../lib/prefs.js";

test("layout presets apply until saved prefs exist", () => {
  const props = { hidden: ["codex"], hiddenWindows: ["claude:session"] };
  assert.deepEqual(effectivePrefs(null, props), { hidden: ["codex"], hiddenWindows: ["claude:session"], showResetTime: false });
  assert.deepEqual(effectivePrefs({ hidden: [], hiddenWindows: [] }, props), { hidden: [], hiddenWindows: [], showResetTime: false });
  assert.deepEqual(effectivePrefs(null, {}), { hidden: [], hiddenWindows: [], showResetTime: false });
  assert.deepEqual(effectivePrefs(undefined, undefined), { hidden: [], hiddenWindows: [], showResetTime: false });
});

test("anything not listed is shown, including new windows", () => {
  const p = { hidden: ["codex"], hiddenWindows: ["claude:session"] };
  assert.equal(isShown(p, "claude"), true);
  assert.equal(isShown(p, "codex"), false);
  assert.equal(isShown(p, "claude", "session"), false);
  assert.equal(isShown(p, "claude", "weekly_scoped:Opus"), true);
  assert.equal(isShown(p, "codex", "codex:primary"), false, "window of a hidden provider");
});

test("toggles round-trip and don't mutate", () => {
  const p0 = { hidden: [], hiddenWindows: [] };
  const p1 = toggleProvider(p0, "codex");
  assert.deepEqual(p1.hidden, ["codex"]);
  assert.deepEqual(p0.hidden, []);
  assert.deepEqual(toggleProvider(p1, "codex").hidden, []);
  const p2 = toggleWindow(p0, "claude", "weekly_scoped:Fable");
  assert.deepEqual(p2.hiddenWindows, ["claude:weekly_scoped:Fable"]);
  assert.deepEqual(toggleWindow(p2, "claude", "weekly_scoped:Fable").hiddenWindows, []);
});

test("reset time is off by default and a layout can preset it", () => {
  assert.equal(effectivePrefs(null, {}).showResetTime, false);
  assert.equal(effectivePrefs(null, { showResetTime: true }).showResetTime, true);
  assert.equal(effectivePrefs({ hidden: [], hiddenWindows: [] }, { showResetTime: true }).showResetTime, false, "saved prefs win");
});

test("toggleShowResetTime round-trips and doesn't mutate", () => {
  const p0 = { hidden: ["codex"], hiddenWindows: [], showResetTime: false };
  const p1 = toggleShowResetTime(p0);
  assert.equal(p1.showResetTime, true);
  assert.equal(p0.showResetTime, false);
  assert.deepEqual(p1.hidden, ["codex"]);
  assert.equal(toggleShowResetTime(p1).showResetTime, false);
});

test("hiding a provider or window keeps the reset time choice", () => {
  const p = { hidden: [], hiddenWindows: [], showResetTime: true };
  assert.equal(toggleProvider(p, "codex").showResetTime, true);
  assert.equal(toggleWindow(p, "claude", "session").showResetTime, true);
});
