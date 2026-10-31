/**
 * The raid targets as data, in one place: the numbers the tests, the lab report and the boss tuner (`tuner.ts`) all read.
 *
 * Two kinds. The thresholds the tests and the report already used (`TOOL_*`, `ROBUST_*`, `GATE_*`, `MARGIN_TARGET`) moved here
 * from `answerMeasure.ts` and `raidMeasure.ts` without a change of value (those modules re-export them). `RAID_TARGETS` is new:
 * for each Boss Rank, what a boss's numbers (HP, Attack, armour) should achieve, as bounds on measures the report already takes.
 * The tuner searches the numbers for the best fit and says which targets cannot be met together.
 *
 * Third kind: the rules the lab tests hold a boss's numbers to (`RULE_TARGETS`: the thresholds of `test/boss*.test.ts`, named here and
 * imported by those tests). They are measured the way the tests measure them (`raidRules.ts`), so the tuner cannot propose numbers
 * a test rejects (2026-10-30: a proposal that met every target failed two tests it did not know about).
 *
 * The values of `RAID_TARGETS` are Misa's, 2026-10-30 (a failed boss returns next week; a raid measures the HP removed;
 * `docs/design/decisions/raids.md`). Changing one is a one-line edit here; no test pins what the tuner proposes, only these
 * numbers (`test/tuner.test.ts`).
 */

import type { CoverageServer } from './valley';

/** An answer's own tool must be worth at least this many win-rate points (panel 5, finding 3). */
export const TOOL_DROP_MIN = 20;
/**
 * An answer's own tool must also be worth at least this many points of the boss's HP removed (Misa, 2026-10-29: the share of HP
 * removed is the primary measure; the kill rate is the cliff). Tested at the high rank, with the line's written talents.
 */
export const TOOL_SHARE_MIN = 0.1;
/**
 * A Knack family is a gate on a boss when taking it out of an answer costs more than this many points of kill rate (the cliff:
 * "required"). The same removal is also shown as points of the boss's HP removed, the primary measure (Misa, 2026-10-29).
 */
export const GATE_DROP = 50;
/** The gate check fails for a family that is a gate on this many bosses or more. */
export const GATE_BOSSES = 3;
/** And remove at least this share of the boss's HP (the primary measure) with random legal talents. */
export const ROBUST_SHARE = 0.8;
/**
 * The old kill-rate target of the prepared line with random legal talents (panel 5, finding 4). The report still shows it; the
 * tuner no longer targets it (Misa, 2026-10-30: the kill is measured as `prepared.beat2` on the written talents instead).
 */
export const ROBUST_TARGET = 0.6;
/** A prepared team usually beats the boss within two weekends (Misa, 2026-10-30): the chance of a kill in at most two is this. */
export const BEAT2_MIN = 0.75;
/**
 * Damage potential (Misa, 2026-10-30): the weekend played as if the boss could not die, as total damage over the boss's HP
 * (`weekendPotentialOf` in `bosses.ts`; 1.4 is 140%). The main measure of the raid.
 * A prepared team (the boss's puzzle solved: the first written answer WITH ITS WRITTEN TALENTS, a server that re-picks them from its
 * Talent Book) reaches at least `PREPARED_POTENTIAL_MIN`, so it wins with room to spare; random legal talents are measured too
 * (`prepared.potentialRandom`) and reported, with no target. An unprepared but decent team (the classic trio) reaches between
 * `CLASSIC_POTENTIAL_MIN` and `CLASSIC_POTENTIAL_MAX`, so that a slightly prepared team can push into a kill.
 */
export const PREPARED_POTENTIAL_MIN = 1.25;
export const CLASSIC_POTENTIAL_MIN = 0.7;
export const CLASSIC_POTENTIAL_MAX = 0.9;
/**
 * The lead's call: among numbers that meet every target, the track tuner prefers the prepared potential nearest this and the classic
 * potential nearest that (the middle of the classic band, and a little above the prepared floor, not the easiest or the hardest numbers).
 */
export const PREPARED_POTENTIAL_AIM = 1.3;
export const CLASSIC_POTENTIAL_AIM = 0.8;
/**
 * A wall slot (`SLOT_WALL` in `track.ts`; Misa, 2026-10-30, "Thornmother is a deliberate wall at the end of the first lap" in
 * `docs/design/decisions/raids.md`): a prepared team still reaches `PREPARED_POTENTIAL_MIN`, but the classic party, which has no
 * answer, sits far lower, between these two (no kill: `classic.kill` is unchanged). The tuner aims at the middle of the band.
 */
export const WALL_CLASSIC_POTENTIAL_MIN = 0.3;
export const WALL_CLASSIC_POTENTIAL_MAX = 0.6;
export const WALL_CLASSIC_POTENTIAL_AIM = 0.45;
/**
 * The tutorial must be a tutorial for every server (design panel 6, the lead's verdict, 2026-10-30): slot 1, the boss with no rule cards,
 * is also beaten in its first weekend by the mixed server (the path's mixed mapping: two min-maxers, three builders and five casual
 * players, `MIXED` in `path.ts`) in at least this share of weekends. Slot 1 only (`slotTargetsFor`); the prepared potential target stays.
 */
