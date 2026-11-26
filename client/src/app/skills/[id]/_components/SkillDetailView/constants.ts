import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface DetailTab {
  key: SkillTab;
  labelKey: string;
  icon: IconName;
}

export type SkillTab = "config" | "preview" | "stats" | "versions";

export const TABS: readonly DetailTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];

export const DEFAULT_TAB: SkillTab = "config";

/** Narrow down an arbitrary ?tab= value to a real tab. */
export function toTab(value: string | null): SkillTab {
  return TABS.some((t) => t.key === value) ? (value as SkillTab) : DEFAULT_TAB;
}
