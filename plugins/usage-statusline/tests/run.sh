#!/usr/bin/env bash
# Runs every tests/test_*.sh; exits non-zero if any assertion failed.
set -u

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

for t in "$TESTS_DIR"/test_*.sh; do
  echo "== $(basename "$t")"
  source "$t"
done

echo "passed: $PASS_COUNT  failed: $FAIL_COUNT"
[ "$FAIL_COUNT" -eq 0 ]
