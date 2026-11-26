import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const push = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

const usage = { runs: 0, pull_freq: null, accept_rate: null, avg_tokens: null, window_days: 30 };
const SKILLS: Skill[] = [
  {
    id: "s1",
    name: "test-branch-coverage",
    description: "Flag one-sided branches.",
    type: "rubric",
    source: "manual",
    body: "# Branch coverage",
    enabled: true,
    version: 2,
    evidence_files: null,
    usage: { ...usage, agents: 1, runs: 4, pull_freq: 0.07, accept_rate: 0.5 },
  },
  {
    id: "s2",
    name: "imported-pack",
    description: "Came from an archive.",
    type: "security",
    source: "imported_file",
    body: "# Imported",
    enabled: false,
    version: 1,
    evidence_files: null,
    usage: { ...usage, agents: 0 },
  },
];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsListView } from "./SkillsListView";

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillsListView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  updateMutate.mockClear();
  deleteMutate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SkillsListView", () => {
  it("renders a card per skill with type, description, origin and version", () => {
    renderView();
    expect(screen.getByText("test-branch-coverage")).toBeInTheDocument();
    expect(screen.getByText("Flag one-sided branches.")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual · v2")).toBeInTheDocument();
  });

  it("shows usage on the card, with — rather than 0% when there is no data", () => {
    renderView();
    const used = screen.getByTestId("skill-card-test-branch-coverage");
    expect(used).toHaveTextContent("1 agent");
    expect(used).toHaveTextContent("7% pull freq");
    expect(used).toHaveTextContent("50% accept");

    const unused = screen.getByTestId("skill-card-imported-pack");
    expect(unused).toHaveTextContent("No agents");
    expect(unused).toHaveTextContent("— pull freq");
    expect(unused).toHaveTextContent("— accept");
  });

  it("marks a skill that came from outside as needing vetting", () => {
    renderView();
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("filters by name", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "imported" } });
    expect(screen.queryByText("test-branch-coverage")).not.toBeInTheDocument();
    expect(screen.getByText("imported-pack")).toBeInTheDocument();
  });

  it("opens the skill's editor on its Config tab when a card is clicked", () => {
    renderView();
    fireEvent.click(screen.getByTestId("skill-card-test-branch-coverage"));
    expect(push).toHaveBeenCalledWith("/skills/s1?tab=config");
  });

  it("toggles a skill globally without opening it", () => {
    renderView();
    const card = screen.getByTestId("skill-card-test-branch-coverage");
    fireEvent.click(card.querySelector('[role="switch"]')!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { enabled: false } });
    expect(push).not.toHaveBeenCalled();
  });

  it("deletes a skill from its card after confirmation, without opening it", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill: imported-pack" }));
    expect(deleteMutate).toHaveBeenCalledWith("s2", expect.anything());
    expect(push).not.toHaveBeenCalled();
  });

  it("does not delete when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill: imported-pack" }));
    expect(deleteMutate).not.toHaveBeenCalled();
  });
});
