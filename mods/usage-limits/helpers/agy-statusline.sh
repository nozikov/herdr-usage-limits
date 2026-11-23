#!/bin/sh
SAVED=${HERDR_USAGE_AGY_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/herdr-usage-limits/antigravity.json}

command -v jq >/dev/null 2>&1 || exit 0
umask 077
mkdir -p "$(dirname "$SAVED")" || exit 0

before=$(jq -c 'if type == "object" and ((.quota // {}) | type) == "object" then . else {} end' "$SAVED" 2>/dev/null)
[ -n "$before" ] || before='{}'
next="$SAVED.tmp.$$"

if jq -ce --argjson saved "$before" '
  def reset: .reset_time // "";
  def kept($old):
    if ($old | type) != "object" or reset > ($old | reset) then .
    elif reset < ($old | reset) then $old
    elif ($old.remaining_fraction // 1) < (.remaining_fraction // 1) then .remaining_fraction = $old.remaining_fraction
    else . end;
  select(type == "object" and (.quota | type) == "object")
  | {at: (now | floor),
     plan: (.plan_tier // $saved.plan // null),
     quota: (($saved.quota // {}) + (.quota | with_entries(.key as $k | .value |= kept($saved.quota[$k] // null))))}
' >"$next" 2>/dev/null; then
  mv "$next" "$SAVED"
else
  rm -f "$next"
fi
exit 0
