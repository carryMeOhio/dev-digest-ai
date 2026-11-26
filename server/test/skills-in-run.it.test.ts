import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-in-run] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW: Review = {
  verdict: 'comment',
  summary: 'ok',
  score: 90,
  findings: [],
};

/**
 * The end of the wire: a skill attached to an agent reaches the model's prompt,
 * and is accounted for in the run trace.
 *
 * This is the automated half of the control experiment. The manual half
 * (docs/skills-control-experiment.md) shows a real model's findings change; this
 * shows the mechanism underneath is real — with a mock model, so it is
 * deterministic and needs no API key.
 */
d('skills reach the prompt and the trace', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW }) },
      },
    });
  }

  /** A fresh repo + PR per test so runs never collide. */
  async function makePr() {
    const db = pg.handle.db;
    const name = `skills-run-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 701,
        title: 'Add discount calculator and tests',
        author: 'dev.tanaka',
        branch: 'feat/x',
        base: 'main',
        headSha: 'c7f1a93b',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  /** An agent plus two skills, linked in order, with `enabled` as given. */
  async function makeAgentWithSkills(enabled: [boolean, boolean]) {
    const db = pg.handle.db;
    const tag = `r${seq}-${Date.now()}`;
    const [agent] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `Skilled ${tag}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a reviewer.',
        repoIntel: false,
        enabled: true,
      })
      .returning();

    const rows = await db
      .insert(t.skills)
      .values([
        {
          workspaceId,
          name: `first-${tag}`,
          description: 'First rule.',
          type: 'rubric',
          source: 'manual',
          body: 'FIRST_SKILL_BODY_MARKER',
          enabled: true,
        },
        {
          workspaceId,
          name: `second-${tag}`,
          description: 'Second rule.',
          type: 'convention',
          source: 'manual',
          body: 'SECOND_SKILL_BODY_MARKER',
          enabled: true,
        },
      ])
      .returning();

    await db.insert(t.agentSkills).values([
      { agentId: agent!.id, skillId: rows[0]!.id, order: 0, enabled: enabled[0] },
      { agentId: agent!.id, skillId: rows[1]!.id, order: 1, enabled: enabled[1] },
    ]);
    return { agent: agent!, skills: rows };
  }

  async function runAndGetTrace(agentId: string, prId: string): Promise<RunTrace> {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });

    const [run] = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, prId));
    expect(run!.status, run!.error ?? 'run should succeed').toBe('done');

    // The executor marks the run `done` BEFORE it persists the trace
    // (completeAgentRun, then saveRunTrace), so a terminal status does not yet
    // guarantee the trace row exists. Under a loaded parallel suite that gap is
    // observable — poll for the trace itself.
    let row: { trace: unknown } | undefined;
    for (let i = 0; i < 200 && !row; i++) {
      [row] = await pg.handle.db
        .select()
        .from(t.runTraces)
        .where(eq(t.runTraces.runId, run!.id));
      if (!row) await new Promise((r) => setTimeout(r, 25));
    }
    await app.close();
    expect(row, 'trace should be persisted').toBeDefined();
    return row!.trace as RunTrace;
  }

  it('puts every enabled skill in the prompt, in order, and accounts for it', async () => {
    const pr = await makePr();
    const { agent, skills } = await makeAgentWithSkills([true, true]);
    const trace = await runAndGetTrace(agent.id, pr.id);

    // Both bodies are in the assembled prompt, each under its own named header.
    expect(trace.prompt_assembly.skills).toContain('FIRST_SKILL_BODY_MARKER');
    expect(trace.prompt_assembly.skills).toContain('SECOND_SKILL_BODY_MARKER');
    expect(trace.prompt_assembly.skills).toContain(`### Skill: ${skills[0]!.name}`);
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');

    // Configured order is prompt order.
    const skillsBlock = trace.prompt_assembly.skills!;
    expect(skillsBlock.indexOf('FIRST_SKILL_BODY_MARKER')).toBeLessThan(
      skillsBlock.indexOf('SECOND_SKILL_BODY_MARKER'),
    );

    // And the trace says which skills ran and what each cost.
    expect(trace.skills_applied.map((s) => s.name)).toEqual([
      skills[0]!.name,
      skills[1]!.name,
    ]);
    expect(trace.skills_applied.map((s) => s.order)).toEqual([0, 1]);
    for (const applied of trace.skills_applied) {
      expect(applied.tokens).toBeGreaterThan(0);
    }

    // The live log names each one, so the SSE stream shows it too.
    const log = trace.log.map((l) => l.msg).join('\n');
    expect(log).toContain(`skill "${skills[0]!.name}"`);
    expect(log).toContain('skills: 2 attached');
  });

  it('a link-disabled skill contributes nothing at all', async () => {
    const pr = await makePr();
    const { agent, skills } = await makeAgentWithSkills([true, false]);
    const trace = await runAndGetTrace(agent.id, pr.id);

    expect(trace.prompt_assembly.skills).toContain('FIRST_SKILL_BODY_MARKER');
    expect(trace.prompt_assembly.skills).not.toContain('SECOND_SKILL_BODY_MARKER');
    expect(trace.skills_applied.map((s) => s.name)).toEqual([skills[0]!.name]);
    expect(trace.log.map((l) => l.msg).join('\n')).not.toContain(`skill "${skills[1]!.name}"`);
  });

  it('a globally-disabled skill is excluded even when the link is on', async () => {
    const pr = await makePr();
    const { agent, skills } = await makeAgentWithSkills([true, true]);
    // Turn the second one off on the Skills page; the agent link stays enabled.
    await pg.handle.db
      .update(t.skills)
      .set({ enabled: false })
      .where(eq(t.skills.id, skills[1]!.id));

    const trace = await runAndGetTrace(agent.id, pr.id);
    expect(trace.skills_applied.map((s) => s.name)).toEqual([skills[0]!.name]);
    expect(trace.prompt_assembly.skills).not.toContain('SECOND_SKILL_BODY_MARKER');
  });

  it('with no skills active there is no skills section anywhere', async () => {
    // The control: this prompt is what the agent sent before skills existed.
    const pr = await makePr();
    const { agent } = await makeAgentWithSkills([false, false]);
    const trace = await runAndGetTrace(agent.id, pr.id);

    expect(trace.prompt_assembly.skills ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    expect(trace.skills_applied).toEqual([]);
    expect(trace.log.map((l) => l.msg).join('\n')).toContain('skills: none attached');
  });
});
