import type { Skill, SkillType } from "@devdigest/shared";
import { TYPE_COLOR } from "./constants";

/** Accent colour for a skill's type badge. */
export function typeColor(type: SkillType): string {
  return TYPE_COLOR[type] ?? TYPE_COLOR.custom;
}

/**
 * Whether this skill arrived from outside the editor and should carry the
 * "needs vetting" marker. Its body becomes instructions in an agent's prompt,
 * so where it came from is worth showing on the card, not buried in a detail
 * pane.
 */
export function isUntrustedSource(skill: Skill): boolean {
  return skill.source !== "manual";
}

/** Case-insensitive filter over a skill's name, description and type. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) =>
    `${s.name} ${s.description} ${s.type}`.toLowerCase().includes(q),
  );
}

/**
 * A 0–1 rate as a whole percentage. Null means "nothing to divide by yet" and
 * renders as an em-dash — a skill nobody has run is not a 0%-accepted skill.
 */
export function formatRate(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}
