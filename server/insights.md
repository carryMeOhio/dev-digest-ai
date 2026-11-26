# Server insights

Non-obvious findings from working on `@devdigest/api`. Appended by the `engineering-insights` skill. Read on task start; append on task end. See [`.claude/skills/engineering-insights/rubrics.md`](../.claude/skills/engineering-insights/rubrics.md) for what goes in each section.

## What Works

## What Doesn't Work

### multi_agent_runs is declared but never written
**Date:** 2026-11-22
**Evidence:** `server/src/db/schema/runs.ts:41`

The `multi_agent_runs` table and the `agent_runs.multi_agent_run_id` concept are declared for a future milestone but no code writes to them, and `agent_runs` has no FK linking back. Treat the table as absent when aggregating cross-agent data — group by (`pr_id`, `agent_id`) on `agent_runs` directly. Adding a proper batch ID is a pending refactor, not a quick workaround.

### PR-list score from the single newest review masks failing agents
**Date:** 2026-11-22
**Evidence:** `server/src/modules/pulls/status.ts` (worstLatestScoreByPr)

A multi-agent run writes one review per agent, often within the same second. Picking the newest review per PR shows whichever agent finished last (e.g. a 100 from Performance hiding two 0s). Aggregate per agent first (latest review per `agent_id`), then take the MIN score — the worst agent gates the PR.

### Never wrap skill bodies in wrapUntrusted
**Date:** 2026-11-26
**Evidence:** `server/src/modules/reviews/run-executor.ts:444`

A skill body is an instruction the user vetted and switched on, so it is joined into `## Skills / rules` raw. Wrapping it in `<untrusted>` makes it inert: INJECTION_GUARD tells the model everything inside those delimiters is data to analyse and never an instruction to follow, so a "hardened" skill is a skill the model ignores. The safety boundary is human vetting instead — `SkillsService.create` forces `enabled: false` for any non-manual source, so an upload can never switch itself on.

### A `done` agent_run does not yet have a run_traces row
**Date:** 2026-11-27
**Evidence:** `server/src/modules/reviews/run-executor.ts:261`, `server/src/modules/reviews/run-executor.ts:307`

`runOneAgent` calls `completeAgentRun` (status → `done`) and only afterwards `saveRunTrace`, so for a moment a terminal run has no trace row. `waitForPrRuns` (`server/test/helpers/runs.ts`) returns on status alone, so a test that reads `run_traces` straight after it is racy: it passes in isolation and fails under a loaded parallel suite with `Cannot read properties of undefined (reading 'trace')`. Poll for the trace row itself. The UI is unaffected because it waits for the SSE completion event, which fires after the save.

## Codebase Patterns

### PR-list cost aggregation: sum latest completed run per distinct agent
**Date:** 2026-11-22
**Evidence:** `server/src/modules/pulls/routes.ts:132`

For each PR, pick the latest `status='done'` run per distinct `agent_id`, then sum their `cost_usd`. If any contributing run has `cost_usd = null`, the PR aggregate is null — don't silently under-report. This mirrors how the list's `score` is derived (latest review per PR), and is the pragmatic stand-in until `multi_agent_runs` becomes the batch primitive.

> **Superseded 2026-11-22:** the list's `score` is no longer "latest review per PR" — it is now latest review per agent, then the minimum (`worstLatestScoreByPr`), matching this per-agent cost rule.

> **Superseded 2026-11-22 (cost):** PR-list `cost_usd` is now the TOTAL over ALL agent runs on the PR (every agent, every re-run) — `totalRunCostByPr` in `server/src/modules/pulls/status.ts`. Runs with no recorded cost (failed/cancelled/running store null) add nothing; a `done` run with unknown cost still makes the total null. Score and findings remain per-agent-latest; cost deliberately does not, because re-runs are real spend.

### Vendored shared contracts drift on comments, not fields — check fields, not files
**Date:** 2026-11-22
**Evidence:** `server/src/vendor/shared/contracts/trace.ts`

`server/src/vendor/shared` and `client/src/vendor/shared` are kept in sync by hand. Running `diff -r` between them is noisy because pre-existing comment drift accumulates (e.g. internal task IDs trimmed on one side). After schema edits, verify sync with `grep -n <new_field_name>` on both copies — field parity is the invariant, byte-for-byte parity isn't.

> **Superseded 2026-11-26:** Field parity is NOT the invariant either — the client copy is missing whole exports (`AgentVersionConfig`, `AgentVersion`), not just comments. Never blanket-copy one side over the other; apply the same targeted edit to both files.

