import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MOD, HERE } from "./_util.js";

const FAKE = join(HERE, "fake-cli", "claude");

function run(helper, env) {
  const t0 = Date.now();
  const r = spawnSync("sh", [join(MOD, "helpers", helper)], { env: { ...process.env, ...env }, encoding: "utf8", timeout: 30000 });
  assert.doesNotMatch(r.stderr ?? "", /No such file|can't open/, "helper script missing");
  return { ...r, ms: Date.now() - t0 };
}

function alive(pattern) {
  return spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" }).stdout.trim() !== "";
}

test("claude helper: bogus bin → exit 127", () => {
  const r = run("claude-usage.sh", { HERDR_USAGE_CLAUDE_BIN: "/nonexistent/claude" });
  assert.equal(r.status, 127);
  assert.equal(r.stdout, "");
});

test("claude helper: skips banner and system events, prints the control_response line", () => {
  const r = run("claude-usage.sh", { HERDR_USAGE_CLAUDE_BIN: FAKE });
  assert.equal(r.status, 0);
  const msg = JSON.parse(r.stdout.trim());
  assert.equal(msg.type, "control_response");
  assert.equal(msg.response.request_id, "herdr-usage-limits");
  assert.ok(r.ms < 5000, `took ${r.ms} ms`);
  assert.equal(alive("fake-cli/claude"), false, "fake CLI left running");
});

test("claude helper: CLI that never answers → exit 1 within 20 s and no leftover process", { timeout: 30000 }, () => {
  const r = run("claude-usage.sh", { HERDR_USAGE_CLAUDE_BIN: FAKE, HANG: "1" });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.ok(r.ms < 20000, `took ${r.ms} ms`);
  assert.equal(alive("sleep 60"), false, "hung CLI left running");
});

test("codex helper: bogus bin and no sessions dir → exit 127", () => {
  const r = run("codex-limits.sh", { HERDR_USAGE_CODEX_BIN: "/nonexistent/codex", CODEX_HOME: mkdtempSync(join(tmpdir(), "codex-home-")) });
  assert.equal(r.status, 127);
  assert.equal(r.stdout, "");
});

test("codex helper: codex missing but session logs exist → exit 127 (not a stale 'ok')", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-home-"));
  mkdirSync(join(home, "sessions", "2026", "11", "04"), { recursive: true });
  const snap = JSON.parse(readFileSync(join(HERE, "fixtures", "codex-session-snapshot.json"), "utf8")).snapshot;
  writeFileSync(join(home, "sessions", "2026", "11", "04", "rollout.jsonl"), JSON.stringify(snap) + "\n");
  const r = run("codex-limits.sh", { HERDR_USAGE_CODEX_BIN: "/nonexistent/codex", CODEX_HOME: home });
  assert.equal(r.status, 127);
  assert.equal(r.stdout, "");
});

// ---- session.sh ----

function session(args, env) {
  return spawnSync("sh", [join(MOD, "helpers", "session.sh"), ...args], { env: { ...process.env, ...env }, encoding: "utf8", timeout: 10000 });
}

function claudeHome(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "ul-claude-"));
  mkdirSync(join(dir, "sessions"));
  mkdirSync(join(dir, "projects", "-some-project"), { recursive: true });
  writeFileSync(join(dir, "sessions", "123.json"), JSON.stringify({ pid: 123, sessionId: "abc-1", cwd: "/x" }));
  copyFileSync(join(HERE, "fixtures", fixture), join(dir, "projects", "-some-project", "abc-1.jsonl"));
  return dir;
}

test("session helper, claude: numbers from the main thread, not from quoted text or subagents", () => {
  const r = session(["claude", "123"], { CLAUDE_CONFIG_DIR: claudeHome("claude-session.jsonl") });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "tokens=182010 calls=3 compactions=2 lastTrigger=auto lastPre=259912 lastPost=10364\n", "prompts only: the trap line, a string and a text block");
});

test("session helper, claude: right after a compaction the context is what's left", () => {
  const r = session(["claude", "123"], { CLAUDE_CONFIG_DIR: claudeHome("claude-session-compacted.jsonl") });
  assert.match(r.stdout, /^tokens=10364 /);
});

