# Usage limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `usage-limits` Herdr mod so the status bar shows every Claude Code and Codex limit window (label, bar with pace tick, percent, reset time when tight), with a checkbox popup to choose providers and windows, and no token handling.

**Architecture:** Pure ES modules (parsers, formatting, prefs) that run both inside Herdr and under `node --test`; thin `sh` helpers that ask each CLI for its limits and print one JSON line; `main.js` is the only file importing `gpui-kit`/`herdr` and renders either the bar or the settings popup depending on `props().view`.

**Tech Stack:** Herdr mod API (gpui-kit / gpui-base / herdr), POSIX `sh`, Node 24 `node --test` (dev only, zero dependencies).

**Spec:** `docs/superpowers/specs/2026-11-04-usage-limits-design.md`

## Global Constraints

- The mod never reads, stores, logs or sends tokens or credential files; helpers only run `claude` / `codex` CLIs.
- Never show a guessed number: unobserved post-reset window → `—`; failures keep the last good reading dimmed with its age.
- No model usage: Claude probe is `claude -p --safe-mode --no-session-persistence --input-format stream-json --output-format stream-json --verbose` + `get_usage` control request only.
- No timers for animation; timers: 60 s redraw, 5 min fetch per enabled provider, 1 h re-check for not-installed providers; manual refresh cooldown 30 s.
- UI copy in English. Colors: `< 70` → `ansi2`, `70–89` → `ansi3`, `≥ 90` → `ansi1`; amber/red append ` · <time to reset>`.
- Helpers: hard timeout ~15 s, always kill the CLI they started; exit `0` + one JSON line on stdout, `127` when the CLI is not found, `1` on any other failure. Env overrides `HERDR_USAGE_CLAUDE_BIN`, `HERDR_USAGE_CODEX_BIN`.
- Prefs in `shared("usage-limits.prefs")` as opt-out lists `{ hidden: string[], hiddenWindows: string[] }` (`"<providerId>:<windowId>"`).
- Credit `jmalicki/herdr-mod-ai-usage` (MIT) for the `get_usage` approach in RECIPE.md and the Claude helper header.
- macOS + Linux only; local machine only.

## Review Focus

1. Claude CLI prints non-JSON lines or other stream events before the `control_response` → helper must skip them, not fail. (Task 2 test: fake CLI emitting a banner + a `system` event first.)
2. Claude reply with `subtype: "error"` or no limits (API-key login) → `status: "error"/"unavailable"`, zero windows, never `0%`. (Task 1 tests.)
3. `codex` / `claude` missing from PATH (Herdr started from the Dock) → exit 127 → provider "not installed", greyed, not `!`. (Task 2 test with a bogus bin.)
4. Clock passes a window's `resetsAt` between fetches → that segment shows `—` and no tick, without a refetch. (Task 3 test on `segmentView`.)
5. All providers/windows hidden by the user → bar still shows the gauge icon so the popup can be reopened. (Task 4 test on `barModel`.)

---

## File Structure

```
package.json                              dev: {"type":"module"}, "test" script
mods/usage-limits/
  main.js            View: bar | settings popup, polling, state (only file importing gpui/herdr)
  mod.json           { "place": "none" } (exists)
  lib/report.js      Report helpers: makeWindow, errorReport, unavailableReport
  lib/format.js      timeLeft, resetClock, level, pace
  lib/prefs.js       isShown, toggleProvider, toggleWindow, effectivePrefs
  lib/view.js        segmentView, barModel, chooseDensity, tooltipText
  providers/claude.js   { id, name, icon, helper, parse(text, now) }
  providers/codex.js    same shape
  providers/index.js    export const PROVIDERS = [claude, codex]
  helpers/claude-usage.sh  get_usage probe
  helpers/codex-limits.sh  moved from ./codex-limits.sh, exit codes per constraints
  icons/gauge.svg    tinted fallback icon
  test/fixtures/*.json   (exist: claude-get-usage.max.json, codex-app-server.plus.json, codex-session-snapshot.json)
  test/*.test.js
  RECIPE.md, preview.png (rewrite / refresh)
```

Removed: `mods/usage-limits/claude-tap.sh`, `mods/usage-limits/codex-limits.sh` (moved).

## Shared types (used across tasks)

```js
// Window
{ id: string, short: string, long: string,
  percent: number /*0–100*/, resetsAt: number|null /*epoch s*/, durationSec: number|null }
// Report
{ status: "ok" | "unavailable" | "error", message: string|null,
  plan: string|null, observedAt: number /*epoch s*/, source: string, windows: Window[] }
```

