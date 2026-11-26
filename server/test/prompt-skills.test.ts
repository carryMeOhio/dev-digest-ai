import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';

/**
 * Skills-in-prompt assembly (pure, no LLM).
 *
 * The run-executor resolves an agent's linked+enabled skills into named blocks
 * and passes them as `skills`. `assemblePrompt` renders them as a single
 * `## Skills / rules` section placed AFTER `## PR description` and BEFORE
 * `## Relevant memory`.
 *
 * The load-bearing property is the LAST test: with no active skills the section
 * vanishes entirely and the user message is byte-identical to a run without the
 * feature. That is what makes the skills-off / skills-on control experiment a
 * clean A/B rather than two prompts that differ in incidental ways.
 */

const COMMON = {
  system: 'You are a reviewer.',
  memory: ['Do not flag try/catch around JSON.parse'],
  diff: '@@ -1 +1 @@\n+stripeKey',
  task: "Review PR #482 'rate limit'",
  prDescription: 'Adds a rate limiter.',
} as const;

// Shaped exactly as RunExecutor.resolveSkills builds them.
const BLOCKS = [
  '### Skill: test-branch-coverage\nFlag tests that exercise only one branch.',
  '### Skill: no-over-mocking\nFlag a test that mocks the unit under test.',
];

describe('assemblePrompt + skills', () => {
  it('renders ## Skills / rules after PR description and before Relevant memory', () => {
    const { messages } = assemblePrompt({ ...COMMON, skills: BLOCKS });
    const user = messages[1]!.content;

    const idxDesc = user.indexOf('## PR description');
    const idxSkills = user.indexOf('## Skills / rules');
    const idxMemory = user.indexOf('## Relevant memory');
    const idxDiff = user.indexOf('## Diff to review');

    expect(idxDesc).toBeGreaterThan(-1);
    expect(idxSkills).toBeGreaterThan(idxDesc);
    expect(idxMemory).toBeGreaterThan(idxSkills);
    expect(idxDiff).toBeGreaterThan(idxMemory);
  });

  it('keeps each skill a separately-labelled block, in the order given', () => {
    const { messages } = assemblePrompt({ ...COMMON, skills: BLOCKS });
    const user = messages[1]!.content;

    expect(user).toContain('### Skill: test-branch-coverage');
    expect(user).toContain('### Skill: no-over-mocking');
    // Order is the agent's configured order, not alphabetical.
    expect(user.indexOf('### Skill: test-branch-coverage')).toBeLessThan(
      user.indexOf('### Skill: no-over-mocking'),
    );
  });

  it('records the skills block in the trace assembly', () => {
    const { assembly } = assemblePrompt({ ...COMMON, skills: BLOCKS });
    expect(assembly.skills).toContain('### Skill: test-branch-coverage');
    expect(assembly.skills).toContain('### Skill: no-over-mocking');
  });

  it('does NOT wrap skill bodies as untrusted data', () => {
    // Deliberate: a skill is an instruction the user vetted and enabled. Wrapping
    // it in <untrusted> would tell the model to treat it as data and ignore it,
    // which would make every skill inert. The safety boundary is the enable
    // toggle (imports arrive disabled), not delimiter-fencing.
    const { messages } = assemblePrompt({ ...COMMON, skills: BLOCKS });
    const user = messages[1]!.content;
    const section = user.slice(
      user.indexOf('## Skills / rules'),
      user.indexOf('## Relevant memory'),
    );
    expect(section).not.toContain('<untrusted');
  });

  it('omits the section entirely when no skill is active (byte-identical prompt)', () => {
    const withNone = assemblePrompt({ ...COMMON });
    const withEmpty = assemblePrompt({ ...COMMON, skills: [] });
    const withUndefined = assemblePrompt({ ...COMMON, skills: undefined });

    expect(withEmpty.messages[1]!.content).toBe(withNone.messages[1]!.content);
    expect(withUndefined.messages[1]!.content).toBe(withNone.messages[1]!.content);
    expect(withNone.messages[1]!.content).not.toContain('## Skills / rules');
    expect(withNone.assembly.skills ?? null).toBeNull();
  });

  it('a disabled skill changes nothing: on/off differ only by the skills section', () => {
    const on = assemblePrompt({ ...COMMON, skills: BLOCKS }).messages[1]!.content;
    const off = assemblePrompt({ ...COMMON, skills: [] }).messages[1]!.content;

    // Everything that is not the skills section survives untouched.
    const onWithoutSkills = on.replace(
      on.slice(on.indexOf('## Skills / rules'), on.indexOf('## Relevant memory')),
      '',
    );
    expect(onWithoutSkills).toBe(off);
  });
});
