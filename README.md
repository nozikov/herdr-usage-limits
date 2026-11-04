<p align="center">
  <img src="assets/hero.png" width="100%" alt="The Herdr window with Claude Code and Codex limits in its status bar, magnified below it: 5-hour at 92%, weekly at 74%, Fable at 47%">
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
  <a href="#install">Install</a> · <a href="#read-it-at-a-glance">Read it</a> · <a href="#hover-for-the-details">Hover</a> · <a href="#what-it-runs">What it runs</a> · <a href="RECIPE.md">Recipe</a>
</p>

<br>

Every limit window your subscriptions report, in the status bar: 5-hour, weekly and
per-model weekly. Hover for the details and the settings. It asks your own `claude` and `codex` CLIs, so there is no API key
to add, no token to read and no model usage to pay for.

## Read it at a glance

<p align="center">
  <img src="assets/states.gif" width="100%" alt="The status bar moving from green, through amber, to red as the limits fill up">
</p>

- **The bar** is how much of the window you've used.
- **The tick** is how much of the window's time has passed. A bar past its tick means you're burning faster than the window allows.

<div align="center">

| 🟢 Under 70% | 🟡 70–89% | 🔴 90% and up |
|:---:|:---:|:---:|
| `41%` | `74% · 2d 10h` | `92% · 38m` |

</div>

Amber and red add the time to reset, so you know how long you'd have to wait.
Tick **Always show time to reset** in the settings to see it on every window, green
ones too:

<p align="center">
  <img src="assets/reset-time.png" width="100%" alt="Two status bars: by default only amber and red windows show their time to reset; with the option ticked, every window does">
</p>

## Hover for the details

<p align="center">
  <img src="assets/card.png" width="440" alt="The hover panel: each provider with its plan and last update, then a bar, percent, time to reset, reset clock and pace for every limit window, with refresh and settings buttons">
</p>

Rest the pointer on the limits for a panel with every window: its bar, percent, time to
reset, reset clock and pace (`ahead`, `on pace`, `under`). It shows windows you've
hidden from the bar too. ↻ refreshes, ⚙ opens the settings.

## Show only what you watch

<p align="center">
  <img src="assets/settings.png" width="440" alt="The settings side of the panel: a back arrow, a checkbox per provider and per limit window, and Always show time to reset">
</p>

⚙ turns the panel around to choose providers and windows, ← turns it back. A new window or a CLI you install
later shows up by itself, and hidden providers aren't fetched at all.

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
- It reads no token or credential file. It reads `~/.codex/sessions/**/*.jsonl` only as a fallback.
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
