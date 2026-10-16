# sync.sh tests: refreshes the installed copy only when setup was done.

SYNC="$SCRIPTS_DIR/sync.sh"
run_sync() { out="$(HOME="$1" bash "$SYNC" 2>&1)"; code=$?; }

# not set up: does nothing
h="$(mktemp -d "${TMPDIR:-/tmp}/usl-home.XXXXXX")"
run_sync "$h"
assert_eq "sync/not-setup-exit" "0" "$code"
assert_eq "sync/not-setup-silent" "" "$out"
assert_true "sync/not-setup-no-file" test ! -e "$h/.claude/statusline/usage.sh"

# stale copy gets replaced
mkdir -p "$h/.claude/statusline"
echo old > "$h/.claude/statusline/usage.sh"
run_sync "$h"
assert_eq "sync/stale-exit" "0" "$code"
assert_eq "sync/stale-silent" "" "$out"
assert_true "sync/stale-updated" cmp -s "$SCRIPTS_DIR/statusline.sh" "$h/.claude/statusline/usage.sh"

# identical copy stays identical
run_sync "$h"
assert_eq "sync/identical-exit" "0" "$code"
assert_eq "sync/identical-silent" "" "$out"
assert_true "sync/identical-same" cmp -s "$SCRIPTS_DIR/statusline.sh" "$h/.claude/statusline/usage.sh"
