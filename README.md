# herdr-mods

Mods for the [Herdr](https://herdr.dev) desktop app. One folder per mod under
`mods/`, each with a `RECIPE.md` (the brief to build it from scratch) and a
`preview.png`.

| Mod | What it does |
|---|---|
| [usage-limits](mods/usage-limits/RECIPE.md) | Claude Code and Codex limit windows (5-hour, weekly, per-model) in the status bar, with pace and a checkbox popup. Reads no tokens. |

## Develop

```sh
ln -s "$PWD/mods/usage-limits" ~/.config/herdr-app/mods/usage-limits
npm test                                    # node --test, no dependencies
herdr-app check ~/.config/herdr-app/mods/usage-limits
```

Herdr doesn't hot-reload a symlinked mod: after editing, switch layouts away
and back (`herdr-app do layout.switch '{"name":"main"}'`, then your layout).
