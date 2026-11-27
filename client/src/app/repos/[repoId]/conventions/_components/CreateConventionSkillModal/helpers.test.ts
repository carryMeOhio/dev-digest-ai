import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildDefaultDescription, buildSkillDraft, DEFAULT_SKILL_NAME } from "./helpers";

const CANDIDATE = (overrides: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id: "c1",
  rule: "Always use TypeORM entity decorators",
  evidence_path: "src/entities/Order.ts",
  evidence_snippet: '@Entity("orders")',
  confidence: 0.9,
  accepted: true,
  ...overrides,
});

describe("buildDefaultDescription", () => {
  it("names the repo when known", () => {
    expect(buildDefaultDescription("acme/app")).toBe(
      "Apply acme/app's house conventions when reviewing code.",
    );
  });

  it("falls back to a generic phrase without a repo name", () => {
    expect(buildDefaultDescription(null)).toContain("this repo");
  });
});

describe("buildSkillDraft", () => {
  it("returns an empty string for no accepted rows", () => {
    expect(buildSkillDraft([])).toBe("");
  });

  it("renders one bullet per rule with its evidence file", () => {
    const draft = buildSkillDraft([
      CANDIDATE(),
      CANDIDATE({ id: "c2", rule: "Use camelCase names", evidence_path: "src/util/names.ts" }),
    ]);
    expect(draft).toContain("- Always use TypeORM entity decorators");
    expect(draft).toContain("`src/entities/Order.ts`");
    expect(draft).toContain("- Use camelCase names");
    expect(draft).toContain("`src/util/names.ts`");
  });
});

describe("DEFAULT_SKILL_NAME", () => {
  it("is repo-conventions", () => {
    expect(DEFAULT_SKILL_NAME).toBe("repo-conventions");
  });
});
