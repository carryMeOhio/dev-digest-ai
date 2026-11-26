import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const push = vi.fn();
const setParam = vi.fn();
let tabParam: string | null = null;

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage",
  description: "Flag one-sided branches.",
  type: "rubric",
  source: "manual",
  body: "# Branch coverage\n\nBoth sides.",
  enabled: true,
  version: 3,
  evidence_files: null,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => tabParam }),
}));
vi.mock("@/lib/search-params", () => ({ useSetSearchParam: () => setParam }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: [SKILL] }),
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillStats: () => ({
    data: {
      agents: 1,
      runs: 0,
      pull_freq: null,
      accept_rate: null,
      avg_tokens: null,
      window_days: 30,
      agent_links: [{ agent_id: "a1", agent_name: "Test Quality Reviewer", enabled: true, order: 0 }],
      findings: { total: 0, accepted: 0, dismissed: 0 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SkillDetailView } from "./SkillDetailView";

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillDetailView id="s1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  tabParam = null;
  push.mockClear();
  setParam.mockClear();
});
afterEach(cleanup);

describe("SkillDetailView", () => {
  it("shows the four tabs and opens on Config by default", () => {
    renderView();
    for (const label of ["Config", "Preview", "Stats", "Versions"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Save skill" })).toBeInTheDocument();
  });

  it("puts the selected tab in the URL", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(setParam).toHaveBeenCalledWith("tab", "versions");
  });

  it("Preview shows the exact block the prompt receives", () => {
    tabParam = "preview";
    renderView();
    expect(screen.getByText("As it appears in the prompt")).toBeInTheDocument();
    const pre = document.querySelector("pre") as HTMLPreElement;
    expect(pre.textContent).toBe("### Skill: branch-coverage\n# Branch coverage\n\nBoth sides.");
  });

  it("Stats lists the agents using it and shows — for rates with no data", () => {
    tabParam = "stats";
    renderView();
    expect(screen.getByRole("link", { name: "Test Quality Reviewer" })).toHaveAttribute(
      "href",
      "/agents/a1?tab=skills",
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("falls back to Config for an unknown ?tab=", () => {
    tabParam = "evals";
    renderView();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeInTheDocument();
  });

  it("shows the version in the header", () => {
    renderView();
    expect(screen.getAllByText("v3").length).toBeGreaterThan(0);
  });
});