export const TUTORIAL_MIXED_KILL_MIN = 0.8;
/**
 * Mixed servers are tuned too (Misa, 2026-10-30, panel 6: "if possible"): on every slot but the tutorial, a mixed server (the path's
 * mixed mapping, ten players, expected speed) needs at most `MIXED_WEEKENDS_MAX` weekends. How it is measured, in the way the tuner can
 * afford: the mixed server's kill rate per weekend `p` at the slot's numbers (`mixed.kill`, which the tuner already takes), read as
 * the chance of a kill within three weekends, `beatWithin(p, 3)`, the way `prepared.beat2` reads the prepared line. That chance is at
 * least `MIXED_BEAT_MIN` (half of the servers kill within three weekends) exactly when `p` is at least `MIXED_KILL_MIN` (about 21%).
 * The weight is below every dedicated target's, so where both cannot hold together the dedicated ones win and the miss is reported.
 * Slot 1's 80% first-weekend kill (`TUTORIAL_MIXED_KILL_MIN`) is the tutorial's own, stronger version, and replaces this one there.
 */
export const MIXED_WEEKENDS_MAX = 3;
export const MIXED_BEAT_MIN = 0.5;
export const MIXED_KILL_MIN = 1 - (1 - MIXED_BEAT_MIN) ** (1 / MIXED_WEEKENDS_MAX);
export const MIXED_WEIGHT = 0.5;
/**
 * Ownability (the lead's call, 2026-10-30; Misa's constraint in the valley's round 15: "it's okay to require a rare here or there because
 * players will be able to pool their rarer creatures together in the raid roster; a 100% common requirement is too limiting"): a slot's
 * tool line (the boss's first answer) is ownable at the week the slot arrives when the chance that a mixed server of `OWNABLE_SERVER`
 * owns every non-common line it uses is at least `OWNABLE_CHANCE_MIN` (`ownability.ts`).
 */
export const OWNABLE_CHANCE_MIN = 0.5;
export const OWNABLE_SERVER: CoverageServer = 'mixed8';
/**
 * A miss of a potential target costs this times the distance (the weight of the other targets is 1 to 2): the potentials are the
 * main targets, so where the tool's worth cannot be met together with them (the potential is damage over HP, and a tool worth ten
 * points of the HP share needs a team without it to fall short of the kill), the tuner keeps the potentials and misses the tool.
 */
export const POTENTIAL_WEIGHT = 4;
/** A mixed server's and the classic party's weeks to a kill show as "20+" beyond this. */
export const WEEKS_CAP = 20;
/** The boss's win rate target at +10% Attack and at +10% HP (a well-prepared team should usually win, but not by a mile). */
export const MARGIN_TARGET = 0.6;

/** The Boss Ranks the lab sets up (`RAID_RANKS` in `bosses.ts`), lowest first. */
export type TargetRank = 'low' | 'mid' | 'high';
export const TARGET_RANKS: readonly TargetRank[] = ['low', 'mid', 'high'];

// ---------- the thresholds the lab tests hold a boss's HP, Attack and armour to ----------
// Each moved here from a test without a change of value or meaning; the test imports it. The measures are in `raidRules.ts`.
// "Every boss" means over `RAID_BOSS_IDS`; "high" is the default rank of `raidBossOf`.

/** `test/bossAnswers.test.ts` (panel 4; 2026-10-29: the share of the HP removed is the measure): at the high rank every written answer removes this share of the HP... */
export const ANSWER_SHARE_MIN = 0.9;
/** ...and reaches the second retreat (the boss at 15% of its HP or less) in this share of weekends; the boss's first answer also kills this often. */
export const ANSWER_T2_MIN = 0.6;
export const ANSWER_FIRST_KILL_MIN = 0.6;
/** ...while the classic party never kills and removes at most this share of the HP (`test/bossAnswers.test.ts`, high rank). */
export const ANSWER_CLASSIC_KILL_MAX = 0;
export const ANSWER_CLASSIC_SHARE_MAX = 0.8;
/** Written talents beat random ones by a share of the HP, not by the whole weekend: at most this much (panel 5, finding 4; `bossAnswers.test.ts`). */
export const ROBUST_GAP_MAX = 0.2;

/** `test/bossRank.test.ts` (Misa, 2026-10-29: a lower rank softens the cards): at every rank the prepared line kills this often and removes this share of the HP... */
export const RANK_PREPARED_KILL_MIN = 0.6;
export const RANK_PREPARED_SHARE_MIN = 0.93;
/** ...and the classic party never kills. */
export const RANK_CLASSIC_KILL_MAX = 0;
/**
 * The classic party removes no more of the HP at the high rank than at the low rank, give or take this much (`bossRank.test.ts`; a
 * cross-rank rule: the low rank's share minus the high rank's is at least minus this).
 */
export const RANK_CLASSIC_LADDER_SLACK = 0.05;
/**
 * A server of ten casual players at the low rank (`bossRank.test.ts`; 2026-10-29: the unprepared feel it first): they remove between
 * these shares of the HP and kill at most this often.
 */
