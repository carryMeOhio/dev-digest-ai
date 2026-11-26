# Reviewer-core insights

Non-obvious findings from working on `@devdigest/reviewer-core`. Appended by the `engineering-insights` skill. Read on task start; append on task end. See [`.claude/skills/engineering-insights/rubrics.md`](../.claude/skills/engineering-insights/rubrics.md) for what goes in each section.

## What Works

### Omit-when-empty in assemblePrompt is a load-bearing invariant, not a nicety
**Date:** 2026-11-26
**Evidence:** `reviewer-core/src/prompt.ts:109`

With an empty/absent `skills` array the whole `## Skills / rules` section disappears, so a skills-off run assembles a byte-identical prompt to a pre-skills run. That is what makes the with/without control experiment valid — anything else (an empty section, a "none" placeholder) would make the comparison measure two differences at once. Pinned by `server/test/prompt-skills.test.ts`.

## What Doesn't Work

## Codebase Patterns

### The engine takes resolved strings; callers own all naming and lookup
**Date:** 2026-11-26
**Evidence:** `reviewer-core/src/review/run.ts:55`

`skills`, `memory` and `specs` are resolved bodies, never slugs or records. The studio resolves skills from the DB and prefixes `### Skill: <name>` before calling in; the CI runner resolves from the filesystem. Keep record-shaped logic out of this package — it has no DB, no filesystem, and no knowledge of what a skill row looks like.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
