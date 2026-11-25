import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import agy from "../providers/agy.js";
import { PROVIDERS } from "../providers/index.js";
import { segmentView } from "../lib/view.js";
import { HERE, NOW } from "./_util.js";
import { alive, run } from "./_helpers.js";

const FAKE_AGY = join(HERE, "fake-cli", "agy");
const FIXTURE = readFileSync(join(HERE, "fixtures", "agy-usage.json"), "utf8");
const T = (s) => Math.floor(Date.parse(s) / 1000);
const LATER = new Date((NOW + 3 * 86400) * 1000).toISOString();
const PASSED = new Date((NOW - 5) * 1000).toISOString();
const bucket = (id, remaining, reset = LATER) => ({ id, remaining_fraction: remaining, reset_time: reset });
const reply = (...groups) => JSON.stringify({ status: "SUCCESS", command: { name: "usage", data: { groups: groups.map((buckets) => ({ buckets })) } } });
const rows = (r) => r.windows.map((w) => [w.id, w.short, w.long, w.percent, w.durationSec, w.offBarByDefault ?? false]);
const outcome = (r) => [r.status, r.message];

test("descriptor, and its place after Codex, before OpenCode", () => {
  assert.deepEqual([agy.id, agy.name, agy.icon, agy.helper, agy.kind], ["agy", "Antigravity", "icons/antigravity.svg", "helpers/agy-limits.sh", undefined]);
  assert.equal(agy.oneColorGlyph, undefined, "a coloured icon, drawn as an image");
  assert.deepEqual(PROVIDERS.map((p) => p.id), ["claude", "codex", "agy", "opencode", "opencode-go", "pi"]);
});

test("a real /usage reply: the weekly limits, read now, without a plan", () => {
  const r = agy.parse(FIXTURE, NOW);
  assert.deepEqual([r.status, r.plan, r.observedAt], ["ok", null, NOW]);
  assert.deepEqual(rows(r), [["gemini-weekly", "wk", "Weekly", 11, 604800, false], ["3p-weekly", "others wk", "Weekly · others", 0, 604800, true]]);
  assert.equal(r.windows[0].resetsAt, T("2026-12-02T14:35:37Z"));
});

test("Gemini's and the others' buckets: Gemini first, 5h before weekly; used = 1 − remaining; others off the bar by default", () => {
  const r = agy.parse(reply([bucket("3p-weekly", 1), bucket("3p-5h", 0.5)], [bucket("gemini-weekly", 0.25), bucket("gemini-5h", 0.9)]), NOW);
  assert.deepEqual(rows(r), [
    ["gemini-5h", "5h", "5-hour", 10, 18000, false],
    ["gemini-weekly", "wk", "Weekly", 75, 604800, false],
    ["3p-5h", "others 5h", "5-hour · others", 50, 18000, true],
    ["3p-weekly", "others wk", "Weekly · others", 0, 604800, true],
  ]);
  assert.equal(r.windows[0].resetsAt, T(LATER));
  assert.equal("offBarByDefault" in r.windows[0], false, "a window on the bar keeps today's shape");
});

test("a reset that has passed keeps its time, so the bar shows a dash like any other provider", () => {
  const r = agy.parse(reply([bucket("gemini-weekly", 0.1, PASSED)]), NOW);
  assert.equal(r.windows[0].resetsAt, NOW - 5);
  assert.equal(segmentView(r.windows[0], NOW).text, "—");
});

test("no reset_time → a window without a reset", () => {
  assert.equal(agy.parse(reply([{ id: "gemini-5h", remaining_fraction: 0.5 }]), NOW).windows[0].resetsAt, null);
});

test("unknown buckets: after the known ones, by id, named from it; a third-party one stays off the bar", () => {
  const r = agy.parse(reply(["zeta", "3p-daily", "gemini-monthly", "gemini-5h", "beta-5h"].map((id) => bucket(id, 0.5))), NOW);
  assert.deepEqual(rows(r), [
    ["gemini-5h", "5h", "5-hour", 50, 18000, false],
    ["3p-daily", "others daily", "daily · others", 50, null, true],
    ["beta-5h", "beta 5h", "5-hour · beta", 50, 18000, false],
    ["gemini-monthly", "monthly", "monthly", 50, null, false],
    ["zeta", "zeta", "zeta", 50, null, false],
  ]);
});

test("odd buckets and groups are left out, never a crash or NaN%", () => {
  const odd = [null, 3, "x", {}, { id: "e", remaining_fraction: "lots" }, { remaining_fraction: 0.2 }, [0.2]];
  const text = JSON.stringify({ status: "SUCCESS", command: { data: { groups: [null, 3, {}, { buckets: "x" }, { buckets: [...odd, bucket("gemini-5h", 0.5)] }] } } });
  assert.deepEqual(agy.parse(text, NOW).windows.map((w) => w.id), ["gemini-5h"]);
  for (const none of [reply(), reply(odd), JSON.stringify({ status: "SUCCESS" }), JSON.stringify({ status: "SUCCESS", command: { data: { groups: 7 } } })]) {
    assert.deepEqual(outcome(agy.parse(none, NOW)), ["unavailable", "No limits in agy's quota"], none);
  }
});