export const CASUAL_SHARE_MIN = 0.3;
export const CASUAL_SHARE_MAX = 0.9;
export const CASUAL_KILL_MAX = 0.3;
/**
 * The tool's worth to a team with random talents, in the share of the HP removed, per rank (`bossRank.test.ts` and
 * `bossRankTool.test.ts`: ten points at the high rank, "about ten" at the lower ones, with a margin for the 40-weekend measure).
 */
export const RANK_TOOL_SHARE_MIN: Readonly<Record<TargetRank, number>> = {
  high: TOOL_SHARE_MIN,
  mid: 0.08,
  low: 0.06,
};
/** Thornmother's answer matters more at the high rank than at the low rank, by more than this many points of the HP (`bossRank.test.ts`; a cross-rank rule). */
export const THORN_TOOL_GAP_POINTS = 10;

/** `test/bossMargin.test.ts` (panel 4): the prepared line, as it stands and at +10% Attack and +10% HP at the high rank, keeps this share of the HP removed. */
export const MARGIN_BASE_MIN = 0.93;
export const MARGIN_PLUS10_MIN = 0.8;
/**
 * The prepared line pays for its win (`bossMargin.test.ts`; Misa, 2026-10-29: everyone alive but low is also a result): it removes
 * this share of the HP, and loses at least this many creatures or ends with the team at this share of HP or lower; the team never
 * ends above the maximum.
 */
export const COST_SHARE_MIN = 0.93;
export const COST_KNOCKOUTS_MIN = 0.5;
export const COST_HP_LEFT_LOW = 0.6;
export const COST_HP_LEFT_MAX = 0.8;
/** At 5, 10 and 15 columns (`bossMargin.test.ts`): the classic party kills at most this often and removes at most this share, the prepared line at least this share. */
export const WIDTH_CLASSIC_KILL_MAX = 0.1;
export const WIDTH_CLASSIC_SHARE_MAX = 0.9;
export const WIDTH_BEST_SHARE_MIN = 0.85;
/**
 * The tool gap at 10 players (`bossMargin.test.ts`): the larger of (the HP share the tool adds / `GAP10_SHARE_UNIT`) and (the kill rate
 * it adds / `GAP10_KILL_UNIT`) is at least `GAP10_MIN`: a line that removes all the HP either way shows its tool in the kills, one that
 * kills no weekend in the HP.
 */
export const GAP10_SHARE_UNIT = 0.05;
export const GAP10_KILL_UNIT = 0.2;
export const GAP10_MIN = 1;
/** A mixed server of ten (`bossMargin.test.ts`; panel 4): wins at most this often, removes between these shares of the HP, and loses more than this many times a prepared team's creatures. */
export const SERVER_KILL_MAX = 0.9;
export const SERVER_SHARE_MIN = 0.4;
export const SERVER_SHARE_MAX = 0.97;
export const SERVER_KNOCKOUT_FACTOR = 3;
/** A weekend costs the classic party this many creatures at least, and it wins at most this often (`bossContent.test.ts`, high rank). */
export const CONTENT_KNOCKOUTS_MIN = 3;
export const CONTENT_CLASSIC_KILL_MAX = 0.5;
/** Armour a boss must keep at the high rank (`bossContent.test.ts`: Forge Heat is not freed by skipping reactions, so its Wyrm is armoured). */
export const BOSS_ARMOUR_MIN: Readonly<Record<string, number>> = { 'cinder-wyrm': 50 };

/**
 * What the tuner measures for one boss at one rank (all shares and rates are 0 to 1):
 * - `prepared.share`, `prepared.kill`: the prepared line (the boss's first written answer) with random legal talents: the mean
 *   share of the boss's HP removed and the share of weekends that kill (`robustnessOf`, `.random`). The kill rate is information.
 * - `prepared.written`: the kill rate of the same line with its written talents (a server facing a returning boss can re-pick
 *   talents from its Talent Book); `prepared.beat2` is the chance to kill in at most two weekends from it (`beatWithin`).
 * - `tool.share`: what the tool is worth with random legal talents: that share minus the same line's with its tool taken off
 *   (`withoutTool`). `tool.written`: the same gap with the line's written talents, as `test/bossAnswers.test.ts` measures it
 *   (`toolCost`'s `shareDrop`). Both must reach `TOOL_SHARE_MIN`, so the tuner cannot propose numbers that test rejects.
 * - `classic.*`: the classic party (`classicFor`) on the usual four columns.
 * - `mixed.*`: the mixed server of ten (2 min-maxers, 3 builders, 5 casual players on their top creatures with no Knack, as
 *   `mixedSpread` measures it).
 */
