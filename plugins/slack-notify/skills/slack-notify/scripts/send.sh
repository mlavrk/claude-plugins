#!/bin/sh
# Usage: send.sh <webhook-url> <<'EOF' ... EOF
# Sends stdin as a Slack message through the webhook: a Workflow Builder
# webhook trigger with a `text` variable, or an incoming webhook.
# Exits 2 on bad input, 1 when Slack or the network fails.
set -eu

url=${1:-}
case $url in
  https://hooks.slack.com/*) ;;
  *)
    echo 'slack-notify: no Slack webhook URL configured; set it with /plugin configure slack-notify@mlavrk' >&2
    exit 2
    ;;
esac

text=$(cat)
if [ -z "$(printf '%s' "$text" | tr -d '[:space:]')" ]; then
  echo 'slack-notify: the message is empty' >&2
  exit 2
fi

payload=$(printf '%s' "$text" | jq -cRs '{text: .}')
if body=$(printf '%s' "$payload" |
  curl -sS --fail-with-body --max-time 10 -H 'Content-Type: application/json' \
    --data-binary @- "$url"); then
  echo 'slack-notify: sent'
else
  echo "slack-notify: not sent${body:+: $body}" >&2
  exit 1
fi
