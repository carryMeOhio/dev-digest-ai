import type { ConventionCandidate, Skill } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { SkillsService } from '../skills/service.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository } from './repository.js';
import {
  dropDuplicatesOfAccepted,
  groundConventions,
  sortCandidates,
  toConventionDto,
} from './helpers.js';
import { buildExtractionPrompt, buildFileSelectionPrompt, ConventionExtraction, ConventionFileSelection } from './prompt.js';
import { MAX_FILES_TO_READ, MAX_FILE_CHARS, SAMPLE_POOL } from './constants.js';

/**
 * Conventions service — the extraction pipeline plus plain CRUD over the
 * candidates it produces.
 *
 * extract(): sample ranked files → LLM picks which to read → read them →
 * LLM proposes rules with evidence → grounding gate → persist (keeping
 * already-accepted rows, replacing pending ones).
 */
export class ConventionsService {
  private repo: ConventionsRepository;
  private repos: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.listForRepo(workspaceId, repoId);
    return sortCandidates(rows).map(toConventionDto);
  }

  async update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: { rule?: string; accepted?: boolean },
  ): Promise<ConventionCandidate | undefined> {
    await this.requireRepo(workspaceId, repoId);
    const row = await this.repo.update(workspaceId, repoId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  async reject(workspaceId: string, repoId: string, id: string): Promise<boolean> {
    await this.requireRepo(workspaceId, repoId);
    return this.repo.remove(workspaceId, repoId, id);
  }

  /**
   * Run the two-step extraction and persist the result. Pending candidates are
   * replaced; accepted ones (and anything that would duplicate one) survive.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const repoRow = await this.requireRepo(workspaceId, repoId);
    const repoRef = { owner: repoRow.owner, name: repoRow.name };

    const pool = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_POOL);
    if (pool.length === 0) {
      throw new AppError(
        'repo_not_indexed',
        'This repo has not been indexed yet (or repo-intel is disabled), so there are no ranked files to sample. Index the repo first, then re-run extraction.',
        409,
      );
    }

    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);

    // Call 1 — pick which sampled files are worth reading in full.
    const selection = buildFileSelectionPrompt(pool);
    const selectionResult = await llm.completeStructured<ConventionFileSelection>({
      model: choice.model,
      schema: ConventionFileSelection,
      schemaName: 'ConventionFileSelection',
      messages: [
        { role: 'system', content: selection.system },
        { role: 'user', content: selection.user },
      ],
    });
    // Never trust a path the model invented — intersect with the real pool.
    const poolSet = new Set(pool);
    const toRead = selectionResult.data.paths
      .filter((p) => poolSet.has(p))
      .slice(0, MAX_FILES_TO_READ);

    const filesRead = new Map<string, string>();
    for (const path of toRead) {
      try {
        const content = await this.container.git.readFile(repoRef, path);
        if (content) filesRead.set(path, content.slice(0, MAX_FILE_CHARS));
      } catch {
        // Unreadable file (deleted since indexing, binary, etc.) — skip it.
      }
    }

    let grounded: ReturnType<typeof groundConventions> = [];
    if (filesRead.size > 0) {
      // Call 2 — propose conventions, each grounded against the files just read.
      const extraction = buildExtractionPrompt(
        Array.from(filesRead, ([path, content]) => ({ path, content })),
      );
      const extractionResult = await llm.completeStructured<ConventionExtraction>({
        model: choice.model,
        schema: ConventionExtraction,
        schemaName: 'ConventionExtraction',
        messages: [
          { role: 'system', content: extraction.system },
          { role: 'user', content: extraction.user },
        ],
      });
      grounded = groundConventions(extractionResult.data.conventions, filesRead);
    }

    const accepted = await this.repo.getAccepted(workspaceId, repoId);
    const deduped = dropDuplicatesOfAccepted(grounded, accepted);
    await this.repo.replacePending(workspaceId, repoId, deduped);

    const rows = await this.repo.listForRepo(workspaceId, repoId);
    return sortCandidates(rows).map(toConventionDto);
  }

  /**
   * Create a `repo-conventions` skill from the currently-accepted candidates.
   * The caller supplies the final name/description/body (the user may have
   * edited them in the modal); this just stamps the fixed type/source/evidence.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: { name: string; description: string; body: string },
  ): Promise<Skill> {
    await this.requireRepo(workspaceId, repoId);
    const accepted = await this.repo.getAccepted(workspaceId, repoId);
    if (accepted.length === 0) {
      throw new ValidationError('Accept at least one convention before creating a skill.');
    }
    const evidenceFiles = Array.from(
      new Set(accepted.map((a) => a.evidencePath).filter((p): p is string => !!p)),
    );
    const skills = new SkillsService(this.container);
    return skills.create(workspaceId, {
      name: input.name,
      description: input.description,
      body: input.body,
      type: 'convention',
      source: 'extracted',
      evidenceFiles,
    });
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const row = await this.repos.getById(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repo not found');
    return row;
  }
}
