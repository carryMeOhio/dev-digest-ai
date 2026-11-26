import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { eq } from 'drizzle-orm';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD over HTTP: create/read/update/delete, the body-only version rule,
 * workspace scoping, and the import preview's "nothing is saved" contract.
 */
d('skills module', () => {
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

  const body = {
    name: 'branch-coverage',
    description: 'Flag tests that exercise only one branch.',
    type: 'rubric' as const,
    body: '# Branch coverage\n\nEvery guard needs a test on both sides.',
  };

  it('creates a skill, lists it, and fetches it by id', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: body });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: 'branch-coverage',
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const one = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().body).toContain('Every guard needs a test');
    await app.close();
  });

  it('creates a version for every CONTENT edit, but not for an enable toggle', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'v-rules' } })
    ).json().id as string;
    const put = (payload: object) =>
      app.inject({ method: 'PUT', url: `/skills/${id}`, payload }).then((r) => r.json());

    expect((await put({ name: 'v-rules-renamed' })).version).toBe(2);
    expect((await put({ description: 'Flag something else.' })).version).toBe(3);
    expect((await put({ type: 'convention' })).version).toBe(4);
    expect((await put({ body: '# Rewritten' })).version).toBe(5);

    // Turning a skill on or off is not an edit of the skill.
    const toggled = await put({ enabled: false });
    expect(toggled.version).toBe(5);
    expect(toggled.enabled).toBe(false);

    // Saving identical content is not an edit either.
    expect((await put({ body: '# Rewritten' })).version).toBe(5);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([5, 4, 3, 2, 1]);
    // Each version is a FULL snapshot, so a restore can bring everything back.
    expect(versions[4]).toMatchObject({ version: 1, name: 'v-rules', type: 'rubric' });
    expect(versions[0]).toMatchObject({
      version: 5,
      name: 'v-rules-renamed',
      description: 'Flag something else.',
      type: 'convention',
      body: '# Rewritten',
      restored_from: null,
    });
    await app.close();
  });

  it('restores an old version as a NEW version, never rewriting history', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'restorable' } })
    ).json().id as string;
    await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { name: 'restorable-v2', body: '# v2 body' },
    });

    const restored = await app.inject({ method: 'POST', url: `/skills/${id}/versions/1/restore` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({
      version: 3,
      name: 'restorable',
      body: body.body,
      type: 'rubric',
    });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].restored_from).toBe(1);
    // v2 is still there, so the restore itself can be undone.
    expect(versions[1].name).toBe('restorable-v2');
    await app.close();
  });

  it('404s restoring a version that does not exist', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'no-v9' } })
    ).json().id as string;
    const res = await app.inject({ method: 'POST', url: `/skills/${id}/versions/9/restore` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns usage stats with the agents that use the skill', async () => {
    const app = await makeApp();
    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const seeded = skills.find((s: { name: string }) => s.name === 'test-branch-coverage');

    // The list carries a usage rollup for the cards.
    expect(seeded.usage).toMatchObject({ agents: 1, window_days: 30 });

    const stats = (await app.inject({ method: 'GET', url: `/skills/${seeded.id}/stats` })).json();
    expect(stats.agent_links.map((l: { agent_name: string }) => l.agent_name)).toEqual([
      'Test Quality Reviewer',
    ]);
    // No reviews have run in this fixture: rates are null ("—"), never a fake 0%.
    expect(stats.runs).toBe(0);
    expect(stats.accept_rate).toBeNull();
    expect(stats.avg_tokens).toBeNull();
    await app.close();
  });

  it('deletes a skill', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'doomed' } })
    ).json().id as string;

    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('422s a malformed id rather than 404ing downstream', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/skills/not-a-uuid' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('refuses to create an imported skill already enabled', async () => {
    // A skill body becomes trusted instructions in an agent's prompt, so an
    // upload can never switch itself on — even if the request asks for it.
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...body, name: 'from-outside', source: 'imported_file', enabled: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().enabled).toBe(false);
    expect(res.json().source).toBe('imported_file');
    await app.close();
  });

  it('previews an imported archive WITHOUT saving anything', async () => {
    const app = await makeApp();
    const archive = zipSync({
      'pack/SKILL.md': strToU8(
        '---\nname: imported-gate\ndescription: Flag breaking route changes.\ntype: rubric\n---\n\nCheck it.',
      ),
      'pack/scripts/run.sh': strToU8('#!/bin/sh\necho pwned'),
    });

    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        filename: 'pack.zip',
        content_b64: Buffer.from(archive).toString('base64'),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'imported-gate',
      type: 'rubric',
      source: 'imported_file',
      ignored_entries: ['pack/scripts/run.sh'],
    });

    // The preview is a parse, not a write.
    const after = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    expect(after).toBe(before);
    await app.close();
  });

  it('rejects bytes that decode fine but are not an archive', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.zip', content_b64: Buffer.from('nope').toString('base64') },
    });
    // ValidationError is 422 app-wide (same code path as a Zod body rejection).
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/could not be read/);
    await app.close();
  });

  it('rejects a malformed base64 envelope at the edge', async () => {
    // `Buffer.from(s, 'base64')` never throws — it silently drops characters it
    // does not recognise — so without the schema's .base64() this garbage would
    // reach the parser as plausible-looking bytes instead of being refused.
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.zip', content_b64: '!!! not base64 !!!' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('seeds both new agents with their skills linked and enabled', async () => {
    const app = await makeApp();
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();

    for (const name of ['Test Quality Reviewer', 'API Contract Reviewer']) {
      const agent = agents.find((a: { name: string }) => a.name === name);
      expect(agent, `${name} should be seeded`).toBeDefined();

      const links = (
        await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })
      ).json();
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((l: { enabled: boolean }) => l.enabled)).toBe(true);
      // Orders are contiguous from 0 — the prompt order the editor shows.
      expect(links.map((l: { order: number }) => l.order)).toEqual(
        links.map((_: unknown, i: number) => i),
      );
    }
    await app.close();
  });

  it('seeds the two control-experiment fixture PRs with real, reviewable patches', async () => {
    // Asserted against the DB rather than over HTTP: what matters is that
    // `pr_files.patch` holds a genuine unified diff. `diffFromPrFiles` rebuilds
    // the review diff from exactly this column, and the grounding gate drops any
    // finding that cites a line the diff does not contain — so a fixture with
    // empty patches would make the control experiment silently unfalsifiable.
    const rows = await pg.handle.db
      .select({ number: t.pullRequests.number, path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.prFiles.prId, t.pullRequests.id));

    for (const number of [701, 702]) {
      const files = rows.filter((r) => r.number === number);
      expect(files.length, `PR #${number} should have files`).toBeGreaterThan(0);
      for (const file of files) {
        expect(file.patch, `${file.path} needs a patch`).toBeTruthy();
        expect(file.patch).toContain('@@');
      }
    }

    // #701 is the happy-path test fixture; #702 renames a request field.
    expect(rows.find((r) => r.path.endsWith('discount.test.ts'))?.patch).toContain(
      'applies a percentage discount',
    );
    expect(rows.find((r) => r.number === 702 && r.path.endsWith('routes.ts'))?.patch).toContain(
      '+  account_id: z.string().uuid(),',
    );
  });

  it('does not leak skills across workspaces', async () => {
    const svc = new SkillsService({ db: pg.handle.db } as unknown as Container);
    const other = await svc.list('00000000-0000-0000-0000-000000000000');
    expect(other).toEqual([]);
    expect(
      await svc.get('00000000-0000-0000-0000-000000000000', crypto.randomUUID()),
    ).toBeUndefined();
  });
});
