/** Route to a skill's editor, opening on a given tab (Config by default). */
export function skillHref(id: string, tab = "config"): string {
  return `/skills/${id}?tab=${tab}`;
}
