import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Guard for one wording rule: a count against a total is written with a spaced slash, "1 / 3",
 * never "1 of 3" (Misa, 2026-10-14; `docs/design/decisions.md` and the style rules in
 * `docs/compendium/README.md`). Units stay after the count: "200 / 2500 XP", "Room 1 / 3".
 *
 * The test reads every non-test source file of the Activity and checks, using the TypeScript
 * parser, string literals, template strings (`${a} of ${b}`) and JSX text (`{a} of {b}`). Code
 * comments are never checked. Ordinary prose that only contains the word "of" ("3 of your
 * creatures") does not match: the pattern needs a number or a placeholder on both sides.
 *
 * To fix a failure, write the count as "<n> / <m>". If the text really is prose and not a counter
 * against a total, add it to `ALLOWED` with a reason (keep that list tiny).
 */

const RULE =
  'Counts against a total use a spaced slash ("1 / 3"), never "1 of 3". See the style rules in docs/compendium/README.md and docs/design/decisions.md (2026-10-14). If this is ordinary prose, add it to ALLOWED in apps/activity/src/count-wording.test.ts with a reason.';

/** A digit run or a template or JSX placeholder, then "of", then the same. */
const COUNT_OF = /(?:\b\d+|\{\})\s+of\s+(?:\d+\b|\{\})/;

/**
 * An element whose whole text is "of 12" or "of {total}": the count was split over sibling elements
 * ("Round", the number, then "of 12"), which `COUNT_OF` cannot see because the number is not in the
 * same element.
 */
const SPLIT_OF = /^of\s+(?:\d+|\{\})$/;

/** Justified prose exceptions: the file (relative to `src/`) and the exact text found. */
const ALLOWED: { file: string; text: string; reason: string }[] = [];

const sources = import.meta.glob<string>(
  ['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'],
  { query: '?raw', import: 'default', eager: true },
);

/** Wording that breaks the rule in `source`: each hit is the offending text. */
function findOfCounts(file: string, source: string): string[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const hits: string[] = [];
  const check = (text: string): void => {
    const flat = text.replace(/\s+/g, ' ');
    if (COUNT_OF.test(flat) || SPLIT_OF.test(flat.trim())) hits.push(flat.trim());
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      check(node.text);
    } else if (ts.isTemplateExpression(node)) {
      check(node.head.text + node.templateSpans.map((s) => `{}${s.literal.text}`).join(''));
    } else if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      // The children read as one sentence: text stays text, every `{expression}` is a placeholder.
      check(
        node.children
          .map((child) => {
            if (ts.isJsxText(child)) return child.text;
            if (ts.isJsxExpression(child)) {
              const e = child.expression;
              if (
                e !== undefined &&
                (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
              )
                return e.text;
              return '{}';
            }
            return '{}';
          })
          .join(''),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return hits;
}

describe('count wording: a spaced slash, never "of"', () => {
  it('scans the Activity sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('flags the old wording and leaves prose alone (scanner self-test)', () => {
    const flagged = [
      'const a = "Round 1 of 3";',
      'const a = `Room ${n} of ${m}`;',
      'const a = `${n} of 5 stars`;',
      'const a = <p>Round {n} of {m}.</p>;',
      'const a = <p>Pick 3 ({n} of 3)</p>;',
      'const a = <p>{"7 of 40"}</p>;',
      'const a = <p><span>Round</span><span>{n}</span><span class="of">of {m}</span></p>;',
      'const a = <span>of 12</span>;',
    ];
    for (const code of flagged) expect(findOfCounts('x.tsx', code), code).not.toEqual([]);
    const fine = [
      'const a = "3 of your creatures";',
      'const a = `${n} of your setups were lost`;',
      'const a = "one of the four bosses";',
      'const a = `Room ${n} / ${m}`;',
      'const a = <p>{n} / {m} XP</p>;',
      'const a = <span>of course</span>;',
      'const a = <p><span>Round</span><span>{n}</span><span>/ {m}</span></p>;',
      '// "Round 1 of 3" in a comment',
    ];
    for (const code of fine) expect(findOfCounts('x.tsx', code), code).toEqual([]);
  });

  it('has no "<n> of <m>" counts in strings, templates or JSX text', () => {
    const found: string[] = [];
    for (const [path, source] of Object.entries(sources)) {
      const file = path.replace(/^\.\//, '');
      for (const text of findOfCounts(file, source)) {
        if (ALLOWED.some((a) => a.file === file && a.text === text)) continue;
        found.push(`${file}: "${text}"`);
      }
    }
    expect(found, `${RULE}\n${found.join('\n')}`).toEqual([]);
  });

  it('keeps the allowlist tiny, and every entry still needed', () => {
    expect(ALLOWED.length).toBeLessThanOrEqual(3);
    for (const a of ALLOWED) {
      const source = sources[`./${a.file}`];
      expect(source, `${a.file} exists`).toBeDefined();
      expect(findOfCounts(a.file, source ?? ''), a.reason).toContain(a.text);
    }
  });
});
