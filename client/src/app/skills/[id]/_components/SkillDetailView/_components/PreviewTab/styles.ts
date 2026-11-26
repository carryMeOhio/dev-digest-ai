import type { CSSProperties } from "react";

/** Co-located styles for the skill Preview tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 22, maxWidth: 980 } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  label: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", textTransform: "none", letterSpacing: 0, fontWeight: 500 } satisfies CSSProperties,
  rendered: {
    padding: "16px 20px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: "14px 16px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
