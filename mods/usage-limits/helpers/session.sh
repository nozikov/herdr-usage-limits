#!/bin/sh
# Prints one line of numbers about the session a process is running, and exits:
#   claude: tokens=N calls=N compactions=N [lastTrigger=auto lastPre=N lastPost=N]
#   codex:  tokens=N window=N calls=N
#   pi:     tokens=N calls=N [model=<id>]
#
# Usage: session.sh claude|codex|pi <pid of the agent in the terminal>
#
# Session files hold the whole conversation. Only numbers leave this script.
# Text in them is JSON-escaped, so \"type\" can't match the "type" looked for here.
# Calls are the person's messages: Claude's "last-prompt" marker repeats within a turn.
#
# Exit: 0 = printed, 1 = no session found for that process (never a guess).
# Claude's files follow CLAUDE_CONFIG_DIR, then %USERPROFILE%\.claude, then ~/.claude.
# Pi's follow HERDR_USAGE_PI_HOME, then ~/.pi. A model id leaves only if it is [A-Za-z0-9._:/-]+.
# Tests replace what is looked up about the process: HERDR_USAGE_PROC_CWD, HERDR_USAGE_PROC_START
# (epoch s) and HERDR_USAGE_PROC_PEERS (agents of that name in that directory, itself included).

app=$1
pid=$2
case "$pid" in '' | *[!0-9]*) exit 1 ;; esac

# The number after "key": in a line, 0 if there is none.
NUM='function num(s, k,   p) {
  p = "\"" k "\":[0-9]+"
  if (!match(s, p)) return 0
  return substr(s, RSTART + length(k) + 3, RLENGTH - length(k) - 3) + 0
}'

claude() {
  # On Windows, Git sh's $HOME can be a network drive while Claude Code keeps
  # its files under %USERPROFILE%, so that wins when it has a .claude folder.
  home=$HOME
  if [ -n "$USERPROFILE" ]; then
    up=$(cygpath -u "$USERPROFILE" 2>/dev/null || printf '%s' "$USERPROFILE")
    [ -d "$up/.claude" ] && home=$up
  fi
  dir=${CLAUDE_CONFIG_DIR:-$home/.claude}
  [ -f "$dir/sessions/$pid.json" ] || exit 1
  id=$(sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' "$dir/sessions/$pid.json")
  case "$id" in '' | *[!0-9a-zA-Z-]*) exit 1 ;; esac
  for file in "$dir"/projects/*/"$id".jsonl; do
    [ -f "$file" ] || exit 1
    awk "$NUM"'
      /"type":"user"/ && /"isSidechain":false/ && !/"isMeta":true/ && !/"isCompactSummary":true/ && !/"type":"tool_result"/ { calls++ }
      /"subtype":"compact_boundary"/ {
        compactions++
        pre = num($0, "preTokens"); post = num($0, "postTokens"); tokens = post
        trigger = match($0, /"trigger":"[a-z]+"/) ? substr($0, RSTART + 11, RLENGTH - 12) : ""
      }
      /"type":"assistant"/ && /"isSidechain":false/ {
        u = index($0, "\"usage\":{")
        if (u) {
          s = substr($0, u)
          # With server tools, usage adds up every request of the turn: the last one is the context.
          i = index(s, "\"iterations\":[")
          if (i) {
            t = substr(s, i)
            while ((i = index(t, "{\"input_tokens\":")) > 0) { s = substr(t, i); t = substr(t, i + 1) }
          }
          n = num(s, "input_tokens") + num(s, "cache_creation_input_tokens") + num(s, "cache_read_input_tokens")
          if (n > 0) tokens = n
        }
      }
      END {
        if (!tokens) exit 1
        printf "tokens=%d calls=%d compactions=%d", tokens, calls, compactions
        if (compactions) printf " lastTrigger=%s lastPre=%d lastPost=%d", trigger, pre, post
        printf "\n"
      }' "$file"
    exit $?
  done
}

# One app-server can hold several sessions open: the live one was written last.
newest_rollout() {
  lsof -nP -Fn -p "$1" 2>/dev/null | sed -n 's/^n//p' | grep '/sessions/.*/rollout-.*\.jsonl$' | {
    newest=
    while IFS= read -r f; do
      if [ -z "$newest" ] || [ "$f" -nt "$newest" ]; then newest=$f; fi
    done
    printf '%s' "$newest"
  }
}

# The terminal's codex runs a child app-server, and that holds the session open.
codex() {
  for kid in $(pgrep -P "$pid"); do
    file=$(newest_rollout "$kid")
    [ -n "$file" ] || continue
    awk "$NUM"'
      /"type":"task_started"/ { calls++ }
      /"type":"token_count"/ {
        u = index($0, "\"last_token_usage\":{")
        if (u) { tokens = num(substr($0, u), "total_tokens"); window = num($0, "model_context_window") }
      }
      END {
        if (!tokens) exit 1
        printf "tokens=%d window=%d calls=%d\n", tokens, window, calls
      }' "$file"
    exit $?
  done
  exit 1
}

# ---- Agents that hold no session file open: the process is tied to its session
# by its working directory and its start time. ----

proc_cwd() {
  d=$(lsof -w -a -d cwd -p "$1" -Fn 2>/dev/null | sed -n 's/^n//p')
  [ -n "$d" ] || d=$(readlink "/proc/$1/cwd" 2>/dev/null)
  printf '%s' "$d"
}

