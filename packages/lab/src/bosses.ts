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
 * HP is the weekend's shared HP (R14). Fourth panel (Misa, 2026-10-28): a raid is announced, so a team built for the week
 * should usually win (about 85% to 100% of weekends) and still lose creatures, while the classic raid party (four players
 * with Tidewing, Tempestray and Thornbuck) never wins. Each boss has one tool it really asks for (the first of its
 * `BOSS_ANSWERS`, tested by taking the tool away): Reach for the Tidal Colossus, Mired on the Cinder Wyrm, Pierce for
 * Thornmother, Taunt for the Storm Sovereign and healing for Old Bogback. Attack and the move powers are
 * the boss's threat: a weekend should cost the party creatures. The boss's Build-up (`escalation` in the data) is the
 * word players read.
 *
 * Balance pass (2026-10-29, Misa: a prepared team wins about 85% to 100% and pays for it, the classic party never wins
 * also at 10 and 15 columns, a mixed server wins about 50% to 85% and feels its losses more). The numbers below were
 * tuned together with the written answers (`bossAnswers.ts`, found by a team search that must keep the boss's tool and
 * a gap of at least 40 points without it): Attack and HP set how hard a weekend is for four players (a boss at its cliff
 * wins or loses within about 10% of Attack, so the prepared line sits just below it: a margin of 60% to 95% at +10%),
 * and the aimed moves that would thin out in a wide row (a single hit, a line of three) have `anchors` per `perColumns`
 * columns so a wide raid of the same three creatures meets as many of them as a narrow one does.
 *
 * Panel 5 (2026-10-29): the weekend HP grows with the players by one exponent for every boss (`RAID_HP_EXPONENT`,
 * `raidMeasure.ts`) and one smooth curve, with no kink; the per-boss exponents and the straight line past ten players are gone.
 *
 * Panel 5, content and tuning (Misa, 2026-10-29: the primary measure is the share of the boss's HP removed in a weekend, with the
 * retreat tiers beside it; the kill is the cliff): Mired's cut is halved, the Colossus washes debuffs off (Shake It Off), Thornmother's
 * bark cracks at each Build-up step, every rule card and gate has a strength (`strengthBp`, 0% to 100%) that rises with the Boss Rank,
 * the boss's Attack grows with the players (`RAID_ATK_EXPONENT`) so the tool gap holds at ten players, and the prepared answers
 * were searched for a team with random legal talents (`bossAnswers.ts`). The numbers below are the high rank's; each boss's
 * `ranks` row gives the lower ranks' HP and Attack.
 */
import { RULES, content, createSeededRng } from '@creatures/game';
import { card } from './cards';
import { weekend } from './fight';
import { LEVEL, toPlacements, type Mode, type Pick, type Score } from './search';
import type { BossDef, BossMove, Escalation, Fighter, Pattern, Placement } from './types';

/** The raid stage: rounds per stage (R14: the round count restarts each stage). */
export const RAID_ROUNDS = 8;
/** The raid arena is four slots wide: one column per player in the lab's raid search. */
export const RAID_COLS = 4;

