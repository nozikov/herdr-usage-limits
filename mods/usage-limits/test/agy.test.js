import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, statSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import agy from "../providers/agy.js";
import { PROVIDERS } from "../providers/index.js";
import { MOD, NOW } from "./_util.js";
import { run } from "./_helpers.js";

const T = (s) => Math.floor(Date.parse(s) / 1000);
const LATER = new Date((NOW + 3 * 86400) * 1000).toISOString();
const PASSED = new Date((NOW - 5) * 1000).toISOString();
const saved = (quota, extra = {}) => JSON.stringify({ at: NOW - 60, plan: "Antigravity Starter Quota", quota, ...extra });
const bucket = (remaining, reset = LATER) => ({ remaining_fraction: remaining, reset_time: reset, reset_in_seconds: 0 });
const ALL_FOUR = { "3p-weekly": bucket(1), "3p-5h": bucket(0.5), "gemini-weekly": bucket(0.25), "gemini-5h": bucket(0.9) };
const rows = (r) => r.windows.map((w) => [w.id, w.short, w.long, w.percent, w.durationSec, w.offBarByDefault ?? false]);

test("descriptor, and its place after Codex, before OpenCode", () => {
  assert.deepEqual([agy.id, agy.name, agy.icon, agy.helper, agy.kind], ["agy", "Antigravity", "icons/antigravity.svg", "helpers/agy-limits.sh", undefined]);
  assert.equal(agy.oneColorGlyph, undefined, "a coloured icon, drawn as an image");
  assert.deepEqual(PROVIDERS.map((p) => p.id), ["claude", "codex", "agy", "opencode", "opencode-go", "pi"]);
});

test("Gemini's and the others' buckets: Gemini first, 5h before weekly; used = 1 − remaining; others off the bar by default", () => {
  const r = agy.parse(saved(ALL_FOUR), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.observedAt, NOW - 60, "as old as agy's last status line");
  assert.deepEqual(rows(r), [
    ["gemini-5h", "5h", "5-hour", 10, 18000, false],
    ["gemini-weekly", "wk", "Weekly", 75, 604800, false],
    ["3p-5h", "others 5h", "5-hour · others", 50, 18000, true],
    ["3p-weekly", "others wk", "Weekly · others", 0, 604800, true],
  ]);
  assert.equal(r.windows[0].resetsAt, T(LATER));
  assert.equal("offBarByDefault" in r.windows[0], false, "a window on the bar keeps today's shape");
});

test("plan: the Antigravity prefix and the Quota suffix go", () => {
  const plan = (p) => agy.parse(saved({ "gemini-5h": bucket(1) }, { plan: p }), NOW).plan;
  assert.deepEqual([plan("Antigravity Starter Quota"), plan("antigravity pro"), plan("Ultra"), plan(null), plan(""), plan(7)], ["Starter", "pro", "Ultra", null, null, null]);
});

test("a reset that has passed since it was saved → 0% and no reset time", () => {
  const r = agy.parse(saved({ "gemini-weekly": bucket(0.1, PASSED) }), NOW);
  assert.deepEqual([r.windows[0].percent, r.windows[0].resetsAt], [0, null]);
});

test("no reset_time → the saved time + reset_in_seconds", () => {
  const r = agy.parse(saved({ "gemini-5h": { remaining_fraction: 0.5, reset_in_seconds: 600 } }), NOW);
  assert.equal(r.windows[0].resetsAt, NOW - 60 + 600);
});

test("unknown buckets: after the known ones, by name, named from their key; a third-party one stays off the bar", () => {
  const r = agy.parse(saved({ zeta: bucket(0.5), "3p-daily": bucket(0.5), "gemini-monthly": bucket(0.5), "gemini-5h": bucket(0.5), "beta-5h": bucket(0.5) }), NOW);
  assert.deepEqual(rows(r), [
    ["gemini-5h", "5h", "5-hour", 50, 18000, false],
    ["3p-daily", "others daily", "daily · others", 50, null, true],
    ["beta-5h", "beta 5h", "5-hour · beta", 50, 18000, false],
    ["gemini-monthly", "monthly", "monthly", 50, null, false],
    ["zeta", "zeta", "zeta", 50, null, false],
  ]);
});

