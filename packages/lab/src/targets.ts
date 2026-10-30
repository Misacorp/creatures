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
 * How hard the boss track should be for the prepared team: among numbers that meet every target, the track tuner prefers the boss whose
 * first-weekend kill rate for the prepared line (written talents, expected roster speed) is closest to this. 0.6 is the lead's reading
 * of Misa's "a prepared team usually wins within two weekends" (2026-10-30): a kill in 0.6 of weekends beats within two weekends
 * 1 - 0.4^2 = 84% of the time. Misa can change it (`BEAT2_MIN` is the floor Misa set; this is where above it to aim).
 */
export const PREPARED_KILL_AIM = 0.6;
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
/** The measures the summary shows as information when no target reads them (the first ten; the test rules are shown only as targets). */
export const REPORTED_MEASURES: readonly RaidMeasure[] = RAID_MEASURES.slice(0, 10);
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

// The unprepared classic party may get anything but a clean kill, so its HP removed has no limit; the mixed server has no target
// (its numbers are information, `RAID_MEASURES`).
const unpreparedTargets = (): RaidTarget[] => [
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
 * Misa's targets for slot `slot` of the boss track, whose cards have strength `strengthBp`: `RAID_TARGETS` (the same bounds at every
 * rank) with two changes of the lead's, which Misa can change:
 * - the tool's worth (`tool.share`, `tool.written`) is what its cards' strength asks for (`toolShareMinAt`), not always ten points;
 * - slot 1 is a welcome boss: a new server has its starters, so any decent team may win it and `classic.kill` has no limit there.
 */
export function slotTargetsFor(slot: number, strengthBp: number): RaidTarget[] {
  return RAID_TARGETS.high
    .filter((t) => !(slot === 1 && t.measure === 'classic.kill'))
    .map((t) =>
      t.measure === 'tool.share' || t.measure === 'tool.written'
        ? { ...t, min: toolShareMinAt(strengthBp) }
        : t,
    );
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
