/**
 * The rules the lab tests hold a boss's numbers to, as measure functions (one for each way a test measures a boss). The tests
 * (`test/boss*.test.ts`) and the tuner (`tuner.ts`) both call these, so the tuner measures a rule exactly as its test does: the same
 * line, the same weekends, the same seeds. Thresholds live in `targets.ts`.
 *
 * `scale` (default 1: the test's own number of weekends) shrinks the weekends for the tuner's cheap passes. The seeds are the test's,
 * so a smaller scale is a prefix of the test's own fights, and at 1 the value is the test's value.
 */
import { createSeededRng } from '@creatures/game';
import { randomTalents, toolCost, type ToolCost } from './answerMeasure';
import { BOSS_ANSWERS, answerLine, withoutTool, type BossAnswer } from './bossAnswers';
import { raidMode, weekendScore, weekendStats, type WeekendStats } from './bosses';
import {
  CASUAL_ORDER,
  RAID_WIDTHS,
  marginOf,
  mixedServer,
  mixedSpread,
  tileLine,
  wideBoss,
  widthOf,
  type Margin,
} from './raidMeasure';
import { classicFor, type Pick } from './search';
import {
  COST_HP_LEFT_LOW,
  COST_KNOCKOUTS_MIN,
  GAP10_KILL_UNIT,
  GAP10_SHARE_UNIT,
  SERVER_KNOCKOUT_FACTOR,
  isCrossMeasure,
  type RaidMeasure,
  type TargetRank,
} from './targets';
import type { BossDef } from './types';

/** `n` weekends at a scale: at least one, and exactly `n` at scale 1. */
export const weekendsAt = (n: number, scale: number): number =>
  Math.max(1, Math.ceil(n * scale - 1e-9));

/** `weekends` over `draws` draws of random talents at a scale: the weekends per draw stay (the draws are a prefix of the test's), the draws shrink. */
export function drawsAt(weekends: number, draws: number, scale: number): [number, number] {
  const per = Math.max(1, Math.floor(weekends / draws));
  const d = weekendsAt(draws, scale);
  return [per * d, d];
}

/** A boss's first written answer: the prepared line and its tool. */
export function firstAnswer(id: string): { answer: BossAnswer; line: Pick[] } {
  const answer = BOSS_ANSWERS[id]?.[0];
  if (!answer) throw new Error(`${id} has no written answer`);
  return { answer, line: answerLine(answer.line) };
}

/**
 * The prepared line with random legal talents, as `robustnessOf(...).random` measures it, without the two measures of that function
 * the tuner does not read (the line as written and with no talents): the mean share of HP removed and the mean kill rate over the
 * draws, with the same salts, so the numbers equal `robustnessOf`'s (tested).
 */
export function randomTalentMeasure(
  boss: BossDef,
  line: readonly Pick[],
  weekends: number,
  draws: number,
  salt: string,
): { share: number; kill: number } {
  const per = Math.max(1, Math.floor(weekends / draws));
  let share = 0,
    kill = 0;
  for (let d = 0; d < draws; d++) {
    const rng = createSeededRng(`talents:${salt}:${d}`);
    const w = weekendStats(boss, randomTalents(rng, line), per, `${salt}:r${d}`);
    share += w.damageShare;
    kill += w.tiers.kill;
  }
  return { share: share / draws, kill: kill / draws };
}

// ---------- bossAnswers.test.ts ----------

export interface AnswersWin {
  readonly classicKill: number;
  readonly classicShare: number;
  readonly answers: readonly {
    readonly label: string;
    readonly share: number;
    readonly t2: number;
    readonly kill: number;
  }[];
}

/** The classic party (16 weekends) and each written answer (24) at the high rank: HP removed, the second retreat, the kill. */
export function answersWin(id: string, boss: BossDef, scale = 1): AnswersWin {
  const classic = weekendStats(
    boss,
    classicFor(raidMode(boss)),
    weekendsAt(16, scale),
    `win:${id}`,
  );
  return {
    classicKill: classic.winRate,
    classicShare: classic.damageShare,
    answers: (BOSS_ANSWERS[id] ?? []).map((a) => {
      const w = weekendStats(boss, answerLine(a.line), weekendsAt(24, scale), `win:${id}`);
      return { label: a.label, share: w.damageShare, t2: w.tiers.t2, kill: w.winRate };
    }),
  };
}

