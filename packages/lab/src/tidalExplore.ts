/**
 * Scratch harness for the Tidal Colossus exploration (mixed servers on slots 6 and 11): custom servers at a slot's numbers, measured as
 * a potential and a kill rate. Not part of the lab's reports.
 */
import { createSeededRng, int } from '@creatures/game';
import { content } from '@creatures/game';
import {
  raidBench,
  weekendPotentialOf,
  weekendStatsOf,
  combineWeekends,
  combinePotential,
} from './bosses';
import {
  casualColumn,
  columnOf,
  limitCopies,
  toolColumns,
  wideBoss,
  BUILDER_MAX_COPIES,
  MIXED_ORDER,
  type PlayerKind,
} from './raidMeasure';
import { levelledColumn, rosterLevels, type RosterKind } from './roster';
import { VALLEY_ROSTER } from './valley';
import { LEVEL, classicFor, type Pick } from './search';
import {
  slotBoss,
  slotMixedOf,
  slotPreparedOf,
  SLOT_NUMBERS,
  SLOT_WEEKS,
  type SlotTable,
} from './track';
import { raidMode } from './bosses';
import { OWN_KNACKS } from './knacks';
import { dedicatedTeam } from './trackTuner';
import type { BossDef, Placement } from './types';

export interface CasualSpec {
  /** Whose levels the casual player has. */
  readonly roster: RosterKind;
  /** Knack: none (the path), or the creature's first own Knack. */
  readonly knack: 'none' | 'own';
  /** Force a Guard into the column (replacing the creature in this row if the column has none), or none. */
  readonly guard: 'none' | 'force';
  readonly guardRow?: number;
  /** `trio`: a random Setter, Payoff and Guard (any species) in a random order, instead of three random forms. */
  readonly compose?: 'random' | 'trio';
  /** The Guard's Knack when forced. */
  readonly guardKnack?: string;
}

export const PATH_CASUAL: CasualSpec = { roster: 'weekly', knack: 'none', guard: 'none' };
const ALL_FORMS = Object.keys(OWN_KNACKS);

/** How often a casual column (the path's: top three of twelve random forms) holds each role. */
export function casualStats(n = 4000): Record<string, number> {
  const out: Record<string, number> = {
    guard: 0,
    setter: 0,
    payoff: 0,
    support: 0,
    setterAndPayoff: 0,
    guardAndSetterPayoff: 0,
    noGuard: 0,
  };
  const roles: Record<string, number> = {};
  for (const f of ALL_FORMS) roles[roleOf(f) ?? '?'] = (roles[roleOf(f) ?? '?'] ?? 0) + 1;
  for (let i = 0; i < n; i++) {
    const col = casualColumn(createSeededRng(`stat:${i}`), 3, 'top3', LEVEL);
    const r = new Set(col.map((p) => roleOf(p.formId)));
    for (const k of ['guard', 'setter', 'payoff', 'support']) if (r.has(k as never)) out[k]!++;
    if (r.has('setter') && r.has('payoff')) out.setterAndPayoff!++;
    if (r.has('setter') && r.has('payoff') && r.has('guard')) out.guardAndSetterPayoff!++;
    if (!r.has('guard')) out.noGuard!++;
  }
  for (const k of Object.keys(out)) out[k] = (out[k] as number) / n;
  return {
    ...out,
    ...Object.fromEntries(Object.entries(roles).map(([k, v]) => ['forms:' + k, v])),
  };
}

const roleOf = (f: string) => content.creatures.find((c) => c.id === f)?.role;
const COMMON_GUARDS = content.creatures
  .filter((c) => c.role === 'guard' && c.stage === 1)
  .map((c) => c.id);

export interface ServerSpec {
  /** Kinds of the columns (the path's mapping by default). */
  readonly order?: readonly PlayerKind[];
  readonly casual?: CasualSpec;
}

