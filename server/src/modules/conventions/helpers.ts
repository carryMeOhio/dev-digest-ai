import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';
import type { ExtractedConvention } from './prompt.js';

/** Map a persisted convention row to the public `ConventionCandidate` DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}

/** Sort accepted-first, then by confidence descending — the list order the page expects. */
export function sortCandidates(rows: ConventionRow[]): ConventionRow[] {
  return [...rows].sort((a, b) => {
    if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });
}

/** Whitespace-insensitive substring check — tolerates re-indentation/line-ending drift. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export interface GroundedConvention {
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;
}

/**
 * Grounding gate for extracted conventions — mirrors reviewer-core's
 * `groundFindings`: a candidate is kept only if its cited file was actually
 * read and its snippet (whitespace-normalized) is a real substring of that
 * file's content. Confidence is clamped to [0, 1] regardless of what the
 * model reported.
 */
export function groundConventions(
  candidates: ExtractedConvention[],
  filesRead: Map<string, string>,
): GroundedConvention[] {
  const out: GroundedConvention[] = [];
  for (const c of candidates) {
    const content = filesRead.get(c.evidence_path);
    if (content == null) continue;
    if (!normalizeWhitespace(content).includes(normalizeWhitespace(c.evidence_snippet))) continue;
    out.push({
      rule: c.rule,
      evidencePath: c.evidence_path,
      evidenceSnippet: c.evidence_snippet,
      confidence: Math.max(0, Math.min(1, c.confidence)),
    });
  }
  return out;
}

/** Normalize a rule for duplicate detection — case/whitespace-insensitive. */
function normalizeRuleKey(rule: string, evidencePath: string): string {
  return `${normalizeWhitespace(rule).toLowerCase()}::${evidencePath}`;
}

/**
 * Drop any newly-grounded candidate that duplicates an already-accepted rule
 * (same rule text + same evidence file) — re-scanning should not reintroduce
 * something the user already accepted, even under a new id.
 */
export function dropDuplicatesOfAccepted(
  candidates: GroundedConvention[],
  accepted: ConventionRow[],
): GroundedConvention[] {
  const acceptedKeys = new Set(
    accepted.map((a) => normalizeRuleKey(a.rule, a.evidencePath ?? '')),
  );
  return candidates.filter(
    (c) => !acceptedKeys.has(normalizeRuleKey(c.rule, c.evidencePath)),
  );
}
