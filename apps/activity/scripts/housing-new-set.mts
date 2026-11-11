// `pnpm housing new-set | remove-set | check` (docs/design/housing-workshop.md, "Adding a set"). The plans are pure
// (src/sprites/workshop/new-set.ts); this file reads and writes the files, runs prettier, and runs the generators
// and tests as child processes (a fresh process sees the new files; this one loaded the old ones).
//
//   pnpm housing new-set <id> [--name "Quiet Verge"] [--theme "..."] [--from <style>] [--element tide|none ...]
//        [--tier 1|2] [--primary <material>|family:<wood|stone|metal|cloth>] [--accent ...]
//        [--moments trip,scout,raid] [--places id,id] [--bosses id,id] [--dry-run] [--no-checks]
//   pnpm housing remove-set <id> [--dry-run] [--no-checks]       undoes new-set (never a shipped set)
//   pnpm housing check                                           every set agrees across all its places
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const { fromPaths, parseSpec, planNewSet, planRemoveSet, PATHS } =
  await import('../src/sprites/workshop/new-set.ts');
type Changes = ReturnType<typeof planNewSet>;

const REPO = join(import.meta.dirname, '..', '..', '..');
const ACTIVITY = join(REPO, 'apps', 'activity');
const NODE = [process.execPath, '--experimental-strip-types', '--no-warnings'];

