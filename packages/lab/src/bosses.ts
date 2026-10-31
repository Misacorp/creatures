/**
 * The five raid bosses of the shipped game as combat v2 `BossDef`s (roadmap phase 1: "the bosses ... as slot patterns,
 * arenas and rule cards"). Name and element come from the content, so they cannot drift. Everything else is data in
 * `@creatures/game/combat-v2` (`raid-bosses.json`), in the grammar of the engine's `types.ts`: an arena, an armour, a plain
 * attack, a list of moves (anchor + shape, power, a round cadence, a boss turn) and one or two rule cards. This file keeps the
 * tuning history below (the measurements the numbers came from) and what the lab does with the data: the ranks, the weekend
 * measures.
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
 * also at 10 and 15 columns, a mixed server wins about 50% to 85% and feels its losses more). The numbers in the data were
 * tuned together with the written answers (`bossAnswers.ts`, found by a team search that must keep the boss's tool and
 * a gap of at least 40 points without it): Attack and HP set how hard a weekend is for four players (a boss at its cliff
 * wins or loses within about 10% of Attack, so the prepared line sits just below it: a margin of 60% to 95% at +10%),
 * and the aimed moves that would thin out in a wide row (a single hit, a line of three) have `anchors` per `perColumns`
 * columns so a wide raid of the same three creatures meets as many of them as a narrow one does.
 *
 * Panel 5 (2026-10-29): the weekend HP grows with the players by one exponent for every boss (`RAID_HP_EXPONENT`,
 * `raidMeasure.ts`) and one smooth curve, with no kink; the per-boss exponents and the straight line past ten players are gone.
 *
 * Rank ladder (Misa, 2026-10-29: low rank asks for a tool, high rank requires it; early raids must not expect an answer to every
 * problem): HP, Attack, armour and card strength all rise from the low rank to the mid and the high rank, and so does the roster
 * (`RAID_RANKS`: the lab's creatures are level 12, 18 and 25), so a lower rank is softer without being a walkover.
 *
 * Panel 5, content and tuning (Misa, 2026-10-29: the primary measure is the share of the boss's HP removed in a weekend, with the
 * retreat tiers beside it; the kill is the cliff): Mired's cut is halved, the Colossus washes debuffs off (Shake It Off), Thornmother's
 * bark cracks at each Build-up step, every rule card and gate has a strength (`strengthBp`, 0% to 100%) that rises with the Boss Rank,
 * the boss's Attack grows with the players (`RAID_ATK_EXPONENT`) so the tool gap holds at ten players, and the prepared answers
 * were searched for a team with random legal talents (`bossAnswers.ts`). The numbers in the data are the high rank's; each boss's
 * `ranks` row gives the lower ranks' HP and Attack.
 */
import { RULES, createSeededRng } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { raidBoss } from '@creatures/engine/v2';
import { weekend } from './fight';
import { SHIPPED } from './species';
import { LEVEL, toPlacements, type Mode, type Pick, type Score } from './search';
import type { BossDef, BossMove, Escalation, Fighter, Placement } from './types';

/** The raid stage: rounds per stage (R14: the round count restarts each stage). */
export const RAID_ROUNDS = 8;
/** The raid arena is four slots wide: one column per player in the lab's raid search. */
export const RAID_COLS = 4;

export interface RaidBossSpec {
  readonly id: string;
  readonly rows: number;
  readonly armour: number;
  readonly atk: number;
  /** The weekend's shared HP. */
  readonly hp: number;
  readonly plain: BossDef['plain'];
  readonly moves: readonly BossMove[];
  readonly cards: readonly string[];
  /** The boss's Store (the escalation), with its phase moves. */
  readonly escalation?: Escalation;
  /** One line for the report: what the boss asks. */
  readonly asks: string;
  /**
   * HP, Attack and (optionally) armour at the lower ranks, in bp of the spec's (the spec is the high rank): every step down is softer
   * in every respect, so each number is below the next rank's. The lab roster is weaker at a lower rank too (`RaidRank.level`), which
   * is what keeps a softer boss from being a walkover. Each boss's rows come from a grid over HP and Attack at the rank's roster level
   * (2026-10-29): the prepared team kills, its tool keeps adding at least ten points of the HP, the classic party never kills, and the
   * mixed server removes more of the HP at a lower rank. The armour entry replaces the card's share (half the armour is the hide, the
   * other half the card at the rank's strength) where the bark is the gate: Thornmother's.
   */
  readonly ranks?: {
    readonly low: readonly [hpBp: number, atkBp: number, armourBp?: number];
    readonly mid: readonly [hpBp: number, atkBp: number, armourBp?: number];
  };
}

