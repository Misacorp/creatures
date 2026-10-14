import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildFieldDocs,
  buildRulesDocs,
  collectScalars,
  inferUnit,
  oneLine,
  parseContentIds,
  parseScalars,
  renderContentIds,
  renderScalars,
  renderTable,
  targetsFor,
  tableCells,
} from '../src/scalars';
import {
  CONTENT_IDS_FILE,
  SCALARS_FILE,
  generate,
  idSections,
  loadTargetMap,
  main,
  realScalars,
  repoRoot,
  targetPatternMatches,
  type Io,
} from '../src/scalars-cli';

const dir = mkdtempSync(join(tmpdir(), 'sim-scalars-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

const SOURCE = `
export const RULES = {
  cost: {
    /** Cost of a thing. Second sentence. */
    base: 3,
    perLevel: 2,
  },
  odds: {
    // A line comment above.
    // Continued here.
    group: { rare: 100, // trailing note
      epic: 5 },
  },
  /** Phases of the week. */
  phases: [
    { id: 'a', rounds: 10 },
    {
      id: 'b',
      /** Rounds of b. */
      rounds: 12,
    },
  ],
  steps: [1, 2, 3],
  label: 'text',
  on: true,
} as const;
`;

describe('comments from the source', () => {
  it('finds JSDoc, line comments, trailing comments and array fields', () => {
    const docs = buildRulesDocs(SOURCE, 'RULES');
    expect(docs.get('RULES.cost.base')).toBe('Cost of a thing. Second sentence.');
    expect(docs.get('RULES.odds.group')).toBe('A line comment above. Continued here.');
    expect(docs.get('RULES.odds.group.rare')).toBe('trailing note');
    expect(docs.get('RULES.odds.group.epic')).toBeUndefined();
    expect(docs.get('RULES.phases')).toBe('Phases of the week.');
    expect(docs.get('RULES.phases.rounds')).toBe('Rounds of b.');
    expect(docs.get('RULES.steps')).toBeUndefined();
  });

  it('keeps a field comment only when every declaration agrees', () => {
    const docs = buildFieldDocs([
      'const a = {\n  /** same */\n  bp: 1,\n};',
      `const x = {
        /** one meaning */
        power: 1,
        /** same meaning */
        both: 2,
      };
      const y = {
        /** another meaning */
        power: 2,
        /** same meaning */
        both: 3,
      };`,
    ]);
    expect(docs.get('power')).toBeUndefined();
    expect(docs.get('both')).toBe('same meaning');
  });

  it('makes a one-line, table-safe meaning', () => {
    expect(oneLine('First | second.\n   More text. Third one.')).toBe(
      'First / second. More text. Third one.',
    );
    expect(oneLine('Cost is a * b.')).toBe('Cost is a x b.');
    expect(oneLine('Short. A longer second sentence follows here, with detail.')).toBe(
      'Short. A longer second sentence follows here, with detail.',
    );
    const long = oneLine(`${'word '.repeat(60)}end.`);
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith('...')).toBe(true);
    expect(oneLine('Odd `tick')).toBe('Odd tick');
  });
});

describe('units', () => {
  it('reads the unit from the key name, then from the parents', () => {
    expect(inferUnit(['gear', 'upgradeStepBp', 'atk'])).toBe('bp');
    expect(inferUnit(['combat', 'strongBp'])).toBe('bp');
    expect(inferUnit(['expeditions', 'rank', 'speedBpPerRank'])).toBe('bp');
    expect(inferUnit(['lengths', 'short', 'ms'])).toBe('ms');
    expect(inferUnit(['gear', 'jobHours', 'craft', 'common'])).toBe('hours');
    expect(inferUnit(['goal', 'extraHours'])).toBe('hours');
    expect(inferUnit(['gear', 'skill', 'xpPerHour'])).toBe('count');
    expect(inferUnit(['raid', 'activeWindowDays'])).toBe('days');
    expect(inferUnit(['dungeon', 'rooms'])).toBe('count');
  });
});

describe('collecting scalars', () => {
  const rules = {
    cost: { base: 3, perLevel: 2 },
    odds: { group: { rare: 100, epic: 5 } },
    phases: [
      { id: 'a', rounds: 10 },
      { id: 'b', rounds: 12 },
    ],
    steps: [1, 2, 3],
    long: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    label: 'text',
    on: true,
    empty: [],
  };
  const scalars = collectScalars({
    rules,
    rulesSource: SOURCE,
    collections: [
      {
        name: 'things',
        system: 'content/things.json',
        items: [{ id: 'x-y', stage: 2, hp: 7, odds: [{ rare: 1 }] }],
        ignoreKeys: ['stage'],
      },
    ],
    schemaSources: ['const s = {\n  /** Hit points. */\n  hp: 1,\n};'],
    targetMap: {
      'RULES.cost': ['econ-a'],
      'RULES.cost.base': ['econ-b'],
      'content.things': ['t-*'],
    },
  });
  const byPath = new Map(scalars.map((s) => [s.path, s]));

  it('has one row per number, ids as keys, short arrays inline and long ones per element', () => {
    expect(scalars.map((s) => s.path)).toEqual([
      'RULES.cost.base',
      'RULES.cost.perLevel',
      'RULES.odds.group.rare',
      'RULES.odds.group.epic',
      'RULES.phases.a.rounds',
      'RULES.phases.b.rounds',
      'RULES.steps',
      ...Array.from({ length: 9 }, (_, i) => `RULES.long[${i}]`),
      'content.things.x-y.hp',
      'content.things.x-y.odds[0].rare',
    ]);
    expect(byPath.get('RULES.steps')?.value).toBe('[1, 2, 3]');
    expect(byPath.get('RULES.long[8]')?.value).toBe('9');
  });

  it('carries system, meaning and targets', () => {
    expect(byPath.get('RULES.cost.base')).toMatchObject({
      system: 'RULES.cost',
      value: '3',
      unit: 'count',
      meaning: 'Cost of a thing. Second sentence.',
      targets: ['econ-a', 'econ-b'],
    });
    expect(byPath.get('RULES.cost.perLevel')).toMatchObject({ targets: ['econ-a'], meaning: '' });
    // A parent's comment below the system level applies to its fields; the system's own does not.
    expect(byPath.get('RULES.odds.group.epic')?.meaning).toBe(
      'A line comment above. Continued here.',
    );
    expect(byPath.get('RULES.odds.group.rare')?.meaning).toBe('trailing note');
    expect(byPath.get('RULES.phases.a.rounds')?.meaning).toBe('Rounds of b.');
    expect(byPath.get('content.things.x-y.hp')).toMatchObject({
      system: 'content/things.json',
      meaning: 'Hit points.',
      targets: ['t-*'],
    });
  });

  it('matches targets by whole path segments only', () => {
    const map = { 'RULES.raid': ['a'], 'RULES.raid.phases': ['b'] };
    expect(targetsFor('RULES.raid.phases[0]', map)).toEqual(['a', 'b']);
    expect(targetsFor('RULES.raidx.y', map)).toEqual([]);
  });

  it('prints and parses back the same rows', () => {
    const text = renderScalars(scalars);
    const parsed = parseScalars(text);
    expect(parsed.map((s) => [s.path, s.value, s.unit, s.system])).toEqual(
      scalars.map((s) => [s.path, s.value, s.unit, s.system]),
    );
    expect(parsed.map((s) => s.targets)).toEqual(scalars.map((s) => s.targets));
  });
});

describe('tables', () => {
  it('lines the columns up', () => {
    expect(renderTable(['A', 'Bee'], [['x', 'longer cell']])).toBe(
      ['| A   | Bee         |', '| --- | ----------- |', '| x   | longer cell |'].join('\n'),
    );
    expect(tableCells('| a   |     | c |')).toEqual(['a', '', 'c']);
    expect(tableCells('not a row')).toBeUndefined();
  });

  it('round-trips the content ids', () => {
    const sections = [
      { title: 'Creatures', items: [{ id: 'a-b', name: 'Ab | Cd' }] },
      { title: 'Gear bases', items: [] },
    ];
    const parsed = parseContentIds(renderContentIds(sections));
    expect(parsed).toEqual([
      { title: 'Creatures', items: [{ id: 'a-b', name: 'Ab / Cd' }] },
      { title: 'Gear bases', items: [] },
    ]);
  });
});

describe('the real registry', () => {
  const root = repoRoot();
  const scalars = realScalars(root);

  it('covers RULES and the content, with unique paths', () => {
    const paths = scalars.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
    const byPath = new Map(scalars.map((s) => [s.path, s]));
    expect(byPath.get('RULES.gear.skill.xpPerHour')).toMatchObject({ value: '12', unit: 'count' });
    expect(byPath.get('RULES.fusion.cumulativeBonusBp')).toMatchObject({ unit: 'bp' });
    expect(byPath.get('RULES.raid.phases.finale.clearAtLossBp')).toMatchObject({ value: '10000' });
    expect(paths.some((p) => p.startsWith('content.bosses.'))).toBe(true);
    expect(paths.some((p) => p.startsWith('content.dungeonFoes.'))).toBe(true);
    expect(paths.some((p) => p.startsWith('content.supplies.'))).toBe(true);
    expect(paths.some((p) => p.startsWith('content.pushOnGoals.'))).toBe(true);
  });

  it('keeps the sim target map pointing at real targets and real scalars', () => {
    const map = loadTargetMap();
    const badTargets = Object.entries(map).flatMap(([prefix, ids]) =>
      ids.filter((id) => !targetPatternMatches(id)).map((id) => `${prefix}: ${id}`),
    );
    expect(badTargets).toEqual([]);
    const deadPrefixes = Object.keys(map).filter(
      (prefix) => !scalars.some((s) => s.path === prefix || s.path.startsWith(`${prefix}.`)),
    );
    expect(deadPrefixes).toEqual([]);
  });

  it('lists every content id', () => {
    const titles = idSections().map((s) => s.title);
    expect(titles).toContain('Creatures');
    expect(titles).toContain('Gear bases');
    for (const s of idSections()) expect(s.items.length).toBeGreaterThan(0);
  });

  it('is committed up to date (run pnpm scalars)', () => {
    const stale = Object.entries(generate(root))
      .filter(([rel, text]) => {
        try {
          return readFileSync(join(root, rel), 'utf8') !== text;
        } catch {
          return true;
        }
      })
      .map(([rel]) => `${rel} is stale: run pnpm scalars`);
    expect(stale).toEqual([]);
  });
});

describe('pnpm scalars', () => {
  it('writes both files, and --check notices a stale one', () => {
    const run = capture();
    expect(main([], run.io, dir)).toBe(0);
    expect(run.out).toEqual([`wrote ${SCALARS_FILE}`, `wrote ${CONTENT_IDS_FILE}`]);
    expect(readFileSync(join(dir, SCALARS_FILE), 'utf8')).toBe(generate(repoRoot())[SCALARS_FILE]);

    const ok = capture();
    expect(main(['--check'], ok.io, dir)).toBe(0);
    expect(ok.err).toEqual([]);

    writeFileSync(join(dir, SCALARS_FILE), 'old\n');
    const stale = capture();
    expect(main(['--check'], stale.io, dir)).toBe(1);
    expect(stale.err).toEqual([`${SCALARS_FILE} is stale: run pnpm scalars`]);
  });

  it('rejects unknown flags', () => {
    const run = capture();
    expect(main(['--nope'], run.io, dir)).toBe(1);
    expect(run.err.length).toBe(1);
  });
});
