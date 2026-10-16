# usage-statusline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code plugin rendering `ctx 42% │ 5h 31% ↻16:45 │ 7d 58% ↻Mon 09:00` in the status line, published from the public marketplace repo `mlavrk/claude-plugins`.

**Architecture:** One bash script feeds stdin JSON into a single `jq` program that renders the line. `setup.sh` copies it to a stable path and merges a `statusLine` entry into `~/.claude/settings.json`; a SessionStart hook (`sync.sh`) refreshes that copy after plugin updates. The repo root is a marketplace; each plugin lives in `plugins/<name>/`.

**Tech Stack:** bash, jq ≥ 1.6, GitHub Actions, `gh` CLI, `claude plugin` CLI.

**Spec:** `docs/superpowers/specs/2026-10-16-usage-statusline-design.md`

## Global Constraints

- macOS and Linux; runtime deps `bash` + `jq` (1.6+) only. No `date`, `uname`, `readlink -f`, GNU/BSD-specific flags. OS detection via `$OSTYPE`.
- Time formatting only via jq `strflocaltime` on epoch seconds (honours `TZ`).
- Separator is ` │ ` (U+2502 with spaces); reset marker `↻`; missing value `—` (U+2014).
- Colors: gray `\e[90m`, yellow `\e[33m`, red `\e[31m`, reset `\e[0m`; only the percentage (or `—`) is wrapped.
- Limits (5h, 7d): gray < 75, yellow 75–89, red ≥ 90. Context: gray < 35, yellow 35–49, red ≥ 50. Compare the **rounded** value, so the number shown always matches its color (spec amended).
- Installed copy: `~/.claude/statusline/usage.sh`. statusLine entry exactly `{"type":"command","command":"bash ~/.claude/statusline/usage.sh"}`.
- Marketplace name `mlavrk`, owner name `mlavrk`; plugin name `usage-statusline`, version `0.1.0`.
- Scripts locate siblings via `"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`, never via cwd.
- `statusline.sh` and `sync.sh` always exit 0.

## Review Focus

1. `~/.claude/settings.json` is a symlink (dotfiles repo) → setup must write through the link, not replace it with a regular file. Test in Task 2.
2. `settings.json` contains invalid JSON (hand-edited, trailing comma) → setup exits 3, prints the problem, leaves file and backup untouched. Test in Task 2.
3. User's timezone isn't UTC → reset times show local clock, and the "today" check uses the local date. Test (`TZ=America/New_York`) in Task 1.
4. Value like `89.6` → shows `90%` and must be red, not yellow. Test in Task 1.
5. jq absent on a fresh Linux box → footer says `usage-statusline: install jq` (not blank, not an error spew); setup prints the right package-manager hint. Tests in Tasks 1 and 2.

---

### Task 1: Renderer `statusline.sh` + test harness

**Files:**
- Create: `plugins/usage-statusline/scripts/statusline.sh`
- Create: `plugins/usage-statusline/tests/run.sh`, `tests/lib.sh`, `tests/test_statusline.sh`
- Create: `plugins/usage-statusline/tests/fixtures/*.json`, `tests/expected/*.txt`

**Interfaces:**
- Produces: `statusline.sh` — stdin: status-line JSON; stdout: one line + `\n`; env `NOW` (epoch seconds, default jq `now`); exit 0 always.
- Produces: `tests/lib.sh` with `visible` (stdin filter: `\e[90m`→`{gray}`, `\e[33m`→`{yellow}`, `\e[31m`→`{red}`, `\e[0m`→`{/}`), `assert_eq <name> <expected> <actual>`, `fail_count` tracking; `tests/run.sh` sources lib, runs every `tests/test_*.sh`, exits non-zero if any assertion failed.

All fixtures/expectations below use `NOW=1792152000` (Fri 2026-10-16 12:00 UTC), `TZ=UTC` unless noted. `R5=1792169100` (Fri 16:45 UTC), `R7=1792400400` (Mon 2026-10-19 09:00 UTC).

- [ ] **Step 1: Write fixtures and expected outputs** (expected in `visible` form, one line each)

