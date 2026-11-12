#!/bin/sh
# Prints one line per Pi assistant reply in the session files written in the last
# 8 days, oldest first, and exits:
#   <ISO timestamp> <totalTokens>
#
# Pi has no stats command; its session files hold the whole conversation. Only the
# reply's timestamp and token count leave this script, never message text. Text in them
# is JSON-escaped, so \"role\" can't match the "role" looked for here. The files are
# read, Pi itself is never run. Adding the numbers up by day is providers/pi.js's job.
#
# Sessions: ${HERDR_USAGE_PI_HOME:-$HOME/.pi}/agent/sessions/<folder>/<start>_<id>.jsonl
# Exit: 0 = printed (nothing when there are no replies), 127 = no sessions folder (Pi not
# installed), 1 = the files couldn't be read.

dir=${HERDR_USAGE_PI_HOME:-$HOME/.pi}/agent/sessions
[ -d "$dir" ] || exit 127

# A message line: {"type":"message",...,"timestamp":"<ISO>","message":{"role":...}}.
# The line's own timestamp comes before "message":{ (the reply has a numeric one of its
# own inside, and a tool call's arguments can hold anything). The first "role" is the
# message's; the reply's "usage" comes after its content, so the last one is the reply's.
# Without totalTokens, its parts are added up.
prog='
  function num(s, k,   p) {
    p = "\"" k "\":[0-9]+"
    if (!match(s, p)) return 0
    return substr(s, RSTART + length(k) + 3, RLENGTH - length(k) - 3) + 0
  }
  function last(s, k,   i, j) {
    j = 0
    while ((i = index(s, k)) > 0) { j += i; s = substr(s, i + 1) }
    return j
  }
  /^\{"type":"message"/ {
    m = index($0, "\"message\":{\"role\":\"")
    if (!m) next
    r = substr($0, m + 19); r = substr(r, 1, index(r, "\"") - 1)
    if (r != "assistant") next
    t = index($0, "\"timestamp\":\"")
    if (!t || t > m) next
    ts = substr($0, t + 13); ts = substr(ts, 1, index(ts, "\"") - 1)
    if (ts !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9](\.[0-9]+)?Z$/) next
    u = last($0, "\"usage\":{")
    if (!u) next
    s = substr($0, u)
    n = num(s, "totalTokens")
    if (n <= 0) n = num(s, "input") + num(s, "output") + num(s, "cacheRead") + num(s, "cacheWrite")
    if (n > 0) printf "%s %d\n", ts, n
  }'

# The trailing / makes find enter the folder when it is a symlink.
out=$(find "$dir/" -type f -name '*.jsonl' -mtime -8 -exec awk "$prog" {} + 2>/dev/null) || exit 1
[ -n "$out" ] || exit 0
# ISO timestamps in UTC sort as text.
printf '%s\n' "$out" | LC_ALL=C sort
