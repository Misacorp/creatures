/**
 * The report's sections on the real bosses (roadmap phase 1): the five raid bosses (arena, moves, the best raid team,
 * the classic party, the intended answers, weekend win rates, escalation steps), the dungeon foes (the best gauntlet
 * team and the classic line at a few depths, runs with and without the camp), Knack usage across all of them and the
 * mechanics that no boss or foe calls for. `pnpm --filter @creatures/lab report -- --bosses` prints only these.
 */
import { ablate, type Measured } from './ablation';
import {
  GATE_BOSSES,
  GATE_DROP,
  ROBUST_SHARE,
  ROBUST_TARGET,
  TOOL_DROP_MIN,
  TOOL_SHARE_MIN,
  failingGates,
  familyDrops,
  familyGates,
  measuredHint,
  ownFamilies,
  robustnessOf,
  toolCost,
  type Call,
  type Robustness,
  type ToolCost,
} from './answerMeasure';
import { BOSS_ANSWERS, answerLine, withoutTool, type BossAnswer } from './bossAnswers';
import {
  NOT_PORTED,
  RAID_BOSS_IDS,
  RAID_RANKS,
  RAID_SPECS,
  raidBossOf,
  raidMode,
  weekendScore,
  weekendStats,
  type RaidRank,
  type WeekendStats,
} from './bosses';
import {
  CASUAL_ORDER,
  MARGIN_TARGET,
  MIXED_DRAWS,
  MIXED_SEEDS,
  RAID_ATK_EXPONENT,
  RAID_HP_EXPONENT,
  RAID_WIDTHS,
  marginOf,
  mixedSpread,
  tileLine,
  widthOf,
  wideBoss,
  type CasualKind,
  type MixedSpread,
  type WidthResult,
} from './raidMeasure';
import { ALL_ROUND_BENCH, ALL_ROUND_TEAM, gauntletScore, gauntletStats, runStats } from './dungeon';
import { DUNGEON_DEPTHS, FOE_IDS, FOE_SPECS, foeAt } from './foes';
import {
  FOE_QUESTIONS,
  FOE_QUESTION_GAP,
  FOE_QUESTION_WIN,
  questionResult,
  type FoeQuestion,
  type FoeQuestionResult,
} from './foeQuestions';
import type { JobResults, JobSpec, Plan } from './jobs';
import { FORM_KNACKS, KNACKS } from './knacks';
import { MECHANICS, coverage } from './mechanics';
import {
  CLASSIC_LINE,
  GAUNTLET,
  classicFor,
  lineKey,
  poolOf,
  search,
  type Pick,
  type Ranked,
} from './search';
import { illegalTalents, legalTalents } from './talents';
import type { BossDef, BossMove, Pattern } from './types';

const knackName = (k: string) => (k === 'none' ? 'no Knack' : (KNACKS[k]?.name ?? k));
const pickName = (p: Pick) =>
  `${p.formId} (${knackName(p.knack)}${p.talents?.length ? `, ${p.talents.join(', ')}` : ''})`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** The primary measure (Misa, 2026-10-29): the share of the boss's HP removed, with its spread between weekends. */
const share = (w: { damageShare: number; damageShareSd?: number }): string =>
  `${pct(w.damageShare)}${w.damageShareSd === undefined ? '' : ` (sd ${Math.round(w.damageShareSd * 100)})`}`;
/** The tiers beside it: weekends reaching the first retreat (30% removed), the second (85%) and the kill. */
const tiers = (w: { tiers: { t1: number; t2: number; kill: number } }): string =>
  `${pct(w.tiers.t1)} / ${pct(w.tiers.t2)} / ${pct(w.tiers.kill)}`;
/** A difference in the primary measure: "+8" points of the boss's HP removed. */
const pts = (x: number): string => {
  const n = Math.round(100 * x);
  return n > 0 ? `+${n}` : n < 0 ? `${n}` : '0';
};
/** Points lost when something is taken out: `-12`, or `+3` when the line did better without it. */
const lost = (points: number): string => {
  const n = Math.round(points);
  return n > 0 ? `-${n}` : n < 0 ? `+${-n}` : '0';
};
const rows = (line: readonly Pick[], cols: number): string =>
  Array.from({ length: Math.ceil(line.length / cols) }, (_, r) =>
    line
      .slice(r * cols, r * cols + cols)
      .map(pickName)
      .join(', '),
  ).join(' / ');

const ANCHOR: Record<Pattern['anchor'], string> = {
  front: 'the front',
  strongest: 'the strongest',
  payoff: 'the strongest Payoff',
  random: 'random',
  grudge: 'the top hitter',
  back: 'the back',
  weakest: 'the most hurt',
};

/** A move or plain attack in a few words: what it hits and when. */
export function shapeText(p: Pattern): string {
  const a = ANCHOR[p.anchor];
  switch (p.shape) {
    case 'single':
      return `${a}, one slot`;
    case 'line3':
      return `${a} and its row neighbours`;
    case 'row':
      return `row of ${a}`;
    case 'column':
      return `column of ${a}`;
    case 'rowEnds':
      return `row ends`;
    case 'randomRow':
      return 'a random row';
    case 'all':
      return 'everything';
    case 'scatter':
      return `${p.n ?? 1} random creatures`;
    case 'chain':
      return `${a}, then jumps x${p.n ?? 1}`;
    case 'columns':
      return `${p.n ?? 2} columns from ${a}`;
    case 'rows':
      return `${p.n ?? 2} rows from ${a}`;
    case 'cross':
      return `${a} and the slots touching it`;
    case 'checker':
      return `every other slot from ${a}`;
  }
}

const moveText = (m: BossMove): string =>
  `${m.name} (${m.silenceTurns ? `silences ${shapeText(m.pattern)} for ${m.silenceTurns}` : shapeText(m.pattern)}; every ${m.every}${m.charged ? ', Wind-up' : ''})`;

/** One line about a raid boss: arena, armour, plain attack, moves, cards, escalation. */
export function bossLine(b: BossDef): string {
  const esc = b.escalation;
  const grow = esc
    ? Object.entries(esc.grow)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')
    : '';
  return (
    `**${b.name}** (${b.element}): ${b.rows} rows of ${b.cols}, armour ${b.armour}, Attack ${b.atk}, HP ${b.hp}; ` +
    `plain: ${shapeText(b.plain.pattern)}${b.plain.hits && b.plain.hits > 1 ? ` x${b.plain.hits}` : ''}; ` +
    `moves: ${[...b.moves, ...(esc?.phase?.moves ?? [])].map(moveText).join('; ')}; ` +
    `cards: ${b.cards.join(', ') || 'none'}` +
    (esc
      ? `; escalation: ${esc.name} (feeds on ${esc.feed}, a step per ${esc.per}${esc.feed === 'hpLost' ? ' bp of HP lost' : ''}${esc.perColumns ? ` per ${esc.perColumns} columns` : ''}, up to ${esc.cap}; each step: ${grow}${esc.phase ? `; ${esc.phase.name} from step ${esc.phase.atStep}` : ''})`
      : '')
  );
}

/** One team's HP left per stage and at the weekend's end: "standing creatures' HP (share of creatures standing)". */
export function healthCells(w: WeekendStats): string[] {
  const cell = (hp: number, up: number) => `${pct(hp)} (${pct(up)})`;
  return [
    ...[0, 1, 2].map((k) =>
      (w.played[k] ?? 0) > 0 ? cell(w.hpLeft[k] ?? 0, w.standing[k] ?? 0) : '-',
    ),
    cell(w.hpLeftEnd, w.standingEnd),
  ];
}

interface Settings {
  readonly raid: {
    starts: number;
    keep: number;
    rounds: number;
    seeds: number;
    freshSeeds: number;
    weekends: number;
    /** The mixed server: draws in all (split over `mixedSeeds` seeds) and weekends per draw. */
    mixedDraws: number;
    mixedSeeds: number;
    mixedWeekends: number;
    /** Draws of random legal talents for the robustness measure (the weekends are split over them). */
    talentDraws: number;
    /** Draws of the mixed server in the HP exponent sensitivity table. */
    sensitivityDraws: number;
    /** The Boss Rank table: weekends of each measure, draws of the mixed and casual servers, draws of random talents. */
    rankWeekends: number;
    rankDraws: number;
    rankTalentDraws: number;
    /** Independent from-scratch searches per boss (the best on common fresh seeds is reported). */
    scratchSearches: number;
  };
  readonly foe: {
    starts: number;
    keep: number;
    rounds: number;
    seeds: number;
    freshSeeds: number;
    fights: number;
  };
  readonly runs: {
    starts: number;
    keep: number;
    rounds: number;
    search: number;
    fresh: number;
    stats: number;
  };
}

export const BOSS_SETTINGS = (quick: boolean): Settings =>
  quick
    ? {
        raid: {
          starts: 30,
          keep: 4,
          rounds: 6,
          seeds: 3,
          freshSeeds: 10,
          weekends: 20,
          mixedDraws: 12,
          mixedSeeds: MIXED_SEEDS,
          mixedWeekends: 1,
          talentDraws: 4,
          sensitivityDraws: 6,
          rankWeekends: 20,
          rankDraws: 8,
          rankTalentDraws: 4,
          scratchSearches: 1,
        },
        foe: { starts: 40, keep: 6, rounds: 2, seeds: 3, freshSeeds: 10, fights: 16 },
        runs: { starts: 40, keep: 6, rounds: 2, search: 3, fresh: 12, stats: 24 },
      }
    : {
        // A few starts and many rounds of local improvement: found far better lines than many starts and few rounds.
        raid: {
          starts: 200,
          keep: 6,
          rounds: 40,
          seeds: 5,
          freshSeeds: 40,
          weekends: 100,
          mixedDraws: MIXED_DRAWS,
          mixedSeeds: MIXED_SEEDS,
          mixedWeekends: 2,
          talentDraws: 10,
          sensitivityDraws: 30,
          rankWeekends: 60,
          rankDraws: 40,
          rankTalentDraws: 10,
          scratchSearches: 2,
        },
        foe: { starts: 120, keep: 10, rounds: 3, seeds: 4, freshSeeds: 24, fights: 40 },
        runs: { starts: 250, keep: 16, rounds: 4, search: 6, fresh: 50, stats: 100 },
      };

/** One written answer, measured (panel 5). */
interface AnswerStudy {
  readonly bossId: string;
  readonly bossName: string;
  readonly answer: BossAnswer;
  readonly picks: readonly Pick[];
  readonly tool: ToolCost;
  readonly robust: Robustness;
  /** What taking each mechanic out of it costs, in win-rate points (the gate check) and in points of the boss's HP removed. */
  readonly measured: readonly Measured[];
  readonly measuredShare: readonly Measured[];
}

interface MixedStudy {
  readonly bossId: string;
  readonly bossName: string;
  readonly casual: CasualKind;
  readonly players: number;
  readonly result: MixedSpread;
}

/** One boss at one Boss Rank (Misa, 2026-10-29): the prepared line, the same line without its tool, and the unprepared servers. */
interface RankStudy {
  readonly bossId: string;
  readonly bossName: string;
  readonly rank: RaidRank;
  readonly hp: number;
  readonly atk: number;
  readonly armour: number;
  readonly robust: Robustness;
  readonly noTool: Robustness;
  readonly classic: readonly { readonly width: number; readonly weekend: WeekendStats }[];
  readonly casual: MixedSpread;
  readonly mixedRandom: MixedSpread;
  readonly mixedTop3: MixedSpread;
}

const CASUAL_KINDS: readonly CasualKind[] = ['random', 'top3'];
const CASUAL_NAME: Readonly<Record<CasualKind, string>> = {
  random: 'random Knack each',
  top3: 'top creatures by level, no Knack',
};
const MIXED_WIDTHS: readonly number[] = [5, 10, 15];
/** The exponents the HP rule's trade is shown at (the rule itself is `RAID_HP_EXPONENT`). */
const SENSITIVITY_EXPONENTS: readonly number[] = [0.5, 0.6, 0.7, 0.8, 1];