/** How far each written answer's weekend score is above the baseline it has to beat (16 weekends): the bare classic party, or with the answer's talent. */
export function answersBeat(
  id: string,
  boss: BossDef,
  scale = 1,
): readonly { label: string; margin: number }[] {
  const score = weekendScore(boss);
  const seeds = weekendsAt(16, scale);
  const classic = score(classicFor(raidMode(boss)), seeds, `ans:${id}`).score;
  return (BOSS_ANSWERS[id] ?? []).map((a) => {
    const baseline = a.talent
      ? score(
          classicFor(raidMode(boss)).map((p) => ({ ...p, talents: [a.talent as string] })),
          seeds,
          `ans:${id}`,
        ).score
      : classic;
    return {
      label: a.label,
      margin: score(answerLine(a.line), seeds, `ans:${id}`).score - baseline,
    };
  });
}

/** An answer's own tool at the high rank (40 weekends, written talents): `shareDrop` in points of HP, `drop` in points of kill rate. */
export function answerToolCost(id: string, k: number, boss: BossDef, scale = 1): ToolCost {
  const a = BOSS_ANSWERS[id]?.[k];
  if (!a) throw new Error(`${id} has no answer ${String(k)}`);
  return toolCost(boss, a, answerLine(a.line), weekendsAt(40, scale), `tool-all:${id}:${a.tool}`);
}

/** The prepared line with random legal talents (48 weekends over 8 draws) and as written: the HP removed. */
export function robustRule(
  id: string,
  boss: BossDef,
  scale = 1,
): { random: number; written: number } {
  const { line } = firstAnswer(id);
  const [weekends, draws] = drawsAt(48, 8, scale);
  return {
    random: randomTalentMeasure(boss, line, weekends, draws, `rob:${id}`).share,
    written: weekendStats(boss, line, weekends, `rob:${id}:w`).damageShare,
  };
}

// ---------- bossRank.test.ts, bossRankTool.test.ts ----------

/** The prepared line and the classic party at a rank (16 weekends each, one seed): kill and HP removed. */
export function rankRule(
  id: string,
  rank: TargetRank,
  boss: BossDef,
  scale = 1,
): { preparedKill: number; preparedShare: number; classicKill: number } {
  const { line } = firstAnswer(id);
  const salt = `rank:${id}:${rank}`;
  const w = weekendStats(boss, line, weekendsAt(16, scale), salt);
  const c = weekendStats(boss, classicFor(raidMode(boss)), weekendsAt(16, scale), salt);
  return { preparedKill: w.winRate, preparedShare: w.damageShare, classicKill: c.winRate };
}

/** The classic party's share of the HP removed at a rank (16 weekends): the cross-rank ladder compares the low rank's with the high rank's. */
export function classicShareAt(id: string, boss: BossDef, scale = 1): number {
  return weekendStats(boss, classicFor(raidMode(boss)), weekendsAt(16, scale), `rank:${id}:c`)
    .damageShare;
}

/** A server of ten casual players (their top three creatures, no Knack) at the low rank: 16 draws of two weekends. */
export function casualRule(id: string, low: BossDef, scale = 1): { share: number; kill: number } {
  const { answer, line } = firstAnswer(id);
  const core = answer.core ?? [];
  const casual = mixedSpread(
    low,
    line,
    [line],
    weekendsAt(16, scale),
    1,
    2,
    `rank:${id}:casual`,
    core,
    [core],
    { players: 10, casual: 'top3', order: CASUAL_ORDER },
  );
  return { share: casual.weekend.damageShare, kill: casual.winRate };
}

/** What the tool is worth at a rank to a team with random talents (40 weekends over 8 draws): the HP share with the tool minus without. */
export function rankToolShare(id: string, rank: TargetRank, boss: BossDef, scale = 1): number {
  const { answer, line } = firstAnswer(id);
  const [weekends, draws] = drawsAt(40, 8, scale);
  const w = randomTalentMeasure(boss, line, weekends, draws, `rank:${id}:${rank}:t`).share;
  const n = randomTalentMeasure(
    boss,
    withoutTool(line, answer.core ?? []),
    weekends,
    draws,
    `rank:${id}:${rank}:n`,
  ).share;
  return w - n;
}

