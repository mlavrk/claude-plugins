# mlavrk's Claude Code plugins

A personal [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugins/create-marketplace).
Add it once per machine, then install any plugin in it.

```
/plugin marketplace add mlavrk/claude-plugins
```

## Plugins

### usage-statusline

A mod that adds a row under the prompt hint line (where "auto mode on"
shows), right-aligned:

```
ctx 42% · 5h 31% (16:45) · 7d 58% (Mon 09:00)
```

- `ctx`: share of the context window used.
- `5h` / `7d`: share of the 5-hour and weekly limits **used**, with the local
  reset time (`HH:MM` today, otherwise weekday + time).
- `—` means Claude Code hasn't reported that value yet. Limits appear after
  the first reply in a session, and only on Pro/Max plans.
- The row is gray; a percentage turns yellow or red as it crosses these:

| metric | gray | yellow | red |
|---|---|---|---|
| 5h / 7d limits | < 75% | 75–89% | ≥ 90% |
| context | < 35% | 35–49% | ≥ 50% |

**Install**, at the prompt of a terminal session:

```
/plugin install usage-statusline --marketplace mlavrk/claude-plugins
```

or from a shell: `claude plugin install usage-statusline --marketplace mlavrk/claude-plugins`.
Nothing else to set up: no settings changes, no scripts, works the same on
macOS and Linux.

**Requirements:** Claude Code 2.1.301 or newer (mods are early access).
It draws in the terminal and the desktop app; VS Code and mobile don't
have the prompt hint line.

**Update:** `/plugin marketplace update mlavrk`, then update the plugin
from `/plugin`.

**Upgrading from 0.1.x (the bash status line):** delete the `statusLine`
key from `~/.claude/settings.json` and `rm -r ~/.claude/statusline`.

## Adding a plugin or skill

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`
   (`{"name": "<name>", "version": "0.1.0", "description": "..."}`).
   Skills go in `plugins/<name>/skills/<skill>/SKILL.md`, slash commands in
   `plugins/<name>/commands/`. A mod has `hooks/hooks.json` naming its
   hooks module (`{ "modules": ["./register.tsx"] }`).
2. Add `{"name": "<name>", "source": "./plugins/<name>", "description": "..."}`
   to `plugins` in `.claude-plugin/marketplace.json`.
3. `claude plugin validate .`, commit, push. On other machines:
   `/plugin marketplace update mlavrk`, then `/plugin install <name>@mlavrk`.

## Development

```
claude plugin validate plugins/usage-statusline
claude plugin test plugins/usage-statusline
```

CI runs both on Ubuntu and macOS with a pinned Claude Code version.
