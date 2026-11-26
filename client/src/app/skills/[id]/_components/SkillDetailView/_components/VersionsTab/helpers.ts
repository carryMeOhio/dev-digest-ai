import type { SkillVersion } from "@devdigest/shared";

export const VERSIONED_FIELDS = ["name", "description", "type", "body"] as const;
export type VersionedField = (typeof VERSIONED_FIELDS)[number];

/**
 * Which content fields differ between a version and the one before it. With no
 * previous version (v1) there is nothing to compare, so the result is empty and
 * the UI says "initial version".
 *
 * `versions` is newest-first, as the API returns it.
 */
export function changedFields(versions: SkillVersion[], index: number): VersionedField[] {
  const current = versions[index];
  const previous = versions[index + 1];
  if (!current || !previous) return [];
  return VERSIONED_FIELDS.filter((f) => current[f] !== previous[f]);
}
