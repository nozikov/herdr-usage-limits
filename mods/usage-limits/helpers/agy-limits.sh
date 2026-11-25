#!/bin/sh
NOT_INSTALLED=127
NO_REPLY=1
DEADLINE_S=${HERDR_USAGE_AGY_DEADLINE_S:-25}
USAGE_SINCE=1001011

AGY=$(command -v "${HERDR_USAGE_AGY_BIN:-agy}" 2>/dev/null) || AGY="$HOME/.local/bin/agy"
[ -x "$AGY" ] || exit "$NOT_INSTALLED"

dir=$(mktemp -d "${TMPDIR:-/tmp}/herdr-agy-limits.XXXXXX") || exit "$NO_REPLY"
trap 'rm -rf "$dir"' EXIT
cd "$dir" || exit "$NO_REPLY"
end=$(($(date +%s) + DEADLINE_S))

ask() {
  "$AGY" "$@" </dev/null >out 2>err &
  pid=$!
  while [ "$(date +%s)" -lt "$end" ] && kill -0 "$pid" 2>/dev/null; do
    sleep 0.2
  done
  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
}

stop_with() {
  printf '{"problem":"%s"}\n' "$1"
  exit 0
}

version_number() {
  sed -n 's/^[^0-9]*\([0-9]\{1,\}\)\.\([0-9]\{1,\}\)\.\([0-9]\{1,\}\).*/\1 \2 \3/p' out | awk 'NR == 1 { print $1 * 1000000 + $2 * 1000 + $3 }'
}

has_usage_command() {
  version=$(version_number)
  [ "${version:-0}" -ge "$USAGE_SINCE" ]
}

ask --version || stop_with unreachable
has_usage_command || stop_with old-version

if ! ask --log-file "$dir/log" models; then
  if grep -qi 'sign in' out err; then stop_with signed-out; fi
  stop_with unreachable
fi

ask -p /usage --output-format json --log-file "$dir/log"
grep -m1 '^{' out || exit "$NO_REPLY"
