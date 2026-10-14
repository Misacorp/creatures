import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Guard for one wording rule: a count against a total is written with a spaced slash, "1 / 3",
 * never "1 of 3" (Misa, 2026-10-14; `docs/design/decisions.md` and the style rules in
 * `docs/compendium/README.md`).
 *
 * Checks every string value in the content JSON (`src/content/data/`), and the string literals and
 * templates in the TypeScript sources of this package. Code comments are never checked. Ordinary
 * prose that only contains the word "of" ("a share of its Attack") does not match: the pattern
 * needs a number or a template placeholder on both sides.
 *
 * To fix a failure, write the count as "<n> / <m>". If the text really is prose and not a counter
 * against a total, add it to `ALLOWED` with a reason (keep that list tiny).
 */

const RULE =
  'Counts against a total use a spaced slash ("1 / 3"), never "1 of 3". See the style rules in docs/compendium/README.md and docs/design/decisions.md (2026-10-14). If this is ordinary prose, add it to ALLOWED in packages/game/test/count-wording.test.ts with a reason.';

/** A digit run or a template placeholder, then "of", then the same. */
const COUNT_OF = /(?:\b\d+|\{\})\s+of\s+(?:\d+\b|\{\})/;

/** Justified prose exceptions: the file (relative to `src/`) and the exact text found. */
const ALLOWED: { file: string; text: string; reason: string }[] = [];

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../src');

function matches(text: string): boolean {
  return COUNT_OF.test(text.replace(/\s+/g, ' '));
}

/** Every string in a parsed JSON value (object keys are not player text). */
function jsonStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(jsonStrings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(jsonStrings);
  return [];
}

/** Wording in the strings and templates of a TypeScript file that breaks the rule. */
function findOfCounts(file: string, source: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hits: string[] = [];
  const check = (text: string): void => {
    if (matches(text)) hits.push(text.replace(/\s+/g, ' ').trim());
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node.text);
    else if (ts.isTemplateExpression(node))
      check(node.head.text + node.templateSpans.map((s) => `{}${s.literal.text}`).join(''));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return hits;
}

const sourceFiles = readdirSync(src, { recursive: true }).filter((p) => p.endsWith('.ts'));
const jsonFiles = readdirSync(resolve(src, 'content/data'), { recursive: true }).filter((p) =>
  p.endsWith('.json'),
);

describe('count wording: a spaced slash, never "of"', () => {
  it('scans the content data and the sources', () => {
    expect(jsonFiles.length).toBeGreaterThan(10);
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it('flags the old wording and leaves prose alone (scanner self-test)', () => {
    for (const code of ['const a = "Level 1 of 5";', 'const a = `Slot ${n} of ${m}`;']) {
      expect(findOfCounts('x.ts', code), code).not.toEqual([]);
    }
    for (const code of [
      'const a = "A row of 1 or 2 creatures";',
      'const a = "3 of your creatures";',
      'const a = `${n} of the row`;',
      'const a = `Slot ${n} / ${m}`;',
      '// "Level 1 of 5" in a comment',
    ]) {
      expect(findOfCounts('x.ts', code), code).toEqual([]);
    }
  });

  it('has no "<n> of <m>" counts in the content JSON', () => {
    const found: string[] = [];
    for (const name of jsonFiles) {
      const file = `content/data/${name}`;
      const strings = jsonStrings(JSON.parse(readFileSync(resolve(src, file), 'utf8')));
      for (const text of strings) {
        if (matches(text) && !ALLOWED.some((a) => a.file === file && a.text === text)) {
          found.push(`${file}: "${text}"`);
        }
      }
    }
    expect(found, `${RULE}\n${found.join('\n')}`).toEqual([]);
  });

  it('has no "<n> of <m>" counts in string literals or templates', () => {
    const found: string[] = [];
    for (const file of sourceFiles) {
      for (const text of findOfCounts(file, readFileSync(resolve(src, file), 'utf8'))) {
        if (!ALLOWED.some((a) => a.file === file && a.text === text)) {
          found.push(`${file}: "${text}"`);
        }
      }
    }
    expect(found, `${RULE}\n${found.join('\n')}`).toEqual([]);
  });

  it('keeps the allowlist tiny', () => {
    expect(ALLOWED.length).toBeLessThanOrEqual(3);
  });
});
