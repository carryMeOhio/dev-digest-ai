import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, MockRepoIntel } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SAMPLE_PATHS = ['src/entities/Order.ts', 'src/entities/Ticket.ts', 'src/util/noise.ts'];

const FILE_SELECTION = { paths: ['src/entities/Order.ts', 'src/entities/Ticket.ts'] };

const EXTRACTION = {
  conventions: [
    {
      rule: 'Always use TypeORM entity decorators to define database models',
      evidence_path: 'src/entities/Order.ts',
      evidence_snippet: '@Entity("orders")',
      confidence: 0.9,
    },
    {
      rule: 'A hallucinated rule citing a file never read',
      evidence_path: 'src/entities/Ghost.ts',
      evidence_snippet: 'whatever',
      confidence: 0.8,
    },
    {
      rule: 'A rule whose snippet does not actually appear in the file',
      evidence_path: 'src/entities/Ticket.ts',
      evidence_snippet: 'this text is nowhere in the file',
      confidence: 0.7,
    },
  ],
};

const FILES = {
  'src/entities/Order.ts': '@Entity("orders")\n@Index(["order_number"])\nexport class Order {}',
  'src/entities/Ticket.ts': '@Entity("tickets")\n@Index(["ticket_number"])\nexport class Ticket {}',
};

/**
 * Conventions module over a real Postgres: extraction (file-selection →
 * read → extraction → grounding → persist), re-scan's keep-accepted/replace-
 * pending rule, edit/accept/reject, skill creation, and the two guard rails
 * (unindexed repo, cross-workspace access).
 */
d('conventions module', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  let repoSeq = 0;
  async function makeRepo() {
    const name = `conventions-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  function makeApp(opts?: { samples?: string[] | null }) {
    const samples = opts?.samples === null ? [] : (opts?.samples ?? SAMPLE_PATHS);
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        repoIntel: new MockRepoIntel({ conventionSamples: samples }),
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: {
              ConventionFileSelection: FILE_SELECTION,
              ConventionExtraction: EXTRACTION,
            },
          }),
        },
      },
    });
  }

  it('extracts, grounds (drops hallucinated path + unmatched snippet), and persists', async () => {
    const app = await makeApp();
    const repo = await makeRepo();

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      rule: 'Always use TypeORM entity decorators to define database models',
      evidence_path: 'src/entities/Order.ts',
      accepted: false,
    });

    const getRes = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(getRes.json()).toHaveLength(1);
    await app.close();
  });

  it('PATCH edits the rule text and can accept in the same call', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const [row] = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();

    const patched = await app.inject({
      method: 'PATCH',
      url: `/repos/${repo.id}/conventions/${row.id}`,
      payload: { rule: 'Edited rule text', accepted: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ rule: 'Edited rule text', accepted: true });
    await app.close();
  });

  it('DELETE rejects (removes) a convention, accepted or not', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const [row] = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    await app.inject({
      method: 'PATCH',
      url: `/repos/${repo.id}/conventions/${row.id}`,
      payload: { accepted: true },
    });

    const del = await app.inject({ method: 'DELETE', url: `/repos/${repo.id}/conventions/${row.id}` });
    expect(del.statusCode).toBe(200);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(list).toHaveLength(0);
    await app.close();
  });

  it('re-scan keeps accepted rows and replaces pending ones, skipping duplicates', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const [row] = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    await app.inject({
      method: 'PATCH',
      url: `/repos/${repo.id}/conventions/${row.id}`,
      payload: { accepted: true },
    });

    // Re-run extraction against the same fixture — the only grounded result
    // duplicates the now-accepted row, so it must NOT be reintroduced.
    const rescanned = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(rescanned.statusCode).toBe(200);
    const list = rescanned.json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: row.id, accepted: true });
    await app.close();
  });

  it('creates a skill from accepted conventions: type=convention, source=extracted, disabled, with evidence_files', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const [row] = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    await app.inject({
      method: 'PATCH',
      url: `/repos/${repo.id}/conventions/${row.id}`,
      payload: { accepted: true },
    });

    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: {
        name: 'repo-conventions',
        description: "Apply this repo's house conventions.",
        body: '- Always use TypeORM entity decorators (src/entities/Order.ts)',
      },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      type: 'convention',
      source: 'extracted',
      enabled: false,
      evidence_files: ['src/entities/Order.ts'],
    });

    const [persisted] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(persisted?.enabled).toBe(false);
    await app.close();
  });

  it('refuses to create a skill when nothing has been accepted', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: { name: 'x', description: 'y', body: 'z' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('409s extraction against an unindexed repo (no ranked samples)', async () => {
    const app = await makeApp({ samples: null });
    const repo = await makeRepo();

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_indexed');
    await app.close();
  });

  it('404s a repo from another workspace', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-conventions' }).returning();
    const [otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'other', name: 'repo', fullName: 'other/repo' })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/repos/${otherRepo!.id}/conventions` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