---

### Task 1: Pure parsers for Claude and Codex

**Files:**
- Create: `package.json`, `mods/usage-limits/lib/report.js`, `mods/usage-limits/providers/claude.js`, `mods/usage-limits/providers/codex.js`, `mods/usage-limits/providers/index.js`
- Create: `mods/usage-limits/test/claude.test.js`, `mods/usage-limits/test/codex.test.js`
- Create synthetic fixtures: `test/fixtures/claude-get-usage.error.json` (`response.subtype: "error"`), `test/fixtures/claude-get-usage.apikey.json` (success, `rate_limits_available: false`, no `limits`, no `five_hour`), `test/fixtures/claude-get-usage.legacy.json` (success, no `limits`, only `five_hour`/`seven_day` with `utilization` 12 / 34), `test/fixtures/codex-app-server.multi.json` (copy of plus fixture with `rateLimitsByLimitId` gaining `"spark": {limitId:"spark", limitName:"Spark", primary:{usedPercent:40,windowDurationMins:300,resetsAt:1793796866}, secondary:null}`)

**Interfaces:**
- Produces: `makeWindow(fields) -> Window`, `errorReport(source, message, now) -> Report`, `unavailableReport(source, message, now) -> Report` in `lib/report.js`.
- Produces: `claude.parse(text: string, now: number) -> Report`, `codex.parse(text: string, now: number) -> Report`; descriptors `{ id: "claude"|"codex", name: "Claude"|"Codex", icon: "icons/claude.svg"|"icons/codex.svg", helper: "helpers/claude-usage.sh"|"helpers/codex-limits.sh", parse }`; `PROVIDERS` in `providers/index.js`.

- [ ] **Step 1: Root `package.json`** — `{"private":true,"type":"module","scripts":{"test":"node --test mods/*/test/"}}`.

- [ ] **Step 2: Write failing tests** (`now = 1793779000` for all)

```js
// claude.test.js
test("max fixture → three windows in order", () => {
  const r = claude.parse(read("claude-get-usage.max.json"), NOW);
  assert.equal(r.status, "ok"); assert.equal(r.plan, "max");
  assert.deepEqual(r.windows.map(w => [w.id, w.short, w.long, w.percent]), [
    ["session", "5h", "5-hour", 4],
    ["weekly_all", "wk", "Weekly", 50],
    ["weekly_scoped:Fable", "Fable", "Weekly · Fable", 3]]);
  assert.equal(r.windows[0].resetsAt, Math.floor(Date.parse("2026-11-04T09:00:00.301383+00:00") / 1000));
  assert.deepEqual(r.windows.map(w => w.durationSec), [18000, 604800, 604800]);
});
test("unknown kind → generic label, no duration", () => {/* limits:[{kind:"monthly_thing",percent:7,resets_at:null,scope:null}] → short "monthly thing", durationSec null, resetsAt null */});
test("scope.surface used when no model", () => {/* scope:{model:null,surface:"Cowork"} kind weekly_scoped → id "weekly_scoped:Cowork", short "Cowork" */});
test("error reply → status error, no windows", () => { /* .error.json */ });
test("api-key reply → status unavailable 'No subscription limits', no windows", () => {});
test("legacy reply → 5h 12 and wk 34 from utilization", () => {});
test("garbage text → status error", () => assert.equal(claude.parse("not json", NOW).status, "error"));
test("finds control_response among other lines", () => {/* text = '{"type":"system"}\n' + fixture line */});

// codex.test.js
test("plus fixture → 5h 0, wk 11 with durations from windowDurationMins", () => {
  const r = codex.parse(read("codex-app-server.plus.json"), NOW);
  assert.deepEqual(r.windows.map(w => [w.id, w.short, w.percent, w.durationSec]),
    [["codex:primary", "5h", 0, 18000], ["codex:secondary", "wk", 11, 604800]]);
  assert.equal(r.plan, "plus"); assert.equal(r.source, "codex app-server");
});
test("multi limit ids → codex first, then 'Spark 5h'", () => {/* ids codex:primary, codex:secondary, spark:primary; short of last = "Spark 5h" */});
test("session snapshot fallback → observedAt from snapshot timestamp, source 'Codex session log'", () => {});
test("garbage → status error", () => {});
```

