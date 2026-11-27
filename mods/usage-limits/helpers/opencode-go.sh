#!/bin/sh
NOT_INSTALLED=127
NO_REPLY=1
DEADLINE_S=20
URL=${HERDR_USAGE_OPENCODE_GO_URL:-https://opencode.ai/zen/go/v1/usage}

key_of() {
  contents=$(tr -d '\r\n' <"$1" 2>/dev/null) || return 0
  for name in opencode-go opencode; do
    entry=$(printf '%s' "$contents" | sed -n 's/.*"'"$name"'"[[:space:]]*:[[:space:]]*{\([^{}]*\)}.*/\1/p')
    [ -n "$entry" ] || continue
    value=$(printf '%s' "$entry" | sed -n 's/.*"key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    if [ -n "$value" ]; then
      printf '%s\n' "$value"
      return 0
    fi
  done
  return 0
}

opencode_bin=${HERDR_USAGE_OPENCODE_BIN:-}
if [ -z "$opencode_bin" ]; then
  opencode_bin=$(command -v opencode 2>/dev/null || true)
  if [ -z "$opencode_bin" ]; then
    for candidate in "$HOME/.opencode/bin/opencode" "$HOME/.local/bin/opencode" /opt/homebrew/bin/opencode /usr/local/bin/opencode; do
      if [ -x "$candidate" ]; then opencode_bin=$candidate; break; fi
    done
  fi
fi

key=${HERDR_USAGE_OPENCODE_GO_KEY:-}
if [ -z "$key" ] && [ -n "$opencode_bin" ] && command -v jq >/dev/null 2>&1; then
  for name in opencode-go opencode; do
    exported=$("$opencode_bin" auth export "$name" 2>/dev/null) || continue
    key=$(printf '%s' "$exported" | jq -r '.[]? | select(.active == true) | (if .value.type == "oauth" then .value.access elif .value.type == "key" then .value.key else .key end) // empty' 2>/dev/null | head -n 1)
    [ -n "$key" ] && break
  done
fi
if [ -z "$key" ]; then
  set -- "$HERDR_USAGE_OPENCODE_GO_AUTH" \
    "${XDG_DATA_HOME:-$HOME/.local/share}/opencode/auth.json" \
    "$HOME/.config/opencode/auth.json" \
    "$HOME/.pi/agent/auth.json"
  for file in "$@"; do
    [ -r "$file" ] || continue
    key=$(key_of "$file")
    [ -n "$key" ] && break
  done
fi
[ -n "$key" ] || exit "$NOT_INSTALLED"
case "$key" in
  *[!A-Za-z0-9._-]*) exit "$NOT_INSTALLED" ;;
esac

org=${HERDR_USAGE_OPENCODE_GO_ORG:-}
org_header=
if [ -n "$org" ]; then
  case "$org" in
    *[!A-Za-z0-9._-]*)
      printf '%s\n' '{"error":{"message":"HERDR_USAGE_OPENCODE_GO_ORG has invalid characters"}}'
      exit 0
      ;;
  esac
  org_header=$(printf 'header = "x-opencode-org-id: %s"\n' "$org")
fi

response=$(
  {
    printf 'header = "Authorization: Bearer %s"\n' "$key"
    printf 'header = "Accept: application/json"\n'
    printf '%s' "$org_header"
  } | curl -sS --max-time "$DEADLINE_S" --config - -w '\n%{http_code}' "$URL" 2>/dev/null
) || exit "$NO_REPLY"

code=$(printf '%s\n' "$response" | tail -n 1)
body=$(printf '%s\n' "$response" | sed '$d')

case "$code" in
  200) printf '%s\n' "$body" ;;
  401) printf '%s\n' '{"error":{"message":"OpenCode Go rejected the key"}}' ;;
  403) exit "$NOT_INSTALLED" ;;
  *) printf '{"error":{"message":"OpenCode Go answered HTTP %s"}}\n' "$code" ;;
esac
