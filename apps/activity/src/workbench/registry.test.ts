import { describe, expect, it } from 'vitest';
import { cleanProps, presetProps } from './props';
import { ENTRIES, coveredNames, entriesByGroup, findEntry } from './registry';
import { GROUPS } from './types';

/**
 * The workbench must show every component of `src/ui/`, so a new one cannot be forgotten (the same
 * idea as the compendium test of `packages/game`). To fix a failure, add an entry for the named
 * component under `src/workbench/entries/` (see `docs/design/workbench.md`).
 */

const sources = import.meta.glob<string>(
  [
    '../*.tsx',
    '../ui/*.tsx',
    '../sprites/*.tsx',
    '../stage/*.tsx',
    '../games/*.tsx',
    '../games/art/*.tsx',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

/** Exported names of a source file (functions and constants). */
function exportsOf(source: string): string[] {
  return [...source.matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map(
    (m) => m[1] ?? '',
  );
}

/** What `src/ui/*.tsx` exports that is not a component to draw (hooks and a props helper). */
const NOT_COMPONENTS = new Set(['popupProps', 'useRevealSequence']);

describe('every component of src/ui has a workbench page', () => {
  const uiFiles = Object.keys(sources).filter((key) => key.startsWith('../ui/'));

  it('finds the ui files', () => {
    expect(uiFiles.length).toBeGreaterThan(15);
  });

  it('has a page (or a "covers" line) for every exported component', () => {
    const covered = coveredNames();
    const missing: string[] = [];
    for (const file of uiFiles) {
      for (const name of exportsOf(sources[file] ?? '')) {
        if (NOT_COMPONENTS.has(name)) continue;
        if (!covered.has(name)) {
          missing.push(`add a workbench entry for ${name} (src/ui/${file.slice('../ui/'.length)})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('the entries', () => {
  it('have unique names, known groups and a sentence of description', () => {
    expect(new Set(ENTRIES.map((e) => e.name)).size).toBe(ENTRIES.length);
    for (const entry of ENTRIES) {
      expect(GROUPS).toContain(entry.group);
      expect(entry.description.length).toBeGreaterThan(30);
      expect(entry.description.trim().endsWith('.')).toBe(true);
    }
  });

  it('use every group, and group them in order', () => {
    expect(entriesByGroup().map((g) => g.group)).toEqual([...GROUPS]);
  });

  it('point at a real file that exports the component they are named after', () => {
    for (const entry of ENTRIES) {
      const key = entry.file.replace('apps/activity/src/', '../');
      const source = sources[key];
      expect(source, `${entry.name}: ${entry.file} does not exist`).toBeDefined();
      for (const name of [entry.name, ...(entry.covers ?? [])]) {
        expect(
          exportsOf(source ?? ''),
          `${entry.name}: ${name} is not exported by ${entry.file}`,
        ).toContain(name);
      }
    }
  });

  it('have a default for every control, and defaults that fit their controls', () => {
    for (const entry of ENTRIES) {
      expect(Object.keys(entry.defaults).sort(), entry.name).toEqual(
        Object.keys(entry.controls).sort(),
      );
      expect(cleanProps(entry, entry.defaults), entry.name).toEqual(entry.defaults);
    }
  });

  it('have presets that only name real props with values that fit', () => {
    for (const entry of ENTRIES) {
      const names = new Set<string>();
      for (const preset of entry.presets) {
        expect(names.has(preset.name), `${entry.name}: preset ${preset.name} twice`).toBe(false);
        names.add(preset.name);
        const merged = { ...entry.defaults, ...preset.props };
        for (const key of Object.keys(preset.props)) {
          expect(
            entry.controls[key],
            `${entry.name}/${preset.name}: no control ${key}`,
          ).toBeDefined();
        }
        expect(presetProps(entry, preset), `${entry.name}/${preset.name}`).toEqual(merged);
      }
    }
  });

  it('build their preview for the defaults and for every preset without throwing', () => {
    for (const entry of ENTRIES) {
      expect(() => entry.render(entry.defaults), entry.name).not.toThrow();
      for (const preset of entry.presets) {
        expect(
          () => entry.render(presetProps(entry, preset)),
          `${entry.name}/${preset.name}`,
        ).not.toThrow();
      }
    }
  });

  it('are found by name', () => {
    expect(findEntry('Bar')?.file).toBe('apps/activity/src/ui/Bar.tsx');
    expect(findEntry('Nope')).toBeNull();
    expect(findEntry(null)).toBeNull();
  });
});
