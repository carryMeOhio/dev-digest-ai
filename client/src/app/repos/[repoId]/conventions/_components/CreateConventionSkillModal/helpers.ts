import type { ConventionCandidate } from "@devdigest/shared";

/** Default name the modal opens with — the user can rename it before saving. */
export const DEFAULT_SKILL_NAME = "repo-conventions";

export function buildDefaultDescription(repoFullName: string | null | undefined): string {
  const repo = repoFullName ?? "this repo";
  return `Apply ${repo}'s house conventions when reviewing code.`;
}

/**
 * Markdown body draft from the accepted candidates — one bullet per rule,
 * with its evidence file noted underneath. The user can edit it further
 * before saving; this is just the starting point.
 */
export function buildSkillDraft(accepted: ConventionCandidate[]): string {
  if (accepted.length === 0) return "";
  const items = accepted.map(
    (c) => `- ${c.rule}\n  _Evidence: \`${c.evidence_path}\`_`,
  );
  return `# Repo conventions\n\n${items.join("\n\n")}\n`;
}