/** The mixed server's weekend at a slot: like `serverWeekend` in `path.ts` but with a casual spec. */
export function mixedWeekend(
  slot: number,
  week: number,
  seed: string,
  table: SlotTable,
  spec: ServerSpec = {},
  mixedAnswer?: number,
): { boss: BossDef; placements: Placement[]; bench: Placement[] } {
  const base = slotBoss(slot, { table });
  const rows = base.rows;
  const order = spec.order ?? MIXED_ORDER;
  const cs = spec.casual ?? PATH_CASUAL;
  const { line, core } = slotMixedOf(slot, mixedAnswer);
  const boss = order.length === base.cols ? base : wideBoss(base, order.length);
  let m = 0;
  let b = 0;
  const placements: Placement[] = [];
  const bench: Placement[] = [];
  order.forEach((kind, c) => {
    const roster: RosterKind = kind === 'c' ? cs.roster : 'daily';
    const levels = rosterLevels(VALLEY_ROSTER, roster, week, 'expected', rows + 1);
    let column: Pick[];
    if (kind === 'm')
      column = columnOf(
        line,
        base.cols,
        toolColumns(line, base.cols, core)[m++ % base.cols] as number,
      );
    else if (kind === 'b')
      column = limitCopies(
        columnOf(line, base.cols, toolColumns(line, base.cols, core)[b++ % base.cols] as number),
        BUILDER_MAX_COPIES,
        line,
      );
    else {
      const rng = createSeededRng(`path:${seed}:casual:${c}`);
      column = casualColumn(rng, rows, 'top3', LEVEL);
      if (cs.compose === 'trio') {
        const pickOf = (role: string): Pick => {
          const pool = ALL_FORMS.filter((f) => roleOf(f) === role);
          const formId = pool[int(rng, pool.length)] as string;
          return { formId, knack: 'none', ...(column[0]?.talents ? {} : {}) };
        };
        const trio = [pickOf('setter'), pickOf('payoff'), pickOf('guard')];
        const shift = int(rng, 3);
        column = Array.from({ length: rows }, (_, r) => trio[(r + shift) % 3] as Pick);
      }
      if (cs.knack === 'own')
        column = column.map((p) => ({ ...p, knack: OWN_KNACKS[p.formId]?.[0] ?? 'none' }));
      if (cs.guard === 'force' && !column.some((p) => roleOf(p.formId) === 'guard')) {
        const g = COMMON_GUARDS[int(rng, COMMON_GUARDS.length)] as string;
        const at = Math.min(rows - 1, cs.guardRow ?? 1);
        column = column.map((p, r) =>
          r === at ? { formId: g, knack: cs.guardKnack ?? 'none' } : p,
        );
      }
    }
    levelledColumn(column, levels).forEach((pick, r) =>
      placements.push({
        owner: `p${c + 1}`,
        formId: pick.formId,
        level: pick.level ?? 1,
        knack: pick.knack,
        ...(pick.talents ? { talents: pick.talents } : {}),
        row: r,
        col: c,
      }),
    );
    bench.push(
      ...raidBench(1, levels[rows] ?? levels[levels.length - 1] ?? 1).map((x) => ({
        ...x,
        owner: `p${c + 1}`,
      })),
    );
  });
  return { boss, placements, bench };
}

/** Mean knockouts a weekend per column of each kind on the mixed server (real fights, the boss can die). */
export function koByKind(
  slot: number,
  table: SlotTable,
  spec: ServerSpec,
  draws = 40,
  runs = 2,
  week = SLOT_WEEKS[slot - 1] ?? 7,
) {
  const order = spec.order ?? MIXED_ORDER;
  const sum: Record<string, number> = {};
  const n: Record<string, number> = {};
  let standing = 0;
  let hpLeft = 0;
  for (let d = 0; d < draws; d++) {
    const w = mixedWeekend(slot, week, `x:m${d}`, table, spec);
    const s = weekendStatsOf(w.boss, w.placements, w.bench, runs, `x:m${d}`);
    standing += s.standingEnd / draws;
    hpLeft += s.hpLeftEnd / draws;
    order.forEach((k, c) => {
      sum[k] = (sum[k] ?? 0) + (s.knockoutsByOwner[`p${c + 1}`] ?? 0) / draws;
      if (d === 0) n[k] = (n[k] ?? 0) + 1;
    });
  }
  return {
    standingEnd: standing,
    hpLeftEnd: hpLeft,
    koPerColumn: Object.fromEntries(
      Object.keys(sum).map((k) => [k, (sum[k] as number) / (n[k] as number)]),
    ),
  };
}