export const RAID_MEASURES = [
  'prepared.share',
  'prepared.kill',
  'prepared.written',
  'prepared.beat2',
  'tool.share',
  'tool.written',
  'classic.share',
  'classic.kill',
  'mixed.share',
  'mixed.kill',
  // Damage potential (Misa, 2026-10-30): the written-talents prepared line and the classic party, the main targets.
  'prepared.potential',
  'classic.potential',
  // Information only, taken in the full measurement (`Fidelity.info`): the prepared line with random talents, the tool's worth in
  // potential points (written talents) and the mixed server's potential (the boss track only).
  'prepared.potentialRandom',
  'tool.potential',
  'mixed.potential',
  // The rules of the lab tests (`raidRules.ts`; each is measured the way its test measures it, with the test's own seeds).
  // High rank: `bossAnswers.test.ts` (answers.*, robust.*), `bossMargin.test.ts` (margin.*, cost.*, width.*, gap10, server.*),
  // `bossContent.test.ts` (content.*).
  'answers.classicKill',
  'answers.classicShare',
  'answers.share',
  'answers.t2',
  'answers.firstKill',
  'answers.beatClassic',
  'answers.toolShare',
  'answers.toolKill',
  'robust.share',
  'robust.gap',
  'margin.base',
  'margin.atk10',
  'margin.hp10',
  'cost.share',
  'cost.pays',
  'cost.hpLeft',
  'width.classicKill',
  'width.classicShare',
  'width.bestShare',
  'gap10',
  'server.kill',
  'server.share',
  'server.knockouts',
  'content.knockouts',
  'content.classicKill',
  // Every rank, `bossRank.test.ts` and `bossRankTool.test.ts`.
  'rank.preparedKill',
  'rank.preparedShare',
  'rank.classicKill',
  'rank.toolShare',
  // The low rank: a casual server of ten.
  'casual.share',
  'casual.kill',
  // Between ranks (tuned together with `--rank all`): the classic party's ladder, and Thornmother's tool at the high rank over the low.
  'cross.classicLadder',
  'cross.toolGap',
] as const;
export type RaidMeasure = (typeof RAID_MEASURES)[number];
/** The measures the summary shows as information when no target reads them (the first twelve; the test rules are shown only as targets). */
export const REPORTED_MEASURES: readonly RaidMeasure[] = RAID_MEASURES.slice(0, 12);
/** The information measures taken only in the full measurement (`Fidelity.info`): NaN in the cheap passes. */
export const INFO_MEASURES: readonly RaidMeasure[] = RAID_MEASURES.slice(12, 15);
/** The value of every measure; a measure not taken at this level of fidelity is NaN (no target reads it: `lossOf`, `metBy`). */
export type RaidMeasures = Readonly<Record<RaidMeasure, number>>;

/** The measures that are not shares (0 to 1): they print as plain numbers. */
const PLAIN_MEASURES: ReadonlySet<RaidMeasure> = new Set([
  'answers.beatClassic',
  'cost.pays',
  'gap10',
  'server.knockouts',
  'content.knockouts',
]);
export const isShareMeasure = (m: RaidMeasure): boolean => !PLAIN_MEASURES.has(m);

/** The measures that need a rank other than the one measured (`cross.*`): only `--rank all` can check them. */
export const isCrossMeasure = (m: RaidMeasure): boolean => m.startsWith('cross.');

/** A bound on one measure (`min` and/or `max`, inclusive), how much a miss costs the tuner, and where it comes from. */
export interface RaidTarget {
  readonly measure: RaidMeasure;
  readonly min?: number;
  readonly max?: number;
  /** The `min` is exclusive (the test says "greater than"): a value equal to it misses by `STRICT_MISS`. */
  readonly strictMin?: boolean;
  /** The loss of a miss is this times the distance from the bound (in the measure's own unit: a share of 1). */
  readonly weight: number;
  readonly why: string;
  /** The rule holds only for these bosses (default: every boss). */
  readonly bosses?: readonly string[];
}

/** How far a value equal to an exclusive bound is counted outside it (small enough not to move the loss in practice). */
export const STRICT_MISS = 1e-9;

const preparedTargets = (): RaidTarget[] => [
  {
    measure: 'prepared.potential',
    min: PREPARED_POTENTIAL_MIN,
    weight: POTENTIAL_WEIGHT,
    why: 'A prepared team (the puzzle solved: written talents) reaches a damage potential of 125% or more: it wins with room to spare (Misa, 2026-10-30)',
  },
  {
    measure: 'prepared.share',
    min: ROBUST_SHARE,
    weight: 2,
    why: 'A prepared team removes most of the HP even with random legal talents (robustness, 2026-10-29)',
  },
  {
    measure: 'prepared.beat2',
    min: BEAT2_MIN,
    weight: 2,
    why: 'A prepared team usually wins within two weekends: a kill in about half of its weekends or more (Misa, 2026-10-30)',
  },
  {
    measure: 'tool.share',
    min: TOOL_SHARE_MIN,
    weight: 1,
    why: 'The boss’s tool is worth at least ten points of its HP removed with random legal talents (rule cards ask before they require)',
  },
  {
    measure: 'tool.written',
    min: TOOL_SHARE_MIN,
    weight: 1,
    why: 'and with the written talents too (the answer test’s own measure)',
  },
];