- [ ] **Step 3: Run** `npm test` → FAIL (modules missing).

- [ ] **Step 4: Implement** `lib/report.js`, `providers/claude.js`, `providers/codex.js`, `providers/index.js`. Claude: scan lines, take the first `type === "control_response"`; durations `session` 18000, `weekly_*` 604800, else null; `percent` rounded to integer; fallback to `five_hour`/`seven_day` (`utilization`) only when `limits` is absent; source `"claude CLI"`. Codex: iterate `rateLimitsByLimitId` (default id `codex` first) or `rateLimits` alone; snapshot path uses snake_case fields.

- [ ] **Step 5: Run** `npm test` → all PASS.

- [ ] **Step 6: Commit** `git add package.json mods/usage-limits/lib/report.js mods/usage-limits/providers mods/usage-limits/test` → `feat(usage-limits): Claude and Codex report parsers`.

---

### Task 2: CLI helpers

**Files:**
- Create: `mods/usage-limits/helpers/claude-usage.sh`
- Move + modify: `mods/usage-limits/codex-limits.sh` → `mods/usage-limits/helpers/codex-limits.sh`
- Create: `mods/usage-limits/test/helpers.test.js`, `mods/usage-limits/test/fake-cli/claude` (executable fake)

**Interfaces:**
- Produces: `sh helpers/claude-usage.sh` and `sh helpers/codex-limits.sh`, contract per Global Constraints (stdout: the raw `control_response` line / the `"id":2` line or `{"snapshot":…}`; codes 0/127/1).

- [ ] **Step 1: Write failing tests** (spawn with `child_process.spawnSync("sh", [helper], {env})`)

```js
test("claude helper: bogus bin → exit 127", () => {
  const r = run("claude-usage.sh", { HERDR_USAGE_CLAUDE_BIN: "/nonexistent/claude" });
  assert.equal(r.status, 127); assert.equal(r.stdout, "");
});
test("claude helper: skips banner and system events, prints the control_response line", () => {
  // fake-cli/claude: prints "Welcome\n", '{"type":"system"}', then echoes a control_response
  // with request_id read from its stdin; ignores its args
  const r = run("claude-usage.sh", { HERDR_USAGE_CLAUDE_BIN: FAKE });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).type, "control_response");
});
test("claude helper: CLI that never answers → exit 1 within 20 s and no leftover process", () => {/* fake with HANG=1 */});
test("codex helper: bogus bin and no sessions dir → exit 127", () => {/* HERDR_USAGE_CODEX_BIN=/nonexistent, CODEX_HOME=<empty tmp> */});
```

- [ ] **Step 2: Run** `npm test` → helper tests FAIL.

- [ ] **Step 3: Implement** `claude-usage.sh` with the same FIFO pattern as the existing Codex helper: resolve `${HERDR_USAGE_CLAUDE_BIN:-claude}` with `command -v` (exit 127 if missing), start it with the exact args from Global Constraints, write one `{"type":"control_request","request_id":"herdr-usage-limits","request":{"subtype":"get_usage","skip_behaviors":true}}` line, poll the output file every 0.2 s up to 15 s for a line containing `"control_response"`, print that line, kill the CLI, clean the temp dir. Header comment: what it runs, that it reads no credentials, credit to jmalicki. Move the Codex helper, add `HERDR_USAGE_CODEX_BIN`, `command -v` check → 127 only when the log fallback also has nothing.

- [ ] **Step 4: Run** `npm test` → PASS; then real run: `sh mods/usage-limits/helpers/claude-usage.sh | head -c 120` prints `{"type":"control_response"` in ≈1 s and `pgrep -f "no-session-persistence"` prints nothing afterwards.

- [ ] **Step 5: Commit** → `feat(usage-limits): claude get_usage and codex app-server helpers`.

---

### Task 3: Formatting and pace

**Files:**
- Create: `mods/usage-limits/lib/format.js`, `mods/usage-limits/lib/view.js` (only `segmentView` and `tooltipText` here), `mods/usage-limits/test/format.test.js`, `mods/usage-limits/test/view.test.js`