const rankRow = (r: {
  readonly hpBp: number;
  readonly atkBp: number;
  readonly armourBp?: number;
}): [hpBp: number, atkBp: number, armourBp?: number] =>
  r.armourBp === undefined ? [r.hpBp, r.atkBp] : [r.hpBp, r.atkBp, r.armourBp];

/**
 * The raid bosses: data in `@creatures/game/combat-v2` (`raid-bosses.json`, in the order of the file). `turn` is the boss turn after
 * which a move lands (0 after the front row, the last after the back row); at most two damaging moves share a turn on any round (the
 * game's loader checks it). The numbers' history is in the header above and in `docs/design/combat/boss-track.md`.
 */
export const RAID_SPECS: readonly RaidBossSpec[] = Object.values(combatV2.raidBosses).map((b) => ({
  id: b.id,
  rows: b.rows,
  armour: b.armour,
  atk: b.atk,
  hp: b.hp,
  plain: b.plain,
  moves: b.moves,
  cards: b.cards,
  ...(b.escalation ? { escalation: b.escalation } : {}),
  asks: b.asks,
  ...(b.ranks ? { ranks: { low: rankRow(b.ranks.low), mid: rankRow(b.ranks.mid) } } : {}),
}));

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

/**
 * Boss Rank in the lab (Misa, 2026-10-29): the strength of the boss's cards and gates rises with the rank, and so do its HP and
 * Attack, as in the shipped ladder (`RULES.raid.curve`: steep in the first ranks, nearly flat later). Three settings stand for
 * it: low (a rank 1 to 3 server), mid (about rank 5) and high (the endgame, rank 10 and up). The raid specs below are the
 * high rank's numbers; a lower rank takes a share of the HP, the Attack, the armour and every card, and its server's creatures
 * are lower level (`level`): the shipped table's early ranks are small because the roster is small, so the lab's roster grows with
 * the rank too (a level 25 roster at every rank would make a boss softer than the high rank's a walkover).
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
  /** The level of the server's creatures (the rank's roster: a young server has lower levels, no gear and fewer talents). */
  readonly level: number;
}

export const RAID_RANKS: readonly RaidRank[] = [
  { id: 'low', rank: 2, strengthBp: 3_000, hpBp: 12_000, atkBp: 10_000, level: 12 },
  { id: 'mid', rank: 5, strengthBp: 6_500, hpBp: 11_000, atkBp: 10_000, level: 18 },
  { id: 'high', rank: 10, strengthBp: 10_000, hpBp: 10_000, atkBp: 10_000, level: LEVEL },
];

export type RankId = RaidRank['id'];
export const rankOf = (id: RankId): RaidRank => RAID_RANKS.find((r) => r.id === id) as RaidRank;

/**
 * A raid boss by id at a Boss Rank (default high): name and element from the content, the rest from its spec; `hp`, `atk` and
 * `armour` may be overridden for tuning (they replace the rank's numbers). Armour and every card are built at the rank's strength.
 */
export function raidBossOf(
  id: string,
  over: {
    hp?: number;
    atk?: number;
    armour?: number;
    rank?: RankId;
    level?: number;
    /** The strength of every card and gate, instead of the rank's (the boss track's slots sit between the three ranks, `track.ts`). */
    strengthBp?: number;
    /** How many of the spec's rule cards the boss has, the first ones (default: all; the young-server ramp gives slot 1 none and slot 2 one, `track.ts`). */
    cards?: number;
    /** Whether the boss has its Build-up (the escalation), default yes; the ramp's first two slots do not. */
    buildUp?: boolean;
    /** Cards the boss carries on top of its spec's, at the same strength (the track's later laps add a luck card, `SLOT_EXTRA_CARDS` in `track.ts`). */
    extraCards?: readonly string[];
  } = {},
): BossDef {
  const spec = RAID_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`unknown raid boss ${id}`);
  const rank = rankOf(over.rank ?? 'high');
  const st = over.strengthBp ?? rank.strengthBp;
  const [hpBp, atkBp, armourBp] =
    rank.id === 'high' || !spec.ranks ? [rank.hpBp, rank.atkBp, undefined] : spec.ranks[rank.id];
  return raidBoss(combatV2, SHIPPED, id, {
    hp: over.hp ?? Math.round((spec.hp * hpBp) / 10_000),
    atk: over.atk ?? Math.round((spec.atk * atkBp) / 10_000),
    armour:
      over.armour ?? Math.round((spec.armour * (armourBp ?? 5_000 + Math.floor(st / 2))) / 10_000),
    strengthBp: st,
    ...(over.cards === undefined ? {} : { cards: over.cards }),
    ...(over.buildUp === undefined ? {} : { buildUp: over.buildUp }),
    ...(over.extraCards === undefined ? {} : { extraCards: over.extraCards }),
    rounds: RAID_ROUNDS,
    cols: RAID_COLS,
    rosterLevel: over.level ?? rank.level,
  });
}

