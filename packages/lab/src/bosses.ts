/**
 * The five raid bosses of the shipped game as combat v2 `BossDef`s (roadmap phase 1: "the bosses ... as slot patterns,
 * arenas and rule cards"). Name and element come from the content, so they cannot drift. Everything else is lab data
 * in the grammar of `types.ts`: an arena, an armour, a plain attack, a list of moves (anchor + shape, power, a round
 * cadence, a boss turn) and one or two rule cards.
 *
 * Misa's direction (2026-10-28): in a raid the players know the one boss in advance and build a roster against it, so a
 * raid boss is strong and has many attacks, most of them area attacks in varied patterns, and a weekend costs the
 * party creatures. The shipped gimmicks are inspiration, not a limit: each boss keeps its identity (the Tidal Colossus
 * sweeps rows and columns, Thornmother binds and silences, the Storm Sovereign strikes the strongest, Old Bogback
 * cleanses and sinks, the Cinder Wyrm burns back reactions) and gets the rest of its moves from the grammar.
 *
 * HP is the weekend's shared HP (R14), set so the classic raid party (four players with Tidewing, Tempestray and
 * Thornbuck) wins about a third of the weekends and the best team found by search wins more (`measureBoss`).
 * Attack and the move powers are the boss's threat: a weekend should cost the party creatures.
 */
import { content, createSeededRng } from '@creatures/game';
import { card } from './cards';
import { weekend } from './fight';
import { LEVEL, toPlacements, type Mode, type Pick, type Score } from './search';
import type { BossDef, BossMove, Escalation, Pattern, Placement } from './types';

/** The raid stage: rounds per stage (R14: the round count restarts each stage). */
export const RAID_ROUNDS = 8;
/** The raid arena is four slots wide: one column per player in the lab's raid search. */
export const RAID_COLS = 4;

/** A move in the lab's short form: `[id, name, every, turn, anchor, shape, powerBp, extras]`. */
type Extras = {
  readonly n?: number;
  /** `n` is for this many columns and grows with the arena's width (`Pattern.perColumns`). */
  readonly perColumns?: number;
  readonly decayBp?: number;
  readonly charged?: boolean;
  readonly silenceTurns?: number;
};
export type MoveRow = readonly [
  id: string,
  name: string,
  every: number,
  turn: number,
  anchor: Pattern['anchor'],
  shape: Pattern['shape'],
  powerBp: number,
  extras?: Extras,
];

export function move(row: MoveRow): BossMove {
  const [id, name, every, turn, anchor, shape, powerBp, x = {}] = row;
  return {
    id,
    name,
    every,
    turn,
    pattern: {
      anchor,
      shape,
      ...(x.n !== undefined ? { n: x.n } : {}),
      ...(x.perColumns !== undefined ? { perColumns: x.perColumns } : {}),
      ...(x.decayBp !== undefined ? { decayBp: x.decayBp } : {}),
    },
    powerBp,
    ...(x.charged ? { charged: true } : {}),
    ...(x.silenceTurns ? { silenceTurns: x.silenceTurns } : {}),
  };
}

export interface RaidBossSpec {
  readonly id: string;
  readonly rows: number;
  readonly armour: number;
  readonly atk: number;
  /** The weekend's shared HP. */
  readonly hp: number;
  readonly plain: BossDef['plain'];
  readonly moves: readonly MoveRow[];
  readonly cards: readonly string[];
  /** The boss's Store (the escalation); its phase moves are given in the short form. */
  readonly escalation?: Omit<Escalation, 'phase'> & {
    readonly phase?: {
      readonly atStep: number;
      readonly name: string;
      readonly moves: readonly MoveRow[];
    };
  };
  /** One line for the report: what the boss asks. */
  readonly asks: string;
}

/**
 * The raid bosses. `turn` is the boss turn after which a move lands (0 after the front row, the last after the back
 * row); at most two moves share a turn on any round (tested).
 */
