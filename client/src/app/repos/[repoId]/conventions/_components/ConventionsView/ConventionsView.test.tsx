import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";

const extractMutate = vi.fn();
const updateMutate = vi.fn();
const rejectMutate = vi.fn();
let conventions: ConventionCandidate[] = [];
let extractPending = false;

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: conventions, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: extractPending }),
  useUpdateConvention: () => ({ mutate: updateMutate, isPending: false, variables: undefined }),
  useRejectConvention: () => ({ mutate: rejectMutate, isPending: false }),
  useCreateConventionSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/app", default_branch: "main" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo not found</div>,
}));

import { ConventionsView } from "./ConventionsView";

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <ConventionsView repoId="r1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  conventions = [];
  extractPending = false;
  extractMutate.mockClear();
  updateMutate.mockClear();
  rejectMutate.mockClear();
});
afterEach(() => cleanup());

describe("ConventionsView", () => {
  it("shows the empty state and triggers extraction from its CTA", () => {
    renderView();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    // Both the header button and the empty-state CTA say "Run extraction".
    const buttons = screen.getAllByRole("button", { name: "Run extraction" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(extractMutate).toHaveBeenCalledTimes(1);
  });

  it("renders a card per candidate once there are some", () => {
    conventions = [
      {
        id: "c1",
        rule: "Always use TypeORM entity decorators",
        evidence_path: "src/entities/Order.ts",
        evidence_snippet: '@Entity("orders")',
        confidence: 0.9,
        accepted: true,
      },
      {
        id: "c2",
        rule: "Use camelCase for function names",
        evidence_path: "src/util/names.ts",
        evidence_snippet: "function findPendingApproval() {}",
        confidence: 0.8,
        accepted: false,
      },
    ];
    renderView();
    expect(screen.getByText("Always use TypeORM entity decorators")).toBeInTheDocument();
    expect(screen.getByText("Use camelCase for function names")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
  });

  it("disables 'Accept as Skill' until at least one convention is accepted", () => {
    conventions = [
      {
        id: "c1",
        rule: "A pending rule",
        evidence_path: "src/a.ts",
        evidence_snippet: "x",
        confidence: 0.9,
        accepted: false,
      },
    ];
    renderView();
    expect(screen.getByRole("button", { name: "Accept as Skill" })).toBeDisabled();
  });

  it("shows Re-scan (not Run extraction) once candidates exist", () => {
    conventions = [
      {
        id: "c1",
        rule: "A rule",
        evidence_path: "src/a.ts",
        evidence_snippet: "x",
        confidence: 0.9,
        accepted: false,
      },
    ];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Re-scan" }));
    expect(extractMutate).toHaveBeenCalledTimes(1);
  });
});