/** A move in the lab's short form: `[id, name, every, turn, anchor, shape, powerBp, extras]`. */
type Extras = {
  readonly n?: number;
  /** single, line3, cross: aimed at this many different creatures (`Pattern.anchors`), per `perColumns` columns when that is set. */
  readonly anchors?: number;
  /** `n` per this many columns of the arena (`Pattern.perColumns`): scatter and row end counts grow with the raid's width. */
  readonly perColumns?: number;
  readonly decayBp?: number;
  /** A Wind-up move (the engine's field is still `charged`): like every move with a roll it is announced at round start; it changes how a hit is dodged and intercepted. */
  readonly windUp?: boolean;
  readonly silenceTurns?: number;
  /** A one-shot: this share (bp) of the target's Max HP at full strength (`BossMove.oneShotBp`). */
  readonly oneShotBp?: number;
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
      ...(x.anchors !== undefined ? { anchors: x.anchors } : {}),
      ...(x.perColumns !== undefined ? { perColumns: x.perColumns } : {}),
      ...(x.decayBp !== undefined ? { decayBp: x.decayBp } : {}),
    },
    powerBp,
    ...(x.windUp ? { charged: true } : {}),
    ...(x.silenceTurns ? { silenceTurns: x.silenceTurns } : {}),
    ...(x.oneShotBp ? { oneShotBp: x.oneShotBp } : {}),
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
  /**
   * HP and Attack at the lower ranks, in bp of the spec's (the spec is the high rank). A lower rank softens the cards and gates, which
   * would make the boss a walkover for everybody, so the lab roster (every creature at level 25 whatever the rank) meets a bigger pool
   * there; each boss's rows were found by a grid over HP and Attack that keeps the classic party from killing it at any width, lets the
   * prepared team kill, and puts the casual server between half and most of the HP (`scripts` in the lab log, 2026-10-29).
   */
  readonly ranks?: {
    readonly low: readonly [number, number];
    readonly mid: readonly [number, number];
  };
}

/**
 * The raid bosses. `turn` is the boss turn after which a move lands (0 after the front row, the last after the back
 * row); at most two moves share a turn on any round (tested).
 */
