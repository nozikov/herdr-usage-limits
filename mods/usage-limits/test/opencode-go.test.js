import { test } from "node:test";
import assert from "node:assert/strict";
import opencodeGo from "../providers/opencode-go.js";
import { NOW, read } from "./_util.js";

const reply = (usage) => JSON.stringify({ usage });
const meter = (percent, resetsAt = "2026-11-18T00:49:14.000Z") => ({ status: "ok", percent, resetsAt });
const all = (percent) => ({ rolling: meter(percent), weekly: meter(percent), monthly: meter(percent) });

test("descriptor", () => {
  assert.deepEqual(
    { id: opencodeGo.id, name: opencodeGo.name, icon: opencodeGo.icon, kind: opencodeGo.kind, helper: opencodeGo.helper },
    { id: "opencode-go", name: "OpenCode Go", icon: "icons/opencode.svg", kind: undefined, helper: "helpers/opencode-go.sh" },
  );
});

test("rolling, weekly and monthly become three windows", () => {
  const r = opencodeGo.parse(reply({ rolling: meter(0), weekly: meter(2, "2026-11-23T00:00:00.000Z"), monthly: meter(64, "2026-12-05T18:00:27.000Z") }), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.source, "OpenCode Go");
  assert.equal(r.observedAt, NOW);
  assert.deepEqual(r.windows.map((w) => [w.id, w.short, w.long]), [
    ["session", "5h", "5-hour"],
    ["weekly", "wk", "Weekly"],
    ["monthly", "mo", "Monthly"],
  ]);
  assert.equal(r.windows[0].resetsAt, Math.floor(Date.parse("2026-11-18T00:49:14.000Z") / 1000));
  assert.deepEqual(r.windows.map((w) => w.durationSec), [18000, 604800, null]);
});

test("percent is rounded, a rate-limited window keeps its percent", () => {
  const r = opencodeGo.parse(reply({ ...all(6), rolling: { status: "rate-limited", percent: 99.6, resetsAt: "2026-11-18T00:49:14.000Z" } }), NOW);
  assert.equal(r.windows[0].percent, 100);
  assert.equal(r.windows[0].resetsAt, Math.floor(Date.parse("2026-11-18T00:49:14.000Z") / 1000));
});

test("a numeric resetsAt is taken as epoch seconds", () => {
  const at = 1763503754;
  const r = opencodeGo.parse(reply({ ...all(10), rolling: { status: "ok", percent: 10, resetsAt: at } }), NOW);
  assert.equal(r.windows[0].resetsAt, at);
});

test("a helper error and a bad reply → error report", () => {
  assert.equal(opencodeGo.parse(JSON.stringify({ error: { message: "OpenCode Go answered HTTP 500" } }), NOW).message, "OpenCode Go answered HTTP 500");
  const stringPercent = JSON.stringify({ usage: { rolling: { status: "ok", percent: "5", resetsAt: "2026-11-18T00:49:14.000Z" }, weekly: meter(1), monthly: meter(1) } });
  for (const text of ["not json", "", JSON.stringify({ usage: {} }), JSON.stringify({ usage: { rolling: meter(1) } }), stringPercent]) {
    const r = opencodeGo.parse(text, NOW);
    assert.equal(r.status, "error", text);
    assert.deepEqual(r.windows, []);
  }
});

test("a meter with a bad percent or reset time → error, not a guess", () => {
  const bad = [
    { rolling: { status: "ok", percent: -1, resetsAt: "2026-11-18T00:49:14.000Z" }, weekly: meter(1), monthly: meter(1) },
    { rolling: { status: "ok", percent: 101, resetsAt: "2026-11-18T00:49:14.000Z" }, weekly: meter(1), monthly: meter(1) },
    { rolling: { status: "ok", percent: 5, resetsAt: "soon" }, weekly: meter(1), monthly: meter(1) },
    { rolling: { status: "ok", percent: 5 }, weekly: meter(1), monthly: meter(1) },
    { rolling: null, weekly: meter(1), monthly: meter(1) },
  ];
  for (const usage of bad) {
    const r = opencodeGo.parse(reply(usage), NOW);
    assert.equal(r.status, "error", JSON.stringify(usage));
    assert.equal(r.message, "Incomplete usage from OpenCode Go");
  }
});

test("the fixture the helper prints parses", () => {
  const r = opencodeGo.parse(read("opencode-go-usage.json"), NOW);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.windows.map((w) => w.percent), [0, 2, 64]);
});
