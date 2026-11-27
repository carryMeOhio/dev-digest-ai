import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  top: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  ruleRow: { flex: 1, display: "flex", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  rule: { fontSize: 15, fontWeight: 600, lineHeight: 1.4 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  acceptedTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--ok)",
    padding: "7px 13px",
  } satisfies CSSProperties,
  evidence: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  evidencePath: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  snippet: {
    fontSize: 12.5,
    lineHeight: 1.55,
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  editFooter: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
