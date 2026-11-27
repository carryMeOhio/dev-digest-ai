import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow } from '../../db/rows.js';
import type { GroundedConvention } from './helpers.js';

/**
 * Conventions data-access. Owns the `conventions` table. Workspace-scoped
 * throughout (the table also carries `repo_id`, so reads/writes are further
 * scoped to one repo within the workspace).
 */
export class ConventionsRepository {
  constructor(private db: Db) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async getById(workspaceId: string, repoId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      );
    return row;
  }

  async getAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    const rows = await this.listForRepo(workspaceId, repoId);
    return rows.filter((r) => r.accepted);
  }

  async update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: { rule?: string; accepted?: boolean },
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
      })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      )
      .returning();
    return row;
  }

  async remove(workspaceId: string, repoId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }

  /**
   * Persist a fresh extraction: delete every PENDING (not-yet-accepted) row for
   * this repo, then insert the newly-grounded, deduped candidates. Accepted
   * rows are never touched here — the caller (`service.extract`) has already
   * deduped the incoming batch against them.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    candidates: GroundedConvention[],
  ): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, false),
        ),
      );
    if (candidates.length === 0) return;
    await this.db.insert(t.conventions).values(
      candidates.map((c) => ({
        workspaceId,
        repoId,
        rule: c.rule,
        evidencePath: c.evidencePath,
        evidenceSnippet: c.evidenceSnippet,
        confidence: c.confidence,
        accepted: false,
      })),
    );
  }
}
