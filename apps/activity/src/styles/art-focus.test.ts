/**
 * The rule for art scenes (`styles/views/art-focus.css`; Misa, 2026-11-15): no focus ring on a target in an art scene, and an in-world
 * cue on keyboard focus only. The browser check (computed style on a real focus) is in `scripts/e2e-valley.mjs`; this one keeps the
 * stylesheet honest: every kind of target is in the one rule, and no other rule gives one a ring.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The tests run from the package's folder. */
const root = 'src/styles';
const css = (rel: string): string => readFileSync(`${root}/${rel}`, 'utf8');

/** The kinds of target in an art scene, as the art-focus rule names them. */
const TARGETS = ['.cv-target', '.vy-place', '.vy-mon', '.vy-stand-btn', '.vy-edge', '.vy-hatch'];

describe('focus in art scenes', () => {
  const rule = css('views/art-focus.css');

  it('names every kind of target once for the no-outline rule and once for the cue', () => {
    for (const target of [
      ...TARGETS,
      '.sg-map .wm-marker',
      '.pc-below',
      '.house-room',
      '.house-fixture',
      '.house-spot',
      '.house-creature',
    ]) {
      expect(rule.split(target).length - 1, target).toBeGreaterThanOrEqual(2);
    }
    expect(rule).toMatch(/:is\(:focus, :focus-visible\)[^{]*\{\s*outline: none;/s);
  });

  it('draws the cue only on :focus-visible, as a gold arrow, with no outline', () => {
    expect(rule).toMatch(/:focus-visible::after \{[^}]*content: '';/s);
    expect(rule).toMatch(/:focus-visible::after \{[^}]*background: var\(--gold\)/s);
    const cue = rule.slice(rule.indexOf(':focus-visible::after'));
    expect(cue).not.toMatch(/outline:/);
  });

  it('is imported after the rules it overrides', () => {
    const index = css('index.css');
    const at = (name: string): number => index.indexOf(name);
    expect(at('art-focus.css')).toBeGreaterThan(at('valley.css'));
    expect(at('art-focus.css')).toBeGreaterThan(at('canvas.css'));
    expect(at('art-focus.css')).toBeGreaterThan(at('signpost-canvas.css'));
  });

  it('no other rule draws a ring on the focus of a target of an art scene', () => {
    // The files that style an art scene's targets (a new one is added here with its target).
    const files = [
      'views/valley.css',
      'views/canvas.css',
      'views/signpost-canvas.css',
      'views/bonfire-canvas.css',
      'views/expeditions/world-map.css',
      'components/creature-pop.css',
      'components/main-nav.css',
      'components/pan-hint.css',
    ];
    const ring = /(outline:\s*(?!none)[^;]+|box-shadow:\s*var\(--ring\))/;
    for (const file of files) {
      for (const [, selector = '', body = ''] of css(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selector.includes(':focus')) continue;
        const names = TARGETS.some((t) =>
          new RegExp(`${t.replace('.', '\\.')}(?![\\w-])`).test(selector),
        );
        if (!names) continue;
        expect(body, `${file}: ${selector.trim()}`).not.toMatch(ring);
      }
    }
  });
});
