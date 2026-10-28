/**
 * Reads the game's own stylesheets so the wiki looks like the game and follows it when it is restyled:
 * the wiki's CSS is made at build time from the source files of `src/styles/` (the tokens, the tag and chip
 * rules, the stat table) instead of copies of their values. Pure text work with no I/O, so it is unit
 * tested; the plugin reads the files.
 *
 * Rules are picked by selector. A selector that matches nothing is an error: if the game renames a class
 * the wiki build fails loudly instead of quietly losing a look.
 */

export interface CssRule {
  /** The selector list, whitespace normalised ("a,\n b" becomes "a, b"). */
  prelude: string;
  /** The whole rule, comments removed. */
  text: string;
}

/** The top-level rules of a stylesheet, comments removed. At-rules (`@media`, `@font-face`) are kept whole. */
export function cssRules(css: string): CssRule[] {
  const clean = css.replace(/\/\*[^]*?\*\//g, '');
  const rules: CssRule[] = [];
  let depth = 0;
  let start = 0;
  let open = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean.charAt(i);
    if (ch === '{') {
      if (depth === 0) open = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        rules.push({
          prelude: clean.slice(start, open).replace(/\s+/g, ' ').trim(),
          text: clean.slice(start, i + 1).trim(),
        });
        start = i + 1;
      }
    }
  }
  return rules;
}

/** The selectors of a rule's selector list, one by one. */
function selectorsOf(prelude: string): string[] {
  return prelude.split(',').map((s) => s.trim());
}

/**
 * Every rule of `css` that has one of `selectors` in its selector list, in the file's order (so the
 * cascade is the game's). Throws when a wanted selector is in no rule. At-rules are never picked.
 */
export function pickRules(css: string, selectors: readonly string[]): string {
  const wanted = new Set(selectors);
  const found = new Set<string>();
  const out: string[] = [];
  for (const rule of cssRules(css)) {
    if (rule.prelude.startsWith('@')) continue;
    const hit = selectorsOf(rule.prelude).filter((s) => wanted.has(s));
    if (hit.length === 0) continue;
    for (const s of hit) found.add(s);
    out.push(rule.text);
  }
  const missing = selectors.filter((s) => !found.has(s));
  if (missing.length > 0) {
    throw new Error(`the game's stylesheet has no rule for: ${missing.join(', ')}`);
  }
  return out.join('\n');
}

/** A whole stylesheet without its comments (for a file that is all tokens or all one component). */
export function wholeCss(css: string): string {
  const rules = cssRules(css);
  if (rules.some((r) => r.prelude.startsWith('@import'))) throw new Error('@import is not allowed');
  return rules.map((r) => r.text).join('\n');
}

/** Where the wiki serves the game's font files from. */
export const FONT_DIR = '/wiki-fonts';

/**
 * The game's `@font-face` rules (`fonts.css`, with the sizes it tunes) with each file moved to the wiki's
 * own address, and the files to copy: `@fontsource/<package>/files/<name>`. Any other `url(...)` is an error.
 */
export function fontFaces(css: string): { css: string; files: string[] } {
  const files: string[] = [];
  const faces = cssRules(css).filter((r) => r.prelude === '@font-face');
  if (faces.length === 0) throw new Error('the game has no @font-face rules');
  const out = faces.map((face) =>
    face.text.replace(/url\(([^)]*)\)/g, (_all, raw: string) => {
      const match = /^['"]?(@fontsource\/[a-z0-9-]+\/files\/([a-z0-9-]+\.woff2))['"]?$/.exec(
        raw.trim(),
      );
      if (match?.[1] === undefined || match[2] === undefined) {
        throw new Error(`unexpected font address ${raw}`);
      }
      files.push(match[1]);
      return `url('${FONT_DIR}/${match[2]}')`;
    }),
  );
  return { css: out.join('\n'), files: [...new Set(files)] };
}
