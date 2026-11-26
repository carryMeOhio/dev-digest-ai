import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseSkillUpload } from '../src/modules/skills/import.js';
import { AppError } from '../src/platform/errors.js';
import { MAX_ARCHIVE_ENTRIES } from '../src/modules/skills/constants.js';

/**
 * Skill import parsing — pure, hermetic (no DB, no Docker, no disk).
 *
 * The product claim these tests defend: importing a skill extracts ONE markdown
 * document and nothing else. Scripts and binaries inside an archive are listed
 * so the user can see what was in there, and are never decoded or run.
 */

const md = (text: string) => strToU8(text);

function zip(entries: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])),
  );
}

describe('parseSkillUpload — markdown', () => {
  it('reads name, description and type from front matter', () => {
    const p = parseSkillUpload(
      'anything.md',
      md(
        '---\nname: no-over-mocking\ndescription: "Flag a test that mocks the unit under test."\ntype: convention\n---\n\n# Rule\n\nDo not mock the subject.',
      ),
    );
    expect(p.name).toBe('no-over-mocking');
    expect(p.description).toBe('Flag a test that mocks the unit under test.');
    expect(p.type).toBe('convention');
    expect(p.body).toContain('Do not mock the subject.');
    // Front matter is metadata, not part of the block sent to the model.
    expect(p.body).not.toContain('---');
    expect(p.source).toBe('imported_file');
  });

  it('falls back to the first heading and first paragraph when there is no front matter', () => {
    const p = parseSkillUpload(
      'skill.md',
      md('# Branch coverage\n\nFlag tests that exercise only the happy path.\n\n- bullet'),
    );
    expect(p.name).toBe('Branch coverage');
    expect(p.description).toBe('Flag tests that exercise only the happy path.');
    expect(p.type).toBe('custom');
    expect(p.warnings.join(' ')).toContain('interface');
  });

  it('skips code fences, lists and quotes when inferring a description', () => {
    const p = parseSkillUpload(
      'x.md',
      md('# T\n\n```ts\nconst a = 1;\n```\n\n> quoted\n\n- item\n\nThe real sentence.'),
    );
    expect(p.description).toBe('The real sentence.');
  });

  it('falls back to the filename when the document has no heading', () => {
    const p = parseSkillUpload('api-contract-gate.md', md('Just prose, no heading.'));
    expect(p.name).toBe('api-contract-gate');
  });

  it('warns and defaults when the declared type is not a known one', () => {
    const p = parseSkillUpload(
      'x.md',
      md('---\nname: n\ndescription: d\ntype: wat\n---\n\nBody.'),
    );
    expect(p.type).toBe('custom');
    expect(p.warnings.join(' ')).toContain('wat');
  });

  it('rejects an empty document', () => {
    expect(() => parseSkillUpload('x.md', md('   \n\n'))).toThrow(AppError);
  });

  it('rejects an unsupported extension', () => {
    expect(() => parseSkillUpload('payload.sh', md('#!/bin/sh\nrm -rf /'))).toThrow(
      /Unsupported file type/,
    );
  });
});

describe('parseSkillUpload — zip archive', () => {
  it('reads SKILL.md and ignores every other entry, naming the executables', () => {
    const archive = zip({
      'pack/SKILL.md': '---\nname: api-contract-gate\ndescription: Flag breaking route changes.\ntype: rubric\n---\n\nCheck the signature.',
      'pack/scripts/run.sh': '#!/bin/sh\necho pwned',
      'pack/assets/logo.png': 'not-really-a-png',
      'pack/README.md': '# readme',
    });

    const p = parseSkillUpload('pack.zip', archive);

    expect(p.name).toBe('api-contract-gate');
    expect(p.source_file).toBe('pack/SKILL.md');
    expect(p.body).toContain('Check the signature.');

    // Everything else is surfaced, not processed.
    expect(p.ignored_entries).toEqual([
      'pack/README.md',
      'pack/assets/logo.png',
      'pack/scripts/run.sh',
    ]);
    // The script's content never reaches the skill.
    expect(p.body).not.toContain('pwned');
    expect(p.warnings.join(' ')).toContain('executable');
    expect(p.warnings.join(' ')).toContain('nothing in the archive is run');
  });

  it('prefers the shallowest SKILL.md over a nested one', () => {
    const p = parseSkillUpload(
      'p.zip',
      zip({ 'deep/nested/SKILL.md': '# deep', 'SKILL.md': '# shallow' }),
    );
    expect(p.source_file).toBe('SKILL.md');
  });

  it('falls back to the shallowest markdown file and warns when there is no SKILL.md', () => {
    const p = parseSkillUpload(
      'p.zip',
      zip({ 'docs/b.md': '# B', 'a.md': '# A\n\nDesc.' }),
    );
    expect(p.source_file).toBe('a.md');
    expect(p.warnings.join(' ')).toContain('no SKILL.md');
  });

  it('refuses an archive whose entry path escapes the root', () => {
    // Nothing is written to disk, so this cannot overwrite anything — but such
    // an archive is malformed or hostile, so we refuse it rather than import
    // "the good part" of it.
    expect(() =>
      parseSkillUpload('evil.zip', zip({ '../../etc/SKILL.md': '# x' })),
    ).toThrow(/escape/);
  });

  it('refuses an archive with an absolute entry path', () => {
    expect(() =>
      parseSkillUpload('evil.zip', zip({ '/etc/SKILL.md': '# x' })),
    ).toThrow(/escape/);
  });

  it('refuses an archive with no markdown at all', () => {
    expect(() =>
      parseSkillUpload('p.zip', zip({ 'run.sh': 'echo hi', 'data.bin': 'xx' })),
    ).toThrow(/No markdown file/);
  });

  it('refuses an empty archive', () => {
    expect(() => parseSkillUpload('p.zip', zip({}))).toThrow(/empty/);
  });

  it('refuses an archive with too many entries', () => {
    const many: Record<string, string> = { 'SKILL.md': '# ok' };
    for (let i = 0; i < MAX_ARCHIVE_ENTRIES + 1; i++) many[`f${i}.txt`] = 'x';
    expect(() => parseSkillUpload('p.zip', zip(many))).toThrow(/limit/);
  });

  it('refuses an archive that expands past the size cap (zip bomb)', () => {
    // Highly compressible: tiny on the wire, large once expanded.
    const huge = 'A'.repeat(5 * 1024 * 1024);
    expect(() =>
      parseSkillUpload('bomb.zip', zip({ 'SKILL.md': '# ok', 'big.txt': huge })),
    ).toThrow(/Refusing to import/);
  });

  it('refuses bytes that are not a zip at all', () => {
    expect(() => parseSkillUpload('p.zip', md('this is not a zip'))).toThrow(
      /could not be read/,
    );
  });
});
