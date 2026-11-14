import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadHousingContent } from '../src/housing';
import { shippedHousing } from '../src/content/housing-lazy';
import { resources } from '../src/content/resources';
import bosses from '../src/content/data/bosses.json';
import destinations from '../src/content/data/destinations.json';
import journal from '../src/content/data/journal.json';

/**
 * What loading the housing content costs: parsing the nine files and validating them with their cross references,
 * the work `@creatures/game/housing-content` does once when its module is first evaluated (once per isolate; no
 * database row is involved, it is static data in the bundle). Times it 20 times and keeps the numbers in
 * `docs/design/housing.md` ("Server cost of the content"). The bound is a loose guard against a content change
 * that makes the load slow by an order of magnitude, not a benchmark: CI machines vary.
 */
const FILES = [
  'forms',
  'rooms',
  'parts',
  'materials',
  'sets',
  'pieces',
  'skins',
  'stamps',
  'starter',
] as const;

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/content/data/housing');
const TEXTS = Object.fromEntries(
  FILES.map((name) => [name, readFileSync(resolve(DIR, `${name}.json`), 'utf8')]),
) as Record<(typeof FILES)[number], string>;

function ms(from: number): number {
  return performance.now() - from;
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

describe('the cost of loading the housing content', () => {
  it('parses and validates in a few milliseconds, with no storage involved', async ({
    annotate,
  }) => {
    const parse: number[] = [];
    const validate: number[] = [];
    for (let i = 0; i < 20; i++) {
      let t = performance.now();
      const raw = Object.fromEntries(
        FILES.map((name) => [name, JSON.parse(TEXTS[name]) as unknown]),
      ) as Record<(typeof FILES)[number], never>;
      parse.push(ms(t));
      t = performance.now();
      loadHousingContent(raw, resources, {
        journalSets: journal.sets.map((s) => s.id),
        bosses: bosses.map((b) => b.id),
        destinations: destinations.map((d) => d.id),
      });
      validate.push(ms(t));
    }
    const total = parse.map((p, i) => p + (validate[i] ?? 0)).sort((a, b) => a - b);
    const stat = (xs: number[]) => {
      const sorted = [...xs].sort((a, b) => a - b);
      return `median ${percentile(sorted, 0.5).toFixed(2)} ms, p95 ${percentile(sorted, 0.95).toFixed(2)} ms`;
    };
    await annotate(
      `housing content load x20: parse ${stat(parse)}; validate ${stat(validate)}; total ${stat(total)}`,
    );
    expect(percentile(total, 0.5)).toBeLessThan(250);
  });

  it('validates once per isolate: every call of the worker accessor returns the same content', () => {
    expect(shippedHousing()).toBe(shippedHousing());
    expect(shippedHousing().parts.length).toBeGreaterThan(0);
  });
});