export interface BossSections {
  readonly md: string[];
  readonly data: Record<string, unknown>;
}

// ---------- Jobs ----------
//
// The raid bosses' studies and the dungeon foes' searches are independent of one another, so the report runs them as jobs
// (`jobs.ts`). A job returns plain data (it may be posted between threads); a mechanic holds a function, so a measured
// mechanic travels as its id and is looked up again when the sections are assembled.

type Deps = Readonly<Record<string, unknown>>;

/** A measured mechanic as it travels between jobs. */
interface WireMeasured {
  readonly mechanicId: string;
  readonly hasTool: boolean;
  readonly carried: boolean;
  readonly drop: number;
  readonly key: string;
}

const toWire = (ms: readonly Measured[]): WireMeasured[] =>
  ms.map((m) => ({
    mechanicId: m.mechanic.id,
    hasTool: m.hasTool,
    carried: m.carried,
    drop: m.drop,
    key: m.key,
  }));

const fromWire = (ws: readonly WireMeasured[]): Measured[] =>
  ws.map((w) => {
    const mechanic = MECHANICS.find((m) => m.id === w.mechanicId);
    if (!mechanic) throw new Error(`unknown mechanic ${w.mechanicId}`);
    return { mechanic, hasTool: w.hasTool, carried: w.carried, drop: w.drop, key: w.key };
  });

type AnswerStudyWire = Omit<AnswerStudy, 'measured' | 'measuredShare'> & {
  readonly measured: WireMeasured[];
  readonly measuredShare: WireMeasured[];
};

const hydrateStudy = (s: AnswerStudyWire): AnswerStudy => ({
  ...s,
  measured: fromWire(s.measured),
  measuredShare: fromWire(s.measuredShare),
});

/** The Knacks the content task will use: the rarely used ones named by panel 5 and the outlier. */
const WATCHED_KNACKS = [
  'double-mark',
  'tunnel-through',
  'crown-of-embers',
  'primed-by-pain',
  'wide-warmth',
  'keep-the-heat-in',
  'guards-shadow',
];

/** What every piece of one raid boss's study starts from: the boss and its written answers (no fights are run here). */
function raidSetup(id: string) {
  const boss = raidBossOf(id);
  const mode = raidMode(boss);
  const classic = classicFor(mode);
  const illegalNotes: string[] = [];
  // A written answer may carry only legal talents; an illegal one is left out of the searches and reported.
  const given = (BOSS_ANSWERS[id] ?? []).map((a) => {
    const picks = answerLine(a.line);
    const bad = illegalTalents(picks);
    if (bad.length)
      illegalNotes.push(
        `${boss.name} / ${a.label}: ${bad.map((x) => `${x.formId} carries ${x.talent} (${x.why})`).join('; ')}`,
      );
    // A talent answer is read against the classic party with the talent on each creature that may carry it.
    const baseline = a.talent
      ? classic.map((p) =>
          legalTalents(p.formId).includes(a.talent as string)
            ? { ...p, talents: [a.talent as string] }
            : p,
        )
      : classic;
    return { ...a, picks, baseline, legal: bad.length === 0 };
  });
  const legalGiven = given.filter((g) => g.legal);
  return {
    boss,
    mode,
    classic,
    illegalNotes,
    given,
    legalGiven,
    prepared: legalGiven[0],
    score: weekendScore(boss),
  };
}

/** The team search over a whole weekend, seeded with the classic party and the written answers. */
function raidSeededSearch(id: string, quick: boolean): Ranked[] {
  const S = BOSS_SETTINGS(quick);
  const { boss, mode, classic, legalGiven, score } = raidSetup(id);
  return search(boss, mode, {
    seed: `raidboss:${id}`,
    ...S.raid,
    talents: true,
    include: [classic, ...legalGiven.flatMap((g) => [g.picks, g.baseline])],
    score,
  });
}

/** One search from nothing (a search from nothing is a lottery: the report runs a few and keeps the best of them). */
function raidScratchSearch(id: string, i: number, quick: boolean): Ranked[] {
  const S = BOSS_SETTINGS(quick);
  const { boss, mode, score } = raidSetup(id);
  return search(boss, mode, {
    seed: `raidboss:${id}:scratch${i === 0 ? '' : `:${i}`}`,
    ...S.raid,
    talents: true,
    score,
  }).slice(0, 5);
}

/** The from-scratch lines ranked on the same fresh seeds, and which of the two best lines does better on them. */
interface RaidPick {
  readonly scratchRanked: Ranked[];
  readonly overallIs: 'seeded' | 'from scratch';
}

function raidPick(
  id: string,
  quick: boolean,
  seeded: readonly Ranked[],
  scratch: readonly (readonly Ranked[])[],
): RaidPick {
  const S = BOSS_SETTINGS(quick);
  const { score } = raidSetup(id);
  const fresh = (l: readonly Pick[]) => score(l, S.raid.freshSeeds, `pick:${id}`).score;
  const scratchRanked = scratch
    .flat()
    .map((r) => ({ r, f: fresh(r.line) }))
    .sort((a, b) => b.f - a.f)
    .map((x) => x.r);
  const s = seeded[0];
  const c = scratchRanked[0];
  // The overall best line is whichever of the two does better on the same fresh seeds.
  const overallIs = s && c && fresh(c.line) >= fresh(s.line) ? 'from scratch' : 'seeded';
  return { scratchRanked, overallIs };
}

/** The searches' outcome and the boss's setup: what the pieces after the searches read. */
function raidContext(id: string, quick: boolean, ranked: readonly Ranked[], pick: RaidPick) {
  const setup = raidSetup(id);
  const seeded = ranked[0];
  const scratch = pick.scratchRanked[0];
  const cl = ranked.find((r) => lineKey(r.line) === lineKey(setup.classic));
  // A search that found nothing (or lost the classic line) leaves the boss out of the tables.
  if (!seeded || !scratch || !cl) return undefined;
  const overall = pick.overallIs === 'from scratch' ? scratch : seeded;
  return {
    ...setup,
    id,
    S: BOSS_SETTINGS(quick),
    ranked,
    seeded,
    scratch,
    cl,
    overall,
    overallIs: pick.overallIs,
  };
}
type RaidContext = NonNullable<ReturnType<typeof raidContext>>;

/** The weekends of the classic party, the two best lines and the written answers (the tables' first rows). */
interface RaidStats {
  readonly wc: WeekendStats;
  readonly wSeeded: WeekendStats;
  readonly wScratch: WeekendStats;
  readonly wPrep: WeekendStats | undefined;
  readonly raidRow: string;
  readonly bestLines: string[];
  readonly answerRows: string[];
  readonly ansData: unknown[];
  readonly answers: number;
  readonly beat: number;
}

function raidStats(c: RaidContext): RaidStats {
  const { id, S, boss, mode, seeded, scratch, cl, classic, ranked, given, prepared } = c;
  const key = (l: readonly Pick[]) => lineKey(l);
  const wSeeded = weekendStats(boss, seeded.line, S.raid.weekends, `report:${id}:seeded`);
  const wScratch = weekendStats(boss, scratch.line, S.raid.weekends, `report:${id}:scratch`);
  const wc = weekendStats(boss, classic, S.raid.weekends, `report:${id}:classic`);
  // The prepared answer: the first written legal answer, the tool the boss asks for (the mixed server brings it too).
  const wPrep = prepared
    ? weekendStats(boss, prepared.picks, S.raid.weekends, `report:${id}:ans`)
    : undefined;
  const raidRow = `| ${boss.name} | ${share(wc)} (${tiers(wc)}) | ${share(wSeeded)} (${tiers(wSeeded)}) | ${share(wScratch)} (${tiers(wScratch)}) | ${Math.round(cl.score.score)} / ${Math.round(seeded.score.score)} / ${Math.round(scratch.score.score)} | ${wc.knockoutsTotal.toFixed(1)} / ${wSeeded.knockoutsTotal.toFixed(1)} / ${wScratch.knockoutsTotal.toFixed(1)} | ${boss.escalation ? `${wc.steps.toFixed(1)} / ${wSeeded.steps.toFixed(1)} / ${wScratch.steps.toFixed(1)} of ${boss.escalation.cap}` : 'none'} |`;
  const bestLines = [
    `- ${boss.name}, seeded: ${rows(seeded.line, mode.cols)}`,
    `- ${boss.name}, from scratch: ${rows(scratch.line, mode.cols)}`,
  ];
  const answerRows: string[] = [];
  const ansData: unknown[] = [];
  let answers = 0,
    beat = 0;
  for (const g of given) {
    if (!g.legal) {
      answerRows.push(
        `| ${boss.name} | ${g.label} (${g.tool}) | **illegal talent, not measured** | - | - | - |`,
      );
      continue;
    }
    const r = ranked.find((x) => key(x.line) === key(g.picks));
    const base = ranked.find((x) => key(x.line) === key(g.baseline)) ?? cl;
    const w = weekendStats(boss, g.picks, S.raid.weekends, `report:${id}:ans`);
    const wbase = g.talent
      ? weekendStats(boss, g.baseline, S.raid.weekends, `report:${id}:base`)
      : wc;
    answers++;
    const wins = r !== undefined && r.score.score > base.score.score;
    if (wins) beat++;
    answerRows.push(
      `| ${boss.name} | ${g.label} (${g.tool}) | ${r ? Math.round(r.score.score) : 'n/a'} vs ${Math.round(base.score.score)}${g.talent ? ` (classic with ${g.talent} where legal)` : ''} | ${share(w)} (${tiers(w)}) vs ${share(wbase)} (${tiers(wbase)}) | ${w.knockoutsTotal.toFixed(1)} | ${boss.escalation ? `${w.steps.toFixed(1)} of ${boss.escalation.cap}` : '-'} |`,
    );
    ansData.push({
      label: g.label,
      tool: g.tool,
      score: r ? Math.round(r.score.score) : null,
      winRate: w.winRate,
      damageShare: w.damageShare,
      beatsClassic: wins,
    });
  }
  return { wc, wSeeded, wScratch, wPrep, raidRow, bestLines, answerRows, ansData, answers, beat };
}

/** Every legal answer: its own tool, random and no talents, and what each Knack family costs it (panel 5). */
interface RaidStudies {
  readonly studies: AnswerStudyWire[];
  /** For each watched Knack, what taking it out of each written answer that carries it costs. */
  readonly knackCosts: Record<string, string[]>;
}

function raidStudies(c: RaidContext): RaidStudies {
  const { id, S, boss, legalGiven } = c;
  const studies: AnswerStudyWire[] = legalGiven.map((g, k) => ({
    bossId: id,
    bossName: boss.name,
    answer: g,
    picks: g.picks,
    tool: toolCost(boss, g, g.picks, S.raid.weekends, `report:${id}:tool:${k}`),
    robust: robustnessOf(
      boss,
      g.picks,
      S.raid.weekends,
      S.raid.talentDraws,
      `report:${id}:rob:${k}`,
    ),
    measured: toWire(
      ablate(
        g.picks,
        (l) => 100 * weekendStats(boss, l, S.raid.weekends, `report:${id}:abl:${k}`).winRate,
      ),
    ),
    measuredShare: toWire(
      ablate(
        g.picks,
        (l) => 100 * weekendStats(boss, l, S.raid.weekends, `report:${id}:abl:${k}`).damageShare,
      ),
    ),
  }));
  const knackCosts: Record<string, string[]> = {};
  for (const k of WATCHED_KNACKS)
    knackCosts[k] = studies
      .filter((st) => st.picks.some((p) => p.knack === k))
      .map((st) => {
        const line = st.picks.map((p) => (p.knack === k ? { ...p, knack: 'none' } : p));
        const salt = `report:${st.bossId}:knack:${k}`;
        const base = weekendStats(boss, st.picks, S.raid.weekends, salt);
        const cut = weekendStats(boss, line, S.raid.weekends, salt);
        return `${st.bossName}: ${pts(base.damageShare - cut.damageShare)} of the HP (kill ${lost(100 * (base.winRate - cut.winRate))})`;
      });
  return { studies, knackCosts };
}

