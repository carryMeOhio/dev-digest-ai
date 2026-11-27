import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";
import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

const ACCEPTED: ConventionCandidate[] = [
  {
    id: "c1",
    rule: "Always use TypeORM entity decorators",
    evidence_path: "src/entities/Order.ts",
    evidence_snippet: '@Entity("orders")',
    confidence: 0.9,
    accepted: true,
  },
];

const mutateAsync = vi.fn(async (input: unknown) => ({
  id: "s1",
  name: (input as { name: string }).name,
  description: "d",
  type: "convention",
  source: "extracted",
  body: "b",
  enabled: false,
  version: 1,
  evidence_files: ["src/entities/Order.ts"],
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useCreateConventionSkill: () => ({ mutateAsync, isPending: false }),
}));

function renderModal(onClose = vi.fn(), onCreated = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ToastProvider>
        <CreateConventionSkillModal
          repoId="r1"
          repoFullName="acme/app"
          accepted={ACCEPTED}
          onClose={onClose}
          onCreated={onCreated}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose, onCreated };
}

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
});

describe("CreateConventionSkillModal", () => {
  it("pre-fills name, description and a body drafted from the accepted rows", () => {
    renderModal();
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Apply acme/app's house conventions when reviewing code."),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Always use TypeORM entity decorators/)).toBeInTheDocument();
  });

  it("saves the edited fields and closes", async () => {
    const { onClose, onCreated } = renderModal();
    fireEvent.change(screen.getByDisplayValue("repo-conventions"), {
      target: { value: "custom-name" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save skill/i }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "custom-name" }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("discards without sending a request", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