### Skills are resolved and named in run-executor, never in reviewer-core
**Date:** 2026-11-26
**Evidence:** `server/src/modules/reviews/run-executor.ts:444`

`resolveSkills` applies BOTH gates (`skills.enabled` globally and `agent_skills.enabled` per agent), prefixes each body with `### Skill: <name>`, counts tokens via `container.tokenizer`, and emits one log line per skill. The engine stays pure — it takes resolved strings and knows nothing about skill records. Add skill-shaped logic here, not in `reviewer-core/src/prompt.ts`.

### agent_skills.enabled exists so a disabled link keeps its order slot
**Date:** 2026-11-26
**Evidence:** `server/src/db/migrations/0011_mysterious_jackal.sql:1`

Unchecking a skill in the agent's Skills tab sets `enabled=false` and keeps the row; only unlinking drops it. Without the column, uncheck→recheck silently moves the skill to the end of the prompt — a behaviour change the user never asked for. Pinned by `test/agent-skills-links.it.test.ts`.

### Reviewer prompts carry the role; the rules live in skills
**Date:** 2026-11-26
**Evidence:** `server/src/db/seed-prompts.ts:255`

`TEST_QUALITY_REVIEWER_PROMPT` and `API_CONTRACT_REVIEWER_PROMPT` deliberately omit the checklists they review by — those are seeded skills. Duplicating a rule into the prompt makes the skills-off control experiment measure nothing. Test: if you'd want a second agent to apply the rule, or want to switch it off to see its effect, it is a skill.

## Tool & Library Notes

### Drizzle text(col, { enum }) emits plain text — no CHECK constraint
**Date:** 2026-11-26
**Evidence:** `server/src/db/migrations/0000_init.sql:316`

`skills.source` is `"source" text NOT NULL` in SQL; the enum is a TypeScript-level constraint only. Adding `'imported_file'` needed no migration, just the three TS locations (`db/schema/skills.ts` plus both vendored `contracts/knowledge.ts` copies). Check the emitted SQL before assuming an enum widening needs a migration.

### New RunTrace fields must carry .default([]) or old traces fail to parse
**Date:** 2026-11-26
**Evidence:** `server/src/vendor/shared/contracts/trace.ts:95`

`run_traces` holds one jsonb document per run and `buildRunTrace` validates on write, but reads re-parse persisted documents. `skills_applied` is `.default([])` so every trace written before the skills feature still parses. A required field here breaks the trace drawer for all history.

### drizzle-kit emits `ADD COLUMN … NOT NULL` with no default, which fails on any populated table
**Date:** 2026-11-27
**Evidence:** `server/src/db/migrations/0012_cheerful_ma_gnuci.sql:1`

Adding a required column to a table that already has rows makes `pnpm db:generate` produce a bare `ADD COLUMN "x" text NOT NULL`, which Postgres rejects. It looks fine in a fresh testcontainers DB (empty tables), so only a real dev DB catches it. Hand-edit the generated SQL: add the column nullable, backfill (e.g. `UPDATE … FROM` the parent row), then `ALTER COLUMN … SET NOT NULL`. Keep the schema file as `.notNull()`; only the migration SQL changes.

## Recurring Errors & Fixes

## Session Notes

### 2026-11-22 — Run Cost Badge: cost_usd restored on agent_runs; wired through 3 routes
**Date:** 2026-11-22
**Evidence:** `server/src/db/migrations/0010_hesitant_texas_twister.sql`

`cost_usd` (double precision, nullable) was previously dropped in migration `0009_complex_runaways.sql`; migration `0010` restores it. Data was already flowing in `ReviewOutcome` (`reviewer-core`) and in OpenRouter's native `usage.cost` — the gap was pure persistence + serialization. Changes: `completeAgentRun`, `listRunsForPull`, `run-executor.ts` destructure, `RunStats`/`RunSummary`/`PrMeta` contracts, `/pulls` aggregation block.

### 2026-11-26 — Skills (M2): the feature was 60% built and disconnected
**Date:** 2026-11-26
**Evidence:** `server/src/modules/reviews/run-executor.ts:215`

The `skills`/`skill_versions`/`agent_skills` tables shipped in `0000_init.sql`, the Zod contracts existed, `GET/POST /agents/:id/skills` was fully implemented, `assemblePrompt` had a `skills` slot, the trace drawer rendered a skills `PromptBlock`, and `messages/en/skills.json` was complete. The only broken wire was run-executor never passing `skills:`. Survey existing scaffolding in this repo before building — several other milestones (conventions, memory, eval) are scaffolded the same way.

## Open Questions
