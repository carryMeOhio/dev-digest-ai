import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { changedFields } from "./helpers";

const restoreMutate = vi.fn();

const v = (version: number, over: Partial<SkillVersion> = {}): SkillVersion => ({
  skill_id: "s1",
  version,
  name: "branch-coverage",
  description: "Flag one-sided branches.",
  type: "rubric",
  body: "# v1 body",
  restored_from: null,
  created_at: "2026-11-26T10:00:00.000Z",
  ...over,
});

// Newest first, as the API returns them. v4 is a restore of v1.
const VERSIONS: SkillVersion[] = [
  v(4, { restored_from: 1 }),
  v(3, { name: "branch-coverage-2", body: "# v3 body", type: "convention" }),
  v(2, { body: "# v2 body" }),
  v(1),
];

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

const SKILL = { id: "s1", name: "branch-coverage", version: 4 } as Skill;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => restoreMutate.mockClear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VersionsTab", () => {
  it("lists every version newest first, marking the current one", () => {
    renderTab();
    const rows = screen.getAllByTestId(/^version-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "version-4",
      "version-3",
      "version-2",
      "version-1",
    ]);
    expect(within(rows[0]!).getByText("current")).toBeInTheDocument();
  });

  it("says what changed in each version, and which one a restore came from", () => {
    renderTab();
    expect(within(screen.getByTestId("version-4")).getByText("restored from v1")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("version-3")).getByText("changed: name, type, body"),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("version-2")).getByText("changed: body")).toBeInTheDocument();
    expect(within(screen.getByTestId("version-1")).getByText("initial version")).toBeInTheDocument();
  });

  it("offers restore on every version except the current one", () => {
    renderTab();
    expect(screen.queryByRole("button", { name: "Restore this version v4" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore this version v3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore this version v1" })).toBeInTheDocument();
  });

  it("restores a version after confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore this version v2" }));

    // The confirmation tells the user the restore ADDS a version.
    expect(confirm.mock.calls[0]![0]).toContain("v5");
    expect(restoreMutate).toHaveBeenCalledWith({ id: "s1", version: 2 }, expect.anything());
  });

  it("does nothing when the restore is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore this version v2" }));
    expect(restoreMutate).not.toHaveBeenCalled();
  });

  it("shows a version's full content on View", () => {
    renderTab();
    const row = screen.getByTestId("version-3");
    fireEvent.click(within(row).getByRole("button", { name: "View" }));
    expect(within(row).getByText("# v3 body")).toBeInTheDocument();
    expect(within(row).getByText("convention")).toBeInTheDocument();
  });
});

describe("changedFields", () => {
  it("compares each version with the one before it", () => {
    expect(changedFields(VERSIONS, 1)).toEqual(["name", "type", "body"]);
    expect(changedFields(VERSIONS, 2)).toEqual(["body"]);
  });

  it("is empty for the oldest version, which has nothing to compare against", () => {
    expect(changedFields(VERSIONS, 3)).toEqual([]);
  });
});
