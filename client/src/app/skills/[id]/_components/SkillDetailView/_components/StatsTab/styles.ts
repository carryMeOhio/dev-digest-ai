import type { CSSProperties } from "react";

/** Co-located styles for the skill Stats tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 22, maxWidth: 980 } satisfies CSSProperties,
  window: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  tiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
  tile: {
    padding: "14px 16px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tileValue: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  tileHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 8 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    marginBottom: 6,
  } satisfies CSSProperties,
  agentLink: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  position: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
