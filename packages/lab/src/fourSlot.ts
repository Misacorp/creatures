/**
 * A four-slot dungeon team, in the lab only (Misa, 2026-11-04: "could you try a four slot team? I'd be interested in seeing if players would
 * bring one character of each row and how they'd position the team").
 *
 * The dungeon's team is one row of three (`RULES.dungeon.teamSize`, the arena `1 x 3`). A fourth slot has no single obvious board, so the lab
 * plays three shapes and says which it chose:
 * - **four wide** (`1 x 4`, the main one): one row of four, the same one boss turn a round as now, a wider row for the foes' area attacks to land on;
 * - **two by two** (`2 x 2`): two rows of two. The engine gives the boss one turn after each row, so the foe acts twice a round: a harder
 *   fight, shown for comparison only;
 * - **three** (`1 x 3`): the shipped shape, searched the same way, as the reference.
 * "One character of each row" is read two ways: one of each role (Setter, Payoff, Guard, Support: four roles, four slots) and, for the
 * two-row board, one in each row. Both are in the report.
 *
 * The foes are the same in every shape (a fourth creature is a stronger team by construction); `four-fair` also scales the foes' HP by 4/3 so
 * the team of four faces the same HP per creature. The team search is the lab's (`search.ts`): a seeded random search with local moves over
 * legal rosters (one of a form, talents from the legal ones, a creature below its evolution level fights as its first form), scored on whole
 * runs of the map with the camp and the `smart` policy and no bench, at the proposed numbers of the dungeon knobs (`base55-u1`). The score is
 * the clear (base floor) or the Undercroft's levels (the keeper of level 1, then level 2), both at a depth and at a uniform level.
 */
import { runStats, type RunOptions } from './dungeon';
import type { FoeKnobs } from './dungeonKnobs';
import type { JobResults, JobSpec, Plan } from './jobs';
import { gatedPick } from './roster';
import { POOL, lineKey, search, toPlacements, type Mode, type Pick, type Score } from './search';
import { formStats } from './species';
import { scenarioOf } from './dungeonMeasure';

export type Arena = 'three' | 'four' | 'two-by-two';
export const ARENAS: Readonly<Record<Arena, Mode>> = {
  three: { id: 'gauntlet', rows: 1, cols: 3, maxCopies: 1 },
  four: { id: 'gauntlet', rows: 1, cols: 4, maxCopies: 1 },
  'two-by-two': { id: 'gauntlet', rows: 2, cols: 2, maxCopies: 1 },
};

export type Objective = 'base' | 'under';

export interface FourSlotJobArgs {
  readonly arena: Arena;
  readonly level: number;
  readonly objective: Objective;
  readonly depth: number;
  /** Foe HP scaled by this many basis points on both the base floors and the Undercroft (13333 for the fair comparison of four against three). */
  readonly foeHpBp: number;
  readonly quick: boolean;
}

export const fourSlotJobId = (a: FourSlotJobArgs): string =>
  `four-slot:${a.arena}:L${a.level}:${a.objective}:d${a.depth}:hp${a.foeHpBp}`;

const scaleKnobs = (foes: FoeKnobs, bp: number): FoeKnobs => {
  const mult = (m: number | undefined): number => Math.floor(((m ?? 10_000) * bp) / 10_000);
  return {
    ...foes,
    base: { ...foes.base, hpMult: mult(foes.base?.hpMult) },
    undercroft: {
      ...(foes.undercroft ?? foes.base),
      hpMult: mult((foes.undercroft ?? foes.base)?.hpMult),
    },
  };
};

/** The options of a run for a job: the proposed numbers, the arena, no bench; the Undercroft objective always goes down. */
export function runOptionsOf(a: FourSlotJobArgs): Partial<RunOptions> {
  const foes = scaleKnobs(scenarioOf('base55-u1').foes ?? {}, a.foeHpBp);
  return {
    mode: ARENAS[a.arena],
    foes,
    ...(a.objective === 'under' ? { levels: 2, descendAbove: -1 } : {}),
  };
}

/** A line as the level allows it: a form below its evolution level fights as its first form, every creature at the uniform level. */
const atLevel = (line: readonly Pick[], level: number): Pick[] =>
  line.map((p) => ({ ...gatedPick(p, level), level }));