export const RAID_SPECS: readonly RaidBossSpec[] = [
  {
    id: 'tidal-colossus',
    rows: 3,
    armour: 30,
    atk: 118,
    hp: 45_000,
    plain: { pattern: { anchor: 'front', shape: 'row' }, powerBp: 2_500 },
    cards: ['adapts'],
    // The tide rises as creatures fall: each pair knocked out widens its columns and rows, a spiral that is stopped early or not at all.
    escalation: {
      name: 'Rising Tide',
      feed: 'knockouts',
      per: 2,
      cap: 3,
      grow: { atkBp: 800, area: 1 },
    },
    asks: 'The whole sea: rows, lanes and spray. Who stands where, and who can take a wave?',
    moves: [
      ['undertow', 'Undertow', 3, 0, 'front', 'row', 9_000],
      ['spray', 'Spray', 2, 0, 'random', 'scatter', 5_000, { n: 4 }],
      ['tidal-pull', 'Tidal Pull', 2, 1, 'strongest', 'columns', 6_000, { n: 2 }],
      ['riptide', 'Riptide', 4, 1, 'random', 'column', 14_000, { charged: true }],
      ['spring-tide', 'Spring Tide', 6, 1, 'payoff', 'row', 16_000, { charged: true }],
      ['great-wave', 'Great Wave', 3, 2, 'random', 'randomRow', 18_000, { charged: true }],
      ['deepwater-spear', 'Deepwater Spear', 5, 2, 'strongest', 'column', 15_000],
      ['breaker', 'Breaker', 7, 0, 'back', 'rows', 8_000, { n: 2 }],
    ],
  },
  {
    id: 'cinder-wyrm',
    rows: 4,
    armour: 24,
    atk: 140,
    hp: 41_000,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 6_000 },
    cards: ['reflective-hide', 'adapts-element'],
    // Every cashed reaction stokes the forge: the fire grows hotter and throws more shells. Few, big reactions or Mired hold it down.
    escalation: {
      name: 'Forge Heat',
      feed: 'reactions',
      per: 5,
      cap: 4,
      grow: { atkBp: 1_000, targets: 1 },
    },
    asks: 'The forge turns your first reaction back on you. Spread the heat, and guard the carry.',
    moves: [
      ['coil-crush', 'Coil Crush', 3, 0, 'front', 'line3', 15_000],
      ['scorch-lane', 'Scorch Lane', 2, 1, 'random', 'column', 7_000],
      ['magma-spit', 'Magma Spit', 4, 1, 'payoff', 'line3', 16_000],
      ['cinder-fall', 'Cinder Fall', 2, 3, 'random', 'scatter', 8_000, { n: 5 }],
      ['ember-chain', 'Ember Chain', 3, 2, 'strongest', 'chain', 14_000, { n: 3, decayBp: 7_000 }],
      ['ash-cloud', 'Ash Cloud', 4, 2, 'random', 'checker', 6_000],
      ['eruption', 'Eruption', 5, 3, 'front', 'all', 8_000, { charged: true }],
    ],
  },
  {
    id: 'thornmother',
    rows: 3,
    armour: 38,
    atk: 131,
    hp: 29_500,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 7_000 },
    cards: ['adapts'],
    // Each quarter of her HP lost wakes her further; at half she blooms (Phase 2) and the whole arena is in play.
    escalation: {
      name: 'Awakening',
      feed: 'hpLost',
      per: 2_500,
      cap: 3,
      grow: { atkBp: 800, jumps: 1 },
      phase: {
        atStep: 2,
        name: 'Second Bloom',
        moves: [
          ['bloom-storm', 'Bloom Storm', 2, 0, 'random', 'scatter', 7_000, { n: 6 }],
          [
            'choking-bloom',
            'Choking Bloom',
            3,
            1,
            'front',
            'rowEnds',
            0,
            { n: 2, silenceTurns: 1 },
          ],
          ['thorn-wall', 'Thorn Wall', 4, 2, 'front', 'rows', 9_000, { n: 2 }],
        ],
      },
    },
    asks: 'The row ends fall silent. Put what you cannot spare in the middle, or ward it.',
    moves: [
      ['bramble-bind', 'Bramble Bind', 2, 2, 'front', 'rowEnds', 0, { n: 1, silenceTurns: 1 }],
      ['choking-vines', 'Choking Vines', 4, 0, 'front', 'rowEnds', 0, { n: 1, silenceTurns: 2 }],
      ['briar-pincer', 'Briar Pincer', 3, 1, 'front', 'rowEnds', 9_000, { n: 1 }],
      ['bramble-cross', 'Bramble Cross', 2, 0, 'random', 'cross', 9_000],
      ['seed-burst', 'Seed Burst', 4, 1, 'random', 'scatter', 10_000, { n: 5, charged: true }],
      ['thorn-lash', 'Thorn Lash', 3, 2, 'strongest', 'chain', 12_000, { n: 3, decayBp: 6_000 }],
      ['root-snare', 'Root Snare', 5, 2, 'random', 'columns', 8_000, { n: 2 }],
      ['back-thorns', 'Back Thorns', 4, 2, 'back', 'row', 8_000],
    ],
  },
  {
    id: 'storm-sovereign',
    rows: 2,
    armour: 10,
    atk: 104,
    hp: 14_000,
    plain: { pattern: { anchor: 'strongest', shape: 'single' }, powerBp: 8_000 },
    cards: ['elusive', 'adapts-element'],
    // The storm gathers as the rounds pass: a race. Mired holds it back.
    escalation: {
      name: 'Gathering Storm',
      feed: 'rounds',
      per: 2,
      cap: 3,
      grow: { atkBp: 1_000, jumps: 1 },
    },
    asks: 'He strikes the hardest hitter first. Who can take it, and who can still land a hit on him?',
    moves: [
      [
        'lightning-rod',
        'Lightning Rod',
        1,
        1,
        'strongest',
        'chain',
        14_000,
        { n: 2, decayBp: 5_500 },
      ],
      ['thunderclap', 'Thunderclap', 3, 0, 'strongest', 'line3', 18_000],
      ['forked-lightning', 'Forked Lightning', 2, 0, 'random', 'columns', 7_000, { n: 2 }],
      ['static-field', 'Static Field', 3, 1, 'payoff', 'row', 12_000],
      ['ball-lightning', 'Ball Lightning', 4, 1, 'random', 'scatter', 9_000, { n: 3 }],
      ['judgement-bolt', 'Judgement Bolt', 4, 0, 'payoff', 'single', 28_000, { charged: true }],
      ['storm-front', 'Storm Front', 5, 1, 'front', 'all', 7_000, { charged: true }],
    ],
  },
  {
    id: 'old-bogback',
    rows: 3,
    armour: 18,
    atk: 112,
    hp: 42_500,
    plain: { pattern: { anchor: 'front', shape: 'line3' }, powerBp: 4_500 },
    cards: ['shake-it-off', 'adapts-element'],
    asks: 'The fen swallows the wounded. Keep them up, and keep the Mired on it.',
    moves: [
      ['sinking-mud', 'Sinking Mud', 3, 2, 'random', 'randomRow', 11_000],
      ['belly-flop', 'Belly Flop', 4, 0, 'front', 'line3', 16_000],
      ['bog-lob', 'Bog Lob', 5, 1, 'payoff', 'line3', 15_000],
      ['mud-slide', 'Mud Slide', 2, 2, 'random', 'columns', 6_000, { n: 2 }],
      [
        'rising-bubbles',
        'Rising Bubbles',
        4,
        1,
        'random',
        'scatter',
        12_000,
        { n: 4, charged: true },
      ],
      ['swallow', 'Swallow', 6, 0, 'weakest', 'single', 24_000],
      ['peat-wave', 'Peat Wave', 5, 0, 'back', 'rows', 9_000, { n: 2 }],
    ],
  },
];

