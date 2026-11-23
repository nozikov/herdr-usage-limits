import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAKE, claudeHome, run, session } from "./_helpers.js";

const configDirOf = (r) => JSON.parse(r.stdout.trim()).response.response.config_dir;

test("claude helper: no config dir → Herdr's CLAUDE_CONFIG_DIR as it is", () => {
  assert.equal(configDirOf(run("claude-usage.sh", { HERDR_USAGE_CLAUDE_BIN: FAKE, CLAUDE_CONFIG_DIR: "/somewhere" })), "/somewhere");
});

test("claude helper: a config dir → CLAUDE_CONFIG_DIR, ~/ expanded, trailing / dropped", () => {
  const env = { HERDR_USAGE_CLAUDE_BIN: FAKE, HOME: "/home/demo", CLAUDE_CONFIG_DIR: "/somewhere" };
  assert.equal(configDirOf(run("claude-usage.sh", env, ["~/.claude-work/"])), "/home/demo/.claude-work");
  assert.equal(configDirOf(run("claude-usage.sh", env, ["/abs/dir"])), "/abs/dir");
});

test("claude helper: ~/.claude → CLAUDE_CONFIG_DIR unset, as the CLI's default sign-in expects", () => {
  const env = { HERDR_USAGE_CLAUDE_BIN: FAKE, HOME: "/home/demo", CLAUDE_CONFIG_DIR: "/home/demo/.claude-work" };
  assert.equal(configDirOf(run("claude-usage.sh", env, ["~/.claude"])), "<unset>");
  assert.equal(configDirOf(run("claude-usage.sh", env, ["/home/demo/.claude/"])), "<unset>");
  assert.equal(configDirOf(run("claude-usage.sh", env, ["~"])), "/home/demo");
});

test("claude helper: a config dir that looks like an option is refused, the CLI not run", () => {
  const r = run("claude-usage.sh", { HERDR_USAGE_CLAUDE_BIN: FAKE }, ["--help"]);
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

const emptyClaudeHome = () => mkdtempSync(join(tmpdir(), "ul-claude-empty-"));

test("session helper, claude: several config dirs → the one holding the pid's session, named by its place", () => {
  const work = claudeHome("claude-session-compacted.jsonl");
  const r = session(["claude", "123", emptyClaudeHome(), work], { CLAUDE_CONFIG_DIR: claudeHome("claude-session.jsonl") });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^account=2\ntokens=10364 /, "from the given dirs, not CLAUDE_CONFIG_DIR");
});

test("session helper, claude: the account is named even before the session has numbers", () => {
  const work = claudeHome("claude-session.jsonl");
  rmSync(join(work, "projects"), { recursive: true });
  const r = session(["claude", "123", emptyClaudeHome(), work], {});
  assert.deepEqual([r.status, r.stdout], [1, "account=2\n"]);
});

test("session helper, claude: no config dirs given → no account line, as before", () => {
  const r = session(["claude", "123"], { CLAUDE_CONFIG_DIR: claudeHome("claude-session.jsonl") });
  assert.doesNotMatch(r.stdout, /account=/);
});

test("session helper, claude: config dirs with ~/ are under HOME", () => {
  const home = mkdtempSync(join(tmpdir(), "ul-home-"));
  renameSync(claudeHome("claude-session.jsonl"), join(home, ".claude-work"));
  const r = session(["claude", "123", "~/.claude", "~/.claude-work"], { HOME: home });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^account=2\ntokens=182010 /);
});

test("session helper, claude: no given dir has the pid → exit 1, no output", () => {
  const r = session(["claude", "123", emptyClaudeHome()], { CLAUDE_CONFIG_DIR: claudeHome("claude-session.jsonl") });
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});
