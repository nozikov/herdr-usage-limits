import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import opencode from "../providers/opencode.js";
import { HERE } from "./_util.js";

const NOW = 1794486757;
const fixture = (name) => JSON.parse(readFileSync(join(HERE, "fixtures", name), "utf8"));
const reply = (today, week) => JSON.stringify({ today, week });

test("descriptor", () => {
  assert.deepEqual(
    { id: opencode.id, name: opencode.name, icon: opencode.icon, kind: opencode.kind, helper: opencode.helper },
    { id: "opencode", name: "OpenCode", icon: "icons/opencode.svg", kind: "spend", helper: "helpers/opencode-spend.sh" },
  );
});

test("today and week are input + output + reasoning + cache read + cache write", () => {
  const r = opencode.parse(reply(fixture("opencode-stats.today.json"), fixture("opencode-stats.week.json")), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.source, "opencode stats");
  assert.equal(r.spend.today, 17493);
  assert.equal(r.spend.week, 412300 + 5120 + 880 + 96000 + 1200);
  assert.deepEqual(r.windows, []);
  assert.equal(r.observedAt, NOW);
});

test("no use → ok with zeros", () => {
  const zero = { tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } };
  const r = opencode.parse(reply(zero, zero), NOW);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.spend, { today: 0, week: 0 });
});

test("a reply without tokens → error report", () => {
  const week = fixture("opencode-stats.week.json");
  for (const text of [reply({ sessions: 0 }, week), reply(fixture("opencode-stats.today.json"), {}), "not json", ""]) {
    const r = opencode.parse(text, NOW);
    assert.equal(r.status, "error", text);
    assert.equal(r.message, "No stats from OpenCode");
    assert.equal(r.source, "opencode stats");
  }
});
