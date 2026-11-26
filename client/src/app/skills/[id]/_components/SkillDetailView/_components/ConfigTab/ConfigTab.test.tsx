import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const updateMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage",
  description: "Flag one-sided branches.",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 3,
  evidence_files: null,
};

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => updateMutate.mockClear());
afterEach(cleanup);

describe("ConfigTab", () => {
  it("labels the description as the skill's interface", () => {
    renderTab();
    expect(screen.getByText("the skill’s interface")).toBeInTheDocument();
  });

  it("keeps Save disabled until something actually changes", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("saves the full edited content", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue("branch-coverage"), {
      target: { value: "branch-coverage-v2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "s1",
        patch: {
          name: "branch-coverage-v2",
          description: "Flag one-sided branches.",
          type: "rubric",
          body: "# Rule",
          enabled: true,
        },
      },
      expect.anything(),
    );
  });

  it("will not save with a required field emptied", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue("Flag one-sided branches."), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("shows the outside-source warning for an imported skill", () => {
    renderTab({ ...SKILL, source: "imported_file" });
    expect(screen.getByText(/instructions the model will follow/)).toBeInTheDocument();
  });
});
