import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import {
  USAGE_WINDOW_DAYS,
  computeUsage,
  mayStartEnabled,
  toSkillDto,
} from './helpers.js';
import { parseSkillUpload } from './import.js';
import { DEFAULT_SKILL_SOURCE } from './constants.js';

/**
 * Skills service. A Skill = name + description + type + markdown body.
 *
 * The `description` is the skill's INTERFACE: it is what tells an agent (and the
 * person wiring it up) when this skill applies, so it is phrased as a directive.
 * The `body` is the block that gets appended to an agent's prompt.
 *
 * Body edits are versioned via `skill_versions` (repository).
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  /** All skills, each with its usage rollup for the cards. */
  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, inputs] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.usageInputs(workspaceId, windowStart()),
    ]);
    return rows.map((row) => {
      const { agent_links: _links, findings: _findings, ...usage } = computeUsage(row.id, inputs);
      return { ...toSkillDto(row), usage };
    });
  }

  /** Stats tab: the rollup plus which agents use the skill. */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const inputs = await this.repo.usageInputs(workspaceId, windowStart());
    return computeUsage(id, inputs);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Create a skill.
   *
   * A skill that did not come from this editor can never arrive enabled: its
   * body becomes trusted instructions inside an agent's prompt, so turning it on
   * is a decision a person makes after reading it, not something an upload does.
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const source = input.source ?? DEFAULT_SKILL_SOURCE;
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source,
      body: input.body,
      enabled: mayStartEnabled(source) ? (input.enabled ?? true) : false,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Version history, newest first. Workspace-scoped: returns undefined when the
   * skill isn't in this workspace (route → 404) so versions can't be read
   * across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map((r) => ({
      skill_id: r.skillId,
      version: r.version,
      name: r.name,
      description: r.description,
      type: r.type as SkillType,
      body: r.body,
      restored_from: r.restoredFrom ?? null,
      created_at: r.createdAt.toISOString(),
    }));
  }

  /** Bring back an earlier version's content as a new version (see repository). */
  async restoreVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restoreVersion(workspaceId, skillId, version);
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Parse an uploaded file into a preview. PERSISTS NOTHING — the client shows
   * this, the person confirms, and only then does a normal create run. Keeping
   * the two steps separate is what makes "preview without executing" true rather
   * than a claim.
   */
  previewImport(filename: string, content: Uint8Array): SkillImportPreview {
    return parseSkillUpload(filename, content);
  }
}

function windowStart(): Date {
  return new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}
