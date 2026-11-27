/* hooks/keys.ts — the single source of truth for TanStack Query keys.
   Hooks build keys from these factories and invalidate through them; components
   never write raw key arrays. Arrays are kept identical to the historical
   literals so cache identity (and prefix invalidation) is unchanged. */
import type { Provider } from "@devdigest/shared";

type Id = string | number | null | undefined;

export const settingsKeys = {
  all: ["settings"] as const,
  secretsStatus: ["secrets-status"] as const,
};

export const repoKeys = {
  all: ["repos"] as const,
};

export const pullKeys = {
  /** Prefix for every repo's PR list — use to refresh list rollups. */
  lists: ["pulls"] as const,
  list: (repoId: Id) => ["pulls", repoId] as const,
  detail: (prId: Id) => ["pull", prId] as const,
  reviews: (prId: Id) => ["reviews", prId] as const,
  runs: (prId: Id) => ["pr-runs", prId] as const,
  activeRuns: (prId: Id) => ["pr-active-runs", prId] as const,
  comments: (prId: Id) => ["pr-comments", prId] as const,
};

export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: Id) => ["agent", id] as const,
  /** Prefix for every provider's model list. */
  providerModelsAll: ["provider-models"] as const,
  providerModels: (provider: Provider | null | undefined) =>
    ["provider-models", provider] as const,
};

export const skillKeys = {
  all: ["skills"] as const,
  detail: (id: Id) => ["skill", id] as const,
  versions: (id: Id) => ["skill-versions", id] as const,
  stats: (id: Id) => ["skill-stats", id] as const,
  /** The ordered skill links for one agent (agent editor, Skills tab). */
  forAgent: (agentId: Id) => ["agent-skills", agentId] as const,
};

export const traceKeys = {
  run: (runId: Id) => ["run-trace", runId] as const,
};

export const repoIntelKeys = {
  state: (repoId: Id) => ["repo-intel-state", repoId] as const,
};

export const conventionKeys = {
  all: ["conventions"] as const,
  list: (repoId: Id) => ["conventions", repoId] as const,
};
