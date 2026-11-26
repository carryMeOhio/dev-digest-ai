import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.012, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: "### Skill: test-branch-coverage\nFlag one-sided branches.",
    memory: null,
    specs: null,
    user: "Review PR #482",
  },
  skills_applied: [
    { id: "sk1", name: "test-branch-coverage", type: "rubric", source: "manual", order: 0, tokens: 412 },
  ],
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: vi.fn(() => ({ data: TRACE, isLoading: false })),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import { useRunTrace } from "@/lib/hooks/trace";
import RunTraceDrawer from "./RunTraceDrawer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("renders the COST stat next to tokens / duration", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("lists the skills applied to the run, in prompt order, with their token cost", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // The Prompt assembly section is collapsed by default — open it.
    fireEvent.click(screen.getByText("Prompt assembly"));

    expect(screen.getByText("Skills applied")).toBeInTheDocument();
    expect(screen.getByText("test-branch-coverage")).toBeInTheDocument();
    expect(screen.getByText("1 skill · ~412 tokens added")).toBeInTheDocument();
    // And the block itself is present, badged with what it added.
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
  });

  it("shows no skills block at all when the run had none attached", () => {
    // This is the control-experiment invariant: a run with every skill disabled
    // produces no skills section anywhere in the trace, not an empty one.
    const noSkills: RunTrace = {
      ...TRACE,
      skills_applied: [],
      prompt_assembly: { ...TRACE.prompt_assembly, skills: null },
    };
    // Only `data` and `isLoading` are read by the drawer; the rest of the
    // TanStack result shape is irrelevant here.
    vi.mocked(useRunTrace).mockReturnValueOnce({
      data: noSkills,
      isLoading: false,
    } as unknown as ReturnType<typeof useRunTrace>);

    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));

    expect(screen.queryByText("Skills applied")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});
