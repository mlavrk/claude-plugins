# mlavrk's Claude Code plugins

A personal [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace).
Add it once per machine, then install any plugin in it.

```
/plugin marketplace add mlavrk/claude-plugins
```

## Plugins

### usage-statusline

A status line showing context usage and your subscription limits:

```
ctx 42% │ 5h 31% ↻16:45 │ 7d 58% ↻Mon 09:00
```

- `ctx`: share of the context window used.
- `5h` / `7d`: share of the 5-hour and weekly limits **used**, with the local
  reset time (`HH:MM` today, otherwise weekday + time).
- `—` means Claude Code hasn't reported that value yet. Limits appear after
  the first reply in a session, and only on Pro/Max plans.

| metric | gray | yellow | red |
|---|---|---|---|
| 5h / 7d limits | < 75% | 75–89% | ≥ 90% |
| context | < 35% | 35–49% | ≥ 50% |

**Install**

```
/plugin install usage-statusline@mlavrk
/usage-statusline:setup
```

Setup copies the script to `~/.claude/statusline/usage.sh`, backs up
`~/.claude/settings.json` to `settings.json.bak`, and sets `statusLine`. It
asks before replacing an existing status line. Start a new session to see it.

**Requirements:** `bash` and `jq` 1.6+ on macOS or Linux.
`brew install jq` · `sudo apt install jq` · `sudo dnf install jq`

**Update:** `/plugin marketplace update mlavrk`, then update the plugin from
`/plugin`. The installed script refreshes itself on the next session start.

**Remove:** delete the `statusLine` key from `~/.claude/settings.json`,
`rm -r ~/.claude/statusline`, and uninstall the plugin from `/plugin`.

## Adding a plugin or skill

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`
   (`{"name": "<name>", "version": "0.1.0", "description": "..."}`).
   Skills go in `plugins/<name>/skills/<skill>/SKILL.md`, slash commands in
   `plugins/<name>/commands/`, hooks in `plugins/<name>/hooks/hooks.json`.
2. Add `{"name": "<name>", "source": "./plugins/<name>", "description": "..."}`
   to `plugins` in `.claude-plugin/marketplace.json`.
3. `claude plugin validate .`, commit, push. On other machines:
   `/plugin marketplace update mlavrk`, then `/plugin install <name>@mlavrk`.

## Development

```
bash plugins/usage-statusline/tests/run.sh
```

CI runs the tests on Ubuntu (latest and 22.04) and macOS.
