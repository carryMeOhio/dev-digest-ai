/* hooks/skills.ts — React Query hooks for the Skills page and the agent
   editor's Skills tab. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillImportPreview,
  SkillStats,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";
import { agentKeys, skillKeys } from "./keys";

export function useSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Set by the import flow; omitted means a skill authored in the editor. */
  source?: Skill["source"];
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.setQueryData(skillKeys.detail(data.id), data);
      // Any content edit appends a version.
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.removeQueries({ queryKey: skillKeys.detail(id) });
      // Deleting a skill drops its agent links (cascade), so agent counts move.
      qc.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

/** Version history, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/**
 * Restore an earlier version. The server appends it as a NEW version rather
 * than rewriting history, so the result is the skill at its new version number.
 */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.setQueryData(skillKeys.detail(data.id), data);
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
    },
  });
}

/** Usage rollup + linked agents for the Stats tab. */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.stats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/**
 * Parse an uploaded file into a preview.
 *
 * This is deliberately a mutation that writes NOTHING: the server parses and
 * returns, the person reads what it found, and only a separate `useCreateSkill`
 * call saves it. An imported skill body becomes trusted instructions inside an
 * agent's prompt, so nothing is stored until someone has seen it.
 */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: { filename: string; content_b64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

// ---- agent ⇄ skill links -------------------------------------------------

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.forAgent(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Save the agent's whole ordered skill list in one call — attach, detach,
 * toggle and reorder are all the same write, because they are all just "this is
 * the list now, in this order".
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      links,
    }: {
      agentId: string;
      links: { skill_id: string; enabled: boolean }[];
    }) => api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { links }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(skillKeys.forAgent(agentId), data);
      // The agent card shows a skill count, so the list is stale now too.
      qc.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}
