import { and, asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isContentChange, type UsageInputs } from './helpers.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; the `agent_skills`
 * link table belongs to the agents module (which owns the agent side of the
 * relation). Workspace-scoped throughout.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Look a skill up by name within a workspace — used by the idempotent seed. */
  async getByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row;
  }

  /** Delete a skill. Versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION);
    return row!;
  }

  /**
   * Update a skill. Any CONTENT change (name/description/type/body) bumps the
   * version and appends a full snapshot; toggling `enabled` does not.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const contentChanged = isContentChange(existing, patch);
    const nextVersion = contentChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(contentChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (contentChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  /**
   * Restore an earlier version's content as a NEW version.
   *
   * History is never rewritten: restoring v3 while on v7 creates v8 holding v3's
   * content, tagged `restored_from = 3`. That keeps every restore undoable, and
   * keeps past run traces pointing at content that still exists in the log.
   * Returns undefined when the skill or the version doesn't exist.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;
    const [snap] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, id), eq(t.skillVersions.version, version)));
    if (!snap) return undefined;

    const nextVersion = existing.version + 1;
    const [row] = await this.db
      .update(t.skills)
      .set({
        name: snap.name,
        description: snap.description,
        type: snap.type,
        body: snap.body,
        version: nextVersion,
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    if (row) await this.snapshotVersion(row, nextVersion, version);
    return row;
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /**
   * Raw material for skill usage stats, for the whole workspace in one pass:
   * which skills each completed run applied (from its trace), how its findings
   * were triaged, and every agent link. The arithmetic is in `computeUsage`.
   *
   * Reads `trace->'skills_applied'` rather than the whole trace document so a
   * workspace with long traces doesn't pull every prompt over the wire.
   */
  async usageInputs(workspaceId: string, since: Date): Promise<UsageInputs> {
    const runs = await this.db
      .select({
        runId: t.agentRuns.id,
        applied: sql<{ id: string; tokens: number }[] | null>`${t.runTraces.trace}->'skills_applied'`,
      })
      .from(t.agentRuns)
      .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, since),
        ),
      );

    const runIds = runs.map((r) => r.runId);
    const findingCounts = runIds.length
      ? await this.db
          .select({
            runId: t.reviews.runId,
            total: count(),
            accepted: count(t.findings.acceptedAt),
            dismissed: count(t.findings.dismissedAt),
          })
          .from(t.findings)
          .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
          .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.runId, runIds)))
          .groupBy(t.reviews.runId)
      : [];

    const links = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        agentId: t.agents.id,
        agentName: t.agents.name,
        enabled: t.agentSkills.enabled,
        order: t.agentSkills.order,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.name));

    return {
      runs: runs.map((r) => ({ runId: r.runId, applied: Array.isArray(r.applied) ? r.applied : [] })),
      findings: findingCounts.flatMap((f) =>
        f.runId
          ? [{ runId: f.runId, total: Number(f.total), accepted: Number(f.accepted), dismissed: Number(f.dismissed) }]
          : [],
      ),
      links,
    };
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    restoredFrom: number | null = null,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({
        skillId: row.id,
        version,
        name: row.name,
        description: row.description,
        type: row.type,
        body: row.body,
        restoredFrom,
      })
      .onConflictDoNothing();
  }
}