/** The margin: the prepared answer and the best line when the boss hits 10% harder, and when it has 10% more HP; and other widths. */
interface RaidMargins {
  readonly mp: ReturnType<typeof marginOf> | undefined;
  readonly m: ReturnType<typeof marginOf>;
  readonly marginRows: string[];
  readonly widths: WidthResult[];
  readonly widthRow: string;
}

function raidMargins(c: RaidContext): RaidMargins {
  const { id, S, boss, prepared, overall, overallIs } = c;
  const mp = prepared
    ? marginOf(boss, prepared.picks, S.raid.weekends, `report:${id}:margin:prepared`)
    : undefined;
  const m = marginOf(boss, overall.line, S.raid.weekends, `report:${id}:margin`);
  const marginRows: string[] = [];
  if (mp)
    marginRows.push(
      `| ${boss.name} | prepared answer | ${pct(mp.share.base)} (kill ${pct(mp.base)}) | ${pct(mp.share.atk10)} (kill ${pct(mp.atk10)}) | ${pct(mp.share.hp10)} (kill ${pct(mp.hp10)}) |`,
    );
  marginRows.push(
    `| ${boss.name} | best searched (${overallIs}) | ${pct(m.share.base)} (kill ${pct(m.base)}) | ${pct(m.share.atk10)} (kill ${pct(m.atk10)}) | ${pct(m.share.hp10)} (kill ${pct(m.hp10)}) |`,
  );
  // Other widths: the classic party, and the best line repeated to fill.
  const widths: WidthResult[] = RAID_WIDTHS.map((w) =>
    widthOf(boss, overall.line, w, S.raid.weekends, `report:${id}:w${w}`),
  );
  const widthRow = `| ${boss.name} | ${widths.map((w) => `${pct(w.classicShare)} (kill ${pct(w.classicWin)}) / ${pct(w.bestShare)} (kill ${pct(w.bestWin)})`).join(' | ')} |`;
  return { mp, m, marginRows, widths, widthRow };
}

/**
 * The mixed server (panel 5): 200 draws over 3 seeds, at 5, 10 and 15 players, with the casual players on a random Knack each
 * and on their top creatures by level with no Knack (the post-migration default). One answer per boss, the prepared line
 * (the first written answer: the tool the boss asks for, at most two copies of a form): the min-maxers and builders bring
 * its columns; the search's best line is tuned to its own four columns together, and its columns do not carry the tool.
 */
function raidMixed(c: RaidContext, casual: CasualKind, players: number): MixedSpread {
  const { id, S, boss, prepared, overall, legalGiven } = c;
  return mixedSpread(
    boss,
    prepared?.picks ?? overall.line,
    prepared ? [prepared.picks] : legalGiven.map((g) => g.picks),
    S.raid.mixedDraws,
    S.raid.mixedSeeds,
    S.raid.mixedWeekends,
    `report:${id}:mixed:${casual}:${players}`,
    prepared?.core ?? [],
    prepared ? [prepared.core ?? []] : [],
    { players, casual },
  );
}

/**
 * Boss Rank (Misa, 2026-10-29): the prepared line, the same line without its tool, the classic party, a server of casual
 * players only and the mixed server, at the low, mid and high rank (cards and gates at 30%, 65% and 100% strength).
 */
function raidRank(c: RaidContext, rank: RaidRank['id']): RankStudy | undefined {
  const { id, S, boss, prepared } = c;
  const rk = RAID_RANKS.find((r) => r.id === rank);
  if (!prepared || !rk) return undefined;
  const br = raidBossOf(id, { rank: rk.id });
  const none = withoutTool(prepared.picks, prepared.core ?? []);
  const tag = `report:${id}:rank:${rk.id}`;
  const server = (casual: CasualKind, order?: typeof CASUAL_ORDER) =>
    mixedSpread(
      br,
      prepared.picks,
      [prepared.picks],
      S.raid.rankDraws,
      1,
      2,
      `${tag}:${casual}${order ? ':casual' : ''}`,
      prepared.core ?? [],
      [prepared.core ?? []],
      { players: 10, casual, ...(order ? { order } : {}) },
    );
  return {
    bossId: id,
    bossName: boss.name,
    rank: rk,
    hp: br.hp,
    atk: br.atk,
    armour: br.armour,
    robust: robustnessOf(
      br,
      prepared.picks,
      S.raid.rankWeekends,
      S.raid.rankTalentDraws,
      `${tag}:p`,
    ),
    noTool: robustnessOf(br, none, S.raid.rankWeekends, S.raid.rankTalentDraws, `${tag}:n`),
    classic: [4, 10, 15].map((width) => {
      const wide = wideBoss(br, width);
      return {
        width,
        weekend: weekendStats(
          wide,
          classicFor(raidMode(wide)),
          S.raid.rankWeekends / 2,
          `${tag}:c${width}`,
        ),
      };
    }),
    casual: server('top3', CASUAL_ORDER),
    mixedRandom: server('random'),
    mixedTop3: server('top3'),
  };
}

/** Which mechanics the best line really needs: take each out and measure the damage share. */
function raidAblationOf(c: RaidContext): WireMeasured[] {
  const { id, S, boss, overall } = c;
  return toWire(
    ablate(
      overall.line,
      (l) => 100 * weekendStats(boss, l, S.raid.weekends, `report:${id}:abl`).damageShare,
    ),
  );
}

/** The tool gap at other widths (panel 5, finding 7): a table row and the cells of the data file. */
interface RaidGap {
  readonly row: string;
  readonly cells: unknown[];
}

function raidGap(c: RaidContext): RaidGap | undefined {
  const { id, S, boss, prepared } = c;
  if (!prepared) return undefined;
  const cells = [4, 5, 10].map((w) => {
    const wide = wideBoss(boss, w);
    const win = (l: readonly Pick[], tag: string) =>
      weekendStats(
        wide,
        tileLine(l, boss.cols, w),
        S.raid.weekends,
        `report:${id}:gap:${w}:${tag}`,
      );
    const withT = win(prepared.picks, 'with');
    const without = win(withoutTool(prepared.picks, prepared.core ?? []), 'without');
    return {
      width: w,
      withTool: withT.winRate,
      without: without.winRate,
      shareWith: withT.damageShare,
      shareWithout: without.damageShare,
      gap: 100 * (withT.winRate - without.winRate),
      shareGap: 100 * (withT.damageShare - without.damageShare),
    };
  });
  const row = `| ${boss.name} | ${prepared.tool} | ${cells.map((x) => `${pct(x.shareWith)} / ${pct(x.shareWithout)}: **${pts(x.shareGap / 100)}** of the HP (kill ${pct(x.withTool)} / ${pct(x.without)})`).join(' | ')} |`;
  return { row, cells };
}

/** The HP exponent's trade (panel 5, finding 7): a table row. */
function raidSensitivity(c: RaidContext): string {
  const { id, S, boss, prepared, overall } = c;
  return `| ${boss.name} | ${SENSITIVITY_EXPONENTS.map((e) => {
    const wide = wideBoss(boss, 15, e);
    const c15w = weekendStats(
      wide,
      classicFor(raidMode(wide)),
      Math.max(8, S.raid.weekends / 4),
      `report:${id}:sens:${e}`,
    );
    const mx = mixedSpread(
      boss,
      prepared?.picks ?? overall.line,
      prepared ? [prepared.picks] : [],
      S.raid.sensitivityDraws,
      1,
      2,
      `report:${id}:sensmix:${e}`,
      prepared?.core ?? [],
      prepared ? [prepared.core ?? []] : [],
      { hpExponent: e, casual: 'top3' },
    );
    // The prepared answer's tool gap at 10 players, tiled to fill the arena.
    const wide10 = wideBoss(boss, 10, e);
    const gap10 = prepared
      ? 100 *
        (weekendStats(
          wide10,
          tileLine(prepared.picks, boss.cols, 10),
          Math.max(8, S.raid.weekends / 4),
          `report:${id}:sensgap:${e}`,
        ).damageShare -
          weekendStats(
            wide10,
            tileLine(withoutTool(prepared.picks, prepared.core ?? []), boss.cols, 10),
            Math.max(8, S.raid.weekends / 4),
            `report:${id}:sensgap:${e}`,
          ).damageShare)
      : 0;
    return `${pct(c15w.damageShare)} (kill ${pct(c15w.winRate)}) / ${pct(mx.weekend.damageShare)} (kill ${pct(mx.winRate)}) / ${pts(gap10 / 100)}`;
  }).join(' | ')} |`;
}

/** One depth of one foe: the best team the search finds and the classic line, as a table cell. */
interface FoeDepth {
  readonly cell: string;
  readonly best: readonly Pick[];
  readonly bestWin: number;
  readonly classicWin: number;
  /** The top lines the usage tables count: not the classic line the search was seeded with. */
  readonly topLines: (readonly Pick[])[];
}

function foeSearch(id: string, depth: number, quick: boolean): FoeDepth | undefined {
  const S = BOSS_SETTINGS(quick);
  const foe = foeAt(id, depth);
  const ranked = search(foe, GAUNTLET, {
    seed: `foe:${id}:${depth}`,
    ...S.foe,
    include: [CLASSIC_LINE],
    score: gauntletScore(foe),
  });
  const best = ranked[0];
  if (!best) return undefined;
  const wb = gauntletStats(foe, best.line, S.foe.fights, `foe:${id}:${depth}:b`);
  const wc = gauntletStats(foe, CLASSIC_LINE, S.foe.fights, `foe:${id}:${depth}:c`);
  return {
    cell: `${pct(wb.winRate)} (${pct(wb.hpLeft)} HP) / ${pct(wc.winRate)} (${pct(wc.hpLeft)} HP)`,
    best: best.line,
    bestWin: wb.winRate,
    classicWin: wc.winRate,
    topLines: ranked
      .slice(0, 3)
      .filter((r) => lineKey(r.line) !== lineKey(CLASSIC_LINE))
      .map((r) => r.line),
  };
}

/** What taking each mechanic out of a foe's best line at the deepest depth costs (the measured mechanics). */
function foeAblationOf(id: string, quick: boolean, best: readonly Pick[]): WireMeasured[] {
  const S = BOSS_SETTINGS(quick);
  const foe = foeAt(id, DUNGEON_DEPTHS[DUNGEON_DEPTHS.length - 1] ?? 7);
  const score = gauntletScore(foe);
  return toWire(ablate(best, (l) => score(l, S.foe.fights, `report:foe:${id}:abl`).score));
}

/** The shipped map's runs at a depth (a careful route, a careless one, the classic line), and the Undercroft below the deepest. */
const MAP_DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8];
const UNDERCROFT_LEVELS = 3;

interface MapRun {
  readonly carefulWin: number;
  readonly carefulKnockouts: number;
  readonly carelessWin: number;
  readonly classicWin: number;
}

function mapRun(depth: number, quick: boolean): MapRun {
  const S = BOSS_SETTINGS(quick);
  const careful = runStats(ALL_ROUND_TEAM, depth, true, S.runs.stats, 'map', {
    policy: 'smart',
    bench: ALL_ROUND_BENCH,
  });
  const careless = runStats(ALL_ROUND_TEAM, depth, true, S.runs.stats, 'map', { policy: 'first' });
  const classic = runStats([...CLASSIC_LINE], depth, true, S.runs.stats, 'map', {
    policy: 'first',
  });
  return {
    carefulWin: careful.winRate,
    carefulKnockouts: careful.knockouts,
    carelessWin: careless.winRate,
    classicWin: classic.winRate,
  };
}

