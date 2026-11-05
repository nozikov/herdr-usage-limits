<p align="center">
  <img src="assets/hero.png" width="100%" alt="Always on the bar, everything on hover: the status bar with session numbers and Claude Code and Codex limits, and above it the hover panel with every limit in full">
</p>

<h1 align="center">Usage limits for Herdr</h1>

<p align="center"><strong>Know how much Claude Code and Codex you have left, without leaving your agents.</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8E929A?style=flat-square&labelColor=1F1F22" alt="MIT license"></a>
  <a href="https://herdr.dev/mods"><img src="https://img.shields.io/badge/herdr-mod-D97757?style=flat-square&labelColor=1F1F22" alt="Herdr mod"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-8E929A?style=flat-square&labelColor=1F1F22" alt="macOS and Linux">
  <img src="https://img.shields.io/badge/reads-no%20tokens-7FB77E?style=flat-square&labelColor=1F1F22" alt="Reads no tokens">
</p>

<p align="center">
  <a href="#install">Install</a> · <a href="#read-the-bar">Read it</a> · <a href="#hover-for-everything">Hover</a> · <a href="#choose-what-the-bar-shows">Settings</a> · <a href="#what-it-runs">What it runs</a> · <a href="RECIPE.md">Recipe</a>
</p>

<br>

See how much Claude Code and Codex you have left, right in Herdr's status bar:

- **Your limits:** 5-hour, weekly and per-model, each with a bar and a percent.
- **Everything on hover:** rest the pointer on the limits for the full picture.
- **Your current session:** how full the context is, how many messages you've sent, how many times it was compacted.

It asks your own `claude` and `codex` CLIs, so there is no API key to add and no model usage to pay for.

## Read the bar

<p align="center">
  <img src="assets/states.gif" width="100%" alt="The status bar moving from green, through amber, to red as the limits fill up">
</p>

- **The bar** is how much of the limit you've used.
- **The tick** is how much of the time has passed. Bar past the tick? You're using it up too fast.

<div align="center">

| 🟢 Under 70% | 🟡 70–89% | 🔴 90% and up |
|:---:|:---:|:---:|
| `41%` | `74% · 2d 10h` | `92% · 38m` |

</div>

From amber on, you also see the time left until the limit resets.

## Hover for everything

<p align="center">
  <img src="assets/card.png" width="440" alt="The hover panel: the current session's context, calls and compactions, then each provider with its plan and last update and one line per limit with a bar, percent and time to reset, with refresh and settings buttons">
</p>

Rest the pointer on the limits. The panel shows every limit and when it resets. Rest it on a
limit to see what its tick means in numbers. ↻ refreshes, ⚙ opens the settings.

The block at the top is the session in the terminal you're focused on, and it changes
when you switch terminals:

- **Context:** how much of it is filled. Codex shows a percent. Claude Code shows tokens, because its session log doesn't say how big the window is.
- **Calls:** how many messages you've sent.
- **Compactions:** how many times the conversation was compacted. Claude Code only, for now.

## Choose what the bar shows

<p align="center">
  <img src="assets/settings.png" width="440" alt="The settings side of the panel: a back arrow, a checkbox per provider and per limit, Always show time to reset, Show bars, and checkboxes for the session's context, calls and compactions">
</p>

Click ⚙ in the panel. The checkboxes only change the bar: the panel always shows everything.

- **Claude, Codex and their limits** are on by default. Untick what you don't watch.
- **Always show time to reset** adds the time to every limit, green ones too.
- **Show bars** keeps a bar beside each limit. Untick it for numbers only.
- **This session** puts the numbers on the bar: `ctx` for context, `⇄` for calls, `▼` for compactions.

<p align="center">
  <img src="assets/reset-time.png" width="100%" alt="Two status bars: by default only amber and red limits show their time to reset; with the option ticked, every limit does">
</p>

<p align="center">
  <img src="assets/session-bar.png" width="100%" alt="The status bar with context, calls and compactions on its left: ctx 182k, 32 calls, 2 compactions, then the limits">
</p>

## It doesn't guess

- **A failing provider says so.** Offline or signed out, it shows a dim `!` and keeps its last good reading, dimmed, with its age.
- **Old numbers look old.** Anything over 15 minutes old is dimmed.
- **A passed reset shows `—`** until the next reading, never a made-up 0%.
- **Codex's session log is only a fallback.** It's marked as a past reading, never as live.
- **Narrow window?** Bars go first, then labels, then the time on calm windows. Percents and providers stay.

## Install

Ask your Herdr agent to add this repository:

```text
Add the Herdr mod github.com/nozikov/herdr-usage-limits to my status bar
```

Or by hand, on macOS or Linux, with the `claude` or `codex` CLI signed in:

```sh
git clone https://github.com/nozikov/herdr-usage-limits.git
cp -R herdr-usage-limits/mods/usage-limits ~/.config/herdr-app/mods/
herdr-app do layout.clone '{"name":"main","as":"my-main"}'
```

Then, in `~/.config/herdr-app/layouts/my-main.json`, replace the `status` block with
this row:

```json
{ "id": "status-row", "type": "row", "size": { "px": 28 }, "resizable": false, "children": [
  { "id": "status", "type": "block", "size": { "weight": 1 }, "content": { "mod": "workspace-status" } },
  { "id": "usage-limits", "type": "block", "size": { "weight": 2.2 }, "min": 130,
    "content": { "mod": "usage-limits" } } ] }
```

Give the block more weight if you want the bars to stay when a window gets tight.

## What it runs

- `sh`, your `claude` CLI and your `codex` CLI, each briefly, every 5 minutes. They use their own sign-ins and talk to Anthropic and OpenAI. The mod makes no network requests itself.
- `hc`, to find the agent in the focused terminal, and `lsof`, to find Codex's open session file.
- It reads no token or credential file.
- It reads the focused session's log (`~/.claude/projects/`, `~/.codex/sessions/`), which holds your conversation. `helpers/session.sh` passes on numbers only. `~/.codex/sessions/**/*.jsonl` is also the fallback for Codex's limits.
- It sends no prompt and starts no turn, so it uses no model time.
- It changes no Claude Code or Codex settings.

> [!NOTE]
> `get_usage` is an internal Claude Code interface, checked on 2.1.317. If an update changes it, Claude shows `!` with the error instead of numbers.

## Develop

```sh
rsync -a --delete mods/usage-limits/ ~/.config/herdr-app/mods/usage-limits/
npm test                                    # node --test, no dependencies
herdr-app check ~/.config/herdr-app/mods/usage-limits
```

Copy the mod, don't symlink it: Herdr won't load icons through a link that leaves its
home, so ↻ and ⚙ would be blank. It doesn't hot-reload either: after copying, switch
layouts away and back (`herdr-app do layout.switch '{"name":"main"}'`, then your layout).

[RECIPE.md](RECIPE.md) is the brief to build the mod from scratch. A new provider is
one file in `providers/` plus its helper.

## Credits

The approach for Claude's `get_usage` comes from
[jmalicki/herdr-mod-ai-usage](https://github.com/jmalicki/herdr-mod-ai-usage) (MIT).
Screenshots are the real mod in a demo window, with sample numbers.
The panel's icons are from [Lucide](https://lucide.dev) (ISC).

## License

[MIT](LICENSE)
