import { describe, it, expect } from 'vitest';
import {
  dropDuplicatesOfAccepted,
  groundConventions,
  sortCandidates,
  toConventionDto,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/db/rows.js';
import type { ExtractedConvention } from '../src/modules/conventions/prompt.js';

function row(overrides: Partial<ConventionRow> = {}): ConventionRow {
  return {
    id: 'c1',
    workspaceId: 'w1',
    repoId: 'r1',
    rule: 'Always use TypeORM entity decorators',
    evidencePath: 'src/entities/Order.ts',
    evidenceSnippet: '@Entity("orders")',
    confidence: 0.9,
    accepted: false,
    ...overrides,
  } as ConventionRow;
}

function candidate(overrides: Partial<ExtractedConvention> = {}): ExtractedConvention {
  return {
    rule: 'Always use TypeORM entity decorators',
    evidence_path: 'src/entities/Order.ts',
    evidence_snippet: '@Entity("orders")',
    confidence: 0.9,
    ...overrides,
  };
}

describe('toConventionDto', () => {
  it('maps nullable DB evidence fields to empty strings on the DTO', () => {
    const dto = toConventionDto(row({ evidencePath: null, evidenceSnippet: null, confidence: null }));
    expect(dto).toMatchObject({ evidence_path: '', evidence_snippet: '', confidence: 0 });
  });
});

describe('sortCandidates', () => {
  it('puts accepted rows first, then orders by confidence descending', () => {
    const rows = [
      row({ id: 'low', accepted: false, confidence: 0.3 }),
      row({ id: 'accepted', accepted: true, confidence: 0.1 }),
      row({ id: 'high', accepted: false, confidence: 0.8 }),
    ];
    expect(sortCandidates(rows).map((r) => r.id)).toEqual(['accepted', 'high', 'low']);
  });
});

describe('groundConventions', () => {
  it('keeps a candidate whose snippet is a real substring of the file it cites', () => {
    const files = new Map([['src/entities/Order.ts', 'line1\n@Entity("orders")\nline3']]);
    const out = groundConventions([candidate()], files);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: candidate().rule, evidencePath: 'src/entities/Order.ts' });
  });

  it('tolerates whitespace/indentation drift between the snippet and the file', () => {
    const files = new Map([
      ['src/entities/Order.ts', 'line1\n  @Entity(\n    "orders"\n  )\nline3'],
    ]);
    const out = groundConventions(
      [candidate({ evidence_snippet: '@Entity(\n  "orders"\n)' })],
      files,
    );
    expect(out).toHaveLength(1);
  });

  it('drops a candidate citing a file that was never read (hallucinated path)', () => {
    const files = new Map([['src/entities/Order.ts', '@Entity("orders")']]);
    const out = groundConventions([candidate({ evidence_path: 'src/entities/Ghost.ts' })], files);
    expect(out).toHaveLength(0);
  });

  it('drops a candidate whose snippet is paraphrased, not quoted', () => {
    const files = new Map([['src/entities/Order.ts', '@Entity("orders")']]);
    const out = groundConventions(
      [candidate({ evidence_snippet: 'the Order entity is decorated with @Entity' })],
      files,
    );
    expect(out).toHaveLength(0);
  });

  it('clamps an out-of-range confidence into [0, 1]', () => {
    const files = new Map([['src/entities/Order.ts', '@Entity("orders")']]);
    const out = groundConventions([candidate({ confidence: 1.4 })], files);
    expect(out[0]?.confidence).toBe(1);
  });
});

describe('dropDuplicatesOfAccepted', () => {
  it('drops a re-extracted candidate that duplicates an already-accepted rule + file', () => {
    const accepted = [row({ id: 'a1', accepted: true })];
    const grounded = groundConventions(
      [candidate()],
      new Map([['src/entities/Order.ts', '@Entity("orders")']]),
    );
    expect(dropDuplicatesOfAccepted(grounded, accepted)).toHaveLength(0);
  });

  it('keeps a candidate that differs in rule text or evidence file', () => {
    const accepted = [row({ id: 'a1', accepted: true, rule: 'A different rule' })];
    const grounded = groundConventions(
      [candidate()],
      new Map([['src/entities/Order.ts', '@Entity("orders")']]),
    );
    expect(dropDuplicatesOfAccepted(grounded, accepted)).toHaveLength(1);
  });
});
