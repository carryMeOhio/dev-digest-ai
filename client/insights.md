# Client insights

Non-obvious findings from working on `@devdigest/web`. Appended by the `engineering-insights` skill. Read on task start; append on task end. See [`.claude/skills/engineering-insights/rubrics.md`](../.claude/skills/engineering-insights/rubrics.md) for what goes in each section.

## What Works

## What Doesn't Work

### Window-level finding shortcuts fire behind modals
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:58`

FindingsPanel's j/k/a/d keyboard handler is attached to `window`, so it keeps firing while any modal is open — pressing `a`/`d` would silently accept/dismiss the focused finding behind the dialog. Any modal opened from the panel must gate the handler on its open state (early-return).

### A scaffolded i18n namespace's prefix doesn't mean what it looks like
**Date:** 2026-11-27
**Evidence:** `client/messages/en/conventions.json` (card.acceptAsSkill)

`conventions.json` had `card.acceptAsSkill: "Accept as Skill"` pre-written under the `"card"` object, but it is the PAGE-HEADER button that turns every accepted candidate into one skill — not a per-card action. The per-card accept button needed its own new key (`card.accept`) because none existed. Don't infer a key's scope from its JSON nesting when auditing a scaffolded i18n file; check the feature spec/screenshot for what each string is actually for.

## Codebase Patterns

### PR-list grid: GRID string + COLUMN_KEYS array must update in lockstep
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/constants.ts:28`

Adding or removing a column in the PR list requires editing two things in the same order: the `GRID` CSS template (`1fr 132px 92px 60px …`) and the `COLUMN_KEYS` array that feeds the header row's i18n lookup. They are not derived from a single source; a mismatch silently misaligns headers and cells. Also add a matching `list.columns.<key>` entry to every `messages/<locale>/prReview.json`.

### Kit Modal: no Escape handling, header X is labelled "Close"
**Date:** 2026-11-22
**Evidence:** `client/src/vendor/ui/kit/Modal.tsx:58`

`Modal` from `@devdigest/ui` only closes via backdrop click or the header IconBtn — add a local `keydown` Escape listener in the consumer. The header button's accessible name is "Close", so a footer "Close" button makes `getByRole("button", { name: "Close" })` ambiguous in tests; use `getAllByRole` or scope with `within(...)`.

### PR-list popovers must portal: the table card clips overflow
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/styles.ts` (tableCard)

`tableCard` has `overflow: hidden`, so an absolutely-positioned popover inside a row is cut off. Render it with `createPortal` to `document.body`, `position: fixed` from the trigger's rect, and cap `maxHeight` to the space on the chosen side (`placePopover` in `_components/FindingsCell/helpers.ts`).

### Mutations that touch findings/reviews must also invalidate ["pulls"]
**Date:** 2026-11-22
**Evidence:** `client/src/lib/hooks/reviews.ts` (useFindingAction)

The PR list's score + FINDINGS counts are derived server-side from reviews and non-dismissed findings. Dismissing a finding or deleting a run/review must invalidate the `["pulls"]` prefix, not just `["reviews", prId]`, or the list shows stale counts until an unrelated refetch.

### Kit Checkbox is a button with role="checkbox"; FormField labels aren't associated
**Date:** 2026-11-26
**Evidence:** `client/src/vendor/ui/kit/Checkbox.tsx:26`

`Checkbox` renders `<button role="checkbox">`, so `querySelector('input[type=checkbox]')` finds nothing. Pass the row's name via `label` to give it an accessible name, then query `getByRole("checkbox", { name })`. `FormField` renders its label as a plain div with no `htmlFor`, so inputs inside it have no accessible name — query the element directly.

### Kit Modal leaves body padding and footer layout to the caller
**Date:** 2026-11-27
**Evidence:** `client/src/vendor/ui/kit/Modal.tsx:60`

The body wrapper is `{ flex: 1, overflow: "auto" }` with no padding, so form fields sit flush against the modal border. The footer is padded but not a flex container, so two buttons render touching. Every modal must wrap its children in `{ padding: 24 }` and its footer buttons in `{ display: "flex", gap: 10, justifyContent: "flex-end" }` — copy `CreateAgentModal/styles.ts` rather than assuming the kit does it.

## Tool & Library Notes

### Number.toPrecision(n) switches to scientific notation below ~1e-6
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/helpers.ts`

