/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default type when an import can't infer one from the document. */
export const DEFAULT_SKILL_TYPE = 'custom' as const;

/** Default source for a skill created through the editor. */
export const DEFAULT_SKILL_SOURCE = 'manual' as const;

// ---- Import limits -------------------------------------------------------
// An import is parsed ENTIRELY IN MEMORY and nothing is written to disk, so
// these caps exist to bound CPU/heap on a hostile archive (zip bomb), not to
// protect a filesystem.

/** Max entries in an archive before it is rejected outright. */
export const MAX_ARCHIVE_ENTRIES = 512;

/** Max total UNCOMPRESSED bytes across all entries. */
export const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;

/** Max size of the markdown body we will accept as a skill. */
export const MAX_BODY_BYTES = 256 * 1024;

/** Description is a one-line interface; longer text is truncated to this. */
export const MAX_DESCRIPTION_CHARS = 300;

/** Accepted upload extensions. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;
export const ARCHIVE_EXTENSIONS = ['.zip'] as const;