export const RAID_SPECS: readonly RaidBossSpec[] = [
  {
    id: 'tidal-colossus',
    rows: 3,
    armour: 34,
    atk: 116,
    hp: 20_200,
    plain: { pattern: { anchor: 'front', shape: 'row' }, powerBp: 2_500 },
    // The sea washes the mud off it (Shake It Off), so Mired is no must-have here; reactions it resists from stage 2.
    cards: ['adapts', 'shake-it-off'],
    // The tide rises as the Colossus is hurt: every fifth of its HP gone widens its columns and rows, and Mired slows it.
    escalation: {
      name: 'Rising Tide',
      feed: 'hpLost',
      per: 2_000,
      cap: 3,
      grow: { atkBp: 1_300, area: 1 },
    },
    asks: 'The whole sea sweeps the rows. Wide Reach and row wards turn the waves; who stands where?',
    ranks: { low: [14500, 10000], mid: [12500, 10000] },
    moves: [
      ['undertow', 'Undertow', 3, 0, 'front', 'row', 9_000],
      ['spray', 'Spray', 2, 0, 'random', 'scatter', 5_000, { n: 4, perColumns: 4 }],
      ['tidal-pull', 'Tidal Pull', 2, 1, 'strongest', 'columns', 6_000, { n: 2, perColumns: 4 }],
      [
        'riptide',
        'Riptide',
        4,
        1,
        'random',
        'columns',
        10_800,
        { n: 1, perColumns: 4, windUp: true },
      ],
      ['spring-tide', 'Spring Tide', 6, 1, 'payoff', 'row', 12_300, { windUp: true }],
      ['great-wave', 'Great Wave', 3, 2, 'random', 'randomRow', 13_900, { windUp: true }],
      [
        'deepwater-spear',
        'Deepwater Spear',
        5,
        2,
        'strongest',
        'columns',
        15_000,
        { n: 1, perColumns: 4 },
      ],
      ['breaker', 'Breaker', 7, 0, 'back', 'rows', 8_000, { n: 2 }],
    ],
  },
  {
    id: 'cinder-wyrm',
    rows: 4,
    armour: 60,
    atk: 130,
    hp: 22_600,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 6_000 },
    cards: ['reflective-hide', 'adapts-element'],
    // Every cashed reaction stokes the forge: the fire grows hotter and throws more shells. Few, big reactions or Mired hold it down.
    escalation: {
      name: 'Forge Heat',
      feed: 'reactions',
      per: 5,
      perColumns: 4,
      cap: 4,
      grow: { atkBp: 1_000, targets: 1 },
    },
    asks: 'The forge turns the first reaction of every row back on you, and every reaction heats it. Keep Mired on it, or make each reaction count.',
    ranks: { low: [15_000, 9_000], mid: [11_500, 10_000] },
    moves: [
      ['coil-crush', 'Coil Crush', 3, 0, 'front', 'line3', 15_000],
      ['scorch-lane', 'Scorch Lane', 2, 1, 'random', 'column', 7_000],
      ['magma-spit', 'Magma Spit', 4, 1, 'payoff', 'line3', 16_000],
      ['cinder-fall', 'Cinder Fall', 2, 3, 'random', 'scatter', 8_000, { n: 5, perColumns: 4 }],
      [
        'ember-leap',
        'Ember Leap',
        3,
        2,
        'strongest',
        'chain',
        14_000,
        { n: 3, perColumns: 4, decayBp: 7_000 },
      ],
      ['ash-cloud', 'Ash Cloud', 4, 2, 'random', 'checker', 6_000],
      ['eruption', 'Eruption', 5, 3, 'front', 'all', 8_000, { windUp: true }],
    ],
  },
  {
    id: 'thornmother',
    rows: 3,
    armour: 170,
    atk: 99,
    hp: 11_000,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 7_000 },
    cards: ['adapts'],
    // Each fifth of her HP lost wakes her further; at half she blooms (Second Bloom) and the whole arena is in play.
    escalation: {
      name: 'Awakening',
      feed: 'hpLost',
      per: 2_500,
      cap: 3,
      // The bark cracks at every step: her armour drops by 30 each fifth of her HP lost (170 at the start, 80 at the cap), so only a Pierce line or a big reaction gets in early.
      grow: { atkBp: 800, jumps: 1, armour: -30 },
      phase: {
        atStep: 2,
        name: 'Second Bloom',
        moves: [
          ['bloom-storm', 'Bloom Storm', 2, 0, 'random', 'scatter', 7_000, { n: 6, perColumns: 4 }],
          ['thorn-wall', 'Thorn Wall', 4, 2, 'front', 'rows', 9_000, { n: 2 }],
        ],
      },
    },
    asks: 'The row ends fall quiet. Keep what you cannot spare in the middle or ward it, and bring something for her thick bark.',
    ranks: { low: [15_000, 7_000], mid: [10_000, 10_000] },
    moves: [
      // The one silencing move: every second round, the two ends of every row.
      [
        'bramble-hush',
        'Bramble Hush',
        2,
        2,
        'front',
        'rowEnds',
        0,
        { n: 1, perColumns: 4, silenceTurns: 1 },
      ],
      ['briar-pincer', 'Briar Pincer', 3, 1, 'front', 'rowEnds', 9_000, { n: 1, perColumns: 4 }],
      ['bramble-cross', 'Bramble Cross', 2, 0, 'random', 'cross', 9_000],
      [
        'seed-burst',
        'Seed Burst',
        4,
        1,
        'random',
        'scatter',
        10_000,
        { n: 5, perColumns: 4, windUp: true },
      ],
      [
        'thorn-lash',
        'Thorn Lash',
        3,
        2,
        'strongest',
        'chain',
        12_000,
        { n: 3, perColumns: 4, decayBp: 6_000 },
      ],
      ['root-snare', 'Root Snare', 5, 2, 'random', 'columns', 8_000, { n: 2, perColumns: 4 }],
      ['back-thorns', 'Back Thorns', 4, 2, 'back', 'row', 8_000],
    ],
  },
  {
    id: 'storm-sovereign',
    rows: 2,
    armour: 7,
    atk: 73,
    hp: 14_500,
    // Lightning Rod: the plain attack leaps from the strongest Payoff, twice a round. A Taunt takes the first strike.
    plain: {
      pattern: { anchor: 'payoff', shape: 'chain', n: 2, perColumns: 4, decayBp: 5_500 },
      powerBp: 12_000,
    },
    cards: ['elusive', 'adapts-element'],
    // The storm gathers as the rounds pass: a race. Mired holds it back.
    escalation: {
      name: 'Gathering Storm',
      feed: 'rounds',
      per: 2,
      cap: 3,
      grow: { atkBp: 2_000, jumps: 1 },
    },
    asks: 'The Rod leaps from the strongest Payoff, round after round, and a Judgement Bolt, announced at round start, can fell it. Draw the Rod onto something that can take it, and have Night Watch beside the Payoff for the Bolt.',
    ranks: { low: [15_000, 9_000], mid: [13_000, 8_000] },
    moves: [
      [
        'thunderclap',
        'Thunderclap',
        3,
        0,
        'strongest',
        'line3',
        18_000,
        { anchors: 1, perColumns: 6 },
      ],
      [
        'forked-lightning',
        'Forked Lightning',
        2,
        0,
        'random',
        'columns',
        7_000,
        { n: 2, perColumns: 4 },
      ],
      [
        'static-field',
        'Static Field',
        3,
        1,
        'payoff',
        'line3',
        14_000,
        { anchors: 1, perColumns: 6 },
      ],
      [
        'ball-lightning',
        'Ball Lightning',
        4,
        1,
        'random',
        'scatter',
        9_000,
        { n: 3, perColumns: 4 },
      ],
      // A one-shot: 120% of the strongest Payoff's Max HP at full strength, a heavy hit of that share below it.
      [
        'judgement-bolt',
        'Judgement Bolt',
        4,
        0,
        'payoff',
        'single',
        70_000,
        { windUp: true, oneShotBp: 12_000, anchors: 1, perColumns: 4 },
      ],
      ['storm-front', 'Storm Front', 5, 1, 'front', 'all', 7_000, { windUp: true }],
      ['spark-dive', 'Spark Dive', 2, 1, 'payoff', 'single', 16_000, { anchors: 1, perColumns: 6 }],
    ],
  },
  {
    id: 'old-bogback',
    rows: 3,
    armour: 23,
    atk: 105,
    hp: 34_000,
    plain: {
      pattern: { anchor: 'front', shape: 'line3', anchors: 1, perColumns: 6 },
      powerBp: 4_500,
    },
    cards: ['shake-it-off', 'adapts-element'],
    asks: 'The fen pulls the most hurt creature down. Keep them up, and keep the Mired on it.',
    ranks: { low: [11500, 9000], mid: [10000, 10000] },
    moves: [
      ['sinking-mud', 'Sinking Mud', 3, 2, 'random', 'randomRow', 11_000],
      ['belly-flop', 'Belly Flop', 4, 0, 'front', 'line3', 13_900, { anchors: 1, perColumns: 6 }],
      ['bog-lob', 'Bog Lob', 5, 1, 'payoff', 'line3', 15_000, { anchors: 1, perColumns: 6 }],
      ['mud-slide', 'Mud Slide', 2, 2, 'random', 'columns', 6_000, { n: 2, perColumns: 4 }],
      [
        'rising-bubbles',
        'Rising Bubbles',
        4,
        1,
        'random',
        'scatter',
        12_000,
        { n: 4, perColumns: 4, windUp: true },
      ],
      ['sinkhole', 'Sinkhole', 6, 0, 'weakest', 'single', 20_900, { anchors: 1, perColumns: 6 }],
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
  'Mired on creatures (Sinking Mud, Mud Spit, Tar Cling, Fen Tug): the lab has Mired only on the boss (-1.5% damage and dodge per stack). A creature debuff needs a debuff-resistance tool first, so it is a proposal question.',
  'Purge as a move: it is the Shake It Off card, every third round instead of every fifth.',
  'Finale abilities (Rally, Shield Wall, Purge): gone with R18\u2019s Knacks.',
  'Slag Tyrant\u2019s backlash (half the time a reaction burns its Payoff): it is Reflective Hide, which is certain (P-04), plus a Build-up that thickens its shell.',
  'Room modifiers (Flooded, Thorns and the rest), rare rooms, carved doors, loot, experience and the Sealed Vault: a run here is the shipped map (fights, elites, mystery rooms, caches, the camp and the floor boss) and the Undercroft below it. Keepsakes are applied as shares off the foe, not as team stats.',
];

export const RAID_BOSS_IDS: readonly string[] = RAID_SPECS.map((s) => s.id);

function escalationOf(e: NonNullable<RaidBossSpec['escalation']>): Escalation {
  const { phase, ...rest } = e;
  return phase ? { ...rest, phase: { ...phase, moves: phase.moves.map(move) } } : rest;
}

/**
 * Boss Rank in the lab (Misa, 2026-10-29): the strength of the boss's cards and gates rises with the rank, and so do its HP and
 * Attack, as in the shipped ladder (`RULES.raid.curve`: steep in the first ranks, nearly flat later). Three settings stand for
 * it: low (a rank 1 to 3 server), mid (about rank 5) and high (the endgame, rank 10 and up). The raid specs below are the
 * high rank's numbers; a lower rank takes a share of the HP, the Attack, the armour and every card. The shares are lab-scale
 * (every lab creature is level 25, so the shipped table's early ranks, a few percent of the pool, would be a boss nobody feels).
 */
export interface RaidRank {
  readonly id: 'low' | 'mid' | 'high';
  /** The Boss Rank it stands for. */
  readonly rank: number;
  /** The strength of every card and gate (bp of the full card). */
  readonly strengthBp: number;
  /** HP and Attack, in bp of the spec's. */
  readonly hpBp: number;
  readonly atkBp: number;
}

export const RAID_RANKS: readonly RaidRank[] = [
  { id: 'low', rank: 2, strengthBp: 3_000, hpBp: 12_000, atkBp: 10_000 },
  { id: 'mid', rank: 5, strengthBp: 6_500, hpBp: 11_000, atkBp: 10_000 },
  { id: 'high', rank: 10, strengthBp: 10_000, hpBp: 10_000, atkBp: 10_000 },
];

export type RankId = RaidRank['id'];
export const rankOf = (id: RankId): RaidRank => RAID_RANKS.find((r) => r.id === id) as RaidRank;

/**
 * A raid boss by id at a Boss Rank (default high): name and element from the content, the rest from its spec; `hp`, `atk` and
 * `armour` may be overridden for tuning (they replace the rank's numbers). Armour and every card are built at the rank's strength.
 */
export function raidBossOf(
  id: string,
  over: { hp?: number; atk?: number; armour?: number; rank?: RankId } = {},
): BossDef {
  const spec = RAID_SPECS.find((s) => s.id === id);
  const shipped = content.bosses.find((b) => b.id === id);
  if (!spec || !shipped) throw new Error(`unknown raid boss ${id}`);
  const rank = rankOf(over.rank ?? 'high');
  const st = rank.strengthBp;
  const [hpBp, atkBp] =
    rank.id === 'high' || !spec.ranks ? [rank.hpBp, rank.atkBp] : spec.ranks[rank.id];
  let boss: BossDef = {
    id,
    name: shipped.name,
    element: shipped.element,
    hp: over.hp ?? Math.round((spec.hp * hpBp) / 10_000),
    atk: over.atk ?? Math.round((spec.atk * atkBp) / 10_000),
    // Half of a boss's armour is its hide and always there; the other half is its card, the strength's share of it.
    armour: over.armour ?? Math.round((spec.armour * (5_000 + Math.floor(st / 2))) / 10_000),
    spd: shipped.baseSpd ?? 0,
    rounds: RAID_ROUNDS,
    rows: spec.rows,
    cols: RAID_COLS,
    plain: spec.plain,
    moves: spec.moves.map(move),
    cards: spec.cards,
    mods: {},
    strengthBp: st,
    ...(spec.escalation
      ? { escalation: { ...escalationOf(spec.escalation), strengthBp: st } }
      : {}),
  };
  for (const c of spec.cards) boss = card(c).apply(boss, st);
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

/**
 * The shipped raid's success tiers (`RULES.raid.phases[].clearAtLossBp`): the boss retreats when 30% of its HP is gone and
 * again at 85% gone, and is defeated at 100%. Tier 1 and tier 2 are the two retreats; a kill is the third tier.
 */
export const TIER_LOSS: readonly [number, number] = [
  (RULES.raid.phases[0]?.clearAtLossBp ?? 3_000) / 10_000,
  (RULES.raid.phases[1]?.clearAtLossBp ?? 8_500) / 10_000,
];

/** Shares of weekends that reached each success tier (a weekend that kills reached all three). */
export interface Tiers {
  /** The first retreat: at least 30% of the boss's HP removed. */
  readonly t1: number;
  /** The second retreat: at least 85% removed. */
  readonly t2: number;
  /** Defeated: all of it. */
  readonly kill: number;
}

export interface WeekendStats {
  readonly runs: number;
  /** Share of weekends won, 0 to 1. */
  readonly winRate: number;
  /** Share of weekends that reached each success tier (the kill is `winRate`). */
  readonly tiers: Tiers;
  /** Mean knockouts in each stage of the weekend (a stage that did not happen counts 0). */
  readonly knockouts: readonly number[];
  /** Mean knockouts over the whole weekend, and mean replacements brought in. */
  readonly knockoutsTotal: number;
  readonly replacements: number;
  /**
   * The primary measure (Misa, 2026-10-29): the mean share of the weekend's boss HP removed (0 to 1), and the standard
   * deviation of that share between weekends. The kill rate is the secondary column.
   */
  readonly damageShare: number;
  readonly damageShareSd: number;
  /** Mean of the highest escalation step the boss reached in a weekend (0 for a boss without one). */
  readonly steps: number;
  /** Share of weekends that played each stage (stage 1 is always 1). */
  readonly played: readonly number[];
  /**
   * The team's HP at the end of each stage (Misa, 2026-10-29: everyone alive but low is also a result): the standing
   * creatures' HP over their max HP, a mean over the weekends that played the stage (0 for a stage nobody played).
   */
  readonly hpLeft: readonly number[];
  /** The share of the creatures that took the stage's field still standing at its end, over the weekends that played it. */
  readonly standing: readonly number[];
  /** The same two at the end of the weekend: the last stage each weekend played (a won weekend ends in its winning stage). */
  readonly hpLeftEnd: number;
  readonly standingEnd: number;
  /** Mean knockouts over the weekend by the owner of the creature (`p1` ...): who paid for it. */
  readonly knockoutsByOwner: Readonly<Record<string, number>>;
}

/** The standing creatures' HP over their max HP, and the share of the field standing, at the end of a stage. */
export function teamHealth(fighters: readonly Fighter[]): { hpLeft: number; standing: number } {
  const up = fighters.filter((f) => f.hp > 0);
  const max = up.reduce((n, f) => n + f.maxHp, 0);
  return {
    hpLeft: max > 0 ? up.reduce((n, f) => n + f.hp, 0) / max : 0,
    standing: fighters.length > 0 ? up.length / fighters.length : 0,
  };
}

/** Several weekend measures of the same boss as one, each weighted by its number of runs (the mixed server's draws). */
export function combineWeekends(parts: readonly WeekendStats[]): WeekendStats {
  const runs = parts.reduce((n, p) => n + p.runs, 0);
  const w = (f: (p: WeekendStats) => number) => parts.reduce((n, p) => n + f(p) * p.runs, 0) / runs;
  const stages = Math.max(0, ...parts.map((p) => p.played.length));
  const at = (k: number, f: (p: WeekendStats) => number) =>
    parts.reduce((n, p) => n + (p.played[k] ?? 0) * p.runs * f(p), 0) /
    Math.max(
      1e-9,
      parts.reduce((n, p) => n + (p.played[k] ?? 0) * p.runs, 0),
    );
  const idx = Array.from({ length: stages }, (_, k) => k);
  return {
    runs,
    winRate: w((p) => p.winRate),
    tiers: { t1: w((p) => p.tiers.t1), t2: w((p) => p.tiers.t2), kill: w((p) => p.tiers.kill) },
    knockouts: idx.map((k) => w((p) => p.knockouts[k] ?? 0)),
    knockoutsTotal: w((p) => p.knockoutsTotal),
    replacements: w((p) => p.replacements),
    damageShare: w((p) => p.damageShare),
    // Pooled: the spread inside each part plus the spread of the parts' means (the law of total variance).
    damageShareSd: Math.sqrt(
      w((p) => p.damageShareSd ** 2) + w((p) => p.damageShare ** 2) - w((p) => p.damageShare) ** 2,
    ),
    steps: w((p) => p.steps),
    played: idx.map((k) => w((p) => p.played[k] ?? 0)),
    hpLeft: idx.map((k) => at(k, (p) => p.hpLeft[k] ?? 0)),
    standing: idx.map((k) => at(k, (p) => p.standing[k] ?? 0)),
    hpLeftEnd: w((p) => p.hpLeftEnd),
    standingEnd: w((p) => p.standingEnd),
    knockoutsByOwner: Object.fromEntries(
      [...new Set(parts.flatMap((p) => Object.keys(p.knockoutsByOwner)))].map((o) => [
        o,
        w((p) => p.knockoutsByOwner[o] ?? 0),
      ]),
    ),
  };
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
    steps = 0,
    t1 = 0,
    t2 = 0,
    shareSq = 0;
  const ko = [0, 0, 0];
  const played = [0, 0, 0];
  const hp = [0, 0, 0];
  const up = [0, 0, 0];
  let hpEnd = 0,
    upEnd = 0;
  const byOwner: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const w = weekend(boss, placements, bench, {
      rng: createSeededRng(`weekend:${salt}:${i}`),
    });
    if (w.won) wins++;
    reps += w.replacements;
    w.stages.forEach((st, k) => {
      ko[k] = (ko[k] ?? 0) + st.knockouts;
      const h = teamHealth(st.fighters);
      played[k] = (played[k] ?? 0) + 1;
      hp[k] = (hp[k] ?? 0) + h.hpLeft;
      up[k] = (up[k] ?? 0) + h.standing;
      for (const f of st.fighters) if (f.hp <= 0) byOwner[f.owner] = (byOwner[f.owner] ?? 0) + 1;
    });
    const lastStage = w.stages[w.stages.length - 1];
    if (lastStage) {
      const h = teamHealth(lastStage.fighters);
      hpEnd += h.hpLeft;
      upEnd += h.standing;
    }
    steps += Math.max(0, ...w.stages.map((st) => st.escalation?.step ?? 0));
    const left = w.stages[w.stages.length - 1]?.bossHpLeft ?? boss.hp;
    share += 1 - left / boss.hp;
    shareSq += (1 - left / boss.hp) ** 2;
    if (1 - left / boss.hp >= TIER_LOSS[0]) t1++;
    if (1 - left / boss.hp >= TIER_LOSS[1]) t2++;
  }
  const knockouts = ko.map((k) => k / runs);
  return {
    runs,
    winRate: wins / runs,
    tiers: { t1: t1 / runs, t2: t2 / runs, kill: wins / runs },
    knockouts,
    knockoutsTotal: knockouts.reduce((a, b) => a + b, 0),
    replacements: reps / runs,
    damageShare: share / runs,
    damageShareSd: Math.sqrt(Math.max(0, shareSq / runs - (share / runs) ** 2)),
    steps: steps / runs,
    played: played.map((n) => n / runs),
    hpLeft: hp.map((h, k) => h / Math.max(1, played[k] ?? 0)),
    standing: up.map((u, k) => u / Math.max(1, played[k] ?? 0)),
    hpLeftEnd: hpEnd / runs,
    standingEnd: upEnd / runs,
    knockoutsByOwner: Object.fromEntries(Object.entries(byOwner).map(([o, n]) => [o, n / runs])),
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
