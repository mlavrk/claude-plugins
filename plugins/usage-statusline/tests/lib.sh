# Shared test helpers. Sourced by run.sh; test files use these.

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$TESTS_DIR")"
SCRIPTS_DIR="$PLUGIN_DIR/scripts"
FIXTURES="$TESTS_DIR/fixtures"
EXPECTED="$TESTS_DIR/expected"

PASS_COUNT=0
FAIL_COUNT=0

# Replace ANSI color codes with readable tags.
visible() {
  sed -e $'s/\e\\[90m/{gray}/g' \
      -e $'s/\e\\[33m/{yellow}/g' \
      -e $'s/\e\\[31m/{red}/g' \
      -e $'s/\e\\[0m/{\\/}/g'
}

# assert_eq <name> <expected> <actual>
assert_eq() {
  if [ "$2" == "$3" ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf 'FAIL: %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"
  fi
}

# assert_true <name> <command...>
assert_true() {
  local name="$1"; shift
  if "$@"; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    printf 'FAIL: %s\n  command failed: %s\n' "$name" "$*"
  fi
}