// The unprepared classic party may get anything but a clean kill, so its HP removed has no limit, but its damage potential sits
// between 70% and 90%; the mixed server has no target (its numbers are information, `RAID_MEASURES`).
const unpreparedTargets = (wall = false): RaidTarget[] => [
  {
    measure: 'classic.potential',
    min: wall ? WALL_CLASSIC_POTENTIAL_MIN : CLASSIC_POTENTIAL_MIN,
    max: wall ? WALL_CLASSIC_POTENTIAL_MAX : CLASSIC_POTENTIAL_MAX,
    weight: POTENTIAL_WEIGHT,
    why: wall
      ? 'A wall slot: the unprepared classic party, with no answer, reaches a damage potential of only 30% to 60% (Misa, 2026-10-30: Thornmother is a deliberate wall)'
      : 'The unprepared but decent classic party reaches a damage potential of 70% to 90%: a slightly prepared team can push into a kill (Misa, 2026-10-30)',
  },
  {
    measure: 'classic.kill',
    max: 0.05,
    weight: 1,
    why: 'The unprepared classic party kills at most about 5% of weekends (Misa, 2026-10-30)',
  },
];

/** Misa's targets, 2026-10-30: the same bounds at every rank (the ranks differ in the boss's numbers, not in what is asked of them). */
export const RAID_TARGETS: Readonly<Record<TargetRank, readonly RaidTarget[]>> = {
  low: [...preparedTargets(), ...unpreparedTargets()],
  mid: [...preparedTargets(), ...unpreparedTargets()],
  high: [...preparedTargets(), ...unpreparedTargets()],
};

/**
 * The tool's worth a boss's cards ask for, by the strength of its cards (bp of the full card): "rule cards ask before they require"
 * (Misa, 2026-10-29). The tests' own line through the three ranks (`RANK_TOOL_SHARE_MIN`: 0.06, 0.08 and 0.10 at 30%, 65% and 100%),
 * straight between them, flat above 100%, and below 30% falling straight to 0.03 at 0%.
 */
export function toolShareMinAt(strengthBp: number): number {
  const points: readonly (readonly [number, number])[] = [
    [0, RANK_TOOL_SHARE_MIN.low / 2],
    [3_000, RANK_TOOL_SHARE_MIN.low],
    [6_500, RANK_TOOL_SHARE_MIN.mid],
    [10_000, RANK_TOOL_SHARE_MIN.high],
  ];
  if (strengthBp >= 10_000) return RANK_TOOL_SHARE_MIN.high;
  for (let i = 1; i < points.length; i++) {
    const [s0, v0] = points[i - 1] as readonly [number, number];
    const [s1, v1] = points[i] as readonly [number, number];
    if (strengthBp <= s1) return v0 + ((v1 - v0) * (Math.max(0, strengthBp) - s0)) / (s1 - s0);
  }
  return RANK_TOOL_SHARE_MIN.high;
}

/**
 * The tool's worth a slot's cards ask for on the boss track, in points of damage potential (the lead's call, 2026-10-30): 0.05 at 0% of
 * the cards' strength, 0.10 at 30%, then straight up to 0.35 at 100%, flat above. A card asks at low strength and requires at full: a
 * team with the tool reaches about 130%, and without it at full strength falls under 100% (130% minus 35 points). On the track this
 * replaces the HP-share tool targets (`toolShareMinAt`), which cannot hold once a prepared team's potential is 125% or more: such a team
 * removes nearly all the HP whether it brings the tool or not. They stay as information, and the fixed ranks' rules keep them.
 */
export function toolPotentialMinAt(strengthBp: number): number {
  const points: readonly (readonly [number, number])[] = [
    [0, 0.05],
    [3_000, 0.1],
    [10_000, 0.35],
  ];
  if (strengthBp >= 10_000) return 0.35;
  for (let i = 1; i < points.length; i++) {
    const [s0, v0] = points[i - 1] as readonly [number, number];
    const [s1, v1] = points[i] as readonly [number, number];
    if (strengthBp <= s1) return v0 + ((v1 - v0) * (Math.max(0, strengthBp) - s0)) / (s1 - s0);
  }
  return 0.35;
}

/** A miss of the track's tool target costs this times the distance (a card asks for it, so less than the potentials' `POTENTIAL_WEIGHT`). */
export const TOOL_POTENTIAL_WEIGHT = 2;

