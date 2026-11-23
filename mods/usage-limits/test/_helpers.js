import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MOD, HERE } from "./_util.js";

export const FAKE = join(HERE, "fake-cli", "claude");

export function run(helper, env, args = []) {
  const t0 = Date.now();
  const r = spawnSync("sh", [join(MOD, "helpers", helper), ...args], { env: { ...process.env, ...env }, encoding: "utf8", timeout: 30000 });
  assert.doesNotMatch(r.stderr ?? "", /No such file|can't open/, "helper script missing");
  return { ...r, ms: Date.now() - t0 };
}

export function alive(pattern) {
  return spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" }).stdout.trim() !== "";
}

export function session(args, env) {
  return spawnSync("sh", [join(MOD, "helpers", "session.sh"), ...args], { env: { ...process.env, ...env }, encoding: "utf8", timeout: 10000 });
}

export function claudeHome(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "ul-claude-"));
  mkdirSync(join(dir, "sessions"));
  mkdirSync(join(dir, "projects", "-some-project"), { recursive: true });
  writeFileSync(join(dir, "sessions", "123.json"), JSON.stringify({ pid: 123, sessionId: "abc-1", cwd: "/x" }));
  copyFileSync(join(HERE, "fixtures", fixture), join(dir, "projects", "-some-project", "abc-1.jsonl"));
  return dir;
}