interface Undercroft {
  readonly careful: readonly number[];
  readonly careless: readonly number[];
}

function undercroftRuns(quick: boolean): Undercroft {
  const S = BOSS_SETTINGS(quick);
  const deepest = MAP_DEPTHS[MAP_DEPTHS.length - 1] ?? 8;
  const careful = runStats(ALL_ROUND_TEAM, deepest, true, S.runs.stats, 'map-under', {
    policy: 'smart',
    bench: ALL_ROUND_BENCH,
    levels: UNDERCROFT_LEVELS,
  });
  const careless = runStats(ALL_ROUND_TEAM, deepest, true, S.runs.stats, 'map-under', {
    policy: 'first',
    levels: UNDERCROFT_LEVELS,
  });
  return { careful: careful.undercroft, careless: careless.undercroft };
}

const raidJobId = (id: string, piece: string) => `boss:raid:${id}:${piece}`;
const foeJobId = (id: string, depth: number) => `boss:foe:${id}:${depth}`;
const foeAblationJobId = (id: string) => `boss:foe:${id}:ablation`;
const mapJobId = (depth: number | 'undercroft') => `boss:map:${depth}`;
const questionJobId = (key: string) => `boss:question:${key}`;
const mixedPiece = (casual: CasualKind, players: number) => `mixed:${casual}:${players}`;
const rankPiece = (rank: RaidRank['id']) => `rank:${rank}`;

/** The arguments of a job of the real bosses' sections (`runBossJob`). */
export interface BossJobArgs {
  readonly quick: boolean;
  readonly part: 'raid' | 'foe' | 'foe-ablation' | 'map' | 'undercroft' | 'question';
  /** The raid boss, foe or question. */
  readonly id?: string;
  /** Raid: the piece (`seeded`, `scratch0`, `pick`, `stats`, `studies`, ...). */
  readonly piece?: string;
  readonly depth?: number;
}

/** Runs one job of the real bosses' sections: its result is plain data (see `jobs.ts`). */
export function runBossJob(args: BossJobArgs, deps: Deps): unknown {
  const { quick } = args;
  const id = args.id ?? '';
  switch (args.part) {
    case 'foe':
      return foeSearch(id, args.depth ?? 1, quick);
    case 'foe-ablation': {
      const best = deps[foeJobId(id, DUNGEON_DEPTHS[DUNGEON_DEPTHS.length - 1] ?? 7)] as
        FoeDepth | undefined;
      return best ? foeAblationOf(id, quick, best.best) : undefined;
    }
    case 'map':
      return mapRun(args.depth ?? 1, quick);
    case 'undercroft':
      return undercroftRuns(quick);
    case 'question':
      return questionResult(FOE_QUESTIONS[id] as FoeQuestion, quick ? 60 : 200, 'report:fq');
    case 'raid':
      return runRaidPiece(id, args.piece ?? '', quick, deps);
  }
}

function runRaidPiece(id: string, piece: string, quick: boolean, deps: Deps): unknown {
  if (piece === 'seeded') return raidSeededSearch(id, quick);
  const scratchIndex = /^scratch(\d+)$/.exec(piece)?.[1];
  if (scratchIndex !== undefined) return raidScratchSearch(id, Number(scratchIndex), quick);
  const seeded = deps[raidJobId(id, 'seeded')] as Ranked[];
  if (piece === 'pick') {
    const scratch = Array.from(
      { length: BOSS_SETTINGS(quick).raid.scratchSearches },
      (_, i) => deps[raidJobId(id, `scratch${i}`)] as Ranked[],
    );
    return raidPick(id, quick, seeded, scratch);
  }
  const c = raidContext(id, quick, seeded, deps[raidJobId(id, 'pick')] as RaidPick);
  if (!c) return undefined;
  const mixed = /^mixed:(random|top3):(\d+)$/.exec(piece);
  if (mixed) return raidMixed(c, mixed[1] as CasualKind, Number(mixed[2]));
  const rank = /^rank:(low|mid|high)$/.exec(piece);
  if (rank) return raidRank(c, rank[1] as RaidRank['id']);
  switch (piece) {
    case 'stats':
      return raidStats(c);
    case 'studies':
      return raidStudies(c);
    case 'margins':
      return raidMargins(c);
    case 'ablation':
      return raidAblationOf(c);
    case 'gap':
      return raidGap(c);
    case 'sensitivity':
      return raidSensitivity(c);
    default:
      throw new Error(`unknown piece ${piece} of ${id}`);
  }
}

export interface BossOptions {
  readonly quick?: boolean;
  /** Only this raid boss's sections (for a tuning loop): none of the foes, and none of the tables across bosses. */
  readonly only?: string;
}

/** The sections on the real bosses as jobs: the searches first (the longest), then the studies that read them. */
export function planBosses(opts: BossOptions = {}): Plan<BossSections> {
  const quick = opts.quick ?? false;
  const S = BOSS_SETTINGS(quick);
  const raidIds = opts.only ? [opts.only] : RAID_BOSS_IDS;
  const wholeReport = opts.only === undefined;
  const job = (
    id: string,
    section: string,
    args: Omit<BossJobArgs, 'quick'>,
    needs: readonly string[] = [],
  ): JobSpec => ({ id, section, kind: 'boss', args: { quick, ...args }, needs });
  const searches = raidIds.flatMap((id) => [
    job(raidJobId(id, 'seeded'), 'Raid bosses: team searches', {
      part: 'raid',
      id,
      piece: 'seeded',
    }),
    ...Array.from({ length: S.raid.scratchSearches }, (_, i) =>
      job(raidJobId(id, `scratch${i}`), 'Raid bosses: team searches', {
        part: 'raid',
        id,
        piece: `scratch${i}`,
      }),
    ),
  ]);
  const foeDepths = wholeReport
    ? FOE_IDS.flatMap((id) =>
        DUNGEON_DEPTHS.map((depth) =>
          job(foeJobId(id, depth), 'Dungeon foes: team searches', { part: 'foe', id, depth }),
        ),
      )
    : [];
  const picks = raidIds.map((id) =>
    job(raidJobId(id, 'pick'), 'Raid bosses: team searches', { part: 'raid', id, piece: 'pick' }, [
      raidJobId(id, 'seeded'),
      ...Array.from({ length: S.raid.scratchSearches }, (_, i) => raidJobId(id, `scratch${i}`)),
    ]),
  );
  const piece = (id: string, section: string, name: string): JobSpec =>
    job(raidJobId(id, name), section, { part: 'raid', id, piece: name }, [
      raidJobId(id, 'seeded'),
      raidJobId(id, 'pick'),
    ]);
  const pieces = raidIds.flatMap((id) => [
    ...CASUAL_KINDS.flatMap((casual) =>
      MIXED_WIDTHS.map((players) =>
        piece(id, 'Raid bosses: mixed server', mixedPiece(casual, players)),
      ),
    ),
    ...RAID_RANKS.map((rk) => piece(id, 'Raid bosses: Boss Rank', rankPiece(rk.id))),
    piece(id, 'Raid bosses: answer studies', 'studies'),
    piece(id, 'Raid bosses: weekends and answers', 'stats'),
    piece(id, 'Raid bosses: HP exponent and tool gap', 'sensitivity'),
    piece(id, 'Raid bosses: margins and widths', 'margins'),
    piece(id, 'Raid bosses: ablation', 'ablation'),
    piece(id, 'Raid bosses: HP exponent and tool gap', 'gap'),
  ]);
  const rest: JobSpec[] = wholeReport
    ? [
        ...FOE_IDS.map((id) =>
          job(foeAblationJobId(id), 'Dungeon foes: ablation', { part: 'foe-ablation', id }, [
            foeJobId(id, DUNGEON_DEPTHS[DUNGEON_DEPTHS.length - 1] ?? 7),
          ]),
        ),
        ...MAP_DEPTHS.map((depth) => job(mapJobId(depth), 'Map runs', { part: 'map', depth })),
        job(mapJobId('undercroft'), 'Map runs', { part: 'undercroft' }),
        ...Object.keys(FOE_QUESTIONS).map((key) =>
          job(questionJobId(key), 'Foe questions', { part: 'question', id: key }),
        ),
      ]
    : [];
  return {
    jobs: [...searches, ...foeDepths, ...picks, ...pieces, ...rest],
    assemble: (results) =>
      assembleBosses({ quick, ...(opts.only ? { only: opts.only } : {}) }, results),
  };
}

