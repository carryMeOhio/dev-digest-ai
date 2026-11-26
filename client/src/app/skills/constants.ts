import type { SkillType } from "@devdigest/shared";

/** Selectable skill types — mirrors the `SkillType` contract enum. Shared by the
    create modal (grid route) and the Config tab (detail route). */
export const SKILL_TYPE_VALUES: readonly SkillType[] = [
  "rubric",
  "convention",
  "security",
  "custom",
];