`(1.23e-7).toPrecision(3)` returns `"1.23e-7"`, which is unfit for a user-facing badge. Guard numeric formatters by testing `/e/i` on the output and falling back to `toFixed(n).replace(/0+$/, "")` for the ultra-tiny branch. `parseFloat(toPrecision(3)).toString()` is also useful to strip trailing zeros (`"0.0120" → "0.012"`).

### jsdom has no Blob.prototype.arrayBuffer
**Date:** 2026-11-26
**Evidence:** `client/src/test/setup.ts:11`

jsdom 25 implements Blob/File but not `arrayBuffer()`, so any file-upload flow reading an uploaded file silently never calls its handler under test. Polyfilled via FileReader in the shared setup. Also note `getByDisplayValue` normalizes whitespace and so cannot match a multi-line textarea — assert on `element.value`.

## Recurring Errors & Fixes

## Session Notes

### 2026-11-22 — Run Cost Badge: one util + one component reused across 3 screens
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunCostBadge/RunCostBadge.tsx`

Feature added COST to the PR list column, the RunHistory timeline row, and the TraceBody Stats section. (Superseded 2026-11-25: `RunCostBadge` moved to `pulls/_components/` and `formatCost` to `lib/format.ts` — a parent route must not import a child route's private `_components`.) Spec rules in `formatCost`: null / undefined / exactly 0 → em-dash `—`; otherwise 3 sig figs (`$0.012`, `$1.23`); never `$0.00`.

### 2026-11-22 — Per-run severity counters + filter + modal
**Date:** 2026-11-22
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`

SeverityCounters (pill = filter button + sibling ⓘ button) and SeverityFindingsModal live next to FindingsPanel, which owns the single-select `severity` + `detailsFor` state per run. Counts come from all findings (`countBySeverity`) so they stay fixed when hide-low is on; only `visibleFindings(findings, hideLow, severity)` drives the list. Shared fixtures: `FindingsPanel/fixtures.test-data.ts` (name avoids the `*.test.ts` glob).

### 2026-11-25 — UI architecture pass (react-architecture skill)
**Date:** 2026-11-25
**Evidence:** `client/src/lib/hooks/keys.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/`

- Every `page.tsx` is a thin entry that reads params and renders one `_components/<X>View`. Orchestration goes in a colocated hook (e.g. `usePrDetailData`), and pure derivations go in `helpers.ts` with tests.
- Query keys come only from `lib/hooks/keys.ts`. The factory arrays are byte-identical to the old literals (`["pulls", repoId]`, `["pr-runs", prId]`, …), so prefix invalidation such as `pullKeys.lists` (`["pulls"]`) still matches. Keep it that way when adding keys.
- `vi.mock` must use the same specifier style the component imports. After the barrel was removed, tests mock `@/lib/hooks/<domain>`, not `@/lib/hooks`.
- Code shared by sibling routes goes up to the nearest common route: `formatFindingLocation` lives in `pulls/helpers.ts` and `RunCostBadge` in `pulls/_components/`. It goes to `lib/` only when domain-agnostic, like `formatCost`.

### 2026-11-26 — Skills UI: /skills page, agent Skills tab, trace token strip
**Date:** 2026-11-26
**Evidence:** `client/src/app/skills/_components/SkillsListView/SkillsListView.tsx:1`

Import is two calls on purpose: `POST /skills/import/preview` parses and writes nothing, then a normal create saves it disabled. Reordering uses native HTML5 drag plus ArrowUp/Down buttons — the buttons are the keyboard path and the only thing testable under jsdom, where drag events don't fire. Two pre-existing i18n strings were factually wrong and were corrected: skills are not "delimiter-wrapped", and they are not "appended below" the system message (they go in the user message under `## Skills / rules`).

### 2026-11-27 — Conventions page: ConventionsView/ConventionCard/CreateConventionSkillModal
**Date:** 2026-11-27
**Evidence:** `client/src/app/repos/[repoId]/conventions/_components/ConventionCard/ConventionCard.tsx`

Followed the `pulls` list pattern (`useActiveRepo` + `useRepoNotFound` + `<RepoNotFound/>` guard) for the repo-scoped page. `PercentProgress` (`client/src/vendor/ui/primitives/ProgressBar.tsx`) already renders the "label … pct%" + bar-beneath layout the mockup wanted for the confidence meter — no new component needed. `githubBlobUrl(repoFullName, sha, path)` works fine with a repo's `default_branch` in the `sha` slot (it's just a git ref in the URL path, not literally a commit sha), so evidence-file links don't need a PR head sha.

## Open Questions