/**
 * Misa's targets for slot `slot` of the boss track, whose cards have strength `strengthBp`: `RAID_TARGETS` (the same bounds at every
 * rank) with changes of the lead's and Misa's, which Misa can change (`wall` is the slot's flag, `SLOT_WALL` in `track.ts`, passed in
 * because `track.ts` reads this module's tuner):
 * - the tool's worth is a target in points of damage potential, by its cards' strength (`toolPotentialMinAt`), and not in points of the
 *   HP share (`tool.share`, `tool.written`: information only here);
 * - slot 1 is the welcome boss, a tutorial with no rule cards (`SLOT_CARDS` in `track.ts`): a new server has its starters, so any
 *   decent team may win it and the classic party has no limit (`classic.kill`, `classic.potential`); with no card there is no tool to
 *   ask for, so the tool's worth has no target there either. Its targets are the prepared potential, `prepared.beat2` and the prepared
 *   line's HP removed with random talents (Misa, 2026-10-30), and one more (`TUTORIAL_MIXED_KILL_MIN`): the mixed server kills it in
 *   its first weekend in at least 80% of weekends (design panel 6, 2026-10-30), so the tutorial is a tutorial for every server.
 * - every other slot asks the mixed server to kill within three weekends in half of its runs (`MIXED_KILL_MIN`, weight below the rest).
 * - a wall slot (`wall`, from `TrackSlot.wall`: Thornmother's first appearance, slot 5) asks the classic party for a potential of 30% to 60% instead of
 *   70% to 90% (`WALL_CLASSIC_POTENTIAL_*`; the decision "Thornmother is a deliberate wall at the end of the first lap"); all else as usual.
 */
export function slotTargetsFor(slot: number, strengthBp: number, wall = false): RaidTarget[] {
  const welcome = (m: RaidMeasure): boolean => m === 'classic.kill' || m === 'classic.potential';
  const targets = RAID_TARGETS.high.filter(
    (t) =>
      t.measure !== 'tool.share' &&
      t.measure !== 'tool.written' &&
      !(slot === 1 && welcome(t.measure)),
  );
  if (slot === 1)
    return [
      ...targets,
      {
        measure: 'mixed.kill',
        min: TUTORIAL_MIXED_KILL_MIN,
        weight: 2,
        why: 'The tutorial is a tutorial for every server: the mixed server (ten players, five of them casual) kills it in its first weekend in at least 80% of weekends (design panel 6, the lead, 2026-10-30)',
      },
    ];
  const mixed: RaidTarget = {
    measure: 'mixed.kill',
    min: MIXED_KILL_MIN,
    weight: MIXED_WEIGHT,
    why: 'Mixed servers are tuned too: a mixed server (ten players, five of them casual) kills the slot within three weekends in half of its runs or more, a kill rate per weekend of about 21% or more (Misa, 2026-10-30)',
  };
  const tool: RaidTarget = {
    measure: 'tool.potential',
    min: toolPotentialMinAt(strengthBp),
    weight: TOOL_POTENTIAL_WEIGHT,
    why: 'The slot’s tool is worth this many points of damage potential, by the strength of its cards: a card asks at low strength and requires at full (the lead, 2026-10-30)',
  };
  // The tool target sits where the HP-share tool targets stood (after the prepared targets, before the classic party's).
  const at = targets.findIndex((t) => t.measure === 'classic.potential');
  // A wall slot swaps the classic party's potential band for the wall's (the prepared targets and the kill limit stay).
  const classic = unpreparedTargets(wall);
  return [
    ...targets.slice(0, at),
    tool,
    ...targets.slice(at).map((t) => classic.find((c) => c.measure === t.measure) ?? t),
    mixed,
  ];
}

/**
 * A miss of a test rule costs this times the weight given to the rule: a boss that fails a lab test cannot be applied, so the tuner
 * does not trade a test failure for a better fit to the softer targets (Misa's, `RAID_TARGETS`, and the tool's worth).
 */
export const RULE_WEIGHT = 10;

const rule = (
  measure: RaidMeasure,
  bounds: { min?: number; max?: number; strictMin?: boolean },
  why: string,
  weight = 1,
  bosses?: readonly string[],
): RaidTarget => ({
  measure,
  ...bounds,
  weight: weight * RULE_WEIGHT,
  why,
  ...(bosses ? { bosses } : {}),
});

/** The rules at every rank (`bossRank.test.ts`, `bossRankTool.test.ts`). */
const rankRules = (rank: TargetRank): RaidTarget[] => [
  rule(
    'rank.preparedKill',
    { min: RANK_PREPARED_KILL_MIN },
    'bossRank.test: at every rank the prepared team kills most weekends',
  ),
  rule(
    'rank.preparedShare',
    { min: RANK_PREPARED_SHARE_MIN },
    'bossRank.test: and removes nearly all the HP',
  ),
  rule(
    'rank.classicKill',
    { max: RANK_CLASSIC_KILL_MAX },
    'bossRank.test: the classic party never kills (16 weekends)',
  ),
  rule(
    'rank.toolShare',
    { min: RANK_TOOL_SHARE_MIN[rank] },
    'bossRank.test: the tool is worth this many points of the HP to a team with random talents (40 weekends)',
  ),
];

/** The cross-rank rules, at the two ranks they compare (low and high). */
const crossRules = (): RaidTarget[] => [
  rule(
    'cross.classicLadder',
    { min: -RANK_CLASSIC_LADDER_SLACK },
    'bossRank.test: the classic party removes no more of the HP at the high rank than at the low rank (low minus high)',
  ),
  rule(
    'cross.toolGap',
    { min: THORN_TOOL_GAP_POINTS / 100, strictMin: true },
    'bossRank.test: Thornmother’s answer matters more at the high rank: its worth there exceeds its worth at the low rank by more than ten points',
    1,
    ['thornmother'],
  ),
];

