# Control experiment: what do skills actually buy you?

A skill is only worth its tokens if the review changes when you attach it. This
is the procedure for showing that, on two seeded PRs, for two agents.

It is a **control experiment**, not a demo: the only thing that differs between
the two runs is whether the skills are enabled. Everything else — agent, model,
prompt, PR, diff — is held fixed.

## Why it is a fair comparison

`assemblePrompt` omits the whole `## Skills / rules` section when no skill is
active, so the skills-off prompt is **byte-identical** to the skills-on prompt
minus that one section. Nothing else shifts: no reordering, no whitespace, no
"skills: none" placeholder. That invariant is pinned by
`server/test/prompt-skills.test.ts`, so if someone breaks it the test fails
rather than the experiment quietly becoming meaningless.

The two agents' prompts are also deliberately thin — they carry the role and the
output conventions, and nothing about which branches or which route changes to
look for. Those rules live only in the skills. If they were duplicated in the
prompt, turning the skills off would change nothing and prove nothing.

## Setup

```sh
docker compose up -d
cd server && pnpm db:migrate && pnpm db:seed && pnpm dev
cd client && pnpm dev
```

The seed creates the two agents, their skills, and the two fixture PRs on
`acme/payments-api`. A real model is required: configure an API key under
**Settings → API Keys** first. The seeded agents default to
`openrouter / deepseek-v4-flash`, which is cheap enough to run several times.

## The two cases

| PR | Agent | Skills attached | What the skills should surface |
|----|-------|-----------------|-------------------------------|
| **#701** "Add discount calculator and tests" | Test Quality Reviewer | `test-branch-coverage`, `test-edge-cases`, `no-over-mocking` | The `percent > 100` and `quantity === 0` branches are never reached; `priceFor` is mocked, so the test would pass against a stubbed implementation |
| **#702** "Tighten the payments list endpoint schema" | API Contract Reviewer | `api-breaking-change-gate`, `route-signature-checklist` | `user_id` → `account_id` and `status` → `state` break every existing caller, with no deprecation window |

Both PRs are written to look fine. The code is clean, named well, and does what
the title says — a reviewer with no specific rule has little reason to object.
That is the point: a PR with an obvious bug would be caught either way.

## Procedure (repeat per agent)

1. **Run without skills.**
   Open the agent → **Skills** tab → untick every skill → **Save skills**.
   Go to the PR → **Run review** → pick that agent.
   Record the verdict and the findings.

2. **Run with skills.**
   Back to the **Skills** tab → tick them all → **Save skills**.
   Run the review on the same PR again.
   Record the verdict and the findings.

3. **Read the trace for both runs.**
   On the PR, open **Agent runs** → the logs icon on a run → **Trace** tab →
   expand **Prompt assembly**.

   | Skills off | Skills on |
   |---|---|
   | No **Skills applied** strip | The strip lists each skill, in prompt order, with its token cost |
   | No **Skills (dynamic)** block at all | The block is present, badged with the tokens it added |
   | Live log says `skills: none attached` | Live log has one `skill "<name>" … attached — ~N token(s)` line per skill, then a total |

   The token numbers are estimates — counted with `cl100k_base` at assembly
   time, not the serving model's own tokenizer — so read them as "roughly what
   this skill costs", not as a billing figure.

## Reading the result honestly

This is one run per condition against a non-deterministic model. A single pair
of runs shows the mechanism works; it does not establish an effect size. If you
want a number rather than a demonstration:

- Run each condition several times and compare how often the target finding
  appears, not whether it appeared once.
- Expect the skills-off run to *sometimes* catch the issue anyway. A capable
  model with a good role prompt is not blind — the claim is that the skill makes
  it reliable and specific, not that it is the only path to the finding.
- A skills-on run that produces *more* findings is not automatically better.
  Check them against the diff: the grounding gate drops findings that cite a
  line that is not there, but it cannot tell you a surviving finding is useful.

If the skills-on run adds nothing on either PR, that is a real result about
those skill bodies, and the bodies are editable on the Skills page — that is
what the page is for.

## Importing a skill, end to end

The library ships five skills, all authored in the editor. To exercise the
import path as well:

```sh
./scripts/make-skill-archive.sh     # → dist/api-contract-pack.zip
```

**Skills → Add Skill → Import from file** → pick the zip.

The preview shows the parsed skill, and lists `api-contract-pack/scripts/run.sh`
under **Ignored — not imported, not executed**. Nothing has been written at this
point; `GET /skills` does not have it yet. Confirm, and it is saved **disabled**,
marked *needs vetting*.

That last part is the trust boundary, and it is the reason import exists as two
calls rather than one. A skill body is not data the model analyses — it is
appended to the agent's prompt as instructions the model follows. Wrapping it in
`<untrusted>` would make it safe and useless in the same stroke, because the
injection guard tells the model to ignore instructions inside those delimiters.
So the protection is not parsing; it is that someone read it and switched it on.