/** Thornmother's tool at a rank with her written talents (24 weekends), in points of the HP (`toolCost`'s `shareDrop`). */
export function thornToolGain(rank: TargetRank, boss: BossDef, scale = 1): number {
  const { answer, line } = firstAnswer('thornmother');
  return toolCost(boss, answer, line, weekendsAt(24, scale), `rank-t:${rank}`).shareDrop;
}

// ---------- bossMargin.test.ts ----------

/** The prepared line as it stands and at +10% Attack and +10% HP (24 weekends). */
export function marginRule(id: string, boss: BossDef, scale = 1): Margin {
  return marginOf(boss, firstAnswer(id).line, weekendsAt(24, scale), `margin:${id}`);
}

/** The prepared line's weekend (24 weekends): HP removed, creatures lost, the team's HP at the end. */
export function costRule(id: string, boss: BossDef, scale = 1): WeekendStats {
  return weekendStats(boss, firstAnswer(id).line, weekendsAt(24, scale), `cost:${id}`);
}

/** The classic party and the prepared line at 5, 10 and 15 columns (12 weekends each). */
export function widthRule(id: string, boss: BossDef, scale = 1) {
  const { line } = firstAnswer(id);
  return RAID_WIDTHS.map((w) => widthOf(boss, line, w, weekendsAt(12, scale), `width:${id}`));
}

/**
 * The tool gap at 10 players: the line repeated to fill, with and without its tool (16 weekends). Returns the two gaps and the larger of
 * them in the units of `GAP10_SHARE_UNIT` and `GAP10_KILL_UNIT` (at least `GAP10_MIN` passes).
 */
export function gap10Rule(
  id: string,
  boss: BossDef,
  scale = 1,
): { share: number; kills: number; gap: number } {
  const { answer, line } = firstAnswer(id);
  const wide = wideBoss(boss, 10);
  const runs = weekendsAt(16, scale);
  const withT = weekendStats(wide, tileLine(line, boss.cols, 10), runs, `gap10:${id}`);
  const without = weekendStats(
    wide,
    tileLine(withoutTool(line, answer.core ?? []), boss.cols, 10),
    runs,
    `gap10:${id}`,
  );
  const share = withT.damageShare - without.damageShare;
  const kills = withT.winRate - without.winRate;
  return { share, kills, gap: Math.max(share / GAP10_SHARE_UNIT, kills / GAP10_KILL_UNIT) };
}

/** A mixed server of ten (20 draws, 60 weekends) and a prepared team's creatures lost (12 weekends): the server's losses over the factor times the team's. */
export function serverRule(
  id: string,
  boss: BossDef,
  scale = 1,
): { kill: number; share: number; knockouts: number; prepared: number } {
  const { answer, line } = firstAnswer(id);
  const [weekends, draws] = drawsAt(60, 20, scale);
  const r = mixedServer(boss, line, [line], draws, weekends, `mixed:${id}`, answer.core ?? [], [
    answer.core ?? [],
  ]);
  const prepared = weekendStats(boss, line, weekendsAt(12, scale), `mixed-cost:${id}`);
  return {
    kill: r.winRate,
    share: r.weekend.damageShare,
    knockouts: r.knockouts,
    prepared: prepared.knockoutsTotal,
  };
}

// ---------- bossContent.test.ts ----------

/** A weekend of the classic party (12 weekends): creatures lost and kill rate. */
export function contentRule(
  id: string,
  boss: BossDef,
  scale = 1,
): { knockouts: number; kill: number } {
  const w = weekendStats(boss, classicFor(raidMode(boss)), weekendsAt(12, scale), `content:${id}`);
  return { knockouts: w.knockoutsTotal, kill: w.winRate };
}

// ---------- the tuner's view: every rule of a rank as measures ----------

/** The measures of the rules for a boss at a rank. `other`: the boss at the other end of a cross-rank rule (low for high, high for low). */
export type RuleValues = Partial<Record<RaidMeasure, number>>;

export interface RuleResult {
  readonly values: RuleValues;
  /** Weekends fought, roughly (a wide weekend counts once). */
  readonly weekends: number;
}

/**
 * Every rule a boss at `rank` is held to, as the measures of `targets.ts`. The `cross.*` measures are taken when `other` is given
 * (the boss as it stands at the other rank the rule compares: the low rank's for the high, the high rank's for the low). Without
 * `heavy`, the rules that only the high rank has (the many fights of `bossAnswers.test.ts`, `bossMargin.test.ts` and
 * `bossContent.test.ts`) are left out, for the tuner's cheapest pass.
 */