export interface Meas {
  kill: number;
  pot: number;
  share: number;
}

/** Measures `draws` mixed weekends of `runs` fights. */
export function measureMixed(
  slot: number,
  table: SlotTable,
  spec: ServerSpec,
  draws = 40,
  runs = 2,
  week = SLOT_WEEKS[slot - 1] ?? 7,
  mixedAnswer?: number,
): Meas {
  const stats = [];
  const pots = [];
  for (let d = 0; d < draws; d++) {
    const w = mixedWeekend(slot, week, `x:m${d}`, table, spec, mixedAnswer);
    stats.push(weekendStatsOf(w.boss, w.placements, w.bench, runs, `x:m${d}`));
    pots.push(weekendPotentialOf(w.boss, w.placements, w.bench, runs, `x:m${d}`));
  }
  const s = combineWeekends(stats);
  return { kill: s.winRate, pot: combinePotential(pots).mean, share: s.damageShare };
}

/** Classic party (4 columns) and tool-line prepared team at a slot. */
export function measureClassic(
  slot: number,
  table: SlotTable,
  week = SLOT_WEEKS[slot - 1] ?? 7,
  runs = 30,
): Meas {
  const boss = slotBoss(slot, { table });
  const t = dedicatedTeam(boss, classicFor(raidMode(boss)), week, 'expected');
  const s = weekendStatsOf(boss, t.placements, t.bench, runs, 'x:c');
  return {
    kill: s.winRate,
    pot: weekendPotentialOf(boss, t.placements, t.bench, runs, 'x:c').mean,
    share: s.damageShare,
  };
}

export function measurePrepared(
  slot: number,
  table: SlotTable,
  week = SLOT_WEEKS[slot - 1] ?? 7,
  runs = 30,
): Meas {
  const boss = slotBoss(slot, { table });
  const { line } = slotPreparedOf(slot);
  const t = dedicatedTeam(boss, line, week, 'expected');
  const s = weekendStatsOf(boss, t.placements, t.bench, runs, 'x:p');
  return {
    kill: s.winRate,
    pot: weekendPotentialOf(boss, t.placements, t.bench, runs, 'x:p').mean,
    share: s.damageShare,
  };
}

/** A server of `n` columns that all field the 3-creature classic trio at `roster` levels, tiled across rows (information). */
export function measureClassicWide(
  slot: number,
  table: SlotTable,
  n: number,
  week = SLOT_WEEKS[slot - 1] ?? 7,
  runs = 20,
  knack = true,
): Meas {
  const base = slotBoss(slot, { table });
  const boss = n === base.cols ? base : wideBoss(base, n);
  const rows = base.rows;
  const cl = classicFor({ id: 'raid', rows, cols: n, maxCopies: 99 } as never);
  const placements: Placement[] = [];
  const bench: Placement[] = [];
  for (let c = 0; c < n; c++) {
    const levels = rosterLevels(VALLEY_ROSTER, 'daily', week, 'expected', rows + 1);
    const col = Array.from({ length: rows }, (_, r) => cl[r * n + c] as Pick).map((p) =>
      knack ? p : { ...p, knack: 'none' },
    );
    levelledColumn(col, levels).forEach((pick, r) =>
      placements.push({
        owner: `p${c + 1}`,
        formId: pick.formId,
        level: pick.level ?? 1,
        knack: pick.knack,
        row: r,
        col: c,
      }),
    );
    bench.push(...raidBench(1, levels[rows] ?? 1).map((x) => ({ ...x, owner: `p${c + 1}` })));
  }
  const s = weekendStatsOf(boss, placements, bench, runs, 'x:cw');
  return {
    kill: s.winRate,
    pot: weekendPotentialOf(boss, placements, bench, runs, 'x:cw').mean,
    share: s.damageShare,
  };
}

export const committed: SlotTable = SLOT_NUMBERS;
