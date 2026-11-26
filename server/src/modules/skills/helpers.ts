import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * version-bump rule. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Fields a skill update may carry. */
export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/**
 * True when a patch changes the skill's CONTENT — name, description, type or
 * body. Each of those changes what an agent sees (the name and description are
 * the skill's interface, the body is the block in the prompt), so each one
 * appends a version. Flipping `enabled` is not an edit of the skill and does not.
 */
export function isContentChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/**
 * Whether a skill from this source may be created already enabled.
 *
 * A skill body is injected into an agent's prompt as TRUSTED INSTRUCTIONS — it
 * is deliberately not wrapped in `<untrusted>`, because wrapping would make it
 * inert and defeat the point. So the safety boundary is human vetting: anything
 * that came from outside arrives disabled and needs an explicit toggle.
 */
export function mayStartEnabled(source: SkillSource): boolean {
  return source === 'manual';
}

// ---- usage stats -----------------------------------------------------------

/** Trailing window the stats cover. */
export const USAGE_WINDOW_DAYS = 30;

/** Everything `computeUsage` needs, fetched once per request by the repository. */
export interface UsageInputs {
  /** Completed review runs in the window and the skills each one applied. */
  runs: { runId: string; applied: { id: string; tokens: number }[] }[];
  /** Finding triage counts per run (runs with no findings are absent). */
  findings: { runId: string; total: number; accepted: number; dismissed: number }[];
  /** Every agent↔skill link in the workspace. */
  links: { skillId: string; agentId: string; agentName: string; enabled: boolean; order: number }[];
}

/**
 * Usage rollup for one skill. Pure — the definitions live here so they are
 * testable and stated once:
 *
 *  - agents      links to this skill that are enabled
 *  - runs        completed runs whose trace applied it
 *  - pull_freq   runs ÷ all completed runs in the window
 *  - accept_rate accepted ÷ (accepted + dismissed) findings from those runs —
 *                untriaged findings are left out, since "not yet looked at"
 *                is not a rejection
 *  - avg_tokens  mean tokens it added per applying run
 *
 * Every rate is null, not 0, when there is nothing to divide by: "no data yet"
 * and "0%" mean very different things on a card.
 */
export function computeUsage(skillId: string, inputs: UsageInputs) {
  const applying = inputs.runs.flatMap((r) => {
    const hit = r.applied.find((a) => a.id === skillId);
    return hit ? [{ runId: r.runId, tokens: hit.tokens }] : [];
  });
  const runIds = new Set(applying.map((a) => a.runId));

  let total = 0;
  let accepted = 0;
  let dismissed = 0;
  for (const f of inputs.findings) {
    if (!runIds.has(f.runId)) continue;
    total += f.total;
    accepted += f.accepted;
    dismissed += f.dismissed;
  }

  const links = inputs.links.filter((l) => l.skillId === skillId);
  const decided = accepted + dismissed;

  return {
    agents: links.filter((l) => l.enabled).length,
    runs: applying.length,
    pull_freq: inputs.runs.length > 0 ? applying.length / inputs.runs.length : null,
    accept_rate: decided > 0 ? accepted / decided : null,
    avg_tokens:
      applying.length > 0
        ? Math.round(applying.reduce((sum, a) => sum + a.tokens, 0) / applying.length)
        : null,
    window_days: USAGE_WINDOW_DAYS,
    agent_links: links.map((l) => ({
      agent_id: l.agentId,
      agent_name: l.agentName,
      enabled: l.enabled,
      order: l.order,
    })),
    findings: { total, accepted, dismissed },
  };
}
