# Usage limits — design

A Herdr mod that keeps your coding-agent subscription limits in the status bar,
always in view: for each provider, every limit window it reports, with how much
is used, how fast, and when it resets. First providers: Claude Code and Codex.
Shared publicly on herdr.dev/mods, so the UI is in English and nothing is
specific to one machine.

## Why

The person runs several Claude Code and Codex agents in Herdr and wants to
know, at a glance and without opening `/usage`, whether they can keep working:
the 5-hour window, the weekly window, and the separate weekly **Fable** limit.
The weekly and per-model limits are the ones that bite; the 5-hour one matters
in bursts.

## Goals

- Every limit window a provider reports, visible without hovering: label, bar,
  percent used.
- A **pace** marker on each bar: how much of the window's time has passed. Used
  ahead of time = you'll run out before the reset.
- When a window is in the amber/red zone, its time to reset is printed next to
  the percent (`92% · 38m`).
- Checkboxes to choose which providers, and which of their windows, are shown.
- Claude: 5-hour, weekly and per-model weekly limits (Fable today) — fresh data,
  **without the mod reading or handling any token**.
- Codex: 5-hour and weekly, fresh, same rule.
- New providers are added later as one module each, without touching rendering.
- Publishable: RECIPE.md, preview.png, `herdr-mod` topic, honest "what it runs".

## Non-goals

- Other providers (OpenRouter, Cursor, Copilot, Gemini…) in this version. The
  provider interface must allow them; implementing them is later work.
- Token counts, cost in dollars, per-agent or per-session usage.
- Remote machines (spaces on another machine): v1 reads the local machine only.
- Windows support (the helpers are `sh`). macOS and Linux.
- Multi-account / account switching.

## Anti-goals (would make it a failure even if it works)

- The mod reads, stores, logs or sends an OAuth token or credentials file.
- It shows a guessed number: a 0% after a reset it hasn't observed, or old data
  that looks fresh.
- It costs model usage (a prompt, a turn) to read the limits.
- It changes the user's Claude Code or Codex settings (statusline, hooks).
- It animates with timers or polls so often that it costs battery.

## Data sources (decided)

### Claude Code — `get_usage` control request

Run the user's own `claude` CLI briefly and ask it for usage; the CLI
authenticates itself. Verified on Claude Code 2.1.317 (Max plan), ~1 s:

```
claude -p --safe-mode --no-session-persistence \
  --input-format stream-json --output-format stream-json --verbose
stdin ← {"type":"control_request","request_id":"<id>",
         "request":{"subtype":"get_usage","skip_behaviors":true}}
stdout → {"type":"control_response","response":{"subtype":"success",
          "request_id":"<id>","response":{ subscription_type, rate_limits: {…, limits: [...]}}}}
```

`rate_limits.limits[]` is the list to render, in order. Seen entries:

| kind | group | scope | label to show |
|---|---|---|---|
| `session` | session | null | `5h` (hover: "5-hour") |
| `weekly_all` | weekly | null | `wk` (hover: "Weekly") |
| `weekly_scoped` | weekly | `{model:{display_name:"Fable"}}` | `Fable` (hover: "Weekly · Fable") |

Each has `percent`, `resets_at` (ISO 8601), `severity`. Unknown kinds are
rendered generically: label from `scope.model.display_name` or `scope.surface`,
else the kind with underscores as spaces; window length unknown → no pace tick.
`five_hour` / `seven_day` objects exist too (`utilization`) and are the fallback
if `limits` is missing. A response without any limits (API-key login) → the
provider reports "no subscription limits". `subscription_type` (`max`, `pro`) is
shown in the hover card.

