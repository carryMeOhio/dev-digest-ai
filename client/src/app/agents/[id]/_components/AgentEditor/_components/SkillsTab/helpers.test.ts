import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { buildRows, filterRows, isDirty, moveRow, toLinksPayload } from "./helpers";

const skill = (id: string, name: string, enabled = true): Skill => ({
  id,
  name,
  description: `${name} desc`,
  type: "rubric",
  source: "manual",
  body: "# b",
  enabled,
  version: 1,
  evidence_files: null,
});

const SKILLS = [skill("s1", "alpha"), skill("s2", "beta"), skill("s3", "gamma")];
const LINKS: AgentSkillLink[] = [
  { agent_id: "a", skill_id: "s2", order: 0, enabled: true },
  { agent_id: "a", skill_id: "s1", order: 1, enabled: false },
];

describe("buildRows", () => {
  it("puts attached skills first in saved prompt order, then the rest alphabetically", () => {
    const rows = buildRows(SKILLS, LINKS);
    expect(rows.map((r) => r.skill.id)).toEqual(["s2", "s1", "s3"]);
    expect(rows.map((r) => r.attached)).toEqual([true, true, false]);
    // A disabled link stays attached and keeps its slot.
    expect(rows[1]).toMatchObject({ attached: true, enabled: false });
  });

  it("ignores a link whose skill no longer exists", () => {
    const rows = buildRows([SKILLS[0]!], [
      { agent_id: "a", skill_id: "gone", order: 0, enabled: true },
      { agent_id: "a", skill_id: "s1", order: 1, enabled: true },
    ]);
    expect(rows.map((r) => r.skill.id)).toEqual(["s1"]);
  });
});

describe("moveRow", () => {
  it("moves an item and leaves the rest in order", () => {
    expect(moveRow([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  });

  it("is a no-op for out-of-range or identical indices", () => {
    const rows = [1, 2, 3];
    expect(moveRow(rows, 1, 1)).toBe(rows);
    expect(moveRow(rows, -1, 0)).toBe(rows);
    expect(moveRow(rows, 0, 9)).toBe(rows);
  });
});

describe("toLinksPayload", () => {
  it("sends only attached rows, in display order", () => {
    const rows = buildRows(SKILLS, LINKS);
    expect(toLinksPayload(rows)).toEqual([
      { skill_id: "s2", enabled: true },
      { skill_id: "s1", enabled: false },
    ]);
  });
});

describe("isDirty", () => {
  it("is false for rows built straight from the saved links", () => {
    expect(isDirty(buildRows(SKILLS, LINKS), LINKS)).toBe(false);
  });

  it("detects a reorder, a toggle, and an attach", () => {
    const rows = buildRows(SKILLS, LINKS);
    expect(isDirty(moveRow(rows, 0, 1), LINKS)).toBe(true);

    const toggled = rows.map((r) => (r.skill.id === "s1" ? { ...r, enabled: true } : r));
    expect(isDirty(toggled, LINKS)).toBe(true);

    const attached = rows.map((r) =>
      r.skill.id === "s3" ? { ...r, attached: true, enabled: true } : r,
    );
    expect(isDirty(attached, LINKS)).toBe(true);
  });

  it("guards the sync effect: dirty rows must not be rebuilt from the server", () => {
    // This is the property the SkillsTab effect relies on — if isDirty were
    // wrong, a background refetch would silently discard the user's reorder.
    const edited = moveRow(buildRows(SKILLS, LINKS), 0, 2);
    expect(isDirty(edited, LINKS)).toBe(true);
  });
});

describe("filterRows", () => {
  it("matches name, description and type, case-insensitively", () => {
    const rows = buildRows(SKILLS, LINKS);
    expect(filterRows(rows, "ALPHA").map((r) => r.skill.id)).toEqual(["s1"]);
    expect(filterRows(rows, "rubric")).toHaveLength(3);
    expect(filterRows(rows, "  ")).toHaveLength(3);
  });
});