test("what the helper ran into is said briefly", () => {
  const said = (problem) => outcome(agy.parse(JSON.stringify({ problem }), NOW));
  assert.deepEqual(said("old-version"), ["unavailable", "Needs agy 1.1.11 or newer"]);
  assert.deepEqual(said("signed-out"), ["unavailable", "Sign in to agy to see its limits"]);
  assert.deepEqual(said("unreachable"), ["error", "agy couldn't reach Antigravity"]);
  assert.deepEqual(said("new-one"), ["error", "No reply from agy"]);
});

test("agy's own error, or no reply at all → an error, its long text left out", () => {
  assert.deepEqual(outcome(agy.parse(JSON.stringify({ status: "ERROR", error: "Post https://x: refused" }), NOW)), ["error", "agy could not read usage"]);
  for (const text of ["", "\n", "garbage", "{}", "[1]"]) assert.deepEqual(outcome(agy.parse(text, NOW)), ["error", "No reply from agy"], text);
});

const tmp = (name) => mkdtempSync(join(tmpdir(), name));

function ask(env = {}) {
  const calls = join(tmp("ul-agy-"), "calls");
  const r = run("agy-limits.sh", { HERDR_USAGE_AGY_BIN: FAKE_AGY, AGY_CALLS: calls, ...env });
  return { ...r, calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [] };
}

const asked = (r, what) => r.calls.some((c) => c.includes(what));

test("helper: checks the version, then the sign-in, then prints the /usage reply", () => {
  const r = ask();
  assert.deepEqual([r.status, r.stdout], [0, FIXTURE]);
  assert.equal(r.calls.length, 3);
  assert.match(r.calls[0], /--version/);
  assert.match(r.calls[1], /--log-file \S+ models$/);
  assert.match(r.calls[2], /-p \/usage --output-format json --log-file \S+/);
});

test("helper: below 1.1.11, or with a version it can't read, /usage would be a prompt: never sent", () => {
  for (const version of ["1.1.10", "1.0.99", "0.9.20", "dev", ""]) {
    const r = ask({ FAKE_AGY_VERSION: version });
    assert.deepEqual([r.status, r.stdout], [0, '{"problem":"old-version"}\n'], version);
    assert.equal(asked(r, "/usage"), false, version);
  }
  for (const version of ["1.1.11", "1.2.0", "2.0.0", "agy version 1.10.3 (abc)"]) assert.equal(ask({ FAKE_AGY_VERSION: version }).stdout, FIXTURE, version);
});

test("helper: signed out, /usage would open the sign-in page in the browser: never sent", () => {
  const r = ask({ FAKE_AGY: "signed-out" });
  assert.deepEqual([r.status, r.stdout, asked(r, "/usage")], [0, '{"problem":"signed-out"}\n', false]);
});

test("helper: sign-in not confirmed for another reason, /usage isn't sent either", () => {
  const r = ask({ FAKE_AGY: "offline" });
  assert.deepEqual([r.status, r.stdout, asked(r, "/usage")], [0, '{"problem":"unreachable"}\n', false]);
});

test("helper: agy's own error is passed on; nothing printed → exit 1", () => {
  assert.equal(JSON.parse(ask({ FAKE_AGY: "error" }).stdout).status, "ERROR");
  const silent = ask({ FAKE_AGY: "silent" });
  assert.deepEqual([silent.status, silent.stdout], [1, ""]);
});

for (const [step, printed] of [["hang-version", '{"problem":"unreachable"}\n'], ["hang-models", '{"problem":"unreachable"}\n'], ["hang", ""]]) {
  test(`helper: ${step}: gives up within the exec limit, no leftover process or folder`, { timeout: 40000 }, () => {
    const dir = tmp("ul-agy-tmp-");
    const r = ask({ FAKE_AGY: step, TMPDIR: dir, HERDR_USAGE_AGY_DEADLINE_S: "3" });
    assert.equal(r.stdout, printed);
    assert.ok(r.ms < 8000, `took ${r.ms} ms`);
    assert.equal(alive("sleep 61"), false, "hung agy left running");
    assert.deepEqual(readdirSync(dir), []);
  });
}

test("helper: agy missing → 127; in ~/.local/bin it counts as installed, as Herdr's PATH may not hold it", () => {
  const home = tmp("ul-home-");
  const env = { HERDR_USAGE_AGY_BIN: "/nonexistent/agy", HOME: home };
  const missing = ask(env);
  assert.deepEqual([missing.status, missing.stdout], [127, ""]);
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  mkdirSync(join(home, ".local", "fixtures"));
  copyFileSync(FAKE_AGY, join(home, ".local", "bin", "agy"));
  copyFileSync(join(HERE, "fixtures", "agy-usage.json"), join(home, ".local", "fixtures", "agy-usage.json"));
  assert.equal(ask(env).stdout, FIXTURE);
});
