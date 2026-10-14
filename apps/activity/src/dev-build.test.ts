import { build, type Rollup } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The production bundle must contain no debug panel code. This builds the app in memory (nothing is
 * written) the way the deploy does, once for production and once for staging, and searches every
 * emitted file for strings that only the panel has.
 */

const MARKERS = ['DEV_PANEL_MARKER_7f3a', 'dev-drawer', '/api/dev/'];

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
  }, 60_000);

  it('is not in a build that does not say it is for staging', async () => {
    const files = await buildFiles('');
    for (const marker of MARKERS) {
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
});
