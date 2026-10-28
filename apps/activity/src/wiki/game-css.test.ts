import { describe, expect, it } from 'vitest';
import { cssRules, fontFaces, pickRules, wholeCss } from './game-css';

const CSS = `
/* a comment { with brace } */
:root { --a: 1; }
.tag,
.badge { color: red; }
@media (min-width: 40rem) { .tag { color: blue; } }
.chip   >  .x { gap: 1px; }
`;

describe('the game stylesheet reader', () => {
  it('splits top-level rules, drops comments and keeps at-rules whole', () => {
    const rules = cssRules(CSS);
    expect(rules.map((r) => r.prelude)).toEqual([
      ':root',
      '.tag, .badge',
      '@media (min-width: 40rem)',
      '.chip > .x',
    ]);
    expect(rules[2]?.text).toContain('.tag { color: blue; }');
    expect(CSS).toContain('a comment');
    expect(rules.map((r) => r.text).join('')).not.toContain('comment');
  });

  it('picks rules by selector, in file order, never at-rules, and fails on a missing selector', () => {
    expect(pickRules(CSS, ['.badge', '.chip > .x'])).toBe(
      '.tag,\n.badge { color: red; }\n.chip   >  .x { gap: 1px; }',
    );
    expect(() => pickRules(CSS, ['.gone'])).toThrow('.gone');
  });

  it('refuses @import in a whole file', () => {
    expect(wholeCss(':root { --a: 1; }')).toBe(':root { --a: 1; }');
    expect(() => wholeCss("@import 'x.css'; a { b: c }")).toThrow();
  });

  it('moves the font files to the wiki address and lists them, refusing any other url', () => {
    const fonts = `@font-face { font-family: 'A'; src: url('@fontsource/a-b/files/a-b-latin-400-normal.woff2') format('woff2'); }
@font-face { src: url('@fontsource/a-b/files/a-b-latin-400-normal.woff2'); }`;
    const out = fontFaces(fonts);
    expect(out.files).toEqual(['@fontsource/a-b/files/a-b-latin-400-normal.woff2']);
    expect(out.css).toContain("url('/wiki-fonts/a-b-latin-400-normal.woff2')");
    expect(out.css).not.toContain('@fontsource');
    expect(() => fontFaces("@font-face { src: url('https://x.example/f.woff2'); }")).toThrow();
    expect(() =>
      fontFaces("@font-face { src: url('@fontsource/a/files/../../x.woff2'); }"),
    ).toThrow();
    expect(() => fontFaces('a { b: c }')).toThrow();
  });
});
