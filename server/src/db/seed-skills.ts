import type { SkillType } from '@devdigest/shared';

/**
 * Built-in skills shipped with the seed, and which agent each one attaches to.
 *
 * A skill is the reusable half of a reviewer: the agent prompt owns the role and
 * the output conventions, and these blocks own the specific rules. They are
 * written to be readable and editable in the Skills editor — the body is exactly
 * what gets appended to the prompt, under a `### Skill: <name>` header.
 *
 * `description` is the skill's INTERFACE. It is phrased as a directive because
 * it is what tells a reader (and the agent) when the skill applies; it is not a
 * summary of the body.
 */

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Agent names this skill is linked to, in the order they should appear. */
  agents: string[];
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'test-branch-coverage',
    description: 'Flag a test that exercises only one side of a branch in the code it covers.',
    type: 'rubric',
    agents: ['Test Quality Reviewer'],
    body: `For every function the diff adds or changes a test for, enumerate its
branches — \`if\`/\`else\`, \`switch\` arms, ternaries, short-circuits, early
returns, \`catch\` blocks — and check which ones the test actually reaches.

Report a branch as uncovered when:
- no test input satisfies the condition that reaches it, or
- the branch is reached but nothing asserts on what it produced.

Name the branch by file and line, and name the input that would reach it. A
guard that returns early on invalid input is a branch; so is an \`||\` fallback.

Do NOT report:
- branches in code the diff does not touch,
- a branch covered by an existing test elsewhere in the file,
- "more tests would be good" without naming the specific unreached branch.`,
  },
  {
    name: 'test-edge-cases',
    description:
      'Flag a test suite that covers only the happy path and skips boundary and error inputs.',
    type: 'rubric',
    agents: ['Test Quality Reviewer'],
    body: `A test suite that only proves the typical case works tells you nothing
about the cases that break in production. For the behaviour under test, check
whether these are exercised and assert-ed on:

- **Boundaries** — zero, one, the maximum, one past the maximum, negative.
- **Empty and absent** — empty string, empty array, empty object, \`null\`,
  \`undefined\`, a missing optional field.
- **Type and range violations** — a value the signature permits but the logic
  does not, e.g. a percentage above 100 or a negative quantity.
- **Error paths** — the throw, the rejected promise, the non-2xx response. An
  error path with no assertion on the error is not covered.
- **Ordering and repetition** — called twice, called out of order, called
  concurrently, where that is meaningful.

Report the specific missing case and the input that produces it. One finding per
distinct uncovered case; do not file a generic "needs edge-case tests".`,
  },
  {
    name: 'no-over-mocking',
    description:
      'Flag a test whose mocks replace the behaviour the test claims to verify.',
    type: 'convention',
    agents: ['Test Quality Reviewer'],
    body: `Mocks exist to remove I/O and non-determinism, not to remove the
subject of the test. Flag a test when:

- It mocks the unit under test, or a function in the same module, so the
  assertion only proves the mock was configured.
- It asserts on mock call counts or arguments instead of on the result or the
  observable state change — the test then pins the implementation, and any
  refactor breaks it even when behaviour is unchanged.
- The mock's stubbed return encodes the very logic being tested, so the test
  would pass against an empty implementation.
- A hermetic in-memory adapter already exists for the dependency and a bare
  \`vi.fn()\` is used instead.

Mocking an external boundary — the LLM provider, GitHub, git, the clock,
the filesystem — is correct and is NOT a finding.

For each finding, say what the test would still pass with: "this test passes if
\`applyDiscount\` returns a constant, because the mock supplies the total".`,
  },
  {
    name: 'api-breaking-change-gate',
    description:
      'Flag a route, schema or response change that breaks an existing client request.',
    type: 'rubric',
    agents: ['API Contract Reviewer'],
    body: `Treat every exported route schema and response shape as published.
A change is BREAKING when a previously-valid client request stops working or a
previously-returned value changes. Specifically:

**Request side**
- A field is removed or renamed.
- An optional field becomes required.
- An accepted type is narrowed (string → enum, number → positive int, a widened
  union losing a member).
- A route path, method or param name changes.
- A validation rule is tightened (new \`min\`/\`max\`/\`regex\`) so inputs that used
  to be accepted now 422.

**Response side**
- A field is removed, renamed or retyped.
- A nullable field becomes non-nullable or vice versa.
- A status code changes for an unchanged request.
- An array's element shape changes.

For each one, state the exact request that breaks and how it fails. Adding an
OPTIONAL request field, adding a response field, adding a route, or widening an
accepted type is additive — not a finding.`,
  },
  {
    name: 'route-signature-checklist',
    description:
      'When a route signature changes, check that every caller and shared contract was updated with it.',
    type: 'convention',
    agents: ['API Contract Reviewer'],
    body: `A route signature does not live alone. When the diff changes one,
check that the change landed everywhere it needs to:

1. **The shared contract** — this repo vendors its Zod contracts into both the
   server and the web client. A schema changed in one copy and not the other is
   a defect, not a style issue: the client will fail to parse a valid response.
2. **The callers** — the typed fetch wrappers and the query hooks that call this
   route. A renamed field in the schema with the old name still sent by a caller
   is a 422 at runtime that no type-check catches across the package boundary.
3. **The migration path** — if the change is breaking, does the diff provide one
   (accept both shapes, a version, a deprecation window)? If it provides none,
   say so; that is the finding.
4. **The tests** — does an existing test still assert the OLD shape? If so, it
   either fails or was quietly updated to match the break; say which.

Report each missed location separately, citing the file and line that still
carries the old signature.`,
  },
];
