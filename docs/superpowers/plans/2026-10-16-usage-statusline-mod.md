# usage-statusline v0.2.0 (mod) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the bash status line with a mod drawing a right-aligned usage row under the prompt hint line.

**Architecture:** `format.ts` (pure) turns a usage snapshot into colored segments; `register.tsx` keeps the snapshot in a `$.state` atom fed by `session.start`/`session.measure` and wraps the engine's `PromptHint` node with a right-aligned row.

**Tech Stack:** Claude Code 2.1.301 function hooks (TypeScript/TSX), `claude plugin test`, `claude plugin validate`.

**Spec:** `docs/superpowers/specs/2026-10-16-usage-statusline-mod-design.md`

## Global Constraints

- Format `ctx 42% · 5h 31% (16:45) · 7d 58% (Mon 09:00)`; separator ` · `; missing `—` without parentheses.
- Whole row `color="gray"`; only a percentage over threshold gets a nested `Text color` (`yellow`/`red`).
- Limits: yellow ≥ 75, red ≥ 90; context: yellow ≥ 35, red ≥ 50; on the rounded value.
- Atom ref `{ plugin: 'usage-statusline', key: 'usage' }`, declared in `types/index.d.ts`.
- No Node, no `import()`; only `Date` and `$`.

## Review Focus

1. Engine's own hint line must stay (pills live): the returned tree holds `next(e)`'s node exactly once. Test in Task 2.
2. Hot reload re-runs `register`: state lives in `$.state`, seeded again on `session.start`. Test in Task 2.
3. Non-UTC timezone: "today" uses the local date. Covered by `LocalTime` injection in Task 1.
4. 89.6 → `90%` red. Task 1.
5. `rateLimits` with an extra `spend_limit` window is ignored. Task 1.

---

### Task 1: `format.ts`

**Files:** Create `hooks/format.ts`, `tests/format.test.ts`.

**Interfaces — Produces:** `formatUsage(u: UsageSnapshot, nowMs: number, local?: LocalTime): Segment[]`; types `UsageSnapshot`, `Segment`, `LocalTime` exported from `hooks/format.ts`.

Segments, concatenated, read exactly like the format line; a colored segment's text is just `NN%`.

- [ ] Write tests (UTC `LocalTime`, now = 2026-10-16T12:00Z): full (`ctx 42%`(yellow) ... `(16:45)` ... `(Mon 09:00)`); empty snapshot → `ctx — · 5h — · 7d —`; one window; each boundary; 89.6/74.4 rounding; spend_limit ignored; resetsAt missing → no parentheses.
- [ ] Run `claude plugin test plugins/usage-statusline` → FAIL.
- [ ] Implement; run → PASS. Commit `feat(usage-statusline): format usage segments`.

### Task 2: `register.tsx` + manifest + contract

**Files:** Create `hooks/register.tsx`, `hooks/hooks.json` (replace), `types/index.d.ts`, `tests/render.test.tsx`; modify `.claude-plugin/plugin.json` (0.2.0, `types`).

**Interfaces — Consumes:** `formatUsage`, `UsageSnapshot` from Task 1.

- [ ] Write render tests for `['terminal','desktop']`: with seeded usage, the mounted `PromptHint` contains a Text reading the format line; the drawing still contains the engine node; with no usage, row shows `—`s.
- [ ] Run → FAIL. Implement; run → PASS; `claude plugin validate plugins/usage-statusline` clean.
- [ ] Remove `scripts/`, `commands/`, old bash tests. Commit `feat(usage-statusline): draw usage row under the prompt hint (mod)`.

### Task 3: Live check, docs, CI

- [ ] Uninstall v0.1.0 locally, remove `statusLine` from `~/.claude/settings.json` (after backup) and `~/.claude/statusline/`.
- [ ] Symlink `~/.claude/dev-mods/<session>/usage-statusline` → repo plugin; the person enables hot reload; confirm the row shows under "auto mode on", right-aligned.
- [ ] README (install line, look, colors, requirements: Claude Code ≥ 2.1.301 terminal/desktop), marketplace description, CI (validate + test if CLI runs unauthenticated, else JSON validate). Commit.
- [ ] After the person approves the look: merge to main, push, CI green, `claude plugin update usage-statusline@mlavrk`.
