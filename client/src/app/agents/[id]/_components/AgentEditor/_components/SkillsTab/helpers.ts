import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** A skill as the tab shows it: attached or not, and on or off for this agent. */
export interface SkillRowState {
  skill: Skill;
  /** Has a row in agent_skills. */
  attached: boolean;
  /** This agent's toggle. Meaningless when `attached` is false. */
  enabled: boolean;
}

/**
 * Build the tab's ordered rows: attached skills first in their saved prompt
 * order, then everything else alphabetically.
 *
 * Attached-but-disabled skills keep their slot, which is the whole reason the
 * link carries its own `enabled` flag — unchecking a skill must not silently
 * move it to the end of the prompt.
 */
export function buildRows(skills: Skill[], links: AgentSkillLink[]): SkillRowState[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .flatMap((l) => {
      const skill = byId.get(l.skill_id);
      return skill ? [{ skill, attached: true, enabled: l.enabled }] : [];
    });

  const linkedIds = new Set(linked.map((r) => r.skill.id));
  const rest = skills
    .filter((s) => !linkedIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, attached: false, enabled: false }));

  return [...linked, ...rest];
}

/** Move the row at `from` to `to`, returning a new array. */
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * The payload the API expects: only attached rows, in display order. An
 * unattached row is simply absent, which is how the server unlinks it.
 */
export function toLinksPayload(rows: SkillRowState[]): { skill_id: string; enabled: boolean }[] {
  return rows
    .filter((r) => r.attached)
    .map((r) => ({ skill_id: r.skill.id, enabled: r.enabled }));
}

/** True when the rows differ from what is saved (order, attachment or toggle). */
export function isDirty(rows: SkillRowState[], links: AgentSkillLink[]): boolean {
  const saved = [...links].sort((a, b) => a.order - b.order);
  const current = toLinksPayload(rows);
  if (saved.length !== current.length) return true;
  return saved.some(
    (l, i) => l.skill_id !== current[i]!.skill_id || l.enabled !== current[i]!.enabled,
  );
}

/** Case-insensitive filter over a row's skill name, description and type. */
export function filterRows(rows: SkillRowState[], search: string): SkillRowState[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    `${r.skill.name} ${r.skill.description} ${r.skill.type}`.toLowerCase().includes(q),
  );
}
