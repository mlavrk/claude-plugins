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
Opus (high) · ctx 42% · cache 96% +6k · 5h 69% (16:45) · 7d 42% (Mon 09:00)
```

- `Opus (high)`: the main loop's model family, without its version, and in
  parentheses the effort its last request was sent with (after any downgrade
  the model forces). The effort appears once the first request is made, and
  a `/model` switch shows at once. Subagents' requests don't count.
- `ctx`: share of the context window used.
- `cache`: the last turn's prompt-cache hit rate (input read from the cache
  over all input), and `+N` the tokens it wrote to the cache. A low rate
  means the context was re-sent at full price: after `/model`, after the
  cache expired while idle, or when something rewrote the prompt (an MCP
  server, a plugin reload, a CLAUDE.md edit). Subagents' turns don't count.
- `5h` / `7d`: share of the 5-hour and weekly limits **left**, like a battery
  (100% is a fresh window, 0% means you've hit the limit), with the local
  reset time (`HH:MM` today, otherwise weekday + time).
- `—` means Claude Code hasn't reported that value yet. Limits appear after
  the first reply in a session, and only on Pro/Max plans.
- The row is gray; a percentage turns yellow or red as it crosses these:

| metric | gray | yellow | red |
|---|---|---|---|
| 5h / 7d limits left | > 25% | 11–25% | ≤ 10% |
| context used | < 35% | 35–49% | ≥ 50% |
| cache | ≥ 80% | 50–79% | < 50% |

The first turn of a session and the first after a compaction are cold by
design, so their cache rate stays gray. (Where an organization manages
Claude Code, the compaction isn't seen and that turn is colored.)

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

### slack-notify

Lets the agent message you in Slack when you ask it to: "ping me in Slack
when the tests finish", or in a `/loop`, "every 30 minutes check my MRs and
send me new threads in Slack". The message arrives as a DM with a
notification.

**Set up the Slack side** once. A Workflow Builder workflow needs no app
install, so it works where you can't add apps (paid Slack plans):

1. Workflows → New → Build Workflow → **From a webhook**.
2. Set up variables: one variable, key `text`, data type Text.
3. Add the step **Send a message to a person**: send to yourself, and make
   the message just the `text` variable.
4. Publish, then copy the webhook URL (`https://hooks.slack.com/triggers/...`).

An incoming webhook URL (`https://hooks.slack.com/services/...`) works too.

**Install**, at the prompt of a terminal session, and paste the URL into the
dialog:

```
/plugin install slack-notify@mlavrk
```

or from a shell: `claude plugin install slack-notify@mlavrk --config webhook_url=<url>`.
To change the URL later: `/plugin configure slack-notify@mlavrk`.

- Slack shows the text as sent, without formatting; the skill has the agent
  write plain text with bare links.
- Anyone with the URL can message you. It's stored in plain text under
  `pluginConfigs` in `~/.claude/settings.json` and shows up in the
  transcript of a session that sends a message, so keep that file out of
  public dotfiles.
- Works in local sessions, including `/loop`. Needs `curl` and `jq`
  (macOS has both).

### subagent-model

A mod that adds each subagent's model and effort to its name, so the
subagent list under the prompt (and the agent's completion notice) shows
what it runs on:

```
● main
○ Explore   Find statusline thresholds [Opus high]
○ general-purpose   Check plugin manifests [Haiku low]
```

- The model is shown by family (`Opus`, `Sonnet`, `Haiku`), the effort as
  the level (`low` … `max`) or the token budget.
- A name is fixed when the subagent starts, before Claude Code resolves its
  model. So the tag comes from the Agent call's own `model` and `effort`
  when it sets them; otherwise from what that agent type actually ran on
  last time, remembered across sessions. The first run of a type that sets
  neither has no tag, and a remembered effort trails a change of your
  session's effort by one run.
- A fork shows your main model and its current effort.
- Workflow agents and resumed agents are left as they are.
- The tag is in the list's own color: mods can change the list's text, not
  its colors.

**Install**, at the prompt of a terminal session:

```
/plugin install subagent-model --marketplace mlavrk/claude-plugins
```

or from a shell: `claude plugin install subagent-model --marketplace mlavrk/claude-plugins`.

**Requirements:** Claude Code 2.1.301 or newer (mods are early access).

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
claude plugin validate plugins/slack-notify
bash plugins/slack-notify/tests/send.test.sh
claude plugin validate plugins/subagent-model
claude plugin test plugins/subagent-model
```

CI runs them on Ubuntu and macOS with a pinned Claude Code version.