**Interfaces:**
- Consumes: `Window`, `Report` (Task 1).
- Produces:
  - `timeLeft(sec: number) -> string` — `"38m"`, `"4h 10m"`, `"2d 6h"`, `"<1m"`.
  - `resetClock(epoch: number, now: number) -> string` — same day `"17:00"`, otherwise `"Fri 17:00"` (local time).
  - `level(percent: number) -> "ok" | "warn" | "hot"` (70 / 90 thresholds).
  - `pace(w: Window, now: number) -> { elapsed: number /*0–1*/, verdict: "ahead" | "on pace" | "under" } | null` — null if `durationSec` or `resetsAt` is null; `ahead` when `percent > elapsed*100 + 10`, `under` when `percent < elapsed*100 - 10`.
  - `segmentView(w: Window, now: number) -> { id, short, text, level, fill /*0–1*/, tick /*0–1|null*/, expired: boolean }` — `expired` when `resetsAt <= now`: `text "—"`, `fill 0`, `tick null`, `level "ok"`; otherwise `text = "${percent}%"` plus `" · " + timeLeft` when level ≠ ok.
  - `tooltipText(provider, report: Report, now) -> string` — first line `"Claude · Max · updated 1 min ago"`; then one line per window: `"Weekly — 50% · resets Fri 17:00 · on pace"`; error/unavailable → message line, plus last good reading age if any.

- [ ] **Step 1: Write failing tests** with exact values:

