import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePrefs, isShown, toggleProvider, toggleWindow } from "../lib/prefs.js";

test("layout presets apply until saved prefs exist", () => {
  const props = { hidden: ["codex"], hiddenWindows: ["claude:session"] };
  assert.deepEqual(effectivePrefs(null, props), { hidden: ["codex"], hiddenWindows: ["claude:session"] });
  assert.deepEqual(effectivePrefs({ hidden: [], hiddenWindows: [] }, props), { hidden: [], hiddenWindows: [] });
  assert.deepEqual(effectivePrefs(null, {}), { hidden: [], hiddenWindows: [] });
  assert.deepEqual(effectivePrefs(undefined, undefined), { hidden: [], hiddenWindows: [] });
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