/** The arena of a raid boss as a search mode: four players, one column each, up to four copies of a form. */
export function raidMode(boss: BossDef): Mode {
  return {
    id: 'raid',
    rows: boss.rows,
    cols: boss.cols,
    maxCopies: 4,
    ...(boss.rosterLevel !== undefined ? { level: boss.rosterLevel } : {}),
  };
}

/** Each player (one per column, four in the usual raid) keeps one Kilnmole with Draw Fire on the bench, as in the report's raid weekend. */
export function raidBench(players = 4, level = LEVEL): Placement[] {
  return Array.from({ length: players }, (_, k) => k + 1).map((i) => ({
    owner: `p${i}`,
    formId: 'kilnmole',
    level,
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
  return weekendStatsOf(
    boss,
    toPlacements(line, raidMode(boss)),
    raidBench(boss.cols, boss.rosterLevel),
    runs,
    salt,
  );
}

/** What a weekend may add to a fight besides its seeds: Determination (the path's dial, `FightOptions.determinationBp`). */
export interface WeekendExtra {
  readonly determinationBp?: number;
}

/** `runs` seeded raid weekends of the placed creatures (any roster) against `boss`, with the players' benches. */
export function weekendStatsOf(
  boss: BossDef,
  placements: readonly Placement[],
  bench: readonly Placement[],
  runs: number,
  salt: string,
  extra: WeekendExtra = {},
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
      ...extra,
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
 * Damage potential over `runs` seeded raid weekends (Misa, 2026-10-30): the weekend is fought as if the boss could not die
 * (`FightOptions.potential`: all rounds and stages play, nothing is wasted on overkill), and the measure is the total damage dealt
 * divided by the boss's HP, so 1.4 is 140%. Knockouts, attrition between stages and Build-up run as in a real weekend. The seeds are
 * the ones `weekendStatsOf` uses, so the two measures fight the same weekend until the boss would have died.
 */
export interface WeekendPotential {
  readonly runs: number;
  /** Mean potential (1 is the boss's HP) and its standard deviation between weekends. */
  readonly mean: number;
  readonly sd: number;
}

export function weekendPotentialOf(
  boss: BossDef,
  placements: readonly Placement[],
  bench: readonly Placement[],
  runs: number,
  salt: string,
  extra: WeekendExtra = {},
): WeekendPotential {
  let sum = 0,
    sq = 0;
  for (let i = 0; i < runs; i++) {
    const w = weekend(boss, placements, bench, {
      rng: createSeededRng(`weekend:${salt}:${i}`),
      potential: true,
      ...extra,
    });
    const p = w.stages.reduce((n, st) => n + st.damage, 0) / boss.hp;
    sum += p;
    sq += p * p;
  }
  const mean = sum / runs;
  return { runs, mean, sd: Math.sqrt(Math.max(0, sq / runs - mean * mean)) };
}

/** `runs` potential weekends of `line` against `boss` (a player for each column, a bench), as `weekendStats` places it. */
export function weekendPotential(
  boss: BossDef,
  line: readonly Pick[],
  runs: number,
  salt: string,
): WeekendPotential {
  return weekendPotentialOf(
    boss,
    toPlacements(line, raidMode(boss)),
    raidBench(boss.cols, boss.rosterLevel),
    runs,
    salt,
  );
}

/** Several potential measures as one, each weighted by its runs (pooled spread: the law of total variance). */
export function combinePotential(parts: readonly WeekendPotential[]): WeekendPotential {
  const runs = parts.reduce((n, p) => n + p.runs, 0);
  const w = (f: (p: WeekendPotential) => number) =>
    parts.reduce((n, p) => n + f(p) * p.runs, 0) / runs;
  const mean = w((p) => p.mean);
  return {
    runs,
    mean,
    sd: Math.sqrt(Math.max(0, w((p) => p.sd ** 2) + w((p) => p.mean ** 2) - mean ** 2)),
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
