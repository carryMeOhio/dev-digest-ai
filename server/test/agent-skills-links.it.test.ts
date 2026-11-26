import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { FastifyInstance } from 'fastify';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-skills] Docker not available — skipping integration tests.');
}

/**
 * The agent↔skill link table as the editor's Skills tab drives it: attach,
 * reorder, toggle off without losing the slot, and detach.
 *
 * The property that matters is that a DISABLED link keeps its `order`. If
 * unchecking a skill dropped the row, re-checking it would silently move the
 * skill to the end of the prompt — changing behaviour the user never asked to
 * change.
 */
d('agent skill links', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function makeSkill(app: FastifyInstance, name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: `${name} desc`, type: 'rubric', body: `# ${name}` },
    });
    return res.json().id as string;
  }

  async function makeAgent(app: FastifyInstance, name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    return res.json().id as string;
  }

  it('attaches, reorders and toggles links in one save', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app, `Linker ${Date.now()}`);
    const a = await makeSkill(app, `link-a-${Date.now()}`);
    const b = await makeSkill(app, `link-b-${Date.now()}`);
    const c = await makeSkill(app, `link-c-${Date.now()}`);

    // Attach three, middle one off.
    const saved = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        links: [
          { skill_id: a, enabled: true },
          { skill_id: b, enabled: false },
          { skill_id: c, enabled: true },
        ],
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual([
      { agent_id: agentId, skill_id: a, order: 0, enabled: true },
      { agent_id: agentId, skill_id: b, order: 1, enabled: false },
      { agent_id: agentId, skill_id: c, order: 2, enabled: true },
    ]);

    // The disabled link KEEPS its slot — it is attached, just not contributing.
    const read = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(read.json()[1]).toMatchObject({ skill_id: b, order: 1, enabled: false });

    // Reorder: c first, and switch b back on in place.
    const reordered = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        links: [
          { skill_id: c, enabled: true },
          { skill_id: b, enabled: true },
          { skill_id: a, enabled: true },
        ],
      },
    });
    expect(reordered.json().map((l: { skill_id: string }) => l.skill_id)).toEqual([c, b, a]);
    await app.close();
  });

  it('still accepts the skill_ids shorthand (all enabled)', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app, `Shorthand ${Date.now()}`);
    const a = await makeSkill(app, `sh-a-${Date.now()}`);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a] },
    });
    expect(res.json()).toEqual([
      { agent_id: agentId, skill_id: a, order: 0, enabled: true },
    ]);
    await app.close();
  });

  it('detaches a skill', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app, `Detach ${Date.now()}`);
    const a = await makeSkill(app, `det-a-${Date.now()}`);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a] },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/agents/${agentId}/skills/${a}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('404s linking against an agent in another workspace', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${crypto.randomUUID()}/skills`,
      payload: { skill_ids: [] },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rejects a save that names neither links nor skill_ids nor skill_id', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app, `Empty ${Date.now()}`);
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