const read = (path: string): string | undefined => {
  const file = join(REPO, path);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

function json<T>(path: string): T {
  const text = read(path);
  if (text === undefined) throw new Error(`${path} is missing`);
  return JSON.parse(text) as T;
}

/** Runs a command in the repo; prints its output and returns whether it passed. */
function run(label: string, cmd: string, args: string[], cwd = REPO): boolean {
  console.log(`\n> ${label}`);
  try {
    const out = execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(out.trimEnd());
    return true;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    console.log(`${e.stdout ?? ''}${e.stderr ?? ''}`.trimEnd());
    console.log(`FAILED: ${label}`);
    return false;
  }
}

const housingCmd = (...args: string[]): string[] => [
  ...NODE.slice(1),
  join(ACTIVITY, 'scripts', 'housing.mts'),
  ...args,
];

/** The cross-check tests: content, art packs, the workshop lock, furnishing, and every set's places. */
const ACTIVITY_TESTS = [
  'src/sprites/workshop',
  'src/sprites/data/house',
  'src/sprites/house-sets-b.test.ts',
];
const GAME_TESTS = ['test/housing-content.test.ts', 'test/housing-load.test.ts'];

function runTests(): boolean {
  const a = run(
    'activity: workshop, art packs, every set across its places',
    'pnpm',
    ['exec', 'vitest', 'run', ...ACTIVITY_TESTS],
    ACTIVITY,
  );
  const g = run(
    'game: housing content',
    'pnpm',
    ['exec', 'vitest', 'run', ...GAME_TESTS],
    join(REPO, 'packages', 'game'),
  );
  return a && g;
}

function generate(): boolean {
  const lock = run('lock the shipped art', NODE[0] as string, housingCmd('lock'));
  const art = run('regenerate docs/art/', NODE[0] as string, [
    ...NODE.slice(1),
    join(ACTIVITY, 'scripts', 'art.mts'),
    'library',
  ]);
  return lock && art;
}

function apply(changes: Changes, dryRun: boolean): void {
  if (changes.size === 0) console.log('Nothing to change: already done.');
  for (const [path, text] of changes) {
    const how = text === null ? 'delete' : existsSync(join(REPO, path)) ? 'update' : 'create';
    console.log(`${dryRun ? 'would ' : ''}${how.padEnd(7)} ${path}`);
  }
  if (dryRun || changes.size === 0) return;
  const touched: string[] = [];
  for (const [path, text] of changes) {
    const file = join(REPO, path);
    if (text === null) {
      unlinkSync(file);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    touched.push(path);
  }
  if (touched.length > 0)
    execFileSync('pnpm', ['exec', 'prettier', '--write', ...touched], {
      cwd: REPO,
      stdio: 'ignore',
    });
}

/** Where a set still says TODO: what the artist and the writer have left, as "file: lines". */
function todos(id: string): string[] {
  const paths = [PATHS.sets, PATHS.pieces, PATHS.skins, PATHS.style(id), PATHS.pack(id)];
  return paths.flatMap((path) => {
    const n = (read(path) ?? '').split('\n').filter((l) => l.includes('TODO')).length;
    return n > 0 ? [`${path}: ${String(n)}`] : [];
  });
}

export function main(args: string[]): void {
  const command = args[0];
  const flags: Record<string, string | undefined> = {};
  const positional: string[] = [];
  const bools = new Set(['--dry-run', '--no-checks']);
  for (let i = 1; i < args.length; i++) {
    const a = args[i] as string;
    if (bools.has(a)) flags[a] = 'true';
    else if (a.startsWith('--')) flags[a] = args[++i];
    else positional.push(a);
  }
  const dryRun = flags['--dry-run'] !== undefined;
  const checks = flags['--no-checks'] === undefined;

  if (command === 'check') {
    const lock = run('shipped-art lock', NODE[0] as string, housingCmd('lock', '--check'));
    const art = run('art catalogue is current', NODE[0] as string, [
      ...NODE.slice(1),
      join(ACTIVITY, 'scripts', 'art.mts'),
      'library',
      '--check',
    ]);
    const tests = runTests();
    const ok = lock && art && tests;
    console.log(ok ? '\nhousing check: every set agrees.' : '\nhousing check: FAILED (see above).');
    process.exit(ok ? 0 : 1);
  }

  const id = positional[0];
  if (id === undefined) {
    console.error(`Usage: pnpm housing ${String(command)} <id> [flags]`);
    process.exit(1);
  }

  try {
    if (command === 'new-set') {
      const spec = parseSpec(id, flags);
      const fromSource = fromPaths(spec.from)
        .map((p) => read(p))
        .find((s) => s !== undefined);
      const placeNames = Object.fromEntries(
        json<{ id: string; name: string }[]>(
          'packages/game/src/content/data/destinations.json',
        ).map((d) => [d.id, d.name]),
      );
      const bossNames = Object.fromEntries(
        json<{ id: string; name: string }[]>('packages/game/src/content/data/bosses.json').map(
          (b) => [b.id, b.name],
        ),
      );
      apply(planNewSet(spec, read, { placeNames, bossNames, fromSource }), dryRun);
      if (dryRun) return;
      const gen = generate();
      const ok = checks ? runTests() : true;
      const sheet = run('review sheet', NODE[0] as string, housingCmd('sheet', id));
      console.log(`
Next:
  1. Edit ${PATHS.style(id)}: palette, variants and motif (the TODO(artist) comments), then
     \`pnpm housing sheet ${id}\` and look at it. Repeat until the nine pieces read at 1x.
  2. Draw the wallpaper, floor and keepsake by hand in ${PATHS.pack(id)} (placeholders now).
  3. Art-director pass against docs/design/review-brief.md; then \`pnpm housing lock\` and \`pnpm art library\`.
  4. Fill the TODO names and lines (sets.json, pieces.json, skins.json, ${PATHS.compendium}) from the
     compendium (docs/compendium/README.md); set the places, bosses and materials the set drops from.
  5. \`pnpm housing check\`, then the usual \`pnpm check:changed\`.
Left to write: ${todos(id).join('; ') || 'nothing'}.`);
      process.exit(gen && ok && sheet ? 0 : 1);
    } else if (command === 'remove-set') {
      apply(planRemoveSet(id, read), dryRun);
      if (dryRun) return;
      const gen = generate();
      const ok = checks ? runTests() : true;
      process.exit(gen && ok ? 0 : 1);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
