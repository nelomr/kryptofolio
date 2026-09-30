/**
 * Fills `{name}` placeholders in one pass. A replacer function keeps parameter values literal
 * (a string replacement would expand `$&`, `$$` and friends), and a single pass means a value that
 * happens to contain `{other}` is never expanded by a later parameter. Unknown placeholders stay as written.
 */
export function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? params[name] : placeholder,
  );
}
