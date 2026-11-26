import { unzipSync } from 'fflate';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  ARCHIVE_EXTENSIONS,
  DEFAULT_SKILL_TYPE,
  MARKDOWN_EXTENSIONS,
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_BODY_BYTES,
  MAX_DESCRIPTION_CHARS,
} from './constants.js';

/**
 * Skill import parsing — PURE. No disk, no network, no child processes.
 *
 * The product promise is that importing a skill extracts its *core* (one
 * markdown document) and shows it for confirmation. Nothing else in an archive
 * is touched: scripts, binaries and nested archives are listed in
 * `ignored_entries` and their bytes are never decoded, never written, never run.
 * A skill is configuration text; it has no executable component by design.
 *
 * Everything here is in-memory, so the caps in constants.ts bound CPU and heap
 * against a zip bomb rather than protecting a filesystem.
 */

/** Extensions we treat as "an executable component" purely for the warning text. */
const EXECUTABLE_HINTS = [
  '.sh', '.bash', '.zsh', '.py', '.rb', '.pl', '.js', '.mjs', '.cjs', '.ts',
  '.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.ps1', '.jar', '.bin',
];

function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

function baseName(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1);
}

/**
 * An archive entry whose path escapes the archive root (`../`, absolute, or a
 * Windows drive). Nothing is written to disk here, so this cannot actually
 * overwrite a file — but an archive carrying such a path is malformed or
 * hostile, and the honest response is to refuse the whole thing rather than
 * silently import "the good part" of it.
 */
function isUnsafePath(name: string): boolean {
  if (name.startsWith('/') || name.startsWith('\\')) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  return name.split(/[/\\]/).includes('..');
}

/** Strip a leading UTF-8 BOM, which would otherwise break front-matter detection. */
function decodeUtf8(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function truncateDescription(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= MAX_DESCRIPTION_CHARS
    ? flat
    : `${flat.slice(0, MAX_DESCRIPTION_CHARS - 1).trimEnd()}…`;
}

/**
 * Read the scalar keys we care about out of a leading `---` front-matter block.
 *
 * Deliberately NOT a YAML parser: skills only ever need `name`, `description`
 * and `type` as single-line scalars, and pulling in a YAML dependency would add
 * an alias/anchor/merge-key attack surface for zero benefit.
 */
function parseFrontMatter(text: string): { fields: Record<string, string>; rest: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text);
  if (!match) return { fields: {}, rest: text };

  const fields: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2]!.trim();
    // Unwrap a quoted scalar; leave everything else verbatim.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    fields[kv[1]!.toLowerCase()] = value;
  }
  return { fields, rest: text.slice(match[0].length) };
}

/** First `# Heading` in the document, if any. */
function firstHeading(markdown: string): string | undefined {
  const m = /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(markdown);
  return m?.[1]?.trim();
}