# Now minus the elapsed time, [[dd-]hh:]mm:ss on macOS and Linux alike.
proc_start() {
  ps -o etime= -p "$1" 2>/dev/null | awk -v now="$(date +%s)" '
    NF {
      e = $1; d = 0
      if (i = index(e, "-")) { d = substr(e, 1, i - 1); e = substr(e, i + 1) }
      n = split(e, p, ":"); s = 0
      for (k = 1; k <= n; k++) s = s * 60 + p[k]
      print now - (d * 86400 + s)
    }'
}

# Processes with the command name of $1 whose working directory is $2, $1 included.
# By name, not arguments: "pi" and "pi --model x" in one folder are still two.
proc_peers() {
  name=$(ps -o comm= -p "$1" 2>/dev/null)
  [ -n "$name" ] || return
  n=0
  for p in $(ps -A -o pid=,comm= 2>/dev/null | awk -v c="$name" '{ pid = $1; sub(/^ *[0-9]+ /, ""); if ($0 == c) print pid }'); do
    [ "$(proc_cwd "$p")" = "$2" ] && n=$((n + 1))
  done
  printf '%s' "$n"
}

mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }

pi() {
  cwd=${HERDR_USAGE_PROC_CWD:-$(proc_cwd "$pid")}
  start=${HERDR_USAGE_PROC_START:-$(proc_start "$pid")}
  peers=${HERDR_USAGE_PROC_PEERS:-$(proc_peers "$pid" "$cwd")}
  case "$cwd" in /*) ;; *) exit 1 ;; esac
  case "$start" in '' | *[!0-9]*) exit 1 ;; esac
  case "$peers" in '' | *[!0-9]* | 0) exit 1 ;; esac
  # Pi's folder: the directory without its leading /, each / \ : as -, wrapped in --.
  dir=${HERDR_USAGE_PI_HOME:-$HOME/.pi}/agent/sessions/--$(printf '%s' "${cwd#/}" | tr '/\\:' '---')--
  [ -d "$dir" ] || exit 1
  # Candidates: started or written since the process started. With one such process in
  # the folder, its session is the one written last. With several, only the session that
  # started within 2 s of it (the file name's timestamp is when Pi started), else none.
  file=$(for f in "$dir"/*.jsonl; do
    [ -f "$f" ] && printf '%s %s\n' "$(mtime "$f")" "$f"
  done | awk -v start="$start" -v peers="$peers" '
    function days(y, m, d) { # days since 1970-01-01 of a Gregorian date
      if (m <= 2) { y--; m += 12 }
      return 365 * y + int(y / 4) - int(y / 100) + int(y / 400) + int((153 * (m - 3) + 2) / 5) + d - 719469
    }
    {
      m = $1; f = substr($0, index($0, " ") + 1); b = f; sub(/.*\//, "", b)
      t = -1
      if (b ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]-[0-9][0-9]-[0-9][0-9]/)
        t = days(substr(b, 1, 4) + 0, substr(b, 6, 2) + 0, substr(b, 9, 2) + 0) * 86400 + substr(b, 12, 2) * 3600 + substr(b, 15, 2) * 60 + substr(b, 18, 2)
      if (t < start - 2 && m < start) next
      if (peers == 1) { if (best == "" || m > bm) { best = f; bm = m } }
      else if (t >= start - 2 && t <= start + 2) { best = f; hits++ }
    }
    END { if (best != "" && (peers == 1 || hits == 1)) print best }')
  [ -n "$file" ] || exit 1
  # A message's role comes before its content, so the first "role" on a line is the
  # message's. The reply's "model" and "usage" come after the content, so the last ones
  # are the reply's, whatever keys a tool call's arguments hold.
  # Compactions aren't counted: none could be made to happen to see how they are written.
  # Pi 1.5.0's source writes a {"type":"compaction"} line; after one, the last reply's
  # context is from before it, so it is dropped until the next reply (Pi's footer too).
  awk "$NUM"'
    function role(s,   i) {
      i = index(s, "\"message\":{\"role\":\"")
      if (!i) return ""
      s = substr(s, i + 19)
      return substr(s, 1, index(s, "\"") - 1)
    }
    function last(s, k,   i, j) {
      j = 0
      while ((i = index(s, k)) > 0) { j += i; s = substr(s, i + 1) }
      return j
    }
    /^\{"type":"compaction"/ { tokens = 0; model = "" }
    /^\{"type":"message"/ {
      r = role($0)
      if (r == "user") calls++
      if (r != "assistant") next
      u = last($0, "\"usage\":{")
      if (!u) next
      s = substr($0, u)
      n = num(s, "input") + num(s, "cacheRead") + num(s, "cacheWrite")
      if (n <= 0) next
      tokens = n; model = ""
      i = last($0, "\"model\":\"")
      if (i) {
        s = substr($0, i + 9); s = substr(s, 1, index(s, "\"") - 1)
        if (s ~ /^[A-Za-z0-9._:\/-]+$/) model = s
      }
    }
    END {
      if (!tokens) exit 1
      printf "tokens=%d calls=%d", tokens, calls
      if (model != "") printf " model=%s", model
      printf "\n"
    }' "$file"
}

case "$app" in
  claude) claude ;;
  codex) codex ;;
  pi) pi ;;
  *) exit 1 ;;
esac