/** The rules of the tests that run at the high rank only (`bossAnswers.test.ts`, `bossMargin.test.ts`, `bossContent.test.ts`). */
const highRules = (): RaidTarget[] => [
  rule(
    'answers.classicKill',
    { max: ANSWER_CLASSIC_KILL_MAX },
    'bossAnswers.test: the classic party never kills (16 weekends)',
  ),
  rule(
    'answers.classicShare',
    { max: ANSWER_CLASSIC_SHARE_MAX },
    'bossAnswers.test: and removes at most this share of the HP',
  ),
  rule(
    'answers.share',
    { min: ANSWER_SHARE_MIN },
    'bossAnswers.test: every written answer removes nearly all the HP (24 weekends)',
  ),
  rule(
    'answers.t2',
    { min: ANSWER_T2_MIN },
    'bossAnswers.test: and reaches the second retreat most weekends',
  ),
  rule(
    'answers.firstKill',
    { min: ANSWER_FIRST_KILL_MIN },
    'bossAnswers.test: the first written answer kills most weekends',
  ),
  rule(
    'answers.beatClassic',
    { min: 0, strictMin: true },
    'bossAnswers.test: every written answer beats the classic party by the weekend score',
    0.01,
  ),
  rule(
    'answers.toolShare',
    { min: TOOL_SHARE_MIN },
    'bossAnswers.test: every answer’s own tool is worth ten points of the HP removed (written talents, 40 weekends)',
  ),
  rule(
    'answers.toolKill',
    { min: TOOL_DROP_MIN / 100 },
    'bossAnswers.test: the first answer’s tool is worth twenty points of kill rate',
  ),
  rule(
    'robust.share',
    { min: ROBUST_SHARE },
    'bossAnswers.test: the prepared line with random legal talents removes most of the HP (48 weekends)',
  ),
  rule(
    'robust.gap',
    { max: ROBUST_GAP_MAX },
    'bossAnswers.test: written talents beat random ones by a share of the HP, not the whole weekend',
  ),
  rule(
    'margin.base',
    { min: MARGIN_BASE_MIN },
    'bossMargin.test: the prepared line keeps its HP share at the margin (24 weekends)',
  ),
  rule('margin.atk10', { min: MARGIN_PLUS10_MIN }, 'bossMargin.test: at +10% Attack'),
  rule('margin.hp10', { min: MARGIN_PLUS10_MIN }, 'bossMargin.test: and at +10% HP'),
  rule(
    'cost.share',
    { min: COST_SHARE_MIN },
    'bossMargin.test: the prepared line pays for its win, removing nearly all the HP (24 weekends)',
  ),
  rule(
    'cost.pays',
    { min: 0 },
    'bossMargin.test: it loses creatures (0.5 or more) or ends with the team at 60% HP or lower (the larger of the two margins is 0 or more)',
  ),
  rule(
    'cost.hpLeft',
    { max: COST_HP_LEFT_MAX },
    'bossMargin.test: and the team never ends above 80% HP',
  ),
  rule(
    'width.classicKill',
    { max: WIDTH_CLASSIC_KILL_MAX },
    'bossMargin.test: at 5, 10 and 15 columns the classic party kills at most 10% of weekends (12 weekends)',
  ),
  rule(
    'width.classicShare',
    { max: WIDTH_CLASSIC_SHARE_MAX },
    'bossMargin.test: and removes at most 90% of the HP',
  ),
  rule(
    'width.bestShare',
    { min: WIDTH_BEST_SHARE_MIN },
    'bossMargin.test: the prepared line removes nearly all the HP at every width',
  ),
  rule(
    'gap10',
    { min: GAP10_MIN },
    'bossMargin.test: the tool gap at 10 players, in HP removed or in kills (16 weekends)',
    0.5,
  ),
  rule(
    'server.kill',
    { max: SERVER_KILL_MAX },
    'bossMargin.test: a mixed server of ten does not always win (60 weekends)',
  ),
  rule(
    'server.share',
    { min: SERVER_SHARE_MIN, max: SERVER_SHARE_MAX },
    'bossMargin.test: and removes a good share of the HP',
  ),
  rule(
    'server.knockouts',
    { min: 0, strictMin: true },
    'bossMargin.test: and feels its losses more: more than three times a prepared team’s creatures lost (this is the difference)',
    0.2,
  ),
  rule(
    'content.knockouts',
    { min: CONTENT_KNOCKOUTS_MIN },
    'bossContent.test: a weekend costs the classic party at least three creatures (12 weekends)',
    0.2,
  ),
  rule(
    'content.classicKill',
    { max: CONTENT_CLASSIC_KILL_MAX },
    'bossContent.test: and it wins at most half of them',
  ),
];

/** The rules of the lab tests that a boss at the low rank meets (a casual server of ten). */
const casualRules = (): RaidTarget[] => [
  rule(
    'casual.share',
    { min: CASUAL_SHARE_MIN, max: CASUAL_SHARE_MAX },
    'bossRank.test: a casual server of ten removes a real share of the HP at the low rank (16 draws)',
  ),
  rule('casual.kill', { max: CASUAL_KILL_MAX }, 'bossRank.test: and kills at most 30% of weekends'),
];

