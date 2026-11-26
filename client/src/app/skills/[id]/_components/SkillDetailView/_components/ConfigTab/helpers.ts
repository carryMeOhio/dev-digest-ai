/**
 * Rough token estimate for the editor's live counter — chars ÷ 4, the same
 * fallback the server tokenizer uses. The browser has no tokenizer; the exact
 * per-run figure is in the run trace. Shown with a "~" for that reason.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
