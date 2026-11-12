/**
 * The first load of the game carries none of the housing: its content (`@creatures/game/housing-content`, about 89 KB of JSON
 * that is validated when it loads) and its screens and art (`housing/HousePlace`, loaded on demand by `HouseHost`). The check
 * follows every static import (not `import type`, not a dynamic `import()`) from `main.tsx` and fails if one leads to either.
 * (Measured with `vite build`: the main chunk went from 1,905 kB to 1,840 kB when the content left it.)
 */
import { describe, expect, it } from 'vitest';

/** Every source file of the app, as text, keyed by its path from this folder (`./main.tsx`). */
const SOURCES = import.meta.glob<string>(
  ['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

const FORBIDDEN_PACKAGE = '@creatures/game/housing-content';
/** Files that are the housing page itself or hold its content or art. */
const FORBIDDEN_FILES = [
  './housing/HousePlace.tsx',
  './housing/house-art.ts',
  './housing/house-names.ts',
  './housing/HouseRows.tsx',
  './housing/interior-art.ts',
  './housing/house-light.ts',
  './housing/house-paint.ts',
  './housing/house-postcard.ts',
  './housing/house-scene.ts',
];
/** Folders whose every file is housing art or its tooling: none of them may be in the first load. */
const FORBIDDEN_PREFIXES = ['./sprites/workshop/', './sprites/draw/', './sprites/data/house/'];

/** The static (value) imports of a file: `import x from 'y'`, `import 'y'`, `export * from 'y'`. */
function staticImports(source: string): string[] {
  const found: string[] = [];
  const pattern = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (const m of source.matchAll(pattern)) {
    if (m[1] === undefined && m[2] !== undefined) found.push(m[2]);
  }
  return found;
}

/** `./a/b.ts` plus `../c` is `./c`. */
function join(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}

function resolveFile(from: string, spec: string): string | null {
  const base = join(from, spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (candidate in SOURCES) return candidate;
  }
  return null;
}

describe('the first load of the game', () => {
  it('reaches neither the housing content nor the housing page', () => {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const spec of staticImports(SOURCES[file] ?? '')) {
        expect(spec, `${file} imports the housing content`).not.toBe(FORBIDDEN_PACKAGE);
        if (!spec.startsWith('.')) continue;
        const next = resolveFile(file, spec);
        if (next !== null) walk(next);
      }
    };
    walk('./main.tsx');
    expect(seen.size).toBeGreaterThan(100);
    for (const forbidden of FORBIDDEN_FILES) expect(seen.has(forbidden), forbidden).toBe(false);
    for (const prefix of FORBIDDEN_PREFIXES) {
      expect(
        [...seen].filter((f) => f.startsWith(prefix)),
        `the first load reaches ${prefix}`,
      ).toEqual([]);
    }
  });

  it('forbids folders that hold files (a renamed folder would make the check pass by itself)', () => {
    for (const prefix of FORBIDDEN_PREFIXES) {
      expect(
        Object.keys(SOURCES).some((f) => f.startsWith(prefix)),
        prefix,
      ).toBe(true);
    }
    for (const file of FORBIDDEN_FILES) expect(file in SOURCES, file).toBe(true);
  });

  it('would notice a static import of the page (the walk follows real imports)', () => {
    expect(
      staticImports(
        "import { A } from './a';\nimport type { B } from './b';\nconst c = () => import('./c');",
      ),
    ).toEqual(['./a']);
    expect(join('./valley/ValleyFrame.tsx', '../housing/HouseRows')).toBe('./housing/HouseRows');
  });
});
