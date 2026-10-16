#!/usr/bin/env bash
# Claude Code status line: context usage + 5h/7d rate limits with reset times.
# Reads the status line JSON on stdin, prints one line. Always exits 0.
# Env: NOW (epoch seconds) overrides the current time; used by tests.

if ! command -v jq >/dev/null 2>&1; then
  echo "usage-statusline: install jq"
  exit 0
fi

jq -r --arg now "${NOW:-}" '
  def esc(code): "\u001b[" + code + "m";

  # Used percentage, rounded, colored by thresholds on the rounded value.
  def pct(v; warn; crit):
    if v == null then esc("90") + "—" + esc("0")
    else (v | round) as $r
      | (if $r >= crit then "31" elif $r >= warn then "33" else "90" end) as $c
      | esc($c) + "\($r)%" + esc("0")
    end;

  # " ↻HH:MM" when the reset is today (local), else " ↻Ddd HH:MM".
  def reset(e; n):
    if e == null then ""
    elif (e | strflocaltime("%Y-%m-%d")) == (n | strflocaltime("%Y-%m-%d"))
      then " ↻" + (e | strflocaltime("%H:%M"))
    else " ↻" + (e | strflocaltime("%a %H:%M"))
    end;

  (if $now == "" then now else ($now | tonumber) end) as $n
  | .rate_limits as $rl
  | "ctx " + pct(.context_window.used_percentage; 35; 50)
    + " │ 5h " + pct($rl.five_hour.used_percentage; 75; 90)
    + reset($rl.five_hour.resets_at; $n)
    + " │ 7d " + pct($rl.seven_day.used_percentage; 75; 90)
    + reset($rl.seven_day.resets_at; $n)
' 2>/dev/null || echo

exit 0
