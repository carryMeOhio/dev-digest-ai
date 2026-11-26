/**
 * The exact block the run executor appends under "## Skills / rules"
 * (`server/src/modules/reviews/run-executor.ts`, resolveSkills). Keep the two in
 * step: this tab claims to show what the model sees.
 */
export function promptBlock(name: string, body: string): string {
  return `### Skill: ${name}\n${body}`;
}
