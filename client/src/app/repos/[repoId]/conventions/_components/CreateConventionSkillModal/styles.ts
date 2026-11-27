import type { CSSProperties } from "react";

/**
 * Co-located styles. The kit Modal gives its body/footer no layout of their
 * own — every caller must pad the body and lay out the footer buttons (see
 * CreateSkillModal / CreateAgentModal).
 */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
