import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const setLinks = vi.fn();

const SKILLS: Skill[] = [
  {
    id: "s1",
    name: "test-branch-coverage",
    description: "Flag one-sided branches.",
    type: "rubric",
    source: "manual",
    body: "# a",
    enabled: true,
    version: 1,
    evidence_files: null,
  },
  {
    id: "s2",
    name: "no-over-mocking",
    description: "Flag tests that mock the subject.",
    type: "convention",
    source: "manual",
    body: "# b",
    enabled: true,
    version: 1,
    evidence_files: null,
  },
  {
    id: "s3",
    name: "imported-pack",
    description: "From an archive.",
    type: "custom",
    source: "imported_file",
    body: "# c",
    enabled: false,
    version: 1,
    evidence_files: null,
  },
];

// s1 and s2 are attached; s2 is attached-but-off and keeps order 1.
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "s1", order: 0, enabled: true },
  { agent_id: "ag1", skill_id: "s2", order: 1, enabled: false },
];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: setLinks, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <SkillsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => setLinks.mockClear());
afterEach(cleanup);

describe("SkillsTab", () => {
  it("lists every workspace skill, attached ones first in prompt order", () => {
    renderTab();
    const rows = screen.getAllByTestId(/^skill-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "skill-row-test-branch-coverage",
      "skill-row-no-over-mocking",
      "skill-row-imported-pack",
    ]);
  });

  it("counts only attached AND enabled links", () => {
    renderTab();
    // s1 on, s2 attached-but-off, s3 unattached → 1 of 3.
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
  });

  it("marks a skill that is switched off globally", () => {
    renderTab();
    expect(screen.getByText("disabled on the Skills page")).toBeInTheDocument();
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("saves nothing until there is a change", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Save skills" }));
    expect(setLinks).not.toHaveBeenCalled();
  });

  it("re-enabling an attached skill keeps its position in the order", () => {
    renderTab();
    // s2 is attached at order 1 but off. Checking it must not move it.
    fireEvent.click(screen.getByRole("checkbox", { name: "no-over-mocking" }));
    fireEvent.click(screen.getByRole("button", { name: "Save skills" }));

    expect(setLinks).toHaveBeenCalledTimes(1);
    expect(setLinks.mock.calls[0]![0].links).toEqual([
      { skill_id: "s1", enabled: true },
      { skill_id: "s2", enabled: true },
    ]);
  });

  it("attaching an unlinked skill appends it to the end", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "imported-pack" }));
    fireEvent.click(screen.getByRole("button", { name: "Save skills" }));

    expect(setLinks.mock.calls[0]![0].links).toEqual([
      { skill_id: "s1", enabled: true },
      { skill_id: "s2", enabled: false },
      { skill_id: "s3", enabled: true },
    ]);
  });

  it("reorders with the arrow buttons and saves the new prompt order", () => {
    renderTab();
    fireEvent.click(
      screen.getByRole("button", { name: "Move up: no-over-mocking" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save skills" }));

    // s2 is now first, and its disabled state travelled with it.
    expect(setLinks.mock.calls[0]![0].links).toEqual([
      { skill_id: "s2", enabled: false },
      { skill_id: "s1", enabled: true },
    ]);
  });

  it("unchecking an attached skill detaches it from the saved payload", () => {
    renderTab();
    // Turning it off keeps it attached, so it stays in the payload with
    // enabled:false — it holds its slot in the order.
    fireEvent.click(screen.getByRole("checkbox", { name: "test-branch-coverage" }));
    fireEvent.click(screen.getByRole("button", { name: "Save skills" }));
    expect(setLinks.mock.calls[0]![0].links).toEqual([
      { skill_id: "s1", enabled: false },
      { skill_id: "s2", enabled: false },
    ]);
  });
});
