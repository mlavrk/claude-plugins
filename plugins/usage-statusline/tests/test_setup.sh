# setup.sh tests. Each case runs against a fresh temporary HOME.

SETUP="$SCRIPTS_DIR/setup.sh"
WANT_ENTRY='{"type":"command","command":"bash ~/.claude/statusline/usage.sh"}'

new_home() { mktemp -d "${TMPDIR:-/tmp}/usl-home.XXXXXX"; }
run_setup() { # run_setup <home> [args...]; sets $out and $code
  local h="$1"; shift
  out="$(HOME="$h" bash "$SETUP" "$@" 2>&1)"; code=$?
}

# fresh install
h="$(new_home)"
run_setup "$h"
assert_eq "setup/fresh-exit" "0" "$code"
assert_true "setup/fresh-script-copied" cmp -s "$SCRIPTS_DIR/statusline.sh" "$h/.claude/statusline/usage.sh"
assert_eq "setup/fresh-entry" "$WANT_ENTRY" "$(jq -c .statusLine "$h/.claude/settings.json")"

# preserves unrelated keys and backs up the original
h="$(new_home)"; mkdir -p "$h/.claude"
echo '{"model":"opus","hooks":{"x":1}}' > "$h/.claude/settings.json"
cp "$h/.claude/settings.json" "$h/original.json"
run_setup "$h"
assert_eq "setup/preserve-exit" "0" "$code"
assert_eq "setup/preserve-model" "opus" "$(jq -r .model "$h/.claude/settings.json")"
assert_eq "setup/preserve-hooks" "1" "$(jq -r .hooks.x "$h/.claude/settings.json")"
assert_true "setup/backup-is-original" cmp -s "$h/original.json" "$h/.claude/settings.json.bak"

# idempotent
h="$(new_home)"
run_setup "$h"; first="$(cat "$h/.claude/settings.json")"
run_setup "$h"
assert_eq "setup/idempotent-exit" "0" "$code"
assert_eq "setup/idempotent-content" "$first" "$(cat "$h/.claude/settings.json")"

# conflicting statusLine without --force
h="$(new_home)"; mkdir -p "$h/.claude"
echo '{"statusLine":{"type":"command","command":"other.sh"}}' > "$h/.claude/settings.json"
cp "$h/.claude/settings.json" "$h/original.json"
run_setup "$h"
assert_eq "setup/conflict-exit" "2" "$code"
assert_true "setup/conflict-shows-existing" grep -q "other.sh" <<<"$out"
assert_true "setup/conflict-unchanged" cmp -s "$h/original.json" "$h/.claude/settings.json"
assert_true "setup/conflict-no-backup" test ! -e "$h/.claude/settings.json.bak"

# --force replaces it
run_setup "$h" --force
assert_eq "setup/force-exit" "0" "$code"
assert_eq "setup/force-entry" "$WANT_ENTRY" "$(jq -c .statusLine "$h/.claude/settings.json")"
assert_true "setup/force-backup" cmp -s "$h/original.json" "$h/.claude/settings.json.bak"

# invalid JSON is left alone
h="$(new_home)"; mkdir -p "$h/.claude"
echo '{"a":1,}' > "$h/.claude/settings.json"
run_setup "$h"
assert_eq "setup/invalid-exit" "3" "$code"
assert_eq "setup/invalid-unchanged" '{"a":1,}' "$(cat "$h/.claude/settings.json")"

# symlinked settings.json keeps its link
h="$(new_home)"; mkdir -p "$h/.claude" "$h/dotfiles"
echo '{"model":"opus"}' > "$h/dotfiles/settings.json"
ln -s "$h/dotfiles/settings.json" "$h/.claude/settings.json"
run_setup "$h"
assert_eq "setup/symlink-exit" "0" "$code"
assert_true "setup/symlink-kept" test -L "$h/.claude/settings.json"
assert_eq "setup/symlink-target-updated" "$WANT_ENTRY" "$(jq -c .statusLine "$h/dotfiles/settings.json")"

# jq missing
h="$(new_home)"
out="$(HOME="$h" PATH=/nonexistent "$BASH" "$SETUP" 2>&1)"; code=$?
assert_eq "setup/no-jq-exit" "1" "$code"
assert_true "setup/no-jq-hint" grep -q "install jq" <<<"$out"

# settings.json that is valid JSON but not an object is left alone
h="$(new_home)"; mkdir -p "$h/.claude"
echo '[]' > "$h/.claude/settings.json"
run_setup "$h"
assert_eq "setup/non-object-exit" "3" "$code"
assert_eq "setup/non-object-unchanged" '[]' "$(cat "$h/.claude/settings.json")"

# empty settings.json is treated like a missing one
h="$(new_home)"; mkdir -p "$h/.claude"
: > "$h/.claude/settings.json"
run_setup "$h"
assert_eq "setup/empty-file-exit" "0" "$code"
assert_eq "setup/empty-file-entry" "$WANT_ENTRY" "$(jq -c .statusLine "$h/.claude/settings.json")"

# dangling symlink whose target can't be written: fail, don't claim success
h="$(new_home)"; mkdir -p "$h/.claude"
ln -s "$h/missing-dir/settings.json" "$h/.claude/settings.json"
run_setup "$h"
assert_eq "setup/dangling-symlink-exit" "3" "$code"
assert_true "setup/dangling-symlink-no-success-msg" test -z "$(grep Installed <<<"$out")"

# re-running after --force keeps the backup of the user's original statusLine
h="$(new_home)"; mkdir -p "$h/.claude"
echo '{"statusLine":{"type":"command","command":"mine.sh"}}' > "$h/.claude/settings.json"
cp "$h/.claude/settings.json" "$h/original.json"
run_setup "$h" --force
run_setup "$h"
assert_eq "setup/rerun-after-force-exit" "0" "$code"
assert_true "setup/rerun-after-force-backup-kept" cmp -s "$h/original.json" "$h/.claude/settings.json.bak"