This is an internal CLI interface (credit: approach from
[jmalicki/herdr-mod-ai-usage](https://github.com/jmalicki/herdr-mod-ai-usage),
MIT). It may break on a Claude Code update; then the provider shows an error
state, never a number.

`--safe-mode` runs without hooks, MCP servers or customizations, so the probe
does not trigger the user's hooks or statusline and starts no turn.

### Codex — `codex app-server`

Already built and verified (`mods/usage-limits/codex-limits.sh`, ~1.3 s):
JSON-RPC over stdio via a FIFO: `initialize`, `initialized`,
`account/rateLimits/read`; kill the server after the `"id":2` reply.
`result.rateLimits.primary` (5h) and `.secondary` (weekly): `usedPercent`,
`windowDurationMins`, `resetsAt` (epoch s); `planType`. If the reply has more
limits (`rateLimitsByLimitId` with several ids), each is its own window set.
Fallback when app-server fails: newest `rate_limits` event in
`~/.codex/sessions/**.jsonl` (14 days), marked with its real observed time.

### Helpers

Both helpers are small `sh` scripts in the mod folder that print one JSON line
and exit; the mod runs them with `exec` (login environment, so nvm/brew
installs are on PATH). `HERDR_USAGE_CLAUDE_BIN` / `HERDR_USAGE_CODEX_BIN`
override discovery. Each helper has a hard timeout (~15 s) and always kills the
CLI it started. No helper reads credential files.

### Removed

The statusline tap (`claude-tap.sh`) built earlier is dropped: `get_usage` is
fresher and needs no settings change. Part of this work, done by the main
session (not a subagent): set `statusLine` in `~/.claude/settings.json` back to
`{"type":"command","command":"sh /Users/anton/.claude/statusline-command.sh"}`
(the pre-change value; full backup at
`/private/tmp/claude-501/-Users-anton/744d5315-6d0a-411f-98d2-68856ff967f5/scratchpad/claude-settings.backup.json`),
touching no other key; then delete `claude-tap.sh` and
`~/.cache/herdr-usage-limits/`.

## Provider interface (decided shape)

Each provider is one JS module under `providers/` exporting:

```js
{ id: "claude", name: "Claude", icon: "icons/claude.svg",
  fetch(): Promise<Report> }      // runs its helper, parses
// Report = { status: "ok" | "unavailable" | "error", message?,
//            plan?: string, observedAt: epochSeconds,
//            windows: [{ id, short, long, percent, resetsAt|null, durationSec|null }] }
```

`id` of a window is stable (`session`, `weekly_all`, `weekly_scoped:Fable`, …)
so checkbox choices survive across refreshes. Parsing is pure functions with
unit tests on recorded fixtures (the real replies above).

### Recorded fixtures (real replies, in `mods/usage-limits/test/fixtures/`)

- `claude-get-usage.max.json`: the whole `control_response` line from a Max
  account. `limits[].percent` and `five_hour.utilization` are **0–100**
  (4, 50, 3); `resets_at` is ISO 8601 with microseconds and `+00:00`. Only
  `scope.model` has been seen; `scope.surface` is handled generically and not
  fixture-tested. Other keys under `rate_limits` (opaque codenames,
  `extra_usage`) are ignored.
- `codex-app-server.plus.json`: the `"id":2` reply (reset-credit details
  removed). `usedPercent` is **0–100**, `resetsAt` epoch seconds.
- `codex-session-snapshot.json`: the log fallback shape (`{"snapshot": <line>}`,
  snake_case, `used_percent` 0–100).
- Not recorded (no such account here): API-key Claude login, a Claude error
  reply, Codex with several limit ids. Builder writes synthetic fixtures for
  these from the shapes above and the rules below: a Claude reply with
  `subtype != "success"`, or with no `limits` and no `five_hour`/`seven_day`,
  is `unavailable`/`error` — never a 0%.

### Codex with several limit ids (decided)

Flatten into the one Codex group. Window ids are `<limitId>:primary` /
`<limitId>:secondary`; for the default id `codex` the short labels are `5h` /
`wk`; for any other id the label gets the reply's `limitName` (else the id)
as a prefix, e.g. `Spark 5h`. Order: `codex` first, then others as returned.

### Window durations for pace (decided)

`session` = 5 h; `weekly_all` and `weekly_scoped` = 7 d (the recorded reply
shows the Fable window resetting at the same moment as the weekly one). Codex
uses its `windowDurationMins`. Unknown kinds: no tick.

## What the person sees (decided: option B from the mockups)

Status bar, right end. Per enabled provider: its icon, then one segment per
enabled window:

```
[C] 5h ▬▬ 4%   wk ▬▬▬ 50%   Fable ▬ 3%   │   [X] 5h ▬ 0%   wk ▬ 11%
```

- Segment = dim short label (10.5px), 30×4px bar (track `border`, fill by
  color), percent in `foreground` 11.8px.
- Pace tick: 1px light line across the bar at `elapsed = 1 − (resetsAt − now) / duration`.
- Colors by percent: < 70 green (`ansi2`), 70–89 amber (`ansi3`), ≥ 90 red
  (`ansi1`); amber/red also color the percent and append ` · <time to reset>`
  (`38m`, `4h 10m`, `2d 6h`).
- Hover a provider group (built-in `.tooltip`, text only): one line per window,
  long label, percent, reset time (relative + local clock, e.g.
  `resets Fri 17:00`), pace verdict (`on pace` / `ahead` / `under`), plan,
  "updated N min ago".
- Narrow window: collapse in steps, measured with `on_size_change` — first bars
  go (labels + percents), then labels (percents only), never providers.
- Thin divider between providers.

States:
- Loading (first read): icon + dim `…`.
- Error/unavailable for an enabled provider: icon + dim `!`, hover says why
  (not installed, not signed in, CLI changed). It keeps showing the last good
  reading dimmed, with its age, if it has one.
- Stale (last good reading older than 15 min because refreshes fail): dimmed.
- Window whose reset time has passed and hasn't been re-read: `—`, not 0%.
- Every provider/window hidden: a small gauge icon remains so settings can be opened.

## Settings (decided)

- Click the block → a popup (`openOverlay({kind: "popup", mod: "usage-limits",
  props: {view: "settings"}})`) anchored at the pointer.
- Content: each known provider with a checkbox; under it, a checkbox per window
  it last reported. Providers that are unavailable on this machine are listed
  greyed with the reason. A "Refresh now" button. Small "Data: claude CLI /
  codex app-server" footnote.
- Choices persist across restarts and are shared between the bar and the popup
  (`shared("usage-limits.prefs")`), stored as **opt-out lists**:
  `{ hidden: [providerId], hiddenWindows: ["<providerId>:<windowId>"] }`.
  Anything not listed is on, so a provider installed later, or a new window
  (another model limit), appears by itself.
- Availability is separate from choice:
  - *not installed* (helper says the CLI isn't found) → left out of the bar,
    greyed in settings; re-checked once an hour;
  - *installed but failing* (offline, timeout, not signed in, CLI changed) →
    stays in the bar with `!` and keeps being fetched every 5 min. A failure
    never hides a provider.
- A layout can preset the lists via block `props` (same shape). They apply
  until the person changes anything in the popup; from then on the saved prefs
  win.

## Refresh

- Each enabled provider every 5 minutes, at start, and on "Refresh now"
  (30 s cooldown). Never two runs of the same helper at once.
- A 60 s timer redraws countdowns and pace (data timer, not an animation).
- Hidden providers are not fetched.

## Layout

Keep the existing clone `my-main`: status row = `workspace-status` (weight 1)
+ `usage-limits` (weight-based, min ~130px) instead of a fixed 250px, so both
shrink on narrow windows.

## Repo

`~/IdeaProjects/herdr-mods` (git, one folder per mod, herdr.dev layout):
`mods/usage-limits/` is symlinked into `~/.config/herdr-app/mods/`. Herdr-
written files (`gpui-kit.d.ts`, `jsconfig.json`) are git-ignored. Publishing
(public GitHub repo, `herdr-mod` topic, RECIPE.md, preview.png) is a later,
separate step the person triggers.

## Left to the builder

- Exact pixel spacing, the gauge icon, tooltip wording beyond what's above.
- Pace verdict thresholds (suggested: "ahead" when used% > elapsed% + 10).
- Whether parsing tests run with `node --test` or another zero-dependency way.
- Helper implementation details (FIFO vs. coprocess), as long as they meet the
  timeout/kill/no-credentials rules.