| fixture | input | expected |
|---|---|---|
| full | ctx 42; 5h 31 @R5; 7d 58 @R7 | `ctx {yellow}42%{/} │ 5h {gray}31%{/} ↻16:45 │ 7d {gray}58%{/} ↻Mon 09:00` |
| no-rate-limits | ctx 10, no `rate_limits` | `ctx {gray}10%{/} │ 5h {gray}—{/} │ 7d {gray}—{/}` |
| null-context | `context_window.used_percentage: null`; limits as full | `ctx {gray}—{/} │ 5h {gray}31%{/} ↻16:45 │ 7d {gray}58%{/} ↻Mon 09:00` |
| empty | `{}` | `ctx {gray}—{/} │ 5h {gray}—{/} │ 7d {gray}—{/}` |
| one-window | ctx 20; only `seven_day: {used_percentage: 58}` (no resets_at) | `ctx {gray}20%{/} │ 5h {gray}—{/} │ 7d {gray}58%{/}` |
| bands-a | ctx 34; 5h 74 @R5; 7d 75 @R7 | `ctx {gray}34%{/} │ 5h {gray}74%{/} ↻16:45 │ 7d {yellow}75%{/} ↻Mon 09:00` |
| bands-b | ctx 35; 5h 89 @R5; 7d 90 @R7 | `ctx {yellow}35%{/} │ 5h {yellow}89%{/} ↻16:45 │ 7d {red}90%{/} ↻Mon 09:00` |
| bands-c | ctx 49; 5h 100 @R5; 7d 0 @R7 | `ctx {yellow}49%{/} │ 5h {red}100%{/} ↻16:45 │ 7d {gray}0%{/} ↻Mon 09:00` |
| bands-d | ctx 50; 5h 89.6 @R5; 7d 74.4 @R7 | `ctx {red}50%{/} │ 5h {red}90%{/} ↻16:45 │ 7d {gray}74%{/} ↻Mon 09:00` |

Fixture JSON shape: `{"context_window":{"used_percentage":N},"rate_limits":{"five_hour":{"used_percentage":N,"resets_at":E},"seven_day":{...}}}`.

- [ ] **Step 2: Write `tests/test_statusline.sh`**
  - For each fixture: `NOW=1792152000 TZ=UTC bash statusline.sh < fixture | visible` equals expected file.
  - `full` with `TZ=America/New_York` → `ctx {yellow}42%{/} │ 5h {gray}31%{/} ↻12:45 │ 7d {gray}58%{/} ↻Mon 05:00`.
  - stdin `not json` → output is the empty string, exit code 0.
  - `PATH=/nonexistent "$BASH" statusline.sh < full.json` → `usage-statusline: install jq`, exit 0.

- [ ] **Step 3: Run `bash plugins/usage-statusline/tests/run.sh`** — expect FAIL (statusline.sh missing).

- [ ] **Step 4: Implement `statusline.sh`**
  `command -v jq` guard → message. Otherwise `jq -r --arg now "${NOW:-}"` with one program: helpers `pct(v; warn; crit)` (null → gray `—`, else round, color by rounded value) and `reset(e)` (null → empty; same local `%Y-%m-%d` as now → `" ↻%H:%M"`, else `" ↻%a %H:%M"` via `strflocaltime`). Escape codes built in jq as `"\u001b[90m"` etc. Wrap with `2>/dev/null || echo` so invalid JSON yields an empty line and exit 0.

- [ ] **Step 5: Run tests** — expect all PASS.

- [ ] **Step 6: Commit** `feat(usage-statusline): add status line renderer with tests`

### Task 2: `setup.sh`

**Files:**
- Create: `plugins/usage-statusline/scripts/setup.sh`
- Create: `plugins/usage-statusline/tests/test_setup.sh`

**Interfaces:**
- Consumes: `scripts/statusline.sh` (sibling file).
- Produces: `setup.sh [--force]`, uses `$HOME`. Exit codes: 0 installed/already installed; 1 jq missing (prints hint: `brew install jq` when `$OSTYPE` is `darwin*`, else `sudo apt install jq   # or: sudo dnf install jq`); 2 different statusLine exists without `--force` (prints `existing statusLine:` + its JSON); 3 settings.json is not valid JSON (prints `settings.json is not valid JSON; not modified`).

Each test uses a fresh `HOME=$(mktemp -d)`.

- [ ] **Step 1: Write `tests/test_setup.sh`**
  - fresh: no `~/.claude` → exit 0; `~/.claude/statusline/usage.sh` identical to `statusline.sh` (`cmp -s`); `jq -c .statusLine settings.json` == `{"type":"command","command":"bash ~/.claude/statusline/usage.sh"}`.
  - preserves keys: settings `{"model":"opus","hooks":{"x":1}}` → after setup `.model=="opus"` and `.hooks.x==1`; `settings.json.bak` equals the original.
  - idempotent: run twice → exit 0 both; settings bytes identical after 1st and 2nd run.
  - conflict: settings `{"statusLine":{"type":"command","command":"other.sh"}}` → exit 2, output contains `other.sh`, file unchanged (`cmp`), no `.bak` created.
  - force: same + `--force` → exit 0, statusLine replaced, `.bak` holds the `other.sh` version.
  - invalid JSON: settings `{"a":1,}` → exit 3, file unchanged.
  - symlink: settings.json → symlink to `$HOME/dotfiles/settings.json` → after setup `[ -L settings.json ]` still true and the target contains the statusLine.
  - no jq: `PATH=/nonexistent "$BASH" setup.sh` → exit 1, output contains `install jq`.

- [ ] **Step 2: Run tests** — expect test_setup FAIL.

