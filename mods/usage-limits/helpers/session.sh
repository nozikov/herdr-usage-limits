#!/bin/sh
app=$1
pid=$2
NO_READING=1
here=$(dirname "$0")
awk_dir=$here/awk
case "$pid" in '' | *[!0-9]*) exit "$NO_READING" ;; esac

home_where_claude_keeps_its_files() {
  home=$HOME
  if [ -n "$USERPROFILE" ]; then
    up=$(cygpath -u "$USERPROFILE" 2>/dev/null || printf '%s' "$USERPROFILE")
    [ -d "$up/.claude" ] && home=$up
  fi
  printf '%s' "$home"
}

expanded_home() {
  case $1 in
    \~) printf '%s' "$HOME" ;;
    \~/*) printf '%s/%s' "$HOME" "${1#\~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

account_holding_the_session() {
  place=0
  for d in "$@"; do
    place=$((place + 1))
    d=$(expanded_home "$d")
    if [ -f "$d/sessions/$pid.json" ]; then
      dir=$d
      echo "account=$place"
      return 0
    fi
  done
  exit "$NO_READING"
}

claude() {
  if [ $# -gt 0 ]; then
    account_holding_the_session "$@"
  else
    dir=${CLAUDE_CONFIG_DIR:-$(home_where_claude_keeps_its_files)/.claude}
    [ -f "$dir/sessions/$pid.json" ] || exit "$NO_READING"
  fi
  id=$(sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' "$dir/sessions/$pid.json")
  case "$id" in '' | *[!0-9a-zA-Z-]*) exit "$NO_READING" ;; esac
  for file in "$dir"/projects/*/"$id".jsonl; do
    [ -f "$file" ] || exit "$NO_READING"
    awk -f "$awk_dir/json-field.awk" -f "$awk_dir/claude-session.awk" "$file"
    exit $?
  done
}

proc_cwd() {
  d=$(readlink "/proc/$1/cwd" 2>/dev/null)
  if [ -z "$d" ]; then
    f=$(LC_ALL=C lsof -w -a -d cwd -p "$1" -Fn 2>/dev/null | sed -n 's/^n//p' | awk -f "$awk_dir/lsof-name.awk") || f=
    case "$f" in /*) d=$(printf '%b' "$f") ;; esac
  fi
  printf '%s' "$d"
}

proc_start() {
  ps -o etime= -p "$1" 2>/dev/null | awk -v now="$(date +%s)" -f "$awk_dir/elapsed-to-start.awk"
}

proc_peers_in_folder() {
  name=$(ps -o comm= -p "$1" 2>/dev/null)
  [ -n "$name" ] || return
  name=${name##*/}
  not_a_client=$3
  n=0
  for p in $(ps -A -o pid=,comm= 2>/dev/null | awk -v c="$name" '{ pid = $1; sub(/^ *[0-9]+ /, ""); sub(/.*\//, ""); if ($0 == c) print pid }'); do
    if [ -n "$not_a_client" ]; then
      ps -o args= -p "$p" 2>/dev/null | awk -v w="$not_a_client" '{ exit !($2 == w) }' && continue
    fi
    [ "$(proc_cwd "$p")" = "$2" ] && n=$((n + 1))
  done
  printf '%s' "$n"
}

mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }

pi_sessions_folder_for() {
  printf '%s/agent/sessions/--%s--' "${HERDR_USAGE_PI_HOME:-$HOME/.pi}" "$(printf '%s' "${1#/}" | tr '/\\:' '---')"
}

pi() {
  cwd=${HERDR_USAGE_PROC_CWD:-$(proc_cwd "$pid")}
  start=${HERDR_USAGE_PROC_START:-$(proc_start "$pid")}
  peers=${HERDR_USAGE_PROC_PEERS:-$(proc_peers_in_folder "$pid" "$cwd")}
  case "$cwd" in /*) ;; *) exit "$NO_READING" ;; esac
  case "$start" in '' | *[!0-9]*) exit "$NO_READING" ;; esac
  case "$peers" in '' | *[!0-9]* | 0) exit "$NO_READING" ;; esac
  dir=$(pi_sessions_folder_for "$cwd")
  [ -d "$dir" ] || exit "$NO_READING"
  file=$(for f in "$dir"/*.jsonl; do
    [ -f "$f" ] && printf '%s %s\n' "$(mtime "$f")" "$f"
  done | awk -v start="$start" -v peers="$peers" -f "$awk_dir/pi-session-file.awk")
  [ -n "$file" ] || exit "$NO_READING"
  awk -f "$awk_dir/json-field.awk" -f "$awk_dir/pi-session.awk" "$file"
}

opencode() {
  cwd=${HERDR_USAGE_PROC_CWD:-$(proc_cwd "$pid")}
  start=${HERDR_USAGE_PROC_START:-$(proc_start "$pid")}
  peers=${HERDR_USAGE_PROC_PEERS:-$(proc_peers_in_folder "$pid" "$cwd" serve)}
  case "$cwd" in /*) ;; *) exit "$NO_READING" ;; esac
  case "$start" in '' | *[!0-9]*) exit "$NO_READING" ;; esac
  [ "$peers" = 1 ] || exit "$NO_READING"
  db=${HERDR_USAGE_OPENCODE_DB:-${XDG_DATA_HOME:-$HOME/.local/share}/opencode/opencode.db}
  exec sh "$here/opencode-db.sh" session "$db" "$cwd" "$start"
}

case "$app" in
  claude) shift 2; claude "$@" ;;
  codex) exec python3 -I "$here/codex-session.py" "$pid" "${3:-}" "${4:-}" ;;
  opencode) opencode ;;
  pi) pi ;;
  *) exit "$NO_READING" ;;
esac
