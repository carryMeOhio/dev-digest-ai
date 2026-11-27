/* hooks/conventions.ts — React Query hooks for the Conventions page. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, Skill } from "@devdigest/shared";
import { conventionKeys, skillKeys } from "./keys";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Run (or re-run) extraction. The server returns the FULL resulting list — set
 * it directly as the query's data rather than invalidating, so the page
 * doesn't flash back to a loading state right after the scan completes.
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData(conventionKeys.list(repoId), data);
    },
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: { rule?: string; accepted?: boolean };
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, patch),
    onSuccess: (data) => {
      qc.setQueryData<ConventionCandidate[]>(conventionKeys.list(repoId), (prev) =>
        prev ? prev.map((c) => (c.id === data.id ? data : c)) : prev,
      );
    },
  });
}

export function useRejectConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/repos/${repoId}/conventions/${id}`),
    onSuccess: (_d, id) => {
      qc.setQueryData<ConventionCandidate[]>(conventionKeys.list(repoId), (prev) =>
        prev ? prev.filter((c) => c.id !== id) : prev,
      );
    },
  });
}

export interface CreateConventionSkillInput {
  name: string;
  description: string;
  body: string;
}

/** Create the `repo-conventions` skill from the currently-accepted candidates. */
export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
