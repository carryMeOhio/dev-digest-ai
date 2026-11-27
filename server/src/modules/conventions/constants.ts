/** Constants for the conventions module. */

/** How many ranked sample paths to pull from repo-intel before file selection. */
export const SAMPLE_POOL = 40;

/** Max files the model may pick to read in full (keeps call 2's prompt bounded). */
export const MAX_FILES_TO_READ = 12;

/** Each read file is truncated to this many characters before it goes in the prompt. */
export const MAX_FILE_CHARS = 6_000;

/** Floor/ceiling on how many conventions we ask the model to extract. */
export const MIN_CONVENTIONS = 5;
export const MAX_CONVENTIONS = 15;

/** Rate limit for the extraction endpoint — mirrors the skills import route. */
export const EXTRACT_RATE_LIMIT = { max: 5, timeWindow: '1 minute' } as const;