- [ ] **Step 3: Implement `setup.sh`**
  Order: jq check → validate existing settings (`jq empty`) → conflict check → `mkdir -p` + `cp` script → `cp` settings to `.bak` (only if it existed) → `jq --argjson sl "$entry" '.statusLine=$sl'` into `mktemp "$dir/settings.XXXXXX"` → if `-L settings.json` then `cat tmp > settings.json; rm tmp` else `mv tmp settings.json`. Missing settings.json starts from `{}`. Print `Installed. Restart Claude Code or start a new session to see the status line.`

- [ ] **Step 4: Run tests** — expect all PASS.

- [ ] **Step 5: Commit** `feat(usage-statusline): add setup script`

### Task 3: Sync hook, slash command, manifests

**Files:**
- Create: `plugins/usage-statusline/scripts/sync.sh`, `hooks/hooks.json`, `commands/setup.md`, `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json` (repo root)
- Create: `plugins/usage-statusline/tests/test_sync.sh`

**Interfaces:**
- Consumes: `statusline.sh`, `setup.sh` exit codes from Task 2.
- Produces: `/usage-statusline:setup` command; SessionStart hook command `bash "${CLAUDE_PLUGIN_ROOT}/scripts/sync.sh"`.

- [ ] **Step 1: Write `tests/test_sync.sh`** (temp `HOME`)
  - not set up (no `~/.claude/statusline/usage.sh`) → exit 0, empty output, file still absent.
  - stale copy (`echo old > usage.sh`) → exit 0, empty output, now `cmp -s` identical to `statusline.sh`.
  - identical copy → exit 0, empty output, content still identical.

- [ ] **Step 2: Run tests** — expect FAIL; implement `sync.sh` (`[ -f dest ] && ! cmp -s src dest && cp src dest`; `exit 0`, all output to `/dev/null`); run → PASS.

- [ ] **Step 3: Write manifests and command**
  - `plugin.json`: `name`, `version` 0.1.0, `description` "Status line with context usage and 5h/7d rate limits with reset times", `author.name` mlavrk.
  - `hooks/hooks.json`: `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"bash \"${CLAUDE_PLUGIN_ROOT}/scripts/sync.sh\"","timeout":10}]}]}}`.
  - `marketplace.json`: `name` mlavrk, `owner.name` mlavrk, one plugin `{"name":"usage-statusline","source":"./plugins/usage-statusline","description":<same as plugin.json>}`.
  - `commands/setup.md`: frontmatter `description: Install the usage status line into ~/.claude/settings.json`, `allowed-tools: Bash`. Body: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"`; exit 0 → relay success; exit 1 → relay jq hint; exit 2 → show the existing statusLine and ask the user whether to replace it, re-run with `--force` only on explicit yes; exit 3 → relay error, change nothing.

- [ ] **Step 4: Validate** — `claude plugin validate .` and `claude plugin validate plugins/usage-statusline` both report no errors; `bash plugins/usage-statusline/tests/run.sh` all PASS.

- [ ] **Step 5: Commit** `feat(usage-statusline): add sync hook, setup command, marketplace manifests`

### Task 4: CI + README

**Files:**
- Create: `.github/workflows/test.yml`, `README.md`

- [ ] **Step 1: Workflow** — on push + pull_request; matrix `os: [ubuntu-latest, ubuntu-22.04, macos-latest]` (22.04 ships jq 1.6 = our floor); steps: checkout, `jq --version`, `bash plugins/usage-statusline/tests/run.sh`.

- [ ] **Step 2: README** — what the marketplace is; install (the three commands from the spec); what the line shows + color table; requirements (Pro/Max for limits, jq with install commands per OS); updating (`/plugin marketplace update mlavrk`, then `/plugin update`); removing (delete `statusLine` key, `rm -r ~/.claude/statusline`, uninstall plugin); adding a new plugin/skill to this repo (folder + marketplace entry).

- [ ] **Step 3: Commit** `ci: test on linux and macos; add README`

### Task 5: Publish and verify end-to-end

- [ ] **Step 1:** `gh repo create mlavrk/claude-plugins --public --source . --push` — repo created, `main` pushed.
- [ ] **Step 2:** `gh run watch --exit-status` on the push run — all three matrix jobs green.
- [ ] **Step 3:** `claude plugin marketplace add mlavrk/claude-plugins` then `claude plugin install usage-statusline@mlavrk` — both succeed.
- [ ] **Step 4:** run the installed `setup.sh` (path from `~/.claude/plugins/installed_plugins.json`) → exit 0; `jq .statusLine ~/.claude/settings.json` shows the entry; `~/.claude/settings.json.bak` exists.
- [ ] **Step 5:** smoke test with a realistic payload: `echo '<full fixture>' | bash ~/.claude/statusline/usage.sh` renders colored line. User opens a new Claude Code session and confirms the footer shows real 5h/7d numbers after the first reply.
