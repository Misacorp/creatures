import { build, type Rollup } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The production bundle must contain no debug panel code. This builds the app in memory (nothing is
 * written) the way the deploy does, once for production and once for staging, and searches every
 * emitted file for strings that only the panel has.
 */

const MARKERS = ['DEV_PANEL_MARKER_7f3a', 'dev-drawer', '/api/dev/'];

/**
 * The component workbench (`workbench.html`, `src/workbench/`) is staging-only the same way: a second
 * build input that exists only when the dev tools are in. Strings only it has: its marker, and a
 * class of its stylesheet.
 */
const WORKBENCH_MARKERS = ['WORKBENCH_MARKER_5c1e', 'wb-frame-stage'];

type Output = Rollup.RollupOutput | Rollup.RollupOutput[] | Rollup.RollupWatcher;

async function buildFiles(targetEnv: string): Promise<{ name: string; text: string }[]> {
  vi.stubEnv('TARGET_ENV', targetEnv);
  const result: Output = await build({
    root: '.',
    logLevel: 'silent',
    build: { write: false, emptyOutDir: false },
  });
  const outputs = Array.isArray(result) ? result : 'output' in result ? [result] : [];
  return outputs.flatMap((o) =>
    o.output.map((file) => ({
      name: file.fileName,
      text: file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : '',
    })),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the debug panel and the production build', () => {
  it('is not in a production build', async () => {
    const files = await buildFiles('production');
    expect(files.some((f) => f.name.endsWith('.js'))).toBe(true);
    for (const marker of MARKERS) {
      expect(files.filter((f) => f.text.includes(marker)).map((f) => f.name)).toEqual([]);
    }
    // The game page is still there, and the workbench is not: no page, no code, no styles.
    expect(files.some((f) => f.name === 'index.html')).toBe(true);
    expect(files.some((f) => f.name.includes('workbench'))).toBe(false);
    for (const marker of WORKBENCH_MARKERS) {
      expect(files.filter((f) => f.text.includes(marker)).map((f) => f.name)).toEqual([]);
    }
    // The rarity colours are defined once, as tokens (grey, blue, pink; gold and crimson reserved).
    const css = files
      .filter((f) => f.name.endsWith('.css'))
      .map((f) => f.text)
      .join('\n')
      .replace(/\s+/g, '');
    for (const token of [
      '--rarity-common:#a8a8b8',
      '--rarity-rare:#4da3ff',
      '--rarity-epic:#ff6fbf',
      '--rarity-legendary:var(--gold)',
      '--rarity-mythic:#dc143c',
    ]) {
      expect(css).toContain(token);
    }
    // The item picker's list and find-and-filter options were dropped from the game: only the grid ships.
    const js = files.filter((f) => f.name.endsWith('.js'));
    for (const gone of ['Find an item', 'ip-pinned', 'item-find']) {
      expect(js.filter((f) => f.text.includes(gone)).map((f) => f.name)).toEqual([]);
    }
  }, 60_000);

  it('is not in a build that does not say it is for staging', async () => {
    const files = await buildFiles('');
    for (const marker of MARKERS) {
      expect(files.filter((f) => f.text.includes(marker)).map((f) => f.name)).toEqual([]);
    }
    expect(files.some((f) => f.name.includes('workbench'))).toBe(false);
    for (const marker of WORKBENCH_MARKERS) {
      expect(files.filter((f) => f.text.includes(marker)).map((f) => f.name)).toEqual([]);
    }
  }, 60_000);

  it('is a separate lazy chunk in a staging build (so the search above can find it)', async () => {
    const files = await buildFiles('staging');
    const panel = files.filter((f) => f.text.includes('DEV_PANEL_MARKER_7f3a'));
    expect(panel).toHaveLength(1);
    const entry = files.find((f) => f.name.endsWith('.js') && /index/.test(f.name));
    expect(entry?.text.includes('DEV_PANEL_MARKER_7f3a')).toBe(false);
    expect(files.some((f) => f.name.endsWith('.css') && f.text.includes('dev-drawer'))).toBe(true);
  }, 60_000);

  it('has the workbench page in a staging build, apart from the game page', async () => {
    const files = await buildFiles('staging');
    expect(files.some((f) => f.name === 'workbench.html')).toBe(true);
    expect(files.some((f) => f.name === 'index.html')).toBe(true);
    const bundles = files.filter((f) => f.text.includes('WORKBENCH_MARKER_5c1e'));
    expect(bundles.map((f) => f.name.endsWith('.js'))).toEqual([true]);
    // The game's own page never loads the workbench bundle.
    const gamePage = files.find((f) => f.name === 'index.html');
    expect(gamePage?.text.includes(bundles[0]?.name ?? 'x')).toBe(false);
    expect(files.some((f) => f.name.endsWith('.css') && f.text.includes('wb-frame-stage'))).toBe(
      true,
    );
    // It makes no API calls: nothing in the workbench bundle names the API.
    expect(bundles[0]?.text.includes('/api/')).toBe(false);
  }, 60_000);
});