/**
 * What the lab tests ask of a boss's numbers (`test/boss*.test.ts`, thresholds above), as targets per rank. Misa's targets
 * (`RAID_TARGETS`) are separate; the loss counts both. The `cross.*` rules compare two ranks and are checked only when the ranks are
 * tuned together (`--rank all`).
 */
export const RULE_TARGETS: Readonly<Record<TargetRank, readonly RaidTarget[]>> = {
  low: [...rankRules('low'), ...casualRules(), ...crossRules()],
  mid: rankRules('mid'),
  high: [...rankRules('high'), ...highRules(), ...crossRules()],
};

/**
 * Every target for a boss at a rank: Misa's and the tests' rules. Without `crossRanks` the targets that compare ranks are left out
 * (`skippedCross` lists them): one rank on its own has no other rank's numbers to compare with.
 */
export function targetsFor(boss: string, rank: TargetRank, crossRanks = false): RaidTarget[] {
  return [...RAID_TARGETS[rank], ...RULE_TARGETS[rank]].filter(
    (t) => (!t.bosses || t.bosses.includes(boss)) && (crossRanks || !isCrossMeasure(t.measure)),
  );
}

/** The targets `targetsFor` leaves out when the ranks are not tuned together. */
export const skippedCross = (boss: string, rank: TargetRank): RaidTarget[] =>
  targetsFor(boss, rank, true).filter((t) => isCrossMeasure(t.measure));

/** The chance to kill in at most `weekends` weekends when each has the kill rate `p`, attempts assumed alike: `1 - (1 - p)^weekends`. */
export const beatWithin = (p: number, weekends: number): number => 1 - (1 - p) ** weekends;

/**
 * The expected number of weekends to the first kill, `1 / p` (a fixed track: a failed boss returns at full HP, attempts assumed
 * alike). Infinity when `p` is 0.
 */
export const weeksToBeat = (p: number): number => (p > 0 ? 1 / p : Number.POSITIVE_INFINITY);

/** Weeks to beat as text: "never" when `p` is 0, "20+" beyond `WEEKS_CAP`, else one decimal ("2.0"). */
export function weeksText(p: number): string {
  const w = weeksToBeat(p);
  if (w === Number.POSITIVE_INFINITY) return 'never';
  if (w > WEEKS_CAP) return `${WEEKS_CAP}+`;
  return w.toFixed(1);
}

/**
 * The ladder (a hard constraint, `test/strength.test.ts`): HP, Attack and armour rise from the low rank to the mid and the high
 * rank. HP and Attack of the low rank are at most 0.9 of the high rank's and of the mid rank's at most 0.95; armour does not fall.
 */
export const LADDER = { lowOfHigh: 0.9, midOfHigh: 0.95 } as const;

/** Whether a measure was taken (a cheap pass of the tuner leaves the rules of the tests out: NaN). */
export const isMeasured = (value: number): boolean => !Number.isNaN(value);

/**
 * How far outside its bounds a value is (0 inside them, edges included; an exclusive `min` counts a value on it as `STRICT_MISS`
 * outside). A measure that was not taken is 0: it is neither met nor missed (`metBy` is false for it).
 */
export function missOf(t: RaidTarget, value: number): number {
  if (!isMeasured(value)) return 0;
  if (t.min !== undefined && value < t.min) return t.min - value;
  if (t.min !== undefined && t.strictMin && value <= t.min) return STRICT_MISS;
  if (t.max !== undefined && value > t.max) return value - t.max;
  return 0;
}

/** Whether the value meets the target (a measure that was not taken meets nothing). */
export const metBy = (t: RaidTarget, value: number): boolean =>
  isMeasured(value) && missOf(t, value) === 0;

/** How far inside its bounds a value is (negative: outside), the smaller of the two sides for a target with both bounds. */
export function marginInside(t: RaidTarget, value: number): number {
  const sides: number[] = [];
  if (t.min !== undefined) sides.push(value - t.min);
  if (t.max !== undefined) sides.push(t.max - value);
  return sides.length ? Math.min(...sides) : 0;
}

/** The tuner's loss: the weighted distance to the bounds, summed over the targets. It is 0 exactly when every target is met. */
export function lossOf(targets: readonly RaidTarget[], m: RaidMeasures): number {
  return targets.reduce((n, t) => n + t.weight * missOf(t, m[t.measure]), 0);
}

/**
 * How comfortably the targets are met, to tell apart candidates of the same loss (most of all, several with loss 0): the mean of
 * each target's margin inside its bounds, a margin counted at most 0.2 so that one very easy target does not decide.
 */
export function comfortOf(targets: readonly RaidTarget[], m: RaidMeasures): number {
  const taken = targets.filter((t) => isMeasured(m[t.measure]));
  if (!taken.length) return 0;
  return taken.reduce((n, t) => n + Math.min(0.2, marginInside(t, m[t.measure])), 0) / taken.length;
}