test("odd buckets are left out, never a crash or NaN%", () => {
  const r = agy.parse(saved({ "gemini-5h": bucket(0.5), a: null, b: 3, c: "x", d: {}, e: { remaining_fraction: "lots" }, f: [0.2] }), NOW);
  assert.deepEqual(r.windows.map((w) => w.id), ["gemini-5h"]);
  const none = agy.parse(saved({ a: null }), NOW);
  assert.deepEqual([none.status, none.message], ["unavailable", "No limits in agy's quota"]);
});

test("nothing saved yet → unavailable, says to open agy", () => {
  for (const text of ["", "\n", "garbage", JSON.stringify({ at: NOW }), JSON.stringify({ at: NOW, quota: [1] })]) {
    const r = agy.parse(text, NOW);
    assert.deepEqual([r.status, r.message], ["unavailable", "Open agy once to see its limits"], text);
  }
});

test("a saved time from the future is taken as now", () => {
  assert.equal(agy.parse(saved({ "gemini-5h": bucket(0.5) }, { at: NOW + 999 }), NOW).observedAt, NOW);
});

const hasJq = spawnSync("sh", ["-c", "command -v jq"]).status === 0;
const cacheFile = (sub = "") => join(mkdtempSync(join(tmpdir(), "ul-agy-")), sub, "antigravity.json");
const statusLine = (input, env) => spawnSync("/bin/sh", [join(MOD, "helpers", "agy-statusline.sh")], { env: { ...process.env, ...env }, input, encoding: "utf8", timeout: 10000 });
const payload = (quota) => JSON.stringify({
  email: "someone@example.com", cwd: "/secret/project", conversation_id: "c1", transcript_path: "/x.jsonl",
  model: { id: "Gemini", display_name: "Gemini" }, plan_tier: "Antigravity Starter Quota", quota,
});
const savedIn = (f) => JSON.parse(readFileSync(f, "utf8"));
const NEEDS_JQ = { skip: !hasJq && "jq not installed" };

test("status line hook: keeps quota, plan and time only, in a file only you can read, and prints nothing", NEEDS_JQ, () => {
  const f = cacheFile("sub");
  const r = statusLine(payload({ "gemini-weekly": bucket(0.4, "2026-11-23T09:45:51Z") }), { HERDR_USAGE_AGY_CACHE: f });
  assert.deepEqual([r.status, r.stdout], [0, ""]);
  const s = savedIn(f);
  assert.deepEqual(Object.keys(s).sort(), ["at", "plan", "quota"]);
  assert.equal(s.plan, "Antigravity Starter Quota");
  assert.equal(s.quota["gemini-weekly"].remaining_fraction, 0.4);
  assert.ok(Math.abs(s.at - Date.now() / 1000) < 60, "saved with the time it was seen");
  assert.doesNotMatch(readFileSync(f, "utf8"), /someone|secret|transcript|c1/);
  assert.equal(statSync(f).mode & 0o777, 0o600);
});

test("status line hook: per bucket the later reset wins, and for the same reset the most used", NEEDS_JQ, () => {
  const f = cacheFile();
  const env = { HERDR_USAGE_AGY_CACHE: f };
  const see = (remaining, reset) => statusLine(payload({ "gemini-weekly": bucket(remaining, reset) }), env);
  const left = () => savedIn(f).quota["gemini-weekly"].remaining_fraction;
  see(0.4, "2026-11-23T09:00:00Z");
  see(0.9, "2026-11-16T09:00:00Z");
  assert.equal(left(), 0.4, "an agy that saw last week");
  see(0.7, "2026-11-23T09:00:00Z");
  assert.equal(left(), 0.4, "same week, older numbers");
  see(0.2, "2026-11-23T09:00:00Z");
  assert.equal(left(), 0.2);
  see(1, "2026-11-30T09:00:00Z");
  assert.equal(left(), 1, "a new week");
});