/** The score of a line over whole runs. */
function scoreOf(
  a: FourSlotJobArgs,
): (line: readonly Pick[], seeds: number, salt: string) => Score {
  const options = runOptionsOf(a);
  return (line, seeds, salt) => {
    const r = runStats(atLevel(line, a.level), a.depth, true, seeds, salt, options);
    const [l1 = 0, l2 = 0] = r.undercroft;
    const score =
      a.objective === 'base'
        ? 100 * r.winRate + 12 * r.cleared - 3 * r.knockouts
        : 20 * r.winRate + 100 * l1 + 60 * l2 + 4 * r.cleared;
    return { score, damage: r.cleared, knockouts: r.knockouts, reactions: 0, blocked: 0 };
  };
}

export interface FourSlotResult {
  readonly args: FourSlotJobArgs;
  /** The best line, slot by slot (row by row, left to right). */
  readonly line: readonly Pick[];
  readonly roles: readonly string[];
  readonly forms: readonly string[];
  /** On fresh seeds: the base floor's clear rate, and the share of all runs (every run goes down when it clears) that beat level 1 and level 2. */
  readonly clear: number;
  readonly level1: number;
  readonly level2: number;
  readonly knockouts: number;
}

/** What a `four-slot` job runs: the team search at one arena, level, objective and depth, then the best line on fresh seeds. */
export function runFourSlotJob(args: unknown): FourSlotResult {
  const a = args as FourSlotJobArgs;
  const mode = ARENAS[a.arena];
  const q = a.quick;
  const ranked = search(
    // The search scores through `score`; the boss argument is not read.
    undefined as never,
    mode,
    {
      seed: fourSlotJobId(a),
      starts: q ? 40 : 160,
      keep: q ? 4 : 8,
      rounds: q ? 2 : 4,
      seeds: q ? 8 : 24,
      freshSeeds: q ? 16 : 60,
      pool: POOL,
      talents: true,
      score: scoreOf(a),
    },
  );
  const best = ranked[0];
  if (!best) throw new Error('the search found no line');
  const line = atLevel(best.line, a.level);
  const r = runStats(line, a.depth, true, q ? 60 : 300, `four-slot-final:${fourSlotJobId(a)}`, {
    ...runOptionsOf(a),
    levels: 2,
    descendAbove: -1,
  });
  return {
    args: a,
    line,
    roles: line.map((p) => formStats(p.formId, a.level).role),
    forms: line.map(
      (p) => `${p.formId}/${p.knack}${p.talents?.length ? `+${p.talents.join('+')}` : ''}`,
    ),
    clear: r.winRate,
    level1: r.undercroft[0] ?? 0,
    level2: r.undercroft[1] ?? 0,
    knockouts: r.knockouts,
  };
}

/** The placements of a result, to check the board it was played on (slot i is row `floor(i / cols)`, column `i % cols`). */
export const placementsOf = (r: FourSlotResult) => toPlacements(r.line, ARENAS[r.args.arena]);

export interface FourSlotOptions {
  readonly quick: boolean;
}

/** The searches: each arena at the cap's level and at the level of a daily player's second week, at a few depths. */
export function fourSlotArgs(quick: boolean): FourSlotJobArgs[] {
  const out: FourSlotJobArgs[] = [];
  const add = (
    arena: Arena,
    level: number,
    objective: Objective,
    depth: number,
    foeHpBp = 10_000,
  ) => out.push({ arena, level, objective, depth, foeHpBp, quick });
  for (const level of [15, 25])
    for (const arena of ['three', 'four'] as const) {
      for (const depth of [4, 12, 24]) add(arena, level, 'base', depth);
      for (const depth of [12, 24]) add(arena, level, 'under', depth);
    }
  // The two-by-two board and the fair comparison, at the cap's level and one depth.
  for (const objective of ['base', 'under'] as const) {
    add('two-by-two', 25, objective, 12);
    add('four', 25, objective, 12, 13_333);
  }
  return out;
}

export interface FourSlotReport {
  readonly md: string[];
  readonly data: { readonly results: readonly FourSlotResult[] };
}

const pct = (x: number): string => `${Math.round(100 * x)}%`;

