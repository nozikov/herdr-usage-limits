#!/bin/sh
NOT_INSTALLED=127
SAVED=${HERDR_USAGE_AGY_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/herdr-usage-limits/antigravity.json}

command -v "${HERDR_USAGE_AGY_BIN:-agy}" >/dev/null 2>&1 || [ -x "$HOME/.local/bin/agy" ] || exit "$NOT_INSTALLED"
if [ -f "$SAVED" ]; then
  tr -d '\n' <"$SAVED"
  echo
fi
exit 0
