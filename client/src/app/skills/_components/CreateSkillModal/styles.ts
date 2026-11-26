import type { CSSProperties } from "react";

/**
 * Co-located styles for CreateSkillModal. The kit Modal gives its body and
 * footer no layout of their own — callers must pad the body and lay out the
 * footer buttons, exactly as CreateAgentModal does.
 */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  interfaceTag: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--accent)",
  } satisfies CSSProperties,
} as const;