/** What the port leaves behind, and why (the report lists it). */
export const NOT_PORTED: readonly string[] = [
  'Boss Rank: the rank-gated moves (rank 4 and 7) and the HP growth per rank. Every move is in play; Boss Rank scaling is the simulator phase (roadmap 5).',
  'Turn orders (left to right, serpentine, right to left): the lab acts row by row, left to right, with a boss turn after each row (R8).',
  'Phase 1, Phase 2 and the twelve-round finale, with their retreat lines: a weekend is three stages of eight rounds that share the boss\u2019s HP (R14). The retreat lines are live-finale flavour.',
  'The lance\u2019s falloff (each row softer) and the Guard that stops a lance: a column hits every creature in it at the move\u2019s power, and a Guard covers by reach like any area hit.',
  'Mired on creatures (Sinking Mud, Mud Spit, Tar Cling, Pull Under): the lab has Mired only on the boss (-3% damage and dodge per stack). A creature debuff needs a debuff-resistance tool first, so it is a proposal question.',
  'Purge as a move: it is the Shake It Off card, every third round instead of every fifth.',
  'Finale abilities (Rally, Shield Wall, Purge): gone with R18\u2019s Knacks.',
  'Slag Tyrant\u2019s backlash (half the time a reaction burns its Payoff): it is Reflective Hide, which is certain (P-04), plus an escalation that heats it.',
  'Room modifiers (Flooded, Thorns and the rest), elites, mystery rooms, keepsakes and the Undercroft: a run here is fights, the camp and the floor boss. The Undercroft stays a mystery and is not modelled.',
];

export const RAID_BOSS_IDS: readonly string[] = RAID_SPECS.map((s) => s.id);

function escalationOf(e: NonNullable<RaidBossSpec['escalation']>): Escalation {
  const { phase, ...rest } = e;
  return phase ? { ...rest, phase: { ...phase, moves: phase.moves.map(move) } } : rest;
}

