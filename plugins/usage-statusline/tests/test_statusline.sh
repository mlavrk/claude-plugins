# Renderer tests. Fixed clock: Fri 2026-10-16 12:00 UTC.

STATUSLINE="$SCRIPTS_DIR/statusline.sh"
NOW_FIXED=1792152000

render() { # render <tz> <stdin-file>
  NOW=$NOW_FIXED TZ="$1" bash "$STATUSLINE" < "$2" | visible
}

for f in "$FIXTURES"/*.json; do
  name="$(basename "$f" .json)"
  assert_eq "statusline/$name" "$(cat "$EXPECTED/$name.txt")" "$(render UTC "$f")"
done

assert_eq "statusline/local-timezone" \
  'ctx {yellow}42%{/} │ 5h {gray}31%{/} ↻12:45 │ 7d {gray}58%{/} ↻Mon 05:00' \
  "$(render America/New_York "$FIXTURES/full.json")"

out="$(echo 'not json' | NOW=$NOW_FIXED bash "$STATUSLINE")"; code=$?
assert_eq "statusline/invalid-json-output" "" "$out"
assert_eq "statusline/invalid-json-exit" "0" "$code"

out="$(PATH=/nonexistent "$BASH" "$STATUSLINE" < "$FIXTURES/full.json")"; code=$?
assert_eq "statusline/no-jq-output" "usage-statusline: install jq" "$out"
assert_eq "statusline/no-jq-exit" "0" "$code"
