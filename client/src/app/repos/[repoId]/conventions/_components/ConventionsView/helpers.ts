import type { ConventionCandidate } from "@devdigest/shared";

export function countAccepted(list: ConventionCandidate[]): number {
  return list.filter((c) => c.accepted).length;
}
