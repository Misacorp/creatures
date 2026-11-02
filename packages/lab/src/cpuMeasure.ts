/**
 * The CPU a combat v2 fight costs, for the worker's 10 ms per request on the Free plan (docs/design/combat/integration.md, section 8):
 * one raid stage at 4, 10 and 15 columns with the log on and off, one dungeon room, and the live finale replayed up to round 6 and to its
 * last round. It only measures; nothing here changes a rule. The numbers are wall-clock times of the engine call on this machine's Node
 * (the creatures are resolved before the clock starts, and `resolve` is timed on its own); a Worker's isolate runs the same V8, but
 * slower or faster by what the host gives, so read them as a ratio to the limit, not a promise. The script is
 * `packages/engine/scripts/v2-cpu.mjs`; the clock (`now`, `performance.now`) comes in from it.
 */
import { content, createSeededRng, type Rng } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import {
  fightV2,
  stageV2,
  startCarry,
  trackBoss,
  type BossDef,
  type FightInputV2,
  type FinaleAction,
  type FighterSpec,
  type StageCarry,
} from '@creatures/engine/v2';
import { ALL_ROUND_TEAM } from './dungeon';
import { FOE_IDS, foeAt } from './foes';
import { raidMode } from './bosses';
import { placeFighters } from './fight';
import { tileLine } from './raidMeasure';
import { LAB_RULES } from './rules';
import { GAUNTLET, classicFor, toPlacements } from './search';
import { ELEMENTS, SHIPPED } from './species';
import { slotAnswersOf } from './track';

export interface CpuRow {
  readonly label: string;
  readonly runs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  /** The slowest median among the cases pooled into the row (a boss, a foe), with its name. */
  readonly worst?: { readonly name: string; readonly medianMs: number };
}

export interface CpuOptions {
  /** `performance.now`: milliseconds, fractions allowed. */
  readonly now: () => number;
  /** Runs timed for each case (default 40). */
  readonly runs?: number;
  /** Runs before the clock counts (default 8): the engine's memos and the JIT warm up. */
  readonly warmup?: number;
}

const world = {
  version: 2,
  rules: LAB_RULES,
  elements: ELEMENTS,
  chart: content.elementChart,
} as const;

/** The value at fraction `q` (0 to 1) of the sorted samples, by nearest rank. */
export function quantile(samples: readonly number[], q: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  ] as number;
}

/**
 * Times `play(k)` for `warmup` untimed runs (k from 0) and then `runs` timed ones; returns the milliseconds of the timed ones. `k` indexes
 * the dice a case built beforehand (`dice`), so making a generator is not on the clock.
 */
function time(play: (k: number) => void, o: Required<CpuOptions>): number[] {
  for (let k = 0; k < o.warmup; k++) play(k);
  const out: number[] = [];
  for (let k = o.warmup; k < o.warmup + o.runs; k++) {
    const t0 = o.now();
    play(k);
    out.push(o.now() - t0);
  }
  return out;
}

/** One seeded generator per run of a case, made before the clock starts. */
const dice = (name: string, o: Required<CpuOptions>) =>
  Array.from({ length: o.warmup + o.runs }, (_, k) => createSeededRng(`cpu:${name}:${k}`));

/** A row pooled from named cases' samples. */
function pooled(label: string, cases: readonly { name: string; samples: number[] }[]): CpuRow {
  const all = cases.flatMap((c) => c.samples);
  const worst = cases
    .map((c) => ({ name: c.name, medianMs: quantile(c.samples, 0.5) }))
    .sort((a, b) => b.medianMs - a.medianMs)[0];
  return {
    label,
    runs: all.length,
    medianMs: quantile(all, 0.5),
    p95Ms: quantile(all, 0.95),
    ...(worst ? { worst } : {}),
  };
}

/** The bosses of the third lap (slots 11 to 15, one of each): the heaviest the track has. */
const SLOTS = [11, 12, 13, 14, 15] as const;
const WIDTHS = [4, 10, 15] as const;

/** A raid party at `width` columns: the slot's first written answer (Knacks and talents), or the classic line, tiled to fill. */
function party(slot: number, width: number, line: 'answer' | 'classic'): FighterSpec[] {
  const wide = trackBoss(combatV2, SHIPPED, slot, { players: width });
  const mode = raidMode(wide);
  const picks =
    line === 'classic' ? classicFor(mode) : tileLine(slotAnswersOf(slot)[0]?.line ?? [], 4, width);
  return placeFighters(toPlacements(picks, mode));
}

const stageInput = (boss: BossDef, fighters: readonly FighterSpec[], log: boolean) => ({
  ...world,
  boss,
  fighters,
  options: { log },
});

/**
 * The same fight at its longest: every creature and the boss have 40 times the HP, so nobody falls, the boss does not die and every round
 * of every stage is played with the whole party acting (what a real fight costs when it goes the full length: the worst case).
 */
function longest(boss: BossDef, fighters: readonly FighterSpec[]) {
  return {
    boss: { ...boss, hp: boss.hp * 40 },
    fighters: fighters.map((f) => ({ ...f, maxHp: f.maxHp * 40 })),
  };
}