test("status line hook: buckets one agy didn't report stay, and its plan stays when a reading has none", NEEDS_JQ, () => {
  const f = cacheFile();
  const env = { HERDR_USAGE_AGY_CACHE: f };
  statusLine(payload({ "gemini-5h": bucket(0.5), "3p-5h": bucket(0.3) }), env);
  statusLine(JSON.stringify({ quota: { "gemini-5h": bucket(0.4) } }), env);
  const s = savedIn(f);
  assert.deepEqual([s.plan, s.quota["gemini-5h"].remaining_fraction, s.quota["3p-5h"]?.remaining_fraction], ["Antigravity Starter Quota", 0.4, 0.3]);
});

test("status line hook: input without a quota, or not JSON, leaves the file alone", NEEDS_JQ, () => {
  const f = cacheFile();
  for (const input of [JSON.stringify({ model: {} }), JSON.stringify({ quota: "x" }), "not json", ""]) {
    const r = statusLine(input, { HERDR_USAGE_AGY_CACHE: f });
    assert.deepEqual([r.status, r.stdout, existsSync(f)], [0, "", false], input);
  }
  statusLine(payload({ "gemini-5h": bucket(0.5) }), { HERDR_USAGE_AGY_CACHE: f });
  const before = readFileSync(f, "utf8");
  statusLine("not json", { HERDR_USAGE_AGY_CACHE: f });
  assert.equal(readFileSync(f, "utf8"), before);
});

test("status line hook: a saved file it can't read is started over, not kept failing", NEEDS_JQ, () => {
  const f = cacheFile();
  for (const broken of ["{", JSON.stringify({ at: 1, quota: "x" }), "[1]"]) {
    writeFileSync(f, broken);
    statusLine(payload({ "gemini-5h": bucket(0.5) }), { HERDR_USAGE_AGY_CACHE: f });
    assert.deepEqual(Object.keys(savedIn(f).quota), ["gemini-5h"], broken);
  }
});

test("status line hook: without jq, does nothing and still exits 0", () => {
  const f = cacheFile();
  const r = statusLine(payload({ "gemini-5h": bucket(0.5) }), { HERDR_USAGE_AGY_CACHE: f, PATH: mkdtempSync(join(tmpdir(), "ul-nojq-")) });
  assert.deepEqual([r.status, r.stdout, existsSync(f)], [0, "", false]);
});

test("limits helper: prints the saved file on one line; nothing saved → empty; agy missing → 127", () => {
  const f = cacheFile();
  const installed = { HERDR_USAGE_AGY_CACHE: f, HERDR_USAGE_AGY_BIN: "sh" };
  assert.deepEqual([run("agy-limits.sh", installed).status, run("agy-limits.sh", installed).stdout], [0, ""]);
  writeFileSync(f, JSON.stringify({ at: 1, plan: null, quota: {} }, null, 2));
  assert.equal(run("agy-limits.sh", installed).stdout, '{  "at": 1,  "plan": null,  "quota": {}}\n');
  const home = mkdtempSync(join(tmpdir(), "ul-home-"));
  const missing = run("agy-limits.sh", { HERDR_USAGE_AGY_CACHE: f, HERDR_USAGE_AGY_BIN: "/nonexistent/agy", HOME: home });
  assert.deepEqual([missing.status, missing.stdout], [127, ""]);
});

test("limits helper: agy in ~/.local/bin counts as installed, as Herdr's PATH may not hold it", () => {
  const home = mkdtempSync(join(tmpdir(), "ul-home-"));
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  writeFileSync(join(home, ".local", "bin", "agy"), "#!/bin/sh\n");
  chmodSync(join(home, ".local", "bin", "agy"), 0o755);
  const env = { HERDR_USAGE_AGY_BIN: "/nonexistent/agy", HOME: home, XDG_CACHE_HOME: join(home, "cache") };
  assert.deepEqual([run("agy-limits.sh", env).status, run("agy-limits.sh", env).stdout], [0, ""]);
  mkdirSync(join(home, "cache", "herdr-usage-limits"), { recursive: true });
  writeFileSync(join(home, "cache", "herdr-usage-limits", "antigravity.json"), JSON.stringify({ at: 2, quota: {} }));
  assert.equal(run("agy-limits.sh", env).stdout, '{"at":2,"quota":{}}\n');
});
