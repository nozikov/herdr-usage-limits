#!/bin/sh
# Claude Code statusline tap for the Herdr usage-limits mod.
#
# Put it in front of your statusline command in ~/.claude/settings.json:
#   "statusLine": { "type": "command",
#     "command": "sh ~/.config/herdr-app/mods/usage-limits/claude-tap.sh sh ~/.claude/statusline-command.sh" }
# With no command after it, it prints nothing (no statusline of its own).
#
# It saves the `rate_limits` block Claude Code passes on stdin to
# ~/.cache/herdr-usage-limits/claude.json and hands stdin, unchanged, to your command.
# It never reads tokens or credentials. Needs jq; without jq it only passes through.

input=$(cat)

if command -v jq >/dev/null 2>&1; then
  dir="${XDG_CACHE_HOME:-$HOME/.cache}/herdr-usage-limits"
  limits=$(printf '%s' "$input" | jq -c 'select(.rate_limits != null) | {observed_at: now | floor, rate_limits}' 2>/dev/null)
  if [ -n "$limits" ]; then
    mkdir -p "$dir" 2>/dev/null
    tmp="$dir/claude.json.$$"
    printf '%s\n' "$limits" >"$tmp" 2>/dev/null && mv -f "$tmp" "$dir/claude.json" 2>/dev/null
    rm -f "$tmp" 2>/dev/null
  fi
fi

if [ "$#" -gt 0 ]; then
  printf '%s' "$input" | "$@"
fi
