#!/usr/bin/env bash
# Tests for skills/slack-notify/scripts/send.sh. A fake curl first on PATH
# records what the script sends and answers like curl --fail-with-body would.
set -u

here=$(cd "$(dirname "$0")" && pwd)
send="$here/../skills/slack-notify/scripts/send.sh"
url='https://hooks.slack.com/triggers/T000/111/abc'
failed=0
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

# Runs send.sh with stdin $1 and webhook URL argument $2 (none when "-").
# Fake curl answers with body $FAKE_BODY and, when set, HTTP error
# $FAKE_HTTP_ERROR or curl exit code $FAKE_CURL_EXIT.
run() {
  tmp=$(mktemp -d "$root/run.XXXXXX")
  mkdir "$tmp/bin"
  cat >"$tmp/bin/curl" <<'EOF'
#!/bin/sh
printf '%s\n' "$@" >"$FAKE_DIR/args"
cat >"$FAKE_DIR/stdin"
if [ -n "${FAKE_CURL_EXIT:-}" ]; then
  echo "curl: ($FAKE_CURL_EXIT) Could not resolve host: hooks.slack.com" >&2
  exit "$FAKE_CURL_EXIT"
fi
printf '%s' "${FAKE_BODY:-}"
if [ -n "${FAKE_HTTP_ERROR:-}" ]; then
  echo "curl: (22) The requested URL returned error: $FAKE_HTTP_ERROR" >&2
  exit 22
fi
EOF
  chmod +x "$tmp/bin/curl"
  if [ "$2" = - ]; then set -- "$1"; else set -- "$1" "$2"; fi
  printf '%s' "$1" | FAKE_DIR="$tmp" PATH="$tmp/bin:$PATH" \
    sh "$send" "${@:2}" >"$tmp/out" 2>"$tmp/err"
  status=$?
}

fail() {
  echo "FAIL: $1"
  echo "  stdout: $(cat "$tmp/out" 2>/dev/null)"
  echo "  stderr: $(cat "$tmp/err" 2>/dev/null)"
  failed=1
}

expect_status() { [ "$status" -eq "$1" ] || fail "$2: exit $status, want $1"; }
expect_no_request() { [ ! -e "$tmp/args" ] || fail "$1: curl was called"; }
expect_contains() { grep -sqF -- "$2" "$tmp/$1" || fail "$3: $1 lacks '$2'"; }

# Quotes, a line break and Cyrillic survive as JSON; the heredoc's trailing
# newline is dropped.
run "$(printf 'MR !42: новый тред от "Ann"\nhttps://gitlab.com/x/-/merge_requests/42')
" "$url"
expect_status 0 'sends message'
[ "$(cat "$tmp/stdin" 2>/dev/null)" = '{"text":"MR !42: новый тред от \"Ann\"\nhttps://gitlab.com/x/-/merge_requests/42"}' ] ||
  fail "sends message: payload $(cat "$tmp/stdin" 2>/dev/null)"
expect_contains args "$url" 'posts to the webhook URL'
expect_contains args 'Content-Type: application/json' 'sends JSON content type'
expect_contains out 'sent' 'reports success'

# Anything that isn't a Slack webhook URL is refused before any request.
for bad in - '' '${user_config.webhook_url}' 'http://hooks.slack.com/triggers/T000/111/abc' \
  'https://hooks.slack.com.evil.example/triggers/T000' 'https://example.com/hook'; do
  run 'hello' "$bad"
  expect_status 2 "refuses URL '$bad'"
  expect_no_request "refuses URL '$bad'"
  expect_contains err '/plugin configure slack-notify@mlavrk' "explains how to set URL '$bad'"
done

# A blank message is refused.
run "$(printf ' \n\t\n')" "$url"
expect_status 2 'refuses blank message'
expect_no_request 'refuses blank message'

# Slack's error body reaches the caller.
FAKE_BODY='invalid_payload' FAKE_HTTP_ERROR=400 run 'hello' "$url"
expect_status 1 'reports Slack error'
expect_contains err 'invalid_payload' 'shows Slack error body'
grep -sqF sent "$tmp/out" && fail 'Slack error is not reported as sent'

# A network failure reaches the caller.
FAKE_CURL_EXIT=6 run 'hello' "$url"
expect_status 1 'reports network error'
expect_contains err 'Could not resolve host' 'shows curl error'

if [ "$failed" -eq 0 ]; then echo 'send.test.sh: all tests passed'; fi
exit "$failed"