export function ruleMeasures(
  id: string,
  rank: TargetRank,
  boss: BossDef,
  scale: number,
  other?: { rank: TargetRank; boss: BossDef },
  heavy = true,
): RuleResult {
  const v: Partial<Record<RaidMeasure, number>> = {};
  let weekends = 0;
  const at = (n: number) => {
    weekends += weekendsAt(n, scale);
  };
  const r = rankRule(id, rank, boss, scale);
  v['rank.preparedKill'] = r.preparedKill;
  v['rank.preparedShare'] = r.preparedShare;
  v['rank.classicKill'] = r.classicKill;
  v['rank.toolShare'] = rankToolShare(id, rank, boss, scale);
  at(32 + 80);
  if (rank === 'low') {
    const c = casualRule(id, boss, scale);
    v['casual.share'] = c.share;
    v['casual.kill'] = c.kill;
    at(32);
  }
  if (rank === 'high' && heavy) {
    const a = answersWin(id, boss, scale);
    v['answers.classicKill'] = a.classicKill;
    v['answers.classicShare'] = a.classicShare;
    v['answers.share'] = Math.min(...a.answers.map((x) => x.share));
    v['answers.t2'] = Math.min(...a.answers.map((x) => x.t2));
    v['answers.firstKill'] = a.answers[0]?.kill ?? 0;
    at(16 + 24 * a.answers.length);
    const beat = answersBeat(id, boss, scale);
    v['answers.beatClassic'] = Math.min(...beat.map((x) => x.margin));
    at(16 * (2 + beat.length));
    const tools = (BOSS_ANSWERS[id] ?? []).map((_, k) => answerToolCost(id, k, boss, scale));
    v['answers.toolShare'] = Math.min(...tools.map((t) => t.shareDrop)) / 100;
    v['answers.toolKill'] = (tools[0]?.drop ?? 0) / 100;
    at(80 * tools.length);
    const rob = robustRule(id, boss, scale);
    v['robust.share'] = rob.random;
    v['robust.gap'] = rob.written - rob.random;
    at(96);
    const m = marginRule(id, boss, scale);
    v['margin.base'] = m.share.base;
    v['margin.atk10'] = m.share.atk10;
    v['margin.hp10'] = m.share.hp10;
    at(72);
    const c = costRule(id, boss, scale);
    v['cost.share'] = c.damageShare;
    v['cost.pays'] = Math.max(
      c.knockoutsTotal - COST_KNOCKOUTS_MIN,
      COST_HP_LEFT_LOW - c.hpLeftEnd,
    );
    v['cost.hpLeft'] = c.hpLeftEnd;
    at(24);
    const w = widthRule(id, boss, scale);
    v['width.classicKill'] = Math.max(...w.map((x) => x.classicWin));
    v['width.classicShare'] = Math.max(...w.map((x) => x.classicShare));
    v['width.bestShare'] = Math.min(...w.map((x) => x.bestShare));
    at(72);
    v.gap10 = gap10Rule(id, boss, scale).gap;
    at(32);
    const s = serverRule(id, boss, scale);
    v['server.kill'] = s.kill;
    v['server.share'] = s.share;
    v['server.knockouts'] = s.knockouts - SERVER_KNOCKOUT_FACTOR * s.prepared;
    at(72);
    const k = contentRule(id, boss, scale);
    v['content.knockouts'] = k.knockouts;
    v['content.classicKill'] = k.kill;
    at(12);
  }
  if (other && isCrossRank(rank, other.rank)) {
    const [low, high] = rank === 'low' ? [boss, other.boss] : [other.boss, boss];
    v['cross.classicLadder'] = classicShareAt(id, low, scale) - classicShareAt(id, high, scale);
    at(32);
    if (id === 'thornmother') {
      v['cross.toolGap'] =
        (thornToolGain('high', high, scale) - thornToolGain('low', low, scale)) / 100;
      at(96);
    }
  }
  return { values: v, weekends };
}

const isCrossRank = (a: TargetRank, b: TargetRank): boolean =>
  (a === 'low' && b === 'high') || (a === 'high' && b === 'low');

/** Whether any measure of the list needs the other rank (`cross.*`). */
export const needsOtherRank = (measures: readonly RaidMeasure[]): boolean =>
  measures.some(isCrossMeasure);