function assembleBosses(opts: BossOptions, results: JobResults): BossSections {
  const quick = opts.quick ?? false;
  const S = BOSS_SETTINGS(quick);
  const raidIds = opts.only ? [opts.only] : RAID_BOSS_IDS;
  const md: string[] = [];
  const data: Record<string, unknown> = {};
  /** Every best line of every search here, counted for the Knack usage and form tables. */
  const topLines: (readonly Pick[])[] = [];
  const bestRaidLines: (readonly Pick[])[] = [];
  const bestFoeLines: (readonly Pick[])[] = [];
  const got = <T>(id: string, piece: string): T => results.get(raidJobId(id, piece)) as T;

  // ---------- Raid bosses ----------
  md.push(
    '## Raid bosses',
    '',
    `The five raid bosses of the shipped game, in the combat v2 grammar (\`packages/lab/src/bosses.ts\`). Players know the one boss in advance and build against it, so each is strong and has many attacks, most of them area attacks in varied shapes; a weekend should cost the party creatures. A weekend is three stages of 8 rounds that share the boss's HP; HP carries, knocked-out creatures stay out, four players each keep one Kilnmole on the bench. The arena is four slots wide (one column per player) and as many rows as the boss has. Best team: the team search over a whole weekend (wins first, then the boss's HP removed, then fewer knockouts), ${S.raid.weekends} weekends each. The classic raid party is four players with Tidewing (Steady Mark), Tempestray (Detonate) and Thornbuck (Wide Reach) in order across the rows.`,
    '',
  );
  for (const id of raidIds) md.push(`- ${bossLine(raidBossOf(id))}`);
  md.push('');

  const raidRows: string[] = [];
  const answerRows: string[] = [];
  const bestLinesMd: string[] = [];
  const marginRows: string[] = [];
  const healthRows: string[] = [];
  const widthRows: string[] = [];
  const illegalNotes: string[] = [];
  const raidData: Record<string, unknown> = {};
  /** The raid bosses' measured mechanics: name, boss id, and what taking each out of the best line costs (win-rate points). */
  const raidAblation: { id: string; name: string; measured: Measured[] }[] = [];
  /** Every legal written answer, measured: its tool, with other talents, and what each Knack family costs it. */
  const studies: AnswerStudy[] = [];
  /** For each watched Knack, what taking it out of each written answer that carries it costs (in the order of `studies`). */
  const knackCosts = new Map<string, string[]>(WATCHED_KNACKS.map((k) => [k, []]));
  /** The mixed server of every boss at each width and for each kind of casual player. */
  const mixedStudies: MixedStudy[] = [];
  /** The prepared line, the same without its tool, and the unprepared servers at each Boss Rank. */
  const rankStudies: RankStudy[] = [];
  /** The prepared answer's tool gap at 4 (the usual raid), 5 and 10 players. */
  const gapRows: string[] = [];
  const gapData: Record<string, unknown> = {};
  /** The HP exponent's trade: the classic party at 15 players and the mixed server of 10, at several exponents. */
  const sensitivityRows: string[] = [];
  let answers = 0,
    beat = 0;
  for (const id of raidIds) {
    const { boss } = raidSetup(id);
    illegalNotes.push(...raidSetup(id).illegalNotes);
    const stats = got<RaidStats | undefined>(id, 'stats');
    // A search that found nothing leaves the boss out of the tables.
    if (!stats) continue;
    const pick = got<RaidPick>(id, 'pick');
    const seeded = got<Ranked[]>(id, 'seeded')[0] as Ranked;
    const scratch = pick.scratchRanked[0] as Ranked;
    const overallIs = pick.overallIs;
    bestRaidLines.push(scratch.line);
    for (const r of pick.scratchRanked.slice(0, 5)) topLines.push(r.line);
    const { wc, wSeeded, wScratch, wPrep } = stats;
    const wOverall = overallIs === 'from scratch' ? wScratch : wSeeded;
    raidRows.push(stats.raidRow);
    bestLinesMd.push(...stats.bestLines);
    answerRows.push(...stats.answerRows);
    answers += stats.answers;
    beat += stats.beat;
    const bossStudies = got<RaidStudies>(id, 'studies');
    const hydrated = bossStudies.studies.map(hydrateStudy);
    studies.push(...hydrated);
    for (const [k, costs] of Object.entries(bossStudies.knackCosts))
      knackCosts.get(k)?.push(...costs);
    const margins = got<RaidMargins>(id, 'margins');
    marginRows.push(...margins.marginRows);
    widthRows.push(margins.widthRow);
    for (const casual of CASUAL_KINDS)
      for (const players of MIXED_WIDTHS)
        mixedStudies.push({
          bossId: id,
          bossName: boss.name,
          casual,
          players,
          result: got<MixedSpread>(id, mixedPiece(casual, players)),
        });
    const mixed = got<MixedSpread>(id, mixedPiece('random', 10));
    for (const rk of RAID_RANKS) {
      const study = got<RankStudy | undefined>(id, rankPiece(rk.id));
      if (study) rankStudies.push(study);
    }
    // HP left (Misa, 2026-10-29): knockouts are not the only cost; creatures standing but low on HP count too.
    const teams: [string, WeekendStats | undefined][] = [
      ['classic party', wc],
      ['prepared answer', wPrep],
      [`best searched (${overallIs})`, wOverall],
      ['mixed server', mixed.weekend],
    ];
    for (const [label, w] of teams)
      if (w)
        healthRows.push(
          `| ${boss.name} | ${label} | ${pct(w.winRate)} | ${w.knockoutsTotal.toFixed(1)} | ${healthCells(w).join(' | ')} |`,
        );
    // Which mechanics the best line really needs: take each out and measure the win rate.
    raidAblation.push({
      id,
      name: boss.name,
      measured: fromWire(got<WireMeasured[]>(id, 'ablation')),
    });
    // The prepared line is a boss's own answer: a tool it cannot do without counts too (the search's best line often has
    // several tools that cover for each other).
    // The other written answers are measured the same way: a boss calls for what its intended answers cannot do without.
    hydrated.forEach((x, k) =>
      raidAblation.push({
        id: k === 0 ? `${id}:prepared` : `${id}:answer${k}`,
        name: k === 0 ? `${boss.name}, prepared line` : `${boss.name}, answer ${k + 1}`,
        measured: [...x.measuredShare],
      }),
    );
    // The tool gap at other widths and the HP exponent's trade (panel 5, finding 7).
    const gap = got<RaidGap | undefined>(id, 'gap');
    if (gap) {
      gapRows.push(gap.row);
      gapData[id] = gap.cells;
    }
    sensitivityRows.push(got<string>(id, 'sensitivity'));
    raidData[id] = {
      seededBest: seeded.line,
      scratchBest: scratch.line,
      overall: overallIs,
      classicWin: wc.winRate,
      seededWin: wSeeded.winRate,
      scratchWin: wScratch.winRate,
      classicKnockouts: wc.knockoutsTotal,
      seededKnockouts: wSeeded.knockoutsTotal,
      scratchKnockouts: wScratch.knockoutsTotal,
      steps: { classic: wc.steps, seeded: wSeeded.steps, scratch: wScratch.steps },
      margin: margins.m,
      preparedMargin: margins.mp,
      health: {
        classic: wc,
        prepared: wPrep,
        best: wOverall,
        mixed: mixed.weekend,
      },
      widths: margins.widths,
      answers: stats.ansData,
    };
  }
  md.push(
    '### The best raid team and the classic party',
    '',
    `The team search over a whole weekend (it also picks a legal talent for each creature) is run per boss **seeded** with the classic party and the written answers, and **from scratch**, with nothing written (the best of ${S.raid.scratchSearches} independent searches, judged on the same fresh seeds: a search from nothing is a lottery). The Knack and form usage tables below count the from-scratch lines only, so they are not skewed by lines written by hand. **The primary measure (Misa, 2026-10-29) is the share of the boss's HP removed in a weekend** (mean and, in brackets, the standard deviation between weekends); beside it the share of weekends that reached each success tier of the shipped raid (the boss retreats when 30% of its HP is gone and again at 85%, and is defeated at 100%): tier 1 / tier 2 / kill. The kill rate is the secondary column. Score is the search score (win rate x 100, plus 40 x the share of boss HP removed, minus half a point per knockout); the weekend columns are measured on their own seeds, ${S.raid.weekends} weekends each, at the high Boss Rank (full cards). Steps is how far the boss escalated in a weekend, on average. Cells read classic / seeded best / from-scratch best.`,
    '',
    '| Boss | Classic: HP removed (tier 1 / tier 2 / kill) | Seeded best | From-scratch best | Score (classic / seeded / scratch) | Knockouts | Escalation steps |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |',
    ...raidRows,
    '',
    'Best lines (rows front to back):',
    '',
    ...bestLinesMd,
    '',
    ...(illegalNotes.length
      ? [
          '**Written answers with illegal talents (a creature may carry only a talent of its line pool that works for its role); they are left out of the searches and the tables until fixed:**',
          '',
          ...illegalNotes.map((n) => `- ${n}`),
          '',
        ]
      : []),
    '### Margin',
    '',
    `The share of the boss's HP removed (and in brackets the kill rate) of the prepared answer (the first written answer) and of the best searched line on the real boss at high rank, with 10% more Attack, and with 10% more HP. A well-prepared team keeps most of its share at +10% (the kill rate is the cliff: about ${pct(MARGIN_TARGET)} or more at +10% is the old target).`,
    '',
    '| Boss | Best line | HP removed | +10% Attack | +10% HP |',
    '| --- | --- | ---: | ---: | ---: |',
    ...marginRows,
    '',
    '### HP left after each stage',
    '',
    `Knockouts are one cost of a weekend; the creatures that stand but are low on HP are another (Misa, 2026-10-29: everyone alive but low is also a result). Each cell reads the standing creatures' HP over their max HP, and in brackets the share of the stage's creatures still standing, at the end of the stage (a mean over the weekends that played it, \`-\` when none did). The last column is the weekend's end: the last stage each weekend played. ${S.raid.weekends} weekends each. The prepared answer is the first written answer; the mixed server is the draw of casual players described below.`,
    '',
    '| Boss | Team | Win | Knockouts | Stage 1 | Stage 2 | Stage 3 | Weekend end |',
    '| --- | --- | ---: | ---: | --- | --- | --- | --- |',
    ...healthRows,
    '',
    '### The raid at other widths',
    '',
    `Each player brings one column, so the arena is as wide as the server's raid: ${RAID_WIDTHS.join(', ')} columns a row, at the high Boss Rank. Cells read the classic party / the best line repeated to fill, as the share of the boss's HP removed with the kill rate in brackets. **The width rules (panel 5, and the tool-gap fix): one exponent for the HP and one for the Attack, for every boss, each one smooth curve with no kink.** The boss's weekend HP is its HP for four players times (players / 4) ^ ${RAID_HP_EXPONENT}, and its Attack times (players / 4) ^ ${RAID_ATK_EXPONENT}. The first version grew the HP alone and a wide line of the same creatures won without its tool (a boss that hits no harder spreads its hits over more creatures); the Attack exponent keeps the damage each creature takes near what it is at four players. Its area counts scale with the width too (a move's counts, and a Build-up's units per step, can be set per 4 columns, \`perColumns\`).`,
    '',
    `| Boss | ${RAID_WIDTHS.map((w) => `${w} columns`).join(' | ')} |`,
    `| --- | ${RAID_WIDTHS.map(() => '---:').join(' | ')} |`,
    ...widthRows,
    '',
    '#### The tool gap at 4, 5 and 10 players',
    '',
    `The prepared answer (the first written answer, repeated to fill the wider arena) with and without its own tool, on the same seeds (${S.raid.weekends} weekends each), at the high rank. Cells read the share of the boss's HP removed with the tool / without it, in bold the difference in points of the HP, and the kill rates in brackets. A gate should not depend on the server's size: the gap should stay near what it is at 4 players (the Attack exponent is what keeps it: with the HP alone a wide line of the same creatures needed no tool).`,
    '',
    '| Boss | Tool | 4 players | 5 players | 10 players |',
    '| --- | --- | --- | --- | --- |',
    ...gapRows,
    '',
    '#### What the exponent trades',
    '',
    `Each cell reads the classic party at 15 columns / the mixed server of 10 (casual players on their top creatures with no Knack, ${S.raid.sensitivityDraws} draws) / the prepared answer's tool gap at 10 players (points of the boss's HP), at the HP exponent in the header, with the Attack exponent at its rule. A low exponent lets the classic party walk over a wide raid; a high one takes the mixed server's casual players out of reach of the boss. The rule uses ${RAID_HP_EXPONENT} (it was 0.7 before the Attack exponent; kept, since 0.6 let the classic party reach tier 2 at 15 columns on three bosses).`,
    '',
    `| Boss | ${SENSITIVITY_EXPONENTS.map((e) => `e = ${e}`).join(' | ')} |`,
    `| --- | ${SENSITIVITY_EXPONENTS.map(() => '---:').join(' | ')} |`,
    ...sensitivityRows,
    '',
    '### A mixed server weekend',
    '',
    `Players, one column each, side by side: about a fifth min-maxers, three tenths builders and half casual players (10 players: 2 min-maxers, 3 builders, 5 casual players; 5 and 15 keep the shares). Min-maxers and builders bring columns of the prepared line (the first written answer: one answer per boss, at most 2 copies of any form in a column; they have read the boss, so the min-maxers bring the columns with the most of its tool first and the builders take the columns in turn). Casual players have a roster of 12 random forms at random levels and a random legal talent each; the two variants differ in the Knack: **random Knack each** (today's players) and **top creatures by level, no Knack** (the default after the migration, P-14: one creature a row, the top three on a three-row arena). ${S.raid.mixedDraws} draws over ${S.raid.mixedSeeds} seeds (${S.raid.mixedWeekends} weekends a draw). HP removed is the mean over all draws (sd between weekends), with the share of weekends reaching tier 1 (30% removed), tier 2 (85%) and the kill, and in brackets the lowest and highest kill rate of the ${S.raid.mixedSeeds} seeds; the draw spread is the standard deviation of the draws' kill rates (a draw is one set of casual rosters). Knockouts per player are the mean a weekend for one player of that kind (a min-maxer, a builder, a casual player); the HP column is the team's HP left at the weekend's end.`,
    '',
    '| Boss | Players | Casual players | HP removed | Tier 1 / tier 2 / kill (kill by seed) | Draw spread of the kill rate (sd) | Knockouts | Per min-maxer / builder / casual | HP left (standing) |',
    '| --- | ---: | --- | ---: | --- | ---: | ---: | --- | --- |',
    ...mixedStudies.map((m) => {
      const r = m.result;
      return `| ${m.bossName} | ${m.players} | ${CASUAL_NAME[m.casual]} | ${share(r.weekend)} | ${tiers(r.weekend)} (${pct(Math.min(...r.seedWins))} to ${pct(Math.max(...r.seedWins))}) | ${Math.round(r.drawSd * 100)} pts | ${r.knockouts.toFixed(1)} | ${r.knockoutsPerPlayer.m.toFixed(2)} / ${r.knockoutsPerPlayer.b.toFixed(2)} / ${r.knockoutsPerPlayer.c.toFixed(2)} | ${healthCells(r.weekend).slice(3).join(' ')} |`;
    }),
    '',
    '### Boss Rank: the same weekends at a low, a mid and the high rank',
    '',
    `Every rule card and boss gate has a strength from 0% to 100% (\`strengthBp\`), and the strength rises with the server's Boss Rank (Misa, 2026-10-29). Reflection returns that share of the reaction's bonus; Shake It Off clears that share of the Mired; Reaction and Element Resistance cut that share of what they cut at full strength; a Build-up step grows the boss by that share; a silence hits that share of its slots and lasts that share of its turns; Judgement Bolt hits for that share of the Payoff's Max HP (a one-shot at full strength, a heavy hit below it); half of a boss's armour is its hide and the other half is its card, the strength's share. A card *asks* for a tool at low strength and *requires* it at high strength. The three ranks are ${RAID_RANKS.map((r) => `**${r.id}** (about rank ${r.rank}: cards at ${r.strengthBp / 100}%)`).join(', ')}. HP and Attack follow each boss's ladder (\`ranks\` in its spec; the high rank is the spec), and every step down is softer in every respect: a lower rank has less HP, less Attack, softer cards and, for Thornmother, a thinner bark. The server's roster grows with the rank, as in the shipped game (the shipped table's early ranks are small because the roster is small): the lab's creatures are level ${RAID_RANKS.map((r) => `${r.level} at the ${r.id} rank`).join(', ')}, the casual players' levels scaled the same way (a creature's stats grow with its level: a level 12 creature has about 70% of a level 25 one's). Without this the lab's level 25 roster would make every low rank boss a walkover unless it had more HP than the high rank's. ${S.raid.rankWeekends} weekends each, ${S.raid.rankDraws} draws of the mixed and casual servers, ${S.raid.rankTalentDraws} draws of random talents. Cells read the share of the boss's HP removed (sd between weekends), then tier 1 / tier 2 / kill.`,
    '',
    '#### The prepared line and its tool',
    '',
    '| Boss | Rank | Roster level | HP / Attack / armour | Prepared, as written | Prepared, random legal talents | Same line without its tool (random talents) | Tool adds | Talents add (random over none) |',
    '| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: |',
    ...rankStudies.map((r) => {
      const cell = (w: WeekendStats) => `${share(w)} (${tiers(w)})`;
      const rnd = (x: Robustness['random']) =>
        `${pct(x.damageShare)} (sd ${Math.round(x.damageShareSd * 100)}; ${pct(x.tiers.t1)} / ${pct(x.tiers.t2)} / ${pct(x.tiers.kill)})`;
      return `| ${r.bossName} | ${r.rank.id} | ${r.rank.level} | ${r.hp} / ${r.atk} / ${r.armour} | ${cell(r.robust.written)} | ${rnd(r.robust.random)} | ${rnd(r.noTool.random)} | ${pts(r.robust.random.damageShare - r.noTool.random.damageShare)} | ${pts(r.robust.random.damageShare - r.robust.none.damageShare)} |`;
    }),
    '',
    '#### The unprepared: the classic party, a server of casual players, the mixed server',
    '',
    `The classic party at 4, 10 and 15 columns (the same three creatures in every column); a server of ten casual players (their top creatures by level, no Knack, nobody has read the boss); the mixed server of ten (2 min-maxers, 3 builders, 5 casual players) with the casual players on a random Knack each and on no Knack.`,
    '',
    '| Boss | Rank | Classic, 4 columns | Classic, 10 | Classic, 15 | Casual server of 10 | Mixed 10, random Knack | Mixed 10, no Knack |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rankStudies.map((r) => {
      const cell = (w: WeekendStats) => `${share(w)} (${tiers(w)})`;
      return `| ${r.bossName} | ${r.rank.id} | ${r.classic.map((c) => cell(c.weekend)).join(' | ')} | ${cell(r.casual.weekend)} | ${cell(r.mixedRandom.weekend)} | ${cell(r.mixedTop3.weekend)} |`;
    }),
    '',
    '### Every answer’s own tool (panel 5)',
    '',
    `Each written answer names its tool (\`core\`): its Knacks become no Knack and its talents are dropped, on the same seeds (${S.raid.weekends} weekends), at the high rank. **The primary measure is the share of the boss's HP removed** (Misa, 2026-10-29): a tool is worth it when the answer removes at least ${Math.round(TOOL_SHARE_MIN * 100)} points more of the HP with it. The kill rate is the cliff beside it (a drop of ${TOOL_DROP_MIN} points or more is the old test). The Mired column is what taking the whole Debuff family (Squelch Song, Mud Wall and the rest of the family) out of the answer costs in points of kill rate (and, in brackets, of the boss's HP removed), and the last column lists the other Knack families whose removal costs more than ${GATE_DROP} points of kill rate (a gate carried from another boss).`,
    '',
    '| Boss | Answer (tool) | HP removed with | HP removed without | Tool adds | Kill with / without (drop) | Own tool | Mired family (Debuff) removed | Other gates carried |',
    '| --- | --- | --- | --- | ---: | --- | --- | ---: | --- |',
    ...studies.map((st) => {
      const own = ownFamilies(st.answer.core ?? []);
      const drops = familyDrops(st.measured);
      const other = Object.entries(drops)
        .filter(([f, d]) => d > GATE_DROP && !own.includes(f))
        .map(([f, d]) => `${f} (-${Math.round(d)})`);
      return `| ${st.bossName} | ${st.answer.label} (${st.answer.tool}) | ${share(st.tool.withStats)} (${tiers(st.tool.withStats)}) | ${share(st.tool.withoutStats)} (${tiers(st.tool.withoutStats)}) | ${pts(st.tool.shareDrop / 100)} | ${pct(st.tool.withTool)} / ${pct(st.tool.without)} (${Math.round(st.tool.drop)}) | ${st.tool.shareDrop >= TOOL_SHARE_MIN * 100 ? 'ok' : '**fails**'} | ${drops['Debuff'] === undefined ? 'none carried' : `${lost(drops['Debuff'])} (HP ${lost(familyDrops(st.measuredShare)['Debuff'] ?? 0)})`} | ${other.join(', ') || '-'} |`;
    }),
    '',
    `**${studies.filter((x) => x.tool.shareDrop >= TOOL_SHARE_MIN * 100).length} of ${studies.length} written answers remove at least ${Math.round(TOOL_SHARE_MIN * 100)} points more of the boss's HP with their own tool; ${studies.filter((x) => x.tool.drop >= TOOL_DROP_MIN).length} lose at least ${TOOL_DROP_MIN} points of kill rate without it.**`,
    '',
    '### Robustness: random legal talents and no talents (panel 5)',
    '',
    `Each written answer as written (the talents the search chose), with random legal talents (one talent for each creature, from its line's pool for its role, ${S.raid.talentDraws} draws) and with no talents, ${S.raid.weekends} weekends each, at the high rank. Cells read the share of the boss's HP removed (sd between weekends), with the tiers and the kill rate beside it; the random talents' range is the lowest and highest draw's mean share. The last two columns are what the talents add in points of the HP (written over none; random over none). Talents are meant to be about a fifth of a result (R20) and not to decide the weekend. **Target: the prepared line with random legal talents removes about ${pct(ROBUST_SHARE)} of the HP or more (and kills about ${pct(ROBUST_TARGET)} of weekends or more is the old, cliff version).**`,
    '',
    '| Boss | Answer (tool) | As written | Random legal talents (range of draws) | No talents | Talents add: written / random | Target |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...studies.map((st, i) => {
      const first = studies.findIndex((x) => x.bossId === st.bossId) === i;
      const cell = (w: WeekendStats) => `${share(w)} (${tiers(w)})`;
      const r = st.robust.random;
      return `| ${st.bossName} | ${st.answer.label} (${st.answer.tool})${first ? ', prepared' : ''} | ${cell(st.robust.written)} | ${pct(r.damageShare)} (sd ${Math.round(r.damageShareSd * 100)}; ${pct(r.minShare)} to ${pct(r.maxShare)}; ${pct(r.tiers.t1)} / ${pct(r.tiers.t2)} / ${pct(r.tiers.kill)}) | ${cell(st.robust.none)} | ${pts(st.robust.written.damageShare - st.robust.none.damageShare)} / ${pts(r.damageShare - st.robust.none.damageShare)} | ${r.damageShare >= ROBUST_SHARE ? 'met' : '**below**'} |`;
    }),
    '',
    `**The prepared line with random legal talents removes ${pct(ROBUST_SHARE)} of the HP or more on ${studies.filter((x, i) => studies.findIndex((y) => y.bossId === x.bossId) === i && x.robust.random.damageShare >= ROBUST_SHARE).length} of ${new Set(studies.map((x) => x.bossId)).size} bosses (and kills ${pct(ROBUST_TARGET)} or more on ${studies.filter((x, i) => studies.findIndex((y) => y.bossId === x.bossId) === i && x.robust.random.winRate >= ROBUST_TARGET).length}).**`,
    '',
    '### Intended answers (P-13)',
    '',
    'An answer works when its score beats the classic party’s on the same boss. Each boss has two or more, on different tools. The comparison is in the share of the boss’s HP removed, with the tiers (30% / 85% / kill) beside it.',
    '',
    '| Boss | Answer (tool) | Score vs classic | HP removed (tier 1 / tier 2 / kill) vs classic | Knockouts | Steps |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...answerRows,
    '',
    `**${beat} of ${answers} intended answers beat the classic party on their boss.**`,
    '',
  );
  data['raidBosses'] = raidData;
  data['hpRule'] = { exponent: RAID_HP_EXPONENT, toolGap: gapData };
  data['mixedServer'] = mixedStudies.map((m) => ({
    boss: m.bossId,
    casual: m.casual,
    players: m.players,
    winRate: m.result.winRate,
    seedWins: m.result.seedWins,
    drawSd: m.result.drawSd,
    knockouts: m.result.knockouts,
    knockoutsPerPlayer: m.result.knockoutsPerPlayer,
  }));
  data['ranks'] = rankStudies.map((r) => ({
    boss: r.bossId,
    rank: r.rank.id,
    strengthBp: r.rank.strengthBp,
    rosterLevel: r.rank.level,
    hp: r.hp,
    atk: r.atk,
    armour: r.armour,
    preparedWritten: { share: r.robust.written.damageShare, tiers: r.robust.written.tiers },
    preparedRandom: { share: r.robust.random.damageShare, tiers: r.robust.random.tiers },
    noToolRandom: { share: r.noTool.random.damageShare, tiers: r.noTool.random.tiers },
    classic: r.classic.map((c) => ({
      width: c.width,
      share: c.weekend.damageShare,
      tiers: c.weekend.tiers,
    })),
    casual: { share: r.casual.weekend.damageShare, tiers: r.casual.weekend.tiers },
    mixedRandom: { share: r.mixedRandom.weekend.damageShare, tiers: r.mixedRandom.weekend.tiers },
    mixedTop3: { share: r.mixedTop3.weekend.damageShare, tiers: r.mixedTop3.weekend.tiers },
  }));
  data['raidAnswers'] = { beat, total: answers };
  data['illegalAnswers'] = illegalNotes;
  // A tuning loop on one boss reads the raid tables only: the foes and the tables across bosses are not measured.
  if (opts.only) return { md, data };

  // ---------- Dungeon foes ----------
  md.push(
    '## Dungeon foes',
    '',
    `The fifteen foes and floor bosses (\`packages/lab/src/foes.ts\`): one row of three, then the foe. Names, elements and round counts come from the content; every foe asks its own question, and the foes are tough: a dungeon shows its encounters up front but sends many different foes, so it wants an all-round team, and the camp (a rest between rooms) has to matter. HP and Attack follow a depth (the dungeon's curve, gentler in the lab because every creature is at its cap; lab depths are not the shipped depth numbers); a floor boss gains its signature move at a landmark depth (depth 7 here). Each cell is the best team the search finds (win rate in ${S.foe.fights} fights, and the share of the team's HP left) against the classic line's.`,
    '',
  );
  md.push(
    `| Foe | Asks | ${DUNGEON_DEPTHS.map((d) => `Depth ${d}: best / classic`).join(' | ')} |`,
    `| --- | --- | ${DUNGEON_DEPTHS.map(() => '---:').join(' | ')} |`,
  );
  const foeData: Record<string, unknown> = {};
  /** The best gauntlet line of each foe at the deepest depth (where floor bosses have their signature), for the measured mechanics. */
  const foeBest = new Map<string, readonly Pick[]>();
  const bestAtMid: string[] = [];
  const mid = DUNGEON_DEPTHS[Math.min(2, DUNGEON_DEPTHS.length - 1)] ?? 5;
  for (const id of FOE_IDS) {
    const cells: string[] = [];
    const per: Record<number, unknown> = {};
    let name = id;
    for (const d of DUNGEON_DEPTHS) {
      const foe = foeAt(id, d);
      name = foe.name;
      const found = results.get(foeJobId(id, d)) as FoeDepth | undefined;
      if (!found) continue;
      // The usage tables count what the search found, not the classic line it was seeded with.
      topLines.push(...found.topLines);
      bestFoeLines.push(found.best);
      if (d === DUNGEON_DEPTHS[DUNGEON_DEPTHS.length - 1]) foeBest.set(id, found.best);
      cells.push(found.cell);
      per[d] = { best: found.best, bestWin: found.bestWin, classicWin: found.classicWin };
      if (d === mid) bestAtMid.push(`- ${foe.name}: ${found.best.map(pickName).join(', ')}`);
    }
    md.push(`| ${name} | ${FOE_ASKS.get(id) ?? ''} | ${cells.join(' | ')} |`);
    foeData[id] = per;
  }
  md.push('', `Best teams at depth ${mid}:`, '', ...bestAtMid, '');
  data['foes'] = foeData;

  // Map runs (panel 5): the shipped map, a careful route and a careless first-exit route, at every depth and in the Undercroft.
  md.push(
    '### Map runs and the camp',
    '',
    `A run is the shipped map (fights, elites, mystery rooms, caches, the camp and the floor boss) with foes drawn without repeats; creatures keep their HP, a knocked-out creature stays out until the camp's Swap, and the camp's Rest heals the standing creatures by the dungeon's share. The team is the lab's all-round team (${ALL_ROUND_TEAM.map(pickName).join(', ')}) with a bench of ${ALL_ROUND_BENCH.map(pickName).join(', ')}. **Careful** plans: it prefers rooms that cost no HP, then the fight the team is strongest against, takes an elite only when healthy and strong against it, and at the camp swaps in a bench creature for one that is knocked out or nearly so, else rests when hurt, else takes the better keepsake. **Careless** takes the first exit every time, rests at the camp and takes the first free option, with no bench. The classic line takes the first exit too. A clear is beating the floor boss; the Undercroft columns are the share of all runs that went on to beat the keeper of that level. ${S.runs.stats} seeded runs each, the same maps and dice for every team.`,
    '',
    '| Depth | Careful: clear | Careful: knockouts at the end | Careless: clear | Classic line, careless: clear |',
    '| --- | ---: | ---: | ---: | ---: |',
  );
  const runData: Record<string, unknown> = {};
  for (const d of MAP_DEPTHS) {
    const run = results.get(mapJobId(d)) as MapRun;
    md.push(
      `| ${d} | ${pct(run.carefulWin)} | ${run.carefulKnockouts.toFixed(1)} | ${pct(run.carelessWin)} | ${pct(run.classicWin)} |`,
    );
    runData[`depth${d}`] = {
      careful: run.carefulWin,
      careless: run.carelessWin,
      classic: run.classicWin,
    };
  }
  const deepest8 = MAP_DEPTHS[MAP_DEPTHS.length - 1] ?? 8;
  const under = results.get(mapJobId('undercroft')) as Undercroft;
  md.push(
    '',
    `The Undercroft below depth ${deepest8} (the share of all runs that beat the keeper of each level):`,
    '',
    '| Undercroft level | Careful | Careless |',
    '| --- | ---: | ---: |',
    ...Array.from(
      { length: UNDERCROFT_LEVELS },
      (_, k) => `| ${k + 1} | ${pct(under.careful[k] ?? 0)} | ${pct(under.careless[k] ?? 0)} |`,
    ),
    '',
  );
  runData['undercroft'] = { careful: under.careful, careless: under.careless };
  data['mapRuns'] = runData;

  // ---------- Knack usage, forms and mechanics ----------
  const pool = poolOf();
  const poolShare = (k: string) => pool.filter((p) => p.knack === k).length / pool.length;
  const appear = new Map<string, number>(
    [...Object.keys(KNACKS), 'none'].map((k) => [k, 0] as [string, number]),
  );
  let picks = 0;
  for (const l of topLines)
    for (const p of l) {
      picks++;
      appear.set(p.knack, (appear.get(p.knack) ?? 0) + 1);
    }
  const usage = [...appear.entries()]
    .map(([k, n]) => ({ k, n, ratio: n / Math.max(1, picks) / poolShare(k) }))
    .sort((a, b) => b.ratio - a.ratio);
  md.push(
    '## Knack usage across the real bosses (per creature)',
    '',
    `${picks} creatures in the top 5 from-scratch raid lines of each boss (not the lines written by hand or the classic party) and the top 3 gauntlet lines of each foe at each depth. Ratio is the Knack's share of those picks over its share of the pool of every form and Knack: 1.0 is what random picks would give, above 2 stands out, below 0.3 is rarely chosen.`,
    '',
    '| Knack | Forms | Picks | Ratio |',
    '| --- | --- | ---: | ---: |',
    ...usage.map(
      ({ k, n, ratio }) =>
        `| ${knackName(k)} | ${
          k === 'none'
            ? 'any'
            : Object.entries(FORM_KNACKS)
                .filter(([, ks]) => ks.includes(k))
                .map(([f]) => f)
                .join(', ')
        } | ${n} | ${ratio.toFixed(1)} |`,
    ),
    '',
  );
  data['bossKnackUsage'] = Object.fromEntries(
    usage.map((u) => [u.k, { picks: u.n, ratio: Math.round(u.ratio * 100) / 100 }]),
  );
  // The gate check (P-05, P-10): no Knack family may be a must-have on three or more bosses.
  const gates = familyGates(
    studies.map((st) => ({
      boss: st.bossName,
      answer: st.answer.label,
      drops: familyDrops(st.measured),
    })),
  );
  const failing = failingGates(gates);
  md.push(
    '## The gate check (P-05, P-10)',
    '',
    `A Knack family is a **gate** on a boss when taking it out of one of the boss's written answers costs more than ${GATE_DROP} points of weekend kill rate (${S.raid.weekends} weekends, the same seeds with and without). **Gate: no Knack family is a gate on ${GATE_BOSSES} or more bosses.** Panel 5 found Mired (the Debuff family) on 9 of the 10 answers.`,
    '',
    '| Knack family | Bosses it gates | Answers |',
    '| --- | ---: | --- |',
    ...gates.map(
      (g) =>
        `| ${g.family} | ${g.bosses.length} (${g.bosses.join(', ')}) | ${g.answers.join('; ')} |`,
    ),
    '',
    failing.length
      ? `**Gate FAILS: ${failing.map((g) => `${g.family} (${g.bosses.length} bosses)`).join(', ')}.**`
      : `**Gate passes: no Knack family costs more than ${GATE_DROP} points on ${GATE_BOSSES} or more bosses.**`,
    '',
  );
  data['gates'] = {
    families: gates,
    failing: failing.map((g) => g.family),
    answers: studies.map((st) => ({
      boss: st.bossId,
      tool: st.answer.tool,
      toolDrop: Math.round(st.tool.drop),
      randomTalentsWin: st.robust.random.winRate,
      noTalentsWin: st.robust.none.winRate,
      familyDrops: familyDrops(st.measured),
    })),
  };

  // Knacks the content task will use: the rarely used ones named by panel 5 and the outlier, with what taking each out costs.
  const WATCHED = WATCHED_KNACKS;
  const usageOf = new Map(usage.map((u) => [u.k, u]));
  const knackRows = WATCHED.map((k) => {
    const costs = knackCosts.get(k) ?? [];
    const u = usageOf.get(k);
    return {
      k,
      row: `| ${knackName(k)} | ${Object.entries(FORM_KNACKS)
        .filter(([, ks]) => ks.includes(k))
        .map(([f]) => f)
        .join(
          ', ',
        )} | ${u?.n ?? 0} | ${(u?.ratio ?? 0).toFixed(1)} | ${costs.length} | ${costs.join('; ') || '-'} |`,
    };
  });
  const rare = usage.filter((u) => u.k !== 'none' && u.ratio < 0.3 && !WATCHED.includes(u.k));
  const loud = usage.filter((u) => u.k !== 'none' && u.ratio >= 2 && !WATCHED.includes(u.k));
  md.push(
    '### Rarely used Knacks and the outlier (the content task\u2019s list)',
    '',
    `The Knacks panel 5 named: six with almost no picks on the real bosses, and Guard's Shadow, far above the rest. Picks and ratio are from the table above; the last two columns are how many written answers carry it and what taking it out of each costs (points of weekend win rate, ${S.raid.weekends} weekends). A Knack that costs an answer nothing is not an answer's tool.`,
    '',
    '| Knack | Forms | Picks | Ratio | Written answers carrying it | Lost without it |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...knackRows.map((r) => r.row),
    '',
    `Other Knacks below ratio 0.3: ${rare.map((u) => `${knackName(u.k)} (${u.n}, ${u.ratio.toFixed(1)})`).join(', ') || 'none'}.`,
    '',
    `Other Knacks at ratio 2 or more: ${loud.map((u) => `${knackName(u.k)} (${u.n}, ${u.ratio.toFixed(1)})`).join(', ') || 'none'}.`,
    '',
  );
  data['knackWatch'] = Object.fromEntries(
    WATCHED.map((k) => [
      k,
      {
        picks: usageOf.get(k)?.n ?? 0,
        ratio: Math.round((usageOf.get(k)?.ratio ?? 0) * 100) / 100,
      },
    ]),
  );
  const formCount = new Map<string, number>();
  for (const l of [...bestRaidLines, ...bestFoeLines])
    for (const f of new Set(l.map((p) => p.formId))) formCount.set(f, (formCount.get(f) ?? 0) + 1);
  const lines = bestRaidLines.length + bestFoeLines.length;
  const forms = [...formCount.entries()].sort((a, b) => b[1] - a[1]);
  md.push(
    '### Forms in the best teams',
    '',
    `Of the ${lines} best teams (one per raid boss, one per foe and depth), the forms in most of them: ${forms
      .slice(0, 6)
      .map(([f, n]) => `${f} (${n}, ${pct(n / Math.max(1, lines))})`)
      .join(', ')}. A form in most best teams is a new "top three" (P-11).`,
    '',
  );
  data['bossForms'] = Object.fromEntries(forms);

  // Which mechanics a boss or foe really calls for: take the mechanic out of its best line and measure what the line loses.
  const RAID_DROP = 5;
  const FOE_DROP = 10;
  const deepest = DUNGEON_DEPTHS[DUNGEON_DEPTHS.length - 1] ?? 7;
  const foeAblation: { id: string; name: string; measured: Measured[] }[] = [];
  for (const id of FOE_IDS) {
    const measured = results.get(foeAblationJobId(id)) as WireMeasured[] | undefined;
    if (!measured) continue;
    foeAblation.push({ id, name: foeAt(id, deepest).name, measured: fromWire(measured) });
  }
  // The foes' questions (Misa, 2026-10-29): each foe asks one mechanic, measured as a team with its tool against the same without.
  const questionResults = Object.keys(FOE_QUESTIONS).map(
    (key) => results.get(questionJobId(key)) as FoeQuestionResult,
  );
  const questionCalls = questionResults.filter(
    (r) => r.gap >= FOE_QUESTION_GAP && r.withTool >= FOE_QUESTION_WIN,
  );
  const calledBy = (mechanicId: string) => [
    ...raidAblation.flatMap((r) => {
      const m = r.measured.find((x) => x.mechanic.id === mechanicId);
      return m && m.drop >= RAID_DROP ? [{ name: r.name, drop: m.drop, unit: 'pts' }] : [];
    }),
    ...foeAblation.flatMap((r) => {
      const m = r.measured.find((x) => x.mechanic.id === mechanicId);
      return m && m.drop >= FOE_DROP ? [{ name: r.name, drop: m.drop, unit: 'score' }] : [];
    }),
    ...questionCalls
      .filter((r) => r.question.mechanic === mechanicId)
      .map((r) => ({
        name: `${foeAt(r.question.foe, 1).name}'s question`,
        drop: 100 * r.gap,
        unit: 'pts of win rate',
      })),
  ];
  const measuredRows = MECHANICS.map((mechanic) => {
    const hasTool = raidAblation[0]?.measured.find((x) => x.mechanic.id === mechanic.id)?.hasTool;
    return { mechanic, hasTool: hasTool ?? false, callers: calledBy(mechanic.id) };
  });
  const bossSide = measuredRows.filter((r) => !r.hasTool);
  const notCalled = measuredRows.filter((r) => r.hasTool && r.callers.length === 0);
  md.push(
    '## Mechanics the bosses and foes call for (measured)',
    '',
    `Every Knack family, keyword, rule and talent kind should be the answer or the problem for at least one boss or foe. A mechanic is **called for** by a raid boss only when taking it out of that boss's best line or of any of its written answers (its Knacks become none, its talents are dropped) lowers the share of the boss's HP removed in a weekend by ${RAID_DROP} points or more, on the same seeds (${S.raid.weekends} weekends); a foe, when the best line's score at depth ${deepest} (where floor bosses have their signature) falls by ${FOE_DROP} or more (${S.foe.fights} fights), or when its **question** (below) is won clearly more often with the tool: a team of three with the mechanic's Knack and the same team without it, on the foe at the depth and the share of its HP and Attack the question names, at least ${Math.round(FOE_QUESTION_GAP * 100)} points more of the fights. The drop is measured, not read off the boss's data. A mechanic only a boss has (an escalation feed, Adaptation) has no tool on a line to take out; those are in the features-present list below.`,
    '',
    '| Mechanic | Kind | Called for by (measured drop) |',
    '| --- | --- | --- |',
    ...measuredRows.map(
      ({ mechanic, hasTool, callers }) =>
        `| ${mechanic.name} | ${mechanic.group} | ${
          !hasTool
            ? 'boss-side only (no tool to take out)'
            : callers.length === 0
              ? '**none**'
              : `${callers.length}: ${callers
                  .slice(0, 4)
                  .map((x) => `${x.name} (-${Math.round(x.drop)} ${x.unit})`)
                  .join(', ')}${callers.length > 4 ? ', ...' : ''}`
        } |`,
    ),
    '',
    notCalled.length
      ? `**No boss or foe measurably calls for: ${notCalled.map((m) => `${m.mechanic.name} (${m.mechanic.group})`).join(', ')}.**`
      : '**Every mechanic with a tool is measurably called for by at least one boss or foe.**',
    '',
  );
  // The same table read the other way round: what each raid boss and foe measurably calls for (the aim: at least three each).
  const perBoss = [
    ...RAID_SPECS.map((spec) => {
      const entries = raidAblation.filter(
        (r) => r.id === spec.id || r.id.startsWith(`${spec.id}:`),
      );
      return {
        id: spec.id,
        name: entries[0]?.name ?? spec.id,
        named: MECHANICS.filter((mech) =>
          entries.some((r) =>
            r.measured.some((x) => x.mechanic.id === mech.id && x.drop >= RAID_DROP),
          ),
        ),
      };
    }),
    ...foeAblation.map((r) => ({
      id: r.id,
      name: r.name,
      named: [
        ...r.measured.filter((x) => x.drop >= FOE_DROP).map((x) => x.mechanic),
        ...questionCalls
          .filter((q) => q.question.foe === r.id)
          .flatMap((q) => MECHANICS.filter((m) => m.id === q.question.mechanic)),
      ].filter((m, i, all) => all.findIndex((y) => y.id === m.id) === i),
    })),
  ];
  md.push(
    '### What each foe asks: the questions',
    '',
    `Each foe has one question (\`packages/lab/src/foeQuestions.ts\`): a team of three with the tool and the same team without it, on the foe at the depth, HP and Attack shown (a foe at 150% HP is what it is in an elite room or deeper down; an ordinary foe at an ordinary depth is beaten by the best searched team whatever it carries, so the ablation above names little). The foe calls for the mechanic when the team with the tool wins at least ${Math.round(FOE_QUESTION_WIN * 100)}% of the fights and at least ${Math.round(FOE_QUESTION_GAP * 100)} points more often than the team without it (${quick ? 60 : 200} fights each).`,
    '',
    '| Foe | Asks | Mechanic (tool) | Depth / HP / Attack | Win with / without | Gap |',
    '| --- | --- | --- | --- | --- | ---: |',
    ...questionResults.map(
      (r) =>
        `| ${foeAt(r.question.foe, 1).name} | ${FOE_ASKS.get(r.question.foe) ?? ''} | ${MECHANICS.find((m) => m.id === r.question.mechanic)?.name ?? r.question.mechanic} (${r.question.tool.map(knackName).join(', ')}) | ${r.question.depth} / ${r.question.hpBp / 100}% / ${r.question.atkBp / 100}% | ${pct(r.withTool)} / ${pct(r.without)} | ${Math.round(100 * r.gap)} ${r.gap >= FOE_QUESTION_GAP && r.withTool >= FOE_QUESTION_WIN ? '' : '**fails**'} |`,
    ),
    '',
    `**${questionCalls.length} of ${questionResults.length} foes call for their mechanic by their question.**`,
    '',
  );
  data['foeQuestions'] = questionResults.map((r) => ({
    foe: r.question.foe,
    mechanic: r.question.mechanic,
    withTool: r.withTool,
    without: r.without,
    gap: r.gap,
  }));
  md.push(
    '### What each boss measurably calls for',
    '',
    'The same measure read per boss: the mechanics whose removal from its best line or one of its written answers costs the weekend win rate (raid) or the score (foe) the drop above. A boss that names few is one the best lines beat without needing much; the aim is at least three each.',
    '',
    '| Boss or foe | Mechanics named | Which |',
    '| --- | ---: | --- |',
    ...perBoss.map(
      (b) =>
        `| ${b.name} | ${b.named.length} | ${b.named.map((m) => `${m.name} (${m.group})`).join(', ') || '-'} |`,
    ),
    '',
  );
  const nothing = perBoss.filter((b) => b.named.length === 0);
  md.push(
    nothing.length
      ? `**Measurably call for nothing: ${nothing.map((b) => b.name).join(', ')}.**`
      : '**Every boss and foe measurably calls for at least one mechanic.**',
    '',
  );
  // The card hint, generated from the measured table (P-13, panel 5 finding 8) next to the one written by hand.
  const callsOf = (m: readonly Measured[]): Call[] =>
    m.filter((x) => x.carried).map((x) => ({ mechanic: x.mechanic, drop: x.drop, key: x.key }));
  const hintRows = [
    ...RAID_SPECS.map((spec) => ({
      id: spec.id,
      name: raidBossOf(spec.id).name,
      written: spec.asks,
      measured: measuredHint(
        raidAblation
          .filter((r) => r.id === spec.id || r.id.startsWith(`${spec.id}:`))
          .map((r) => callsOf(r.measured)),
        RAID_DROP,
      ),
    })),
    ...foeAblation.map((r) => ({
      id: r.id,
      name: r.name,
      written: FOE_ASKS.get(r.id) ?? '',
      measured: measuredHint([callsOf(r.measured)], FOE_DROP),
    })),
  ];
  md.push(
    '### The card hint, from measurement (P-13)',
    '',
    `The hint a boss card would show, generated from the measured table above instead of written from intent: the five mechanics (removal costs at least ${RAID_DROP} points; a foe: ${FOE_DROP} score) that most of the boss's lines (its best line and each written answer) cannot do without, then by the biggest drop; Knack families as "<family> Knacks" and talent kinds as "<kind> talents"; mechanics that take the same Knacks and talents off a line are one entry, and a keyword with a family's or rule's name is the same entry. The written hint is what the boss's spec says today.`,
    '',
    '| Boss or foe | Written hint | Measured hint |',
    '| --- | --- | --- |',
    ...hintRows.map((h) => `| ${h.name} | ${h.written} | ${h.measured || '-'} |`),
    '',
  );
  data['cardHints'] = Object.fromEntries(
    hintRows.map((h) => [h.id, { written: h.written, measured: h.measured }]),
  );
  data['coveragePerBoss'] = Object.fromEntries(
    perBoss.map((b) => [b.id, b.named.map((m) => m.id)]),
  );
  data['mechanicsNotCalled'] = notCalled.map((m) => m.mechanic.id);
  data['mechanicsBossSide'] = bossSide.map((m) => m.mechanic.id);
  data['mechanicsTotal'] = MECHANICS.length;
  data['mechanicsMeasured'] = Object.fromEntries(
    measuredRows.map((r) => [
      r.mechanic.id,
      r.callers.map((c) => ({ ...c, drop: Math.round(c.drop) })),
    ]),
  );

  // The old structural check, kept as a separate list: which boss features exist, whether or not the best line needs them.
  const everyone: BossDef[] = [
    ...RAID_BOSS_IDS.map((id) => raidBossOf(id)),
    ...FOE_IDS.map((id) => foeAt(id, 7)),
  ];
  const cover = coverage(everyone);
  const missing = cover.filter((c) => c.callers.length === 0);
  md.push(
    '### Features present (not measured)',
    '',
    'What the bosses and foes have, read off their data by the predicates in `src/mechanics.ts`: a Knack family, keyword or rule that some boss or foe has a feature for. This does not say a team needs it; the measured table above does.',
    '',
    '| Mechanic | Kind | Present on |',
    '| --- | --- | --- |',
    ...cover.map(
      (c) =>
        `| ${c.mechanic.name} | ${c.mechanic.group} | ${
          c.callers.length === 0
            ? '**none**'
            : `${c.callers.length}: ${c.callers
                .slice(0, 4)
                .map((x) => x.name)
                .join(', ')}${c.callers.length > 4 ? ', ...' : ''}`
        } |`,
    ),
    '',
    missing.length
      ? `**No boss or foe has a feature for: ${missing.map((m) => `${m.mechanic.name} (${m.mechanic.group})`).join(', ')}.**`
      : '**Every mechanic has a feature on at least one boss or foe.**',
    '',
  );
  md.push(
    '## Not ported from the shipped bosses and foes',
    '',
    ...NOT_PORTED.map((t) => `- ${t}`),
    '',
  );
  data['featuresMissing'] = missing.map((m) => m.mechanic.id);
  return { md, data };
}

/** What each foe asks, from its spec (for the table). */
const FOE_ASKS = new Map(FOE_SPECS.map((s) => [s.id, s.asks]));
