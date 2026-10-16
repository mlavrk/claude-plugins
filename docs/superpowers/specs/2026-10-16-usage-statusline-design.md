# usage-statusline plugin + personal marketplace — design

Date: 2026-10-16
Status: superseded by 2026-10-16-usage-statusline-mod-design.md (v0.2.0)

## Goal

A Claude Code status line showing current context usage and the subscription
rate limits (5-hour and 7-day) with their reset times, distributed from a
public GitHub repo that doubles as a personal plugin marketplace so it can be
installed on any machine (macOS and Linux) and later host more plugins/skills.

## Constraints

- Works identically on macOS and Linux. Dependencies: `bash` and `jq` (1.6+)
  only. No `date` invocations (BSD/GNU differ); all time formatting via jq
  `localtime | strftime`.
- Plugins cannot set `statusLine` (only `agent`/`subagentStatusLine` in plugin
  settings take effect), and the plugin install path changes on update, so
  `statusLine` in `~/.claude/settings.json` must point to a stable copy.
- Data comes only from the JSON Claude Code pipes to the status line command;
  no API calls, no scraping.

## Repository layout

GitHub: `mlavrk/claude-plugins` (public). Local: `~/projects/claude-plugins`.

```
.claude-plugin/marketplace.json     # marketplace name "mlavrk"
plugins/usage-statusline/
  .claude-plugin/plugin.json
  scripts/statusline.sh             # renderer
  scripts/setup.sh                  # install copy + edit settings.json
  scripts/sync.sh                   # refresh installed copy on plugin update
  commands/setup.md                 # /usage-statusline:setup
  hooks/hooks.json                  # SessionStart -> sync.sh
  tests/fixtures/*.json
  tests/expected/*.txt
  tests/run.sh
.github/workflows/test.yml          # tests on ubuntu-latest and macos-latest
README.md
```

Adding a future plugin: new folder under `plugins/<name>/` (skills in
`plugins/<name>/skills/<skill>/SKILL.md`) plus one entry in `marketplace.json`.

Install on a machine:

```
/plugin marketplace add mlavrk/claude-plugins
/plugin install usage-statusline@mlavrk
/usage-statusline:setup
```

## Components

### statusline.sh (renderer)

Input: status line JSON on stdin. Output: one line.

Format:

```
ctx 42% │ 5h 31% ↻16:45 │ 7d 58% ↻Mon 09:00
```

- `ctx` = `context_window.used_percentage`.
- `5h` = `rate_limits.five_hour.used_percentage`, reset from
  `rate_limits.five_hour.resets_at` (Unix epoch seconds).
- `7d` = `rate_limits.seven_day.used_percentage` / `.resets_at`.
- Percentages are of the limit **used**, rounded to an integer.
- Reset time in local time: `HH:MM` if the reset falls on today's local date,
  otherwise `Ddd HH:MM`.
- Any missing/null value renders as `—` (e.g. `5h —`), and the `↻` part is
  omitted when `resets_at` is missing. This covers: before the first API
  response, after `/compact`, a window dropped after it resets, and accounts
  without subscription rate limits.
- Colors (ANSI), applied to the percentage:

  | metric          | gray (dim) | yellow   | red   |
  |-----------------|------------|----------|-------|
  | 5h / 7d limits  | < 75       | 75 – 89  | ≥ 90  |
  | context         | < 35       | 35 – 49  | ≥ 50  |

  Thresholds compare the rounded (displayed) value, so a shown `90%` is always red. Labels, separators and reset times
  are uncolored. `—` is gray.
- All parsing, coloring and formatting happen in a single `jq` invocation.
- `NOW` env var (epoch seconds) overrides the current time; used by tests for
  the "today vs other day" decision.
- If `jq` is not on PATH, prints `usage-statusline: install jq` and exits 0.
- Invalid JSON on stdin: prints an empty line and exits 0 (never spams
  errors into the footer).

### setup.sh

Invoked by `/usage-statusline:setup` with `${CLAUDE_PLUGIN_ROOT}`. Uses `$HOME`
(so tests can point it at a temp dir).

1. If `jq` missing: print OS-specific install hint (`brew install jq` on
   Darwin; `sudo apt install jq` / `sudo dnf install jq` on Linux) and exit 1.
2. Copy `statusline.sh` to `~/.claude/statusline/usage.sh` (create dir).
3. Desired entry:
   `{"type":"command","command":"bash ~/.claude/statusline/usage.sh"}`.
4. If `settings.json` is missing, create it containing just `statusLine`.
5. If an existing `statusLine` differs from the desired one and `--force` was
   not passed: print the existing value, exit 2, change nothing in
   settings.json.
6. Otherwise back up to `settings.json.bak`, write the merged JSON to a temp
   file in the same dir, then `mv` over the original (atomic). If
   `settings.json` is a symlink (dotfiles), write through it instead so the
   link survives.
6a. If the existing `settings.json` is not a JSON object, or any write step
   fails: print the error, exit 3, leave settings.json unchanged. An empty
   settings.json is treated as missing.
6b. If the existing statusLine already equals the desired entry: refresh the
   script copy only; do not rewrite settings.json or overwrite the backup.
7. Idempotent: running twice yields the same settings.json.

### commands/setup.md

Slash command `/usage-statusline:setup`. Tells Claude to run
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"`; on exit 2 show the user the
existing statusLine and ask whether to replace it, re-running with `--force`
only on a yes; on exit 1 relay the jq install hint.

### sync.sh + hooks/hooks.json

SessionStart hook runs `bash "${CLAUDE_PLUGIN_ROOT}/scripts/sync.sh"`.
If `~/.claude/statusline/usage.sh` exists (setup was done) and differs from
the plugin's `statusline.sh` (`cmp -s`), copy the plugin's version over it.
Never touches settings.json, prints nothing, always exits 0.

## Testing

- `tests/run.sh` pipes each fixture into `statusline.sh` with `TZ=UTC` and a
  fixed `NOW`, diffs against `expected/*.txt` (colors included, as raw ANSI).
  Fixtures: full data; no `rate_limits`; null context; each color band
  boundary (74/75/89/90 for limits, 34/35/49/50 for context); reset on
  another day; one window missing.
- setup.sh tests with a temp `HOME`: fresh install, idempotent re-run,
  existing different statusLine (exit 2, file unchanged), `--force`, backup
  created, unrelated settings keys preserved.
- sync.sh tests: no-op when not set up; updates when content differs.
- CI: GitHub Actions matrix `ubuntu-latest`, `macos-latest` runs `tests/run.sh`.

## Out of scope

Config files/themes, Windows, a remove command (README documents deleting
the `statusLine` key and `~/.claude/statusline/`).
