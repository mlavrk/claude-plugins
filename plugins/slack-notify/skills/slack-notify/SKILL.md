---
name: slack-notify
description: Use when the user asks to be notified, pinged or messaged in Slack, now or later — when a task finishes, or when a /loop or other watch finds something new (new MR threads, a failed pipeline).
allowed-tools: Bash(sh ${CLAUDE_SKILL_DIR}/scripts/send.sh *)
---

# Message the user in Slack

The message reaches the user as a Slack DM with a notification. Send one
only for what the user asked to be notified about.

```sh
sh ${CLAUDE_SKILL_DIR}/scripts/send.sh '${user_config.webhook_url}' <<'EOF'
MR !42 "Fix login": 2 new threads
Ann: asks to cover the expired-token case with a test
Bob: suggests moving the retry into the client
https://gitlab.example.com/team/app/-/merge_requests/42
EOF
```

Keep the command in this shape, so it runs without a permission prompt.

## The message

Slack shows the text exactly as sent, without rendering any formatting. The
message is plain text:

1. First line: what happened, readable on its own. It is the notification
   preview.
2. Then one short line per item.
3. Links as bare URLs, each on its own line.

Under 15 lines; the user often reads it on a phone. Send one message per
check, covering everything new.

## Result

- `slack-notify: sent`: delivered.
- Exit 2: no webhook URL configured, or an empty message. Tell the user the
  printed reason; don't retry.
- Exit 1: Slack or the network failed. Tell the user the printed error in
  the session; retry at most once, and only for a network error.
