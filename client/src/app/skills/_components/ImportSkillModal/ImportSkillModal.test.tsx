import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";
import { toBase64 } from "./helpers";

const previewMutate = vi.fn();
const createMutate = vi.fn();

const PREVIEW: SkillImportPreview = {
  name: "api-contract-gate",
  description: "Flag breaking route changes.",
  type: "rubric",
  body: "# Rule\n\nCheck the signature.",
  source: "imported_file",
  source_file: "pack/SKILL.md",
  ignored_entries: ["pack/scripts/run.sh", "pack/assets/logo.png"],
  warnings: ["2 other entries were ignored, including 1 executable file(s)."],
};

vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutate, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

function renderModal(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillModal onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** Drive the hidden file input the way a file picker would. */
async function choose(name = "pack.zip") {
  const file = new File(["zip-bytes"], name);
  const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => expect(previewMutate).toHaveBeenCalled());
}

beforeEach(() => {
  previewMutate.mockReset().mockResolvedValue(PREVIEW);
  createMutate.mockReset().mockResolvedValue({ ...PREVIEW, id: "s9", enabled: false, version: 1 });
});
afterEach(cleanup);

describe("ImportSkillModal", () => {
  it("shows the picker before any file is chosen", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /Choose a file/ })).toBeInTheDocument();
    expect(previewMutate).not.toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("previews a chosen file WITHOUT saving it", async () => {
    renderModal();
    await choose();

    expect(await screen.findByText("api-contract-gate")).toBeInTheDocument();
    expect(screen.getByText("Flag breaking route changes.")).toBeInTheDocument();
    // This is the contract that makes "preview, don't execute" real: the
    // preview call parses, and nothing is written until Confirm.
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("lists the archive entries it refused to process", async () => {
    renderModal();
    await choose();

    expect(await screen.findByText("pack/scripts/run.sh")).toBeInTheDocument();
    expect(screen.getByText("pack/assets/logo.png")).toBeInTheDocument();
    expect(screen.getByText(/Ignored — not imported, not executed/)).toBeInTheDocument();
  });

  it("warns that an imported body becomes instructions in the prompt", async () => {
    renderModal();
    await choose();
    expect(await screen.findByText("This skill comes from outside")).toBeInTheDocument();
  });

  it("saves as DISABLED only after confirmation", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await choose();

    fireEvent.click(await screen.findByRole("button", { name: /Save as a disabled skill/ }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0]![0]).toMatchObject({
      name: "api-contract-gate",
      type: "rubric",
      source: "imported_file",
      enabled: false,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("surfaces a parse failure instead of saving", async () => {
    previewMutate.mockRejectedValueOnce(new Error("boom"));
    renderModal();

    const file = new File(["nope"], "bad.zip");
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    expect(await screen.findByText("Import failed")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });
});

describe("toBase64", () => {
  it("round-trips bytes", () => {
    const bytes = new TextEncoder().encode("# Skill\nbody");
    expect(atob(toBase64(bytes))).toBe("# Skill\nbody");
  });

  it("encodes a payload larger than one chunk without overflowing the stack", () => {
    // String.fromCharCode(...bytes) throws RangeError well before this size,
    // which is why the helper chunks.
    const bytes = new Uint8Array(200_000).fill(65);
    expect(toBase64(bytes).length).toBeGreaterThan(0);
    expect(atob(toBase64(bytes)).length).toBe(200_000);
  });
});