test("session helper, claude: a turn with server tools counts its last request, not their sum", () => {
  const r = session(["claude", "123"], { CLAUDE_CONFIG_DIR: claudeHome("claude-session-iterations.jsonl") });
  assert.match(r.stdout, /^tokens=321002 /);
});

test("session helper, claude: prints no conversation text", () => {
  const r = session(["claude", "123"], { CLAUDE_CONFIG_DIR: claudeHome("claude-session.jsonl") });
  assert.doesNotMatch(r.stdout, /secret/);
});

test("session helper, claude: unknown process → exit 1, no output", () => {
  const r = session(["claude", "999"], { CLAUDE_CONFIG_DIR: claudeHome("claude-session.jsonl") });
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

test("session helper: a pid that isn't a number is refused", () => {
  const r = session(["claude", "../../etc/passwd"], { CLAUDE_CONFIG_DIR: claudeHome("claude-session.jsonl") });
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

function fakeTools(rollout) {
  const dir = mkdtempSync(join(tmpdir(), "ul-bin-"));
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  };
  tool("pgrep", 'echo 456');
  const files = [rollout].flat().filter(Boolean).map((f) => `n${f}\\n`).join("");
  tool("lsof", files ? `[ "$4" = 456 ] && printf 'p456\\nn/other/file\\n${files}'` : "exit 1");
  return dir;
}

test("session helper, codex: the file its app-server holds open, last usage and window", () => {
  const home = mkdtempSync(join(tmpdir(), "ul-codex-"));
  const day = join(home, "sessions", "2026", "11", "04");
  mkdirSync(day, { recursive: true });
  const rollout = join(day, "rollout-2026-11-04T12-55-35-abc.jsonl");
  copyFileSync(join(HERE, "fixtures", "codex-rollout.jsonl"), rollout);
  const r = session(["codex", "123"], { PATH: `${fakeTools(rollout)}:${process.env.PATH}` });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "tokens=115225 window=475000 calls=2\n");
});

test("session helper, codex: no open session file → exit 1, never a guess", () => {
  const r = session(["codex", "123"], { PATH: `${fakeTools(null)}:${process.env.PATH}` });
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

test("session helper, codex: with two files open, the one being written", () => {
  const day = join(mkdtempSync(join(tmpdir(), "ul-codex-")), "sessions", "2026", "11", "04");
  mkdirSync(day, { recursive: true });
  const old = join(day, "rollout-a.jsonl");
  const live = join(day, "rollout-b.jsonl");
  writeFileSync(old, '{"payload":{"type":"token_count","info":{"last_token_usage":{"total_tokens":7},"model_context_window":100}}}\n');
  copyFileSync(join(HERE, "fixtures", "codex-rollout.jsonl"), live);
  utimesSync(old, 1000, 1000);
  const r = session(["codex", "123"], { PATH: `${fakeTools([old, live])}:${process.env.PATH}` });
  assert.match(r.stdout, /^tokens=115225 /);
});

// ---- session.sh pi ----

const runSession = (app, pid, env) => session([app, pid], env);

// $HOME/.pi/agent/sessions/<encoded /home/demo/project>/<start>_<id>.jsonl
function piHome(files) {
  const home = mkdtempSync(join(tmpdir(), "ul-pi-"));
  const dir = join(home, ".pi", "agent", "sessions", "--home-demo-project--");
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return home;
}
const PI = readFileSync(join(HERE, "fixtures", "pi-session.jsonl"), "utf8");
const piReply = (input, model = "demo-model") =>
  JSON.stringify({ type: "message", id: "b1", parentId: null, timestamp: "2026-11-02T10:05:02.000Z",
    message: { role: "assistant", content: [], model, usage: { input, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: input + 1 } } }) + "\n";
const home = piHome({ "2026-11-02T10-00-00-000Z_x.jsonl": PI });
const home2 = piHome({ "2026-11-02T10-00-00-000Z_a.jsonl": PI, "2026-11-02T10-05-00-000Z_b.jsonl": piReply(777) });

const piEnv = (home, extra = {}) => ({ HERDR_USAGE_PI_HOME: join(home, ".pi"), HERDR_USAGE_PROC_CWD: "/home/demo/project",
  HERDR_USAGE_PROC_START: "1793613600", HERDR_USAGE_PROC_PEERS: "1", ...extra }); // 2026-11-02T10:00:00Z

test("pi session: last reply's context, real user messages only, the model", () => {
  assert.equal(runSession("pi", "4242", piEnv(home)).stdout.trim(), "tokens=50500 calls=4 model=demo-model");
});

test("pi session: prints no conversation text", () => {
  assert.doesNotMatch(runSession("pi", "4242", piEnv(home)).stdout, /hello|thanks|README|Done/);
});

test("pi session: a session that ended before this process started is not its session", () => {
  assert.equal(runSession("pi", "4242", piEnv(home, { HERDR_USAGE_PROC_START: "1893613600" })).status, 1);
});

test("pi session: two in one folder, told apart by start time or not at all", () => {
  // second file started 10:05:00; process started 10:05:01 → the second file
  assert.match(runSession("pi", "4242", piEnv(home2, { HERDR_USAGE_PROC_PEERS: "2", HERDR_USAGE_PROC_START: "1793613901" })).stdout, /^tokens=777 /);
  // process started 10:02:30, matching neither → nothing
  const r = runSession("pi", "4242", piEnv(home2, { HERDR_USAGE_PROC_PEERS: "2", HERDR_USAGE_PROC_START: "1793613750" }));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

test("pi session: a model id with other characters is dropped, numbers stay", () => {
  const h = piHome({ "2026-11-02T10-00-00-000Z_x.jsonl": piReply(1234, "bad id;rm") });
  assert.equal(runSession("pi", "4242", piEnv(h)).stdout, "tokens=1234 calls=0\n");
});

test("pi session: no folder for that directory → exit 1", () => {
  const r = runSession("pi", "4242", piEnv(home, { HERDR_USAGE_PROC_CWD: "/home/demo/elsewhere" }));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

// One Pi in the folder, but files of others that came and went: only a certain match.
function piHomeTimed(files) { // { name: [text, mtime] }
  const h = piHome(Object.fromEntries(Object.entries(files).map(([n, [text]]) => [n, text])));
  const dir = join(h, ".pi", "agent", "sessions", "--home-demo-project--");
  for (const [n, [, m]] of Object.entries(files)) utimesSync(join(dir, n), m, m);
  return h;
}
const START = 1793613600; // 2026-11-02T10:00:00Z

test("pi session, one process: its own session is shown while an older-written other exists", () => {
  const h = piHomeTimed({ "2026-11-02T10-00-00-000Z_own.jsonl": [piReply(500), START + 200], "2026-11-02T09-00-00-000Z_old.jsonl": [piReply(900), START + 100] });
  assert.equal(runSession("pi", "4242", piEnv(h)).stdout, "tokens=500 calls=0 model=demo-model\n");
});

test("pi session, one process: another Pi wrote after it → nothing, not the other's numbers", () => {
  const h = piHomeTimed({ "2026-11-02T10-00-00-000Z_own.jsonl": [piReply(500), START + 100], "2026-11-02T10-03-00-000Z_b.jsonl": [piReply(900), START + 300] });
  const r = runSession("pi", "4242", piEnv(h));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

test("pi session, one process: a resumed session is shown when it is the only candidate", () => {
  const h = piHomeTimed({ "2026-11-01T08-00-00-000Z_resumed.jsonl": [piReply(600), START + 50], "2026-10-30T08-00-00-000Z_stale.jsonl": [piReply(900), START - 9000] });
  assert.equal(runSession("pi", "4242", piEnv(h)).stdout, "tokens=600 calls=0 model=demo-model\n");
});

test("pi session, one process: two candidates and neither started with it → nothing", () => {
  const h = piHomeTimed({ "2026-11-01T08-00-00-000Z_a.jsonl": [piReply(600), START + 50], "2026-11-01T09-00-00-000Z_b.jsonl": [piReply(900), START + 80] });
  const r = runSession("pi", "4242", piEnv(h));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

// ---- session.sh opencode ----

const HAS_SQLITE = spawnSync("sqlite3", ["-version"], { stdio: "ignore" }).status === 0;
const sqliteTest = (name, fn) => test(name, HAS_SQLITE ? {} : { skip: "sqlite3 not installed" }, fn);

const OC_START = 1793613600; // 2026-11-02T10:00:00Z, the process start
const ocTokens = (input, output = 0) => ({ input, output, reasoning: 0, cache: { read: 0, write: 0 } });
const sq = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

// sessions: [{ id, parent, dir, updated (s), model, rows: [[type, data]] }]
function ocDb(sessions) {
  const file = join(mkdtempSync(join(tmpdir(), "ul-oc-")), "opencode.db");
  let sql = "create table session_v2 (id text primary key, parent_id text, directory text not null, model text, time_created integer not null, time_updated integer not null);\n"
    + "create table session_message (id text primary key, session_id text not null, type text not null, seq integer not null, data text not null);\n";
  for (const s of sessions) {
    const t = (s.updated ?? OC_START + 60) * 1000;
    sql += `insert into session_v2 values (${sq(s.id)}, ${sq(s.parent ?? null)}, ${sq(s.dir ?? "/home/demo/project")}, ${sq(JSON.stringify({ id: s.model ?? "demo-model", providerID: "workspace" }))}, ${t - 30000}, ${t});\n`;
    (s.rows ?? []).forEach(([type, data], i) => {
      sql += `insert into session_message values (${sq(`${s.id}-${i}`)}, ${sq(s.id)}, ${sq(type)}, ${i + 1}, ${sq(JSON.stringify(data))});\n`;
    });
  }
  const r = spawnSync("sqlite3", [file], { input: sql, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return file;
}

const OC_ROWS = [
  ["user", {}], ["assistant", { tokens: ocTokens(9000, 12) }],
  ["user", {}], ["assistant", { tokens: ocTokens(17456, 37) }],
  ["user", {}],
];
const OC_OWN = { id: "ses_own", rows: OC_ROWS };
const OC_CHILD = { id: "ses_child", parent: "ses_own", updated: OC_START + 300, rows: [["user", {}], ["assistant", { tokens: ocTokens(99000, 500) }]] };
const OC_ELSEWHERE = { id: "ses_else", dir: "/home/demo/elsewhere", updated: OC_START + 400, rows: [["user", {}], ["assistant", { tokens: ocTokens(88000, 400) }]] };

const ocEnv = (db, extra = {}) => ({ HERDR_USAGE_OPENCODE_DB: db, HERDR_USAGE_PROC_CWD: "/home/demo/project",
  HERDR_USAGE_PROC_START: String(OC_START), HERDR_USAGE_PROC_PEERS: "1", ...extra });

sqliteTest("opencode session: newest reply's context, the person's messages, the model", () => {
  assert.equal(runSession("opencode", "4242", ocEnv(ocDb([OC_OWN]))).stdout, "tokens=17493 calls=3 compactions=0 model=demo-model\n");
});

sqliteTest("opencode session: a subagent's session and another folder's are never picked", () => {
  assert.equal(runSession("opencode", "4242", ocEnv(ocDb([OC_OWN, OC_CHILD, OC_ELSEWHERE]))).stdout, "tokens=17493 calls=3 compactions=0 model=demo-model\n");
});

sqliteTest("opencode session: a reply still being written (no tokens yet) leaves the last context", () => {
  const db = ocDb([{ id: "ses_own", rows: [...OC_ROWS, ["assistant", { tokens: ocTokens(0) }]] }]);
  assert.equal(runSession("opencode", "4242", ocEnv(db)).stdout, "tokens=17493 calls=3 compactions=0 model=demo-model\n");
});

sqliteTest("opencode session: updated before the process started → nothing", () => {
  const r = runSession("opencode", "4242", ocEnv(ocDb([{ ...OC_OWN, updated: OC_START - 600 }])));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

sqliteTest("opencode session: two candidates and one client → nothing, not the newest", () => {
  const r = runSession("opencode", "4242", ocEnv(ocDb([OC_OWN, { id: "ses_other", updated: OC_START + 120, rows: OC_ROWS }])));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

sqliteTest("opencode session: two clients in one folder → nothing", () => {
  const r = runSession("opencode", "4242", ocEnv(ocDb([OC_OWN]), { HERDR_USAGE_PROC_PEERS: "2" }));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

sqliteTest("opencode session: a folder name with a quote is matched, not broken", () => {
  const dir = "/home/demo/it's a project";
  const db = ocDb([{ ...OC_OWN, dir }, { id: "ses_x", dir: "/home/demo/it", updated: OC_START + 100, rows: OC_ROWS }]);
  assert.equal(runSession("opencode", "4242", ocEnv(db, { HERDR_USAGE_PROC_CWD: dir })).stdout, "tokens=17493 calls=3 compactions=0 model=demo-model\n");
});

sqliteTest("opencode session: a model id with other characters is dropped, numbers stay", () => {
  const db = ocDb([{ ...OC_OWN, model: "bad id|x;rm" }]);
  assert.equal(runSession("opencode", "4242", ocEnv(db)).stdout, "tokens=17493 calls=3 compactions=0\n");
});

sqliteTest("opencode session: no sqlite3, or no database → exit 1, no output", () => {
  const db = ocDb([OC_OWN]);
  const a = runSession("opencode", "4242", ocEnv(db, { HERDR_USAGE_SQLITE_BIN: "/nonexistent/sqlite3" }));
  assert.deepEqual([a.status, a.stdout], [1, ""]);
  const b = runSession("opencode", "4242", ocEnv(join(tmpdir(), "ul-no-such-dir", "opencode.db")));
  assert.deepEqual([b.status, b.stdout], [1, ""]);
});

// Peers looked up for real (through fake ps and lsof): the background service isn't a client.
function ocProcs(procs) { // { pid: [comm, args] }, all in /home/demo/project
  const dir = mkdtempSync(join(tmpdir(), "ul-bin-"));
  const tool = (name, body) => writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  const list = Object.entries(procs).map(([p, [c]]) => `${p} ${c}`).join("\\n");
  const one = Object.entries(procs).map(([p, [c, a]]) =>
    `  ${p}) [ "$2" = "comm=" ] && echo '${c}' || echo '${a}' ;;`).join("\n");
  tool("ps", `if [ "$1" = -A ]; then printf '${list}\\n'; exit 0; fi\ncase "$4" in\n${one}\n  *) exit 1 ;;\nesac`);
  tool("lsof", 'printf "p%s\\nn/home/demo/project\\n" "$6"');
  return dir;
}
const ocPeersEnv = (db, procs) => {
  const env = ocEnv(db, { PATH: `${ocProcs(procs)}:${process.env.PATH}` });
  delete env.HERDR_USAGE_PROC_PEERS;
  return env;
};

sqliteTest("opencode session: the background service in the same folder is not counted as a client", () => {
  const procs = { 4242: ["opencode", "opencode"], 4300: ["opencode", "/usr/local/bin/opencode serve --service"] };
  assert.equal(runSession("opencode", "4242", ocPeersEnv(ocDb([OC_OWN]), procs)).stdout, "tokens=17493 calls=3 compactions=0 model=demo-model\n");
});

sqliteTest("opencode session: a second terminal client in the folder → nothing", () => {
  const procs = { 4242: ["opencode", "opencode"], 4300: ["opencode", "opencode serve --service"], 4301: ["/usr/local/bin/opencode", "/usr/local/bin/opencode -c"] };
  const r = runSession("opencode", "4242", ocPeersEnv(ocDb([OC_OWN]), procs));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

// OpenCode 2.2.5 writes a compaction as a session_message of type "compaction" whose
// tokens are the summarising call's, not the context after it.
const OC_COMPACTED = [...OC_ROWS, ["compaction", { status: "completed", reason: "manual", tokens: ocTokens(18084, 181) }]];

sqliteTest("opencode session: right after a compaction the old context isn't shown", () => {
  const r = runSession("opencode", "4242", ocEnv(ocDb([{ id: "ses_own", rows: OC_COMPACTED }])));
  assert.deepEqual([r.status, r.stdout], [1, ""]);
});

sqliteTest("opencode session: compactions are counted, the reply after the last one is the context", () => {
  const rows = [...OC_COMPACTED, ["user", {}], ["assistant", { tokens: ocTokens(2100, 40) }], ["compaction", { status: "failed", tokens: ocTokens(5) }]];
  assert.equal(runSession("opencode", "4242", ocEnv(ocDb([{ id: "ses_own", rows }]))).stdout, "tokens=2140 calls=4 compactions=1 model=demo-model\n");
});
