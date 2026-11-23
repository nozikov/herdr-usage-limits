#!/bin/sh
NOT_INSTALLED=127
NO_REPLY=1
DEADLINE_S=15
REQUEST='{"type":"control_request","request_id":"herdr-usage-limits","request":{"subtype":"get_usage","skip_behaviors":true}}'

expanded_home() {
  case $1 in
    \~) printf '%s' "$HOME" ;;
    \~/*) printf '%s/%s' "$HOME" "${1#\~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

ask_as_account() {
  case $1 in -*) exit "$NO_REPLY" ;; esac
  cfg=$(expanded_home "$1")
  while [ "${cfg%/}" != "$cfg" ]; do cfg=${cfg%/}; done
  if [ "$cfg" = "$HOME/.claude" ]; then
    unset CLAUDE_CONFIG_DIR
  else
    CLAUDE_CONFIG_DIR=$cfg
    export CLAUDE_CONFIG_DIR
  fi
}

[ -n "${1:-}" ] && ask_as_account "$1"

CLAUDE=$(command -v "${HERDR_USAGE_CLAUDE_BIN:-claude}" 2>/dev/null) || exit "$NOT_INSTALLED"

dir=$(mktemp -d "${TMPDIR:-/tmp}/herdr-claude-usage.XXXXXX") || exit "$NO_REPLY"
out="$dir/out"

ask_with_the_request_in_a_regular_file() {
  printf '%s\n' "$REQUEST" >"$dir/in"
  "$CLAUDE" -p --safe-mode --no-session-persistence \
    --input-format stream-json --output-format stream-json --verbose \
    <"$dir/in" >"$out" 2>/dev/null &
}

end=$(($(date +%s) + DEADLINE_S))
ask_with_the_request_in_a_regular_file
pid=$!

while [ "$(date +%s)" -lt "$end" ]; do
  if grep -q '"control_response"' "$out" 2>/dev/null; then break; fi
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.2
done
kill "$pid" 2>/dev/null
wait "$pid" 2>/dev/null

status=$NO_REPLY
if grep -m1 '"control_response"' "$out"; then status=0; fi
rm -rf "$dir"
exit "$status"