export function planFourSlot(options: FourSlotOptions): Plan<FourSlotReport> {
  const all = fourSlotArgs(options.quick);
  const jobs: JobSpec[] = all.map((a) => ({
    id: fourSlotJobId(a),
    section: 'Four-slot team',
    kind: 'four-slot',
    args: a,
    needs: [],
  }));
  return {
    jobs,
    assemble: (results: JobResults): FourSlotReport => {
      const rs = all.map((a) => results.get(fourSlotJobId(a)) as FourSlotResult);
      const md: string[] = [
        '### A four-slot dungeon team (lab only)',
        '',
        'Best teams found by the lab search for each board, at the proposed dungeon numbers (`base55-u1`), no bench. Foes are the same on every board unless the row says "foe HP x4/3". Slots are listed in order: row by row, left to right. Clear is the base floor\'s clear rate; level 1 and level 2 are the shares of all runs that beat each Undercroft keeper when the team always goes down (level 2 as if the floor were cracked).',
        '',
        '| Board | Level | Objective | Depth | Foe HP | Clear | Level 1 | Level 2 | KOs | Roles (slot order) | Forms |',
        '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
      ];
      for (const r of rs)
        md.push(
          `| ${r.args.arena} | ${r.args.level} | ${r.args.objective} | ${r.args.depth} | ${r.args.foeHpBp === 10_000 ? 'x1' : 'x4/3'} | ${pct(r.clear)} | ${pct(r.level1)} | ${pct(r.level2)} | ${r.knockouts.toFixed(2)} | ${r.roles.join(', ')} | ${r.forms.join(' / ')} |`,
        );
      const of = (arena: Arena, hp = 10_000) =>
        rs.filter((r) => r.args.arena === arena && r.args.foeHpBp === hp);
      const mean = (xs: readonly number[]): number =>
        xs.length === 0 ? 0 : xs.reduce((x, y) => x + y, 0) / xs.length;
      const four = of('four');
      const oneOfEach = four.filter((r) => new Set(r.roles).size === 4).length;
      md.push(
        '',
        `Of ${four.length} best teams of four (four wide), ${oneOfEach} bring one of each of the four roles (mean ${mean(four.map((r) => new Set(r.roles).size)).toFixed(2)} different roles; the teams of three: ${mean(of('three').map((r) => new Set(r.roles).size)).toFixed(2)}). Distinct lines: ${new Set(four.map((r) => lineKey(r.line))).size} of ${four.length}.`,
        '',
        '| Board | Objective | Clear | Level 1 | Level 2 | KOs |',
        '| --- | --- | ---: | ---: | ---: | ---: |',
      );
      for (const [name, arena, hp] of [
        ['three', 'three', 10_000],
        ['four wide', 'four', 10_000],
      ] as const)
        for (const objective of ['base', 'under'] as const) {
          const g = of(arena, hp).filter((r) => r.args.objective === objective);
          md.push(
            `| ${name} | ${objective} | ${pct(mean(g.map((r) => r.clear)))} | ${pct(mean(g.filter((r) => r.args.depth >= 8).map((r) => r.level1)))} | ${pct(mean(g.filter((r) => r.args.depth >= 8).map((r) => r.level2)))} | ${mean(g.map((r) => r.knockouts)).toFixed(2)} |`,
          );
        }
      md.push(
        '',
        'Mean over the searches of each board (depths 4 to 24, levels 15 and 25); the Undercroft levels over depth 8 and deeper only (it opens there).',
        '',
      );
      // Where the roles stand: a count of the role in each slot, over the best teams of each board.
      const roleNames = ['setter', 'payoff', 'guard', 'support'];
      for (const [name, arena] of [
        ['three', 'three'],
        ['four wide', 'four'],
        ['two by two', 'two-by-two'],
      ] as const) {
        const g = of(arena);
        if (g.length === 0) continue;
        const slots = g[0]?.roles.length ?? 0;
        md.push(
          `Roles by slot, ${name} (${g.length} teams): ` +
            Array.from({ length: slots }, (_, i) => {
              const counts = roleNames
                .map((role) => `${role} ${g.filter((r) => r.roles[i] === role).length}`)
                .join(', ');
              return `slot ${i + 1}: ${counts}`;
            }).join('; ') +
            '.',
          '',
        );
      }
      return { md, data: { results: rs } };
    },
  };
}
