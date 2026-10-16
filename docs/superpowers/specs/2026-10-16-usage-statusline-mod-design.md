# usage-statusline v0.2.0 as a mod — design

Date: 2026-10-16
Status: approved in conversation (option A)
Supersedes: 2026-10-16-usage-statusline-design.md (bash statusLine, v0.1.0)

## Goal

Show context usage and the 5h/7d rate limits on their own row directly
**under** the prompt hint line (the line that says e.g. "auto mode on"),
**right-aligned**, using Claude Code's mod API (function hooks), with no
settings.json edits, no shell scripts and no `jq`.

## Look

```
ctx 42% · 5h 31% (16:45) · 7d 58% (Mon 09:00)
```

- Separator ` · ` (U+00B7 with spaces). Reset time in parentheses, local
  time: `HH:MM` when the reset is today (local date), else `Ddd HH:MM`.
- The whole row is gray. Only a percentage that crosses a threshold (number
  and `%`) is colored, yellow or red; the rest stays gray.
- Thresholds on the rounded value:

  | metric         | gray   | yellow  | red   |
  |----------------|--------|---------|-------|
  | 5h / 7d limits | < 75   | 75 – 89 | ≥ 90  |
  | context        | < 35   | 35 – 49 | ≥ 50  |

- A missing value is a gray `—` and its parentheses are left out
  (`5h —`). Missing: before the first response, off a subscription, or a
  window Claude Code dropped.

## Architecture

The plugin `plugins/usage-statusline/` becomes a mod:

```
.claude-plugin/plugin.json      version 0.2.0, "types": "./types/index.d.ts"
hooks/hooks.json                { "modules": ["./register.tsx"] }
hooks/register.tsx              hooks: session.start, session.measure, ui.render
hooks/format.ts                 pure: usage snapshot + now -> segments
types/index.d.ts                PluginState contract for the usage atom
tests/format.test.ts            formatting/threshold/time tests
tests/render.test.tsx           PromptHint drawing tests (terminal + desktop)
```

- **Data.** An atom `usage-statusline.usage` holds
  `{ contextPercent: number | null, limits: { kind, percentUsed, resetsAt? }[] }`.
  `session.start` seeds it from `$.session.usage()`; `session.measure`
  replaces it from the event's `context.percent` and `rateLimits`. Both call
  `next(e)` untouched.
- **Formatting.** `format.ts` exports
  `formatUsage(u: UsageSnapshot, nowMs: number, local?: LocalTime): Segment[]`
  where `Segment = { text: string; color?: 'yellow' | 'red' }` and
  `LocalTime = (ms: number) => { date: string; hm: string; weekday: string }`
  (default: `Date` local getters; tests inject a UTC one).
- **Drawing.** `ui.render` on `{ component: 'PromptHint' }`:
  `own = await next(e)`; return
  `Box(column)[ own, Box(justifyContent flex-end)[ Text(gray)[segments] ] ]`,
  a yellow/red segment being a nested `Text color`. Claude Code keeps
  drawing its own hint line (live pills) as the engine node.
  If there is nothing to show at all (no context and no limits), still draw
  the row with `—`s, so the layout doesn't jump.
- If the tree fails to validate, the engine draws its own line (built-in
  fallback).

## Removed

`scripts/` (statusline.sh, setup.sh, sync.sh), `commands/setup.md`,
the SessionStart sync hook, the bash tests, and the CI job that ran them.
On this Mac: uninstall v0.1.0's effects — remove the `statusLine` key from
`~/.claude/settings.json` (backup first) and `~/.claude/statusline/`.

## Testing

- `claude plugin test plugins/usage-statusline`: format cases (every
  threshold boundary 34/35/49/50, 74/75/89/90, 89.6 → red `90%`, missing
  values, today vs other day, `spend_limit` ignored), and render cases on
  terminal and desktop (row present under the engine node, right-aligned,
  colored segment only on the percentage).
- `claude plugin validate` for the repo and the plugin; `tsc` type-check.
- CI: install Claude Code in GitHub Actions and run validate + test if it
  works without login; otherwise CI validates JSON only and the README says
  tests run locally.
- Live check in this session via hot reload (the mods folder holds a
  symlink to the repo's plugin folder).

## Out of scope

Config options, VS Code/mobile surfaces (they don't raise PromptHint),
countdown timers.
