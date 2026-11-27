import { z } from 'zod';
import { wrapUntrusted, INJECTION_GUARD } from '../../platform/prompt.js';
import { MAX_CONVENTIONS, MAX_FILES_TO_READ, MIN_CONVENTIONS } from './constants.js';

/**
 * Two-step LLM dialogue for convention extraction:
 *   1. `ConventionFileSelection` — given a pool of ranked candidate paths
 *      (names only, no content), the model picks which ones are worth reading.
 *   2. `ConventionExtraction` — given the full content of those files, the
 *      model proposes rules with evidence, grounded by `helpers.ts` afterward.
 *
 * Both schema names match `MockLLMProvider.structuredBySchema` keys already
 * documented in `adapters/mocks.ts`.
 */

export const ConventionFileSelection = z.object({
  paths: z.array(z.string()).max(MAX_FILES_TO_READ),
});
export type ConventionFileSelection = z.infer<typeof ConventionFileSelection>;

export const ExtractedConvention = z.object({
  rule: z.string().min(1),
  evidence_path: z.string().min(1),
  evidence_snippet: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type ExtractedConvention = z.infer<typeof ExtractedConvention>;

export const ConventionExtraction = z.object({
  conventions: z.array(ExtractedConvention),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

/** System prompt for call 1 — pick which sampled files are worth reading. */
export function buildFileSelectionPrompt(paths: string[]): {
  system: string;
  user: string;
} {
  const system =
    `You help extract a team's coding conventions from their repository. You will be ` +
    `given a list of file paths, ranked by importance, sampled from the repo. Pick up to ` +
    `${MAX_FILES_TO_READ} of them whose CONTENTS are most likely to reveal house conventions ` +
    `— naming, error handling, module structure, testing patterns, API shape — not files ` +
    `that are merely important to the business logic. Return ONLY paths from the list given ` +
    `to you; never invent a path.`;
  const user = `## Candidate files\n${wrapUntrusted('candidate-paths', paths.join('\n'))}`;
  return { system: `${system}\n\n${INJECTION_GUARD}`, user };
}

/** System prompt for call 2 — extract grounded conventions from file contents. */
export function buildExtractionPrompt(files: { path: string; content: string }[]): {
  system: string;
  user: string;
} {
  const system =
    `You extract a team's CODING CONVENTIONS from real source files — the agreements a ` +
    `team has settled into, not generic language advice. Good examples: "always use TypeORM ` +
    `entity decorators to define database models", "repository methods are prefixed with ` +
    `find/get/list", "errors are thrown as AppError subclasses, never raw Error". Bad examples ` +
    `(do not report these): "use consistent indentation", "write clear variable names", or ` +
    `anything that is just good practice in any codebase rather than THIS team's choice.\n\n` +
    `Propose between ${MIN_CONVENTIONS} and ${MAX_CONVENTIONS} conventions. Each one must cite ` +
    `exactly one file (its exact path as given) and a SHORT verbatim snippet (1-6 lines, copied ` +
    `character-for-character from that file) that demonstrates the rule. Never paraphrase the ` +
    `snippet and never cite a file or line that isn't in the content you were given — every ` +
    `claim is checked against the real file afterward and dropped if it doesn't match. Set ` +
    `confidence (0-1) by how consistently the pattern recurs across the given files.`;
  const user = files
    .map((f) => `## File: ${f.path}\n${wrapUntrusted(f.path, f.content)}`)
    .join('\n\n');
  return { system: `${system}\n\n${INJECTION_GUARD}`, user };
}
