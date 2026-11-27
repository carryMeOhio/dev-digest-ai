import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

const CONVENTION: ConventionCandidate = {
  id: "c1",
  rule: "Always use TypeORM entity decorators",
  evidence_path: "src/entities/Order.ts",
  evidence_snippet: '@Entity("orders")',
  confidence: 0.9,
  accepted: false,
};

function renderCard(overrides: Partial<ConventionCandidate> = {}, handlers: Partial<Parameters<typeof ConventionCard>[0]> = {}) {
  const onAccept = vi.fn();
  const onReject = vi.fn();
  const onSaveRule = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        convention={{ ...CONVENTION, ...overrides }}
        repoFullName="acme/app"
        defaultBranch="main"
        onAccept={onAccept}
        onReject={onReject}
        onSaveRule={onSaveRule}
        {...handlers}
      />
    </NextIntlClientProvider>,
  );
  return { onAccept, onReject, onSaveRule };
}

afterEach(() => cleanup());

describe("ConventionCard", () => {
  it("shows the rule, evidence path, snippet and an Accept button when pending", () => {
    renderCard();
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
    expect(screen.getByText(CONVENTION.evidence_path)).toBeInTheDocument();
    expect(screen.getByText(CONVENTION.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("shows 'Accepted' instead of an Accept button once accepted", () => {
    renderCard({ accepted: true });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("calls onAccept when Accept is clicked", () => {
    const { onAccept } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onReject when Reject is clicked, even on an accepted card", () => {
    const { onReject } = renderCard({ accepted: true });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("edits the rule text and saves it", () => {
    const { onSaveRule } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByDisplayValue(CONVENTION.rule);
    fireEvent.change(textarea, { target: { value: "A rewritten rule" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaveRule).toHaveBeenCalledWith("A rewritten rule");
  });

  it("cancels an edit without saving", () => {
    const { onSaveRule } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByDisplayValue(CONVENTION.rule);
    fireEvent.change(textarea, { target: { value: "Thrown away" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSaveRule).not.toHaveBeenCalled();
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
  });
});
