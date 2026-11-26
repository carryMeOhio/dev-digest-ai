import type { SkillType } from "@devdigest/shared";

/** Accent per skill type, so the grid is scannable by kind. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--info)",
  convention: "var(--accent)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/** Card grid template (responsive auto-fill) — matches the agents grid. */
export const CARD_GRID_COLS = "repeat(auto-fill, minmax(280px, 1fr))";
