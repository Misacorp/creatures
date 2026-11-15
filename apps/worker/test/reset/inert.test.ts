// The reset is built but inert: nothing runs it. These are source-level checks (the module graph as text), so a later change that wires
// the wipe, the archive or the secret into a route, the alarm or a dev tool fails here until the release PR does it on purpose
// and changes this test with it (docs/design/reset-build.md, "What the release PR must add").
import { describe, expect, it } from 'vitest';
import wranglerText from '../../wrangler.jsonc?raw';
import { DEV_ACTION_TOOLS, DEV_READ_TOOLS } from '../../src/dev-schemas';

const sources = (
  import.meta as unknown as {
    glob: (
      pattern: string,
      options: { query: string; import: string; eager: true },
    ) => Record<string, string>;
  }
).glob('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true });

const files = Object.entries(sources).map(([path, text]) => ({
  path: path.replace('../../', ''),
  text,
}));
const outside = files.filter((f) => !f.path.startsWith('src/reset/'));
const inside = files.filter((f) => f.path.startsWith('src/reset/'));

describe('the reset is inert', () => {
  it('finds the sources it scans', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(inside.map((f) => f.path)).toContain('src/reset/wipe.ts');
  });

  it('nothing outside src/reset/ reaches the wipe or the archive; only the dry run is imported (by the dev tools)', () => {
    const imports = outside.flatMap((f) =>
      [...f.text.matchAll(/from\s+'(\.\.?\/reset\/[^']+)'/g)].map(
        (m) => `${f.path} -> ${m[1] ?? ''}`,
      ),
    );
    expect(imports).toEqual(['src/dev-tools.ts -> ./reset/dry-run']);
    for (const f of outside) {
      expect(f.text, f.path).not.toMatch(
        /wipeGuild|WipeRefused|SettlerArchive|SETTLER_HMAC_KEY|ArchiveStore/,
      );
    }
  });

  it('inside src/reset/, only wipe.ts defines the wipe and nothing else calls it', () => {
    for (const f of inside) {
      if (f.path === 'src/reset/wipe.ts') continue;
      expect(f.text, f.path).not.toMatch(/wipeGuild\s*\(|from '\.\/wipe'/);
    }
    // The dry run reads the table lists only, never the wipe itself.
    const dry = inside.find((f) => f.path === 'src/reset/dry-run.ts');
    expect(dry?.text).not.toContain("'./wipe'");
  });

  it('no dev tool, route, alarm or entry point names the reset beyond the read-only dry run', () => {
    // (`reset-raids-dungeons`, `reset-account` and the others are older tools of single tables and players, not this reset.)
    expect(
      DEV_ACTION_TOOLS.filter((t) => /wipe-guild|archive|settler|dry-run|reset-guild/.test(t)),
    ).toEqual([]);
    expect(DEV_READ_TOOLS.filter((t) => /wipe|archive|settler|reset/.test(t))).toEqual([
      'reset-dry-run',
    ]);
    // The Worker's entry exports no archive class, and the guild object (its alarm included) imports nothing from src/reset (checked above).
    const entry = outside.find((f) => f.path === 'src/index.ts')?.text ?? '';
    expect(entry).not.toMatch(/\.\/reset\//);
    // The dry run is a GET: the POST route has no way to name it.
    const dev = outside.find((f) => f.path === 'src/dev-tools.ts')?.text ?? '';
    expect(dev).toContain("toolId === 'reset-dry-run'");
    expect(dev).not.toMatch(/'reset-dry-run':\s*tool\(/);
  });

  it('wrangler.jsonc has no archive binding, no Durable Object migration for it and no secret named for it', () => {
    expect(wranglerText).not.toMatch(/SettlerArchive|SETTLER|settler|archive/i);
  });

  it('draws every random value from crypto, never Math.random', () => {
    for (const f of inside) expect(f.text, f.path).not.toContain('Math.random');
  });
});