/** First prose paragraph — skipping headings, fences, lists and quotes. */
function firstParagraph(markdown: string): string | undefined {
  let inFence = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```') || line.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line === '') continue;
    if (line.startsWith('#') || line.startsWith('>') || line.startsWith('---')) continue;
    if (/^[-*+][ \t]/.test(line) || /^\d+\.[ \t]/.test(line)) continue;
    return line;
  }
  return undefined;
}

/** Fall back to the file's own name, de-slugified, when nothing else names it. */
function nameFromFilename(filename: string): string {
  const base = baseName(filename);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.trim() || 'Imported skill';
}

/**
 * Parse one markdown document into a skill preview. Exported so the archive
 * path and the plain-file path share exactly one set of inference rules.
 */
export function parseMarkdownSkill(
  sourceFile: string,
  markdown: string,
  extras: { ignoredEntries?: string[]; warnings?: string[] } = {},
): SkillImportPreview {
  const warnings = [...(extras.warnings ?? [])];
  const { fields, rest } = parseFrontMatter(markdown);

  const body = rest.trim();
  if (body.length === 0) throw new ValidationError('The skill document is empty.');

  const name = fields.name?.trim() || firstHeading(body) || nameFromFilename(sourceFile);

  let description = fields.description?.trim() ?? '';
  if (!description) {
    description = firstParagraph(body) ?? '';
    if (description) {
      warnings.push(
        'No `description` was declared, so the first paragraph was used. The description is the skill’s interface — rewrite it as a directive before saving.',
      );
    }
  }
  if (!description) {
    warnings.push(
      'No description could be inferred. Write one before saving — it is how an agent decides this skill applies.',
    );
  }

  const declaredType = fields.type?.trim().toLowerCase();
  const parsedType = SkillType.safeParse(declaredType);
  if (declaredType && !parsedType.success) {
    warnings.push(
      `Unrecognised type "${declaredType}" — falling back to "${DEFAULT_SKILL_TYPE}".`,
    );
  }

  return {
    name,
    description: truncateDescription(description),
    type: parsedType.success ? parsedType.data : DEFAULT_SKILL_TYPE,
    body,
    source: 'imported_file',
    source_file: sourceFile,
    ignored_entries: [...(extras.ignoredEntries ?? [])].sort(),
    warnings,
  };
}

/**
 * Pick the document that is the skill's core. `SKILL.md` wins (that is the
 * convention these packs follow); otherwise the shallowest markdown file.
 */
function chooseBodyEntry(markdownNames: string[]): { name: string; warning?: string } {
  const depth = (n: string) => n.split('/').length;
  const byDepthThenName = (a: string, b: string) => depth(a) - depth(b) || a.localeCompare(b);

  const skillMd = markdownNames
    .filter((n) => baseName(n).toLowerCase() === 'skill.md')
    .sort(byDepthThenName);
  if (skillMd.length > 0) return { name: skillMd[0]! };

  const sorted = [...markdownNames].sort(byDepthThenName);
  const chosen = sorted[0]!;
  if (sorted.length > 1) {
    return {
      name: chosen,
      warning: `The archive has no SKILL.md and holds ${sorted.length} markdown files; "${chosen}" was used as the skill body.`,
    };
  }
  return { name: chosen };
}

/** Parse a `.zip` archive into a skill preview. Only one markdown entry is read. */
export function parseZipSkill(filename: string, bytes: Uint8Array): SkillImportPreview {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ValidationError('That archive could not be read. Is it a valid .zip file?');
  }

  // Directory markers carry no content and are not "entries" to a user.
  const names = Object.keys(entries).filter((n) => !n.endsWith('/'));

  if (names.length === 0) throw new ValidationError('The archive is empty.');
  if (names.length > MAX_ARCHIVE_ENTRIES) {
    throw new ValidationError(
      `The archive has ${names.length} entries, over the ${MAX_ARCHIVE_ENTRIES} limit.`,
    );
  }

  const unsafe = names.filter(isUnsafePath);
  if (unsafe.length > 0) {
    throw new ValidationError(
      `The archive contains entries with paths that escape its root (e.g. "${unsafe[0]}"). Refusing to import it.`,
    );
  }

  let total = 0;
  for (const name of names) {
    total += entries[name]!.length;
    if (total > MAX_ARCHIVE_BYTES) {
      throw new ValidationError(
        `The archive expands to more than ${Math.round(MAX_ARCHIVE_BYTES / 1024)} KB. Refusing to import it.`,
      );
    }
  }

  const markdownNames = names.filter((n) => MARKDOWN_EXTENSIONS.includes(extensionOf(n) as never));
  if (markdownNames.length === 0) {
    throw new ValidationError('No markdown file was found in the archive.');
  }

  const { name: bodyEntry, warning } = chooseBodyEntry(markdownNames);
  const bodyBytes = entries[bodyEntry]!;
  if (bodyBytes.length > MAX_BODY_BYTES) {
    throw new ValidationError(
      `"${bodyEntry}" is larger than the ${Math.round(MAX_BODY_BYTES / 1024)} KB limit for a skill body.`,
    );
  }

  const ignored = names.filter((n) => n !== bodyEntry);
  const warnings: string[] = warning ? [warning] : [];
  if (ignored.length > 0) {
    const executables = ignored.filter((n) => EXECUTABLE_HINTS.includes(extensionOf(n)));
    warnings.push(
      executables.length > 0
        ? `${ignored.length} other entr${ignored.length === 1 ? 'y was' : 'ies were'} ignored, including ${executables.length} executable file(s). A skill is configuration text — nothing in the archive is run.`
        : `${ignored.length} other entr${ignored.length === 1 ? 'y was' : 'ies were'} ignored. Only the markdown body is imported.`,
    );
  }

  // Only the chosen entry's bytes are ever decoded.
  return parseMarkdownSkill(bodyEntry, decodeUtf8(bodyBytes), {
    ignoredEntries: ignored,
    warnings,
  });
}

/**
 * Entry point: parse an uploaded file into a preview. Dispatches on extension —
 * the caller has already decoded the base64 transport envelope.
 */
export function parseSkillUpload(filename: string, bytes: Uint8Array): SkillImportPreview {
  const ext = extensionOf(filename);

  if (ARCHIVE_EXTENSIONS.includes(ext as never)) return parseZipSkill(filename, bytes);

  if (MARKDOWN_EXTENSIONS.includes(ext as never)) {
    if (bytes.length > MAX_BODY_BYTES) {
      throw new ValidationError(
        `That file is larger than the ${Math.round(MAX_BODY_BYTES / 1024)} KB limit for a skill body.`,
      );
    }
    return parseMarkdownSkill(baseName(filename), decodeUtf8(bytes));
  }

  throw new ValidationError(
    `Unsupported file type "${ext || filename}". Upload a Markdown file (.md) or a .zip archive.`,
  );
}