/** The live finale's inputs used for the replay: a Rally, a Shield Wall and a Purge in three rounds. */
const FINALE_ACTIONS: readonly FinaleAction[] = [
  { round: 2, kind: 'rally', by: 'p1' },
  { round: 3, kind: 'shieldWall', row: 1, by: 'p2' },
  { round: 4, kind: 'purge', by: 'p3' },
];

export function cpuReport(options: CpuOptions): CpuRow[] {
  const o: Required<CpuOptions> = { runs: 40, warmup: 8, ...options };
  const rows: CpuRow[] = [];

  // One raid stage (stage 1, fresh carry), at 4, 10 and 15 columns, 3 rows, the log off and on: as the lab plays it (a party that falls
  // early ends the fight early) and at the full length (every round, the whole party acting).
  for (const length of ['as played', 'full length'] as const)
    for (const line of ['answer', 'classic'] as const)
      for (const width of WIDTHS)
        for (const log of [false, true]) {
          const cases = SLOTS.map((slot) => {
            const wide = trackBoss(combatV2, SHIPPED, slot, { players: width });
            const played = party(slot, width, line);
            const { boss, fighters } =
              length === 'full length' ? longest(wide, played) : { boss: wide, fighters: played };
            const carry = startCarry(boss);
            const rngs = dice(`s${slot}`, o);
            return {
              name: `${boss.id} (slot ${slot})`,
              samples: time(
                (k) => void stageV2(stageInput(boss, fighters, log), carry, rngs[k] as Rng),
                o,
              ),
            };
          });
          const rows3 = trackBoss(combatV2, SHIPPED, SLOTS[0], { players: width }).rows;
          rows.push(
            pooled(
              `raid stage, ${width} columns x ${rows3} rows, ${line} line, ${length}, log ${log ? 'on' : 'off'}`,
              cases,
            ),
          );
        }

  // Resolving a party into creatures (the worker does it for each stage and each read).
  for (const width of WIDTHS) {
    const wide = trackBoss(combatV2, SHIPPED, 13, { players: width });
    const placements = toPlacements(
      tileLine(slotAnswersOf(13)[0]?.line ?? [], 4, width),
      raidMode(wide),
    );
    rows.push(
      pooled(`resolve ${placements.length} creatures (${width} columns)`, [
        { name: 'slot 13', samples: time(() => void placeFighters(placements), o) },
      ]),
    );
  }

  // One dungeon room: the all-round team against each foe at depth 15 (a landmark: the signature move too).
  {
    const placements = toPlacements(ALL_ROUND_TEAM, GAUNTLET);
    const fighters = placeFighters(placements);
    for (const log of [false, true]) {
      const cases = FOE_IDS.map((id) => {
        const boss = foeAt(id, 15, { signature: true });
        const input: FightInputV2 = { ...world, boss, fighters, options: { log } };
        const rngs = dice(`room:${id}`, o);
        return { name: id, samples: time((k) => void fightV2(input, rngs[k] as Rng), o) };
      });
      rows.push(pooled(`dungeon room, 3 creatures, depth 15, log ${log ? 'on' : 'off'}`, cases));
    }
  }

  // The live finale replayed from its seed and actions on a read: stage 3, with the carry of two stages behind it, to round 6 and to the end.
  for (const width of WIDTHS)
    for (const [label, rounds] of [
      ['round 6', 6],
      ['the last round', 0],
    ] as const) {
      const cases = SLOTS.map((slot) => {
        const { boss: full, fighters } = longest(
          trackBoss(combatV2, SHIPPED, slot, { players: width }),
          party(slot, width, 'answer'),
        );
        let carry: StageCarry = startCarry(full);
        for (let k = 0; k < 2; k++)
          carry = stageV2(
            stageInput(full, fighters, false),
            carry,
            createSeededRng(`cpu:pre${slot}:${k}`),
          ).carry;
        const rngs = dice(`fin${slot}`, o);
        const boss = rounds === 0 ? full : { ...full, rounds };
        return {
          name: `${full.id} (slot ${slot}, ${boss.rounds} rounds)`,
          samples: time(
            (k) =>
              void stageV2(
                { ...stageInput(boss, fighters, true), actions: FINALE_ACTIONS },
                carry,
                rngs[k] as Rng,
              ),
            o,
          ),
        };
      });
      rows.push(
        pooled(
          `live finale replay to ${label}, ${width} columns, full length, log on, 3 actions`,
          cases,
        ),
      );
    }
  return rows;
}

/** The rows as a text table. */
export function cpuTable(rows: readonly CpuRow[], limitMs = 10): string {
  const ms = (n: number) => n.toFixed(2).padStart(7);
  const lines = rows.map(
    (r) =>
      `${ms(r.medianMs)} ${ms(r.p95Ms)}  ${r.label}${r.worst ? `  [slowest median ${r.worst.medianMs.toFixed(2)} ms: ${r.worst.name}]` : ''}`,
  );
  return [
    `median(ms)  p95(ms)  case   (the Free plan's limit is ${limitMs} ms of CPU per request)`,
    ...lines,
  ].join('\n');
}