```js
assert.equal(timeLeft(38 * 60), "38m"); assert.equal(timeLeft(4 * 3600 + 600), "4h 10m");
assert.equal(timeLeft(2 * 86400 + 6 * 3600), "2d 6h"); assert.equal(timeLeft(20), "<1m");
assert.equal(level(69), "ok"); assert.equal(level(70), "warn"); assert.equal(level(90), "hot");
// weekly 50% with 2d10h left of 7d → elapsed ≈ 0.6548, verdict "under"
// weekly 80% with 5d left of 7d → "ahead"
test("segment of a passed window is '—' with no tick", () => {/* resetsAt = now - 1 */});
test("hot segment appends time to reset", () => {/* percent 92, resetsAt now+38*60 → text "92% · 38m", level "hot" */});
test("tooltip lists every window with long labels", () => {/* uses claude max fixture parse */});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** → `feat(usage-limits): formatting, pace and segment view`.

---

### Task 4: Prefs and bar model

**Files:**
- Create: `mods/usage-limits/lib/prefs.js`, `mods/usage-limits/test/prefs.test.js`
- Modify: `mods/usage-limits/lib/view.js` (add `barModel`, `chooseDensity`), `mods/usage-limits/test/view.test.js`

**Interfaces:**
- Consumes: `segmentView` (Task 3), `PROVIDERS` (Task 1).
- Produces:
  - `effectivePrefs(saved: Prefs|null, props: object) -> Prefs` — `saved` wins once it exists; else `{hidden: props.hidden ?? [], hiddenWindows: props.hiddenWindows ?? []}`.
  - `isShown(prefs, providerId, windowId?) -> boolean`; `toggleProvider(prefs, id) -> Prefs`; `toggleWindow(prefs, providerId, windowId) -> Prefs` (pure, return new objects).
  - `barModel(states: {[providerId]: ProviderState}, prefs, now) -> { groups: [{ providerId, name, icon, mark: null|"…"|"!", dim: boolean, segments: SegmentView[] }], empty: boolean }` where `ProviderState = { report: Report|null, lastGood: Report|null, installed: boolean|null }`. Rules: not installed → no group; installed but `report.status !== "ok"` → group with `mark "!"`, segments from `lastGood` with `dim true` (none if no lastGood); `report === null` → `mark "…"`; `dim` also when `now - lastGood.observedAt > 900`; hidden providers/windows dropped; `empty` true when no groups.
  - `chooseDensity(model, widthPx: number) -> 0 | 1 | 2` — 0 full, 1 no bars, 2 percents only; estimated width per group `20 + Σ segment`, segment width at density 0 = `8 + 6.5*short.length + 30 + 7*text.length + 12`, density 1 drops the 30+gap, density 2 also drops the label; pick the smallest density that fits, else 2.

- [ ] **Step 1: Failing tests:** presets apply until saved exists; toggles round-trip; new window id (not in lists) is shown; failing provider keeps lastGood dimmed with `!`; not-installed provider absent; all hidden → `empty: true`; density 0 at 600px, 2 at 140px for the max+plus fixtures.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** → `feat(usage-limits): prefs and bar model`.

---

### Task 5: main.js — bar, popup, polling

**Files:**
- Rewrite: `mods/usage-limits/main.js`
- Create: `mods/usage-limits/icons/gauge.svg` (simple 16×16 single-colour gauge)

**Interfaces:**
- Consumes: everything above.
- Produces: one `View` class; `props().view === "settings"` renders the popup, anything else the bar.

- [ ] **Step 1: Bar.** Root `h_flex().id("root").on_size_change(...)`, right-aligned, `chrome` bg, `border` top line, 11.8px `muted` text, `px(12)`, `gap(14)` between groups, 1px `border` divider between groups. Per group: icon 13px (`image(...)`), then segments: short label 10.5px `dim`; bar 30×4 rounded 2, track `border`, fill colour by level; tick = 1×8 `foreground` at 0.75 opacity positioned at `tick*30`; text `foreground` (or level colour when warn/hot). Group `.opacity(0.55)` when `dim`; `.tooltip(tooltipText(...))`. `empty` → only `svg("mods/usage-limits/icons/gauge.svg")`. Whole root `.on_click` opens the popup: `openOverlay({ kind: "popup", mod: "usage-limits", props: { view: "settings" }, width: 300, height: 320 })`.
- [ ] **Step 2: Polling.** `init`: per provider in `PROVIDERS`, fetch now; `cx.timer.every(60_000)` → for each provider: refetch if shown and `installed !== false` and last fetch ≥ 5 min ago, or if `installed === false` and ≥ 1 h ago; then `cx.notify()`. Fetch = `exec("sh", [appHome() + "/mods/usage-limits/" + p.helper])`; code 127 → `installed:false`; else `installed:true`, `report = p.parse(stdout, now)`; `ok` reports also become `lastGood`. One in-flight fetch per provider. States live in `shared("usage-limits.state")` so the popup and every bar copy see the same data and only the bar copy polls (popup reads only).
- [ ] **Step 3: Popup.** Title "Usage limits"; per provider row: `Checkbox` + icon + name (+ grey reason when not installed / error); nested window rows with `Checkbox` + long label, from `lastGood.windows`; toggles write `setShared("usage-limits.prefs", toggleX(...))`. "Refresh now" button (disabled for 30 s after use) sets `shared("usage-limits.refresh", Date.now())`, which the bar copy watches in render and turns into an immediate fetch. Footnote "Data: claude CLI · codex app-server" in `dim`.
- [ ] **Step 4: Check:** `herdr-app check ~/.config/herdr-app/mods/usage-limits` → `check passed`; `npm test` still PASS.
- [ ] **Step 5: Live check:** `herdr-app status` has `"errors": []`; `herdr-app shot` crop shows `5h … wk … Fable …` for Claude and `5h … wk …` for Codex with numbers matching `sh helpers/*.sh` output; clicking the block opens the popup (`herdr-app status` lists the overlay); unticking Codex removes it from the bar.
- [ ] **Step 6: Commit** → `feat(usage-limits): status bar segments and settings popup`.

---

### Task 6: Layout, cleanup, revert statusline, docs

**Files:**
- Modify: `~/.config/herdr-app/layouts/my-main.json` (not in repo)
- Modify: `~/.claude/settings.json` (not in repo — main session only, see spec)
- Delete: `mods/usage-limits/claude-tap.sh`, `~/.cache/herdr-usage-limits/`
- Rewrite: `mods/usage-limits/RECIPE.md`, refresh `mods/usage-limits/preview.png`; Create: `README.md` (repo root, one paragraph + list of mods)

- [ ] **Step 1: Layout.** In `my-main.json` set `status` to `{"size":{"weight":1}}` and `usage-limits` to `{"size":{"weight":2.2},"min":130}`; no `layout.error` file appears; screenshot at full width and after narrowing the window shows density 0 then 1/2.
- [ ] **Step 2: Revert statusline** to `{"type":"command","command":"sh /Users/anton/.claude/statusline-command.sh"}`, touching no other key; diff against the backup shows only that key restored. Delete `claude-tap.sh` and `~/.cache/herdr-usage-limits/`.
- [ ] **Step 3: RECIPE.md** in the herdr.dev order (what you see / how it behaves / built from / watch out / done when), English, from the real files; "What it runs" section stating the CLIs it starts, files it reads (`~/.codex/sessions` fallback), that it reads no tokens; credit jmalicki. New `preview.png` from `herdr-app shot` crop of the bar.
- [ ] **Step 4: Final check:** `npm test` PASS, `herdr-app check` passes, `git status` clean except intended files.
- [ ] **Step 5: Commit** → `docs(usage-limits): recipe, preview, readme; drop statusline tap`.