/** A raid boss by id: name and element from the content, the rest from its spec; `hp` and `atk` may be overridden for tuning. */
export function raidBossOf(id: string, over: { hp?: number; atk?: number } = {}): BossDef {
  const spec = RAID_SPECS.find((s) => s.id === id);
  const shipped = content.bosses.find((b) => b.id === id);
  if (!spec || !shipped) throw new Error(`unknown raid boss ${id}`);
  let boss: BossDef = {
    id,
    name: shipped.name,
    element: shipped.element,
    hp: over.hp ?? spec.hp,
    atk: over.atk ?? spec.atk,
    armour: spec.armour,
    spd: shipped.baseSpd ?? 0,
    rounds: RAID_ROUNDS,
    rows: spec.rows,
    cols: RAID_COLS,
    plain: spec.plain,
    moves: spec.moves.map(move),
    cards: spec.cards,
    mods: {},
    ...(spec.escalation ? { escalation: escalationOf(spec.escalation) } : {}),
  };
  for (const c of spec.cards) boss = card(c).apply(boss);
  return boss;
}

/** The arena of a raid boss as a search mode: four players, one column each, up to four copies of a form. */
export function raidMode(boss: BossDef): Mode {
  return { id: 'raid', rows: boss.rows, cols: boss.cols, maxCopies: 4 };
}

/** Each player (one per column, four in the usual raid) keeps one Kilnmole with Draw Fire on the bench, as in the report's raid weekend. */
export function raidBench(players = 4): Placement[] {
  return Array.from({ length: players }, (_, k) => k + 1).map((i) => ({
    owner: `p${i}`,
    formId: 'kilnmole',
    level: LEVEL,
    knack: 'draw-fire',
    row: 0,
    col: 0,
  }));
}

export interface WeekendStats {
  readonly runs: number;
  /** Share of weekends won, 0 to 1. */
  readonly winRate: number;
  /** Mean knockouts in each stage of the weekend (a stage that did not happen counts 0). */
  readonly knockouts: readonly number[];
  /** Mean knockouts over the whole weekend, and mean replacements brought in. */
  readonly knockoutsTotal: number;
  readonly replacements: number;
  /** Mean share of the weekend's boss HP removed. */
  readonly damageShare: number;
  /** Mean of the highest escalation step the boss reached in a weekend (0 for a boss without one). */
  readonly steps: number;
}

/** `runs` seeded raid weekends of `line` against `boss` (three stages, attrition, a bench; a player for each column). */
export function weekendStats(
  boss: BossDef,
  line: readonly Pick[],
  runs: number,
  salt: string,
): WeekendStats {
  return weekendStatsOf(boss, toPlacements(line, raidMode(boss)), raidBench(boss.cols), runs, salt);
}

/** `runs` seeded raid weekends of the placed creatures (any roster) against `boss`, with the players' benches. */
export function weekendStatsOf(
  boss: BossDef,
  placements: readonly Placement[],
  bench: readonly Placement[],
  runs: number,
  salt: string,
): WeekendStats {
  let wins = 0,
    reps = 0,
    share = 0,
    steps = 0;
  const ko = [0, 0, 0];
  for (let i = 0; i < runs; i++) {
    const w = weekend(boss, placements, bench, {
      rng: createSeededRng(`weekend:${salt}:${i}`),
    });
    if (w.won) wins++;
    reps += w.replacements;
    w.stages.forEach((st, k) => {
      ko[k] = (ko[k] ?? 0) + st.knockouts;
    });
    steps += Math.max(0, ...w.stages.map((st) => st.escalation?.step ?? 0));
    const left = w.stages[w.stages.length - 1]?.bossHpLeft ?? boss.hp;
    share += 1 - left / boss.hp;
  }
  const knockouts = ko.map((k) => k / runs);
  return {
    runs,
    winRate: wins / runs,
    knockouts,
    knockoutsTotal: knockouts.reduce((a, b) => a + b, 0),
    replacements: reps / runs,
    damageShare: share / runs,
    steps: steps / runs,
  };
}

/**
 * A line's score over raid weekends, in the shape the team search ranks by: wins count most, then how much of the boss's
 * HP the weekend removed, then fewer knockouts (each costs half a point). `damage` is the share of the boss's HP removed.
 */
export function weekendScore(
  boss: BossDef,
): (line: readonly Pick[], seeds: number, salt: string) => Score {
  return (line, seeds, salt) => {
    const w = weekendStats(boss, line, seeds, salt);
    return {
      score: 100 * w.winRate + 40 * w.damageShare - 0.5 * w.knockoutsTotal,
      damage: w.damageShare,
      knockouts: w.knockoutsTotal,
      reactions: 0,
      blocked: 0,
    };
  };
}
