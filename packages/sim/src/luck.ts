import { RULES, content, createSeededRng, type BossDef, type LuckConfig } from '@creatures/game';
import {
  defaultAbilityRound,
  simulateFight,
  type AbilityChoice,
  type FightInput,
} from '@creatures/engine';
import { scaleMix } from './archetypes';
import { chooseSignUps, runEconomy } from './economy';
import {
  fightFor,
  hasShieldWall,
  neutralGuard,
  openRaidWeek,
  playStage,
  playWholeWeek,
} from './raid';
import { clonePlayer, type SimPlayer } from './state';
import { mean, percentile } from './util';

/**
 * How much luck is in a finale? (docs/design/luck.md.) For a sample of fixed finale inputs (roster,
 * row, boss, boss HP pool, adaptation and abilities at their default rounds) this runs each input
 * with many seeds and records its win probability, then tries alternative ability timings greedily
 * to see how far perfect timing can move that probability. The same measurement runs for any luck
 * setting, so a proposed mechanic can be compared with the shipped rules.
 */

export interface LuckStudySettings {
  seed: string;
  /** Economy sims per server size (each gives roster snapshots at weeks 4 and 8). */
  economySims: number;
  /** Server sizes (players in the economy sim; sign-ups of casuals vary). */
  counts: number[];
  /** Seeds per input and setting when measuring a win probability. */
  seeds: number;
  /** Seeds used while searching for better ability timings (kept apart from the measured ones). */
  searchSeeds: number;
  /** Search passes over the abilities. */
  passes: number;
  /** Cap on inputs per group; 0 for no cap. */
  maxCases: number;
  /** Stages that roll luck in the whole-week measurement. */
  luckStages: readonly ('phase1' | 'phase2' | 'finale')[];
}

export function defaultLuckSettings(mode: 'full' | 'quick'): LuckStudySettings {
  return mode === 'quick'
    ? {
        seed: 'luck',
        economySims: 1,
        counts: [7, 15],
        seeds: 20,
        searchSeeds: 6,
        passes: 1,
        maxCases: 4,
        luckStages: ['phase1', 'phase2', 'finale'],
      }
    : {
        seed: 'luck',
        economySims: 3,
        counts: [5, 7, 10, 12, 15],
        seeds: 200,
        searchSeeds: 16,
        passes: 2,
        maxCases: 0,
        luckStages: ['phase1', 'phase2', 'finale'],
      };
}

/** One fixed finale input and what is needed to replay the whole week around it. */
export interface LuckCase {
  id: string;
  signedUp: number;
  snapshotWeek: number;
  boss: BossDef;
  signed: SimPlayer[];
  finale: FightInput;
}

/** Players per case group, as the owner counts them: typical servers, then the 15-player cap. */
export function groupOf(signedUp: number): 'small' | 'typical' | 'large' {
  if (signedUp <= 4) return 'small';
  return signedUp <= 10 ? 'typical' : 'large';
}

/**
 * Builds the sample: economy sims give rosters at weeks 4 and 8, each snapshot is signed up as in the
 * raid sweep and played through Phase 1 and Phase 2 with the shipped rules (no luck), which fixes
 * the boss HP pool and the adaptation the finale starts from.
 */
export function buildCases(settings: LuckStudySettings): LuckCase[] {
  const cases: LuckCase[] = [];
  for (const count of settings.counts) {
    for (let k = 0; k < settings.economySims; k++) {
      const econ = runEconomy({
        seed: `${settings.seed}:econ:${count}:${k}`,
        weeks: 8,
        mix: scaleMix(count),
        snapshotWeeks: [4, 8],
      });
      for (const snap of econ.snapshots) {
        for (const boss of content.bosses) {
          const base = `${settings.seed}:case:${count}:${k}:${snap.week}:${boss.id}`;
          const signed = chooseSignUps(
            snap.players.map(clonePlayer),
            createSeededRng(`${base}:signup`),
            createSeededRng(`${base}:order`),
          );
          if (signed.length === 0) continue;
          const week = openRaidWeek(boss, signed.map(clonePlayer));
          playStage(week, 'phase1', createSeededRng(`${base}:p1`), createSeededRng(`${base}:l1`));
          playStage(week, 'phase2', createSeededRng(`${base}:p2`), createSeededRng(`${base}:l2`));
          cases.push({
            id: base,
            signedUp: signed.length,
            snapshotWeek: snap.week,
            boss,
            signed,
            finale: fightFor(week, 'finale').fight,
          });
        }
      }
    }
  }
  if (settings.maxCases === 0) return cases;
  const taken = new Map<string, number>();
  return cases.filter((c) => {
    const g = groupOf(c.signedUp);
    const n = taken.get(g) ?? 0;
    taken.set(g, n + 1);
    return n < settings.maxCases;
  });
}

const UNBEATABLE = 1_000_000_000_000;

interface Outcome {
  wins: number;
  /** Mean boss HP left as a share of the pool the finale started with. */
  hpLeft: number;
  /** Mean creatures knocked out per finale. */
  knockouts: number;
}

/** Runs a finale input with `seeds` seeds and the given ability timings. */
function runSeeds(
  fight: FightInput,
  abilities: readonly AbilityChoice[],
  luck: LuckConfig | undefined,
  seedBase: string,
  seeds: number,
): Outcome {
  let wins = 0;
  let hpLeft = 0;
  let knockouts = 0;
  for (let s = 0; s < seeds; s++) {
    const r = simulateFight(
      { ...fight, finaleAbilities: abilities, ...(luck === undefined ? {} : { luck }) },
      createSeededRng(`${seedBase}:${s}`),
    );
    if (r.bossHpEnd === 0) wins += 1;
    hpLeft += r.bossHpEnd / fight.bossHpPool.current;
    for (const e of r.events) if (e.t === 'knockout') knockouts += 1;
  }
  return { wins, hpLeft: hpLeft / seeds, knockouts: knockouts / seeds };
}

/** Damage a finale deals against a boss that cannot fall, as a share of the pool: above 1 wins. */
export function damageRatio(
  fight: FightInput,
  abilities: readonly AbilityChoice[],
  luck: LuckConfig | undefined,
  seed: string,
): number {
  return finaleDamage(fight, abilities, luck, seed) / fight.bossHpPool.current;
}

/** Total damage the finale deals to a boss that cannot fall (all rounds are played). */
export function finaleDamage(
  fight: FightInput,
  abilities: readonly AbilityChoice[],
  luck: LuckConfig | undefined,
  seed: string,
): number {
  const r = simulateFight(
    {
      ...fight,
      finaleAbilities: abilities,
      bossHpPool: { max: UNBEATABLE, current: UNBEATABLE },
      ...(luck === undefined ? {} : { luck }),
    },
    createSeededRng(seed),
  );
  let total = 0;
  for (const e of r.events) if (e.t === 'hit') total += e.damage;
  return total;
}

/** True if `a` is a better outcome than `b`: more wins, or equal wins and less boss HP left. */
function better(a: Outcome, b: Outcome): boolean {
  return a.wins > b.wins || (a.wins === b.wins && a.hpLeft < b.hpLeft - 1e-9);
}

/**
 * Greedy search for better ability timings (the "perfect timing" proxy): for each ability in turn,
 * try every fire round of the finale and keep the best, for `passes` passes. The search uses its own
 * seeds, so measuring the result on fresh seeds is not flattered by luck it was fitted to.
 */
export function skilledAbilities(
  fight: FightInput,
  luck: LuckConfig | undefined,
  settings: Pick<LuckStudySettings, 'searchSeeds' | 'passes'>,
  seedBase: string,
  /** Only abilities this accepts are timed (for example the Shield Walls); the rest stay at default. */
  only: (choice: AbilityChoice) => boolean = () => true,
): AbilityChoice[] {
  const rounds = fight.boss.finaleRounds;
  const choices: AbilityChoice[] = fight.finaleAbilities.map((a) => ({ ...a }));
  const defs = new Map(content.finaleAbilities.map((a) => [a.id, a]));
  let best = runSeeds(fight, choices, luck, seedBase, settings.searchSeeds);
  for (let pass = 0; pass < settings.passes; pass++) {
    let changed = false;
    for (let i = 0; i < choices.length; i++) {
      const original = choices[i] as AbilityChoice;
      if (!only(original)) continue;
      const def = defs.get(original.abilityId);
      const current =
        original.fireAtRound ??
        (def === undefined ? 1 : defaultAbilityRound(fight.boss, def, rounds));
      let pick = original;
      for (let round = 1; round <= rounds; round++) {
        if (round === current) continue;
        choices[i] = { ...original, fireAtRound: round };
        const outcome = runSeeds(fight, choices, luck, seedBase, settings.searchSeeds);
        if (better(outcome, best)) {
          best = outcome;
          pick = choices[i] as AbilityChoice;
          changed = true;
        }
      }
      choices[i] = pick;
    }
    if (!changed) break;
  }
  return choices;
}

/** A study setting with everything resolved: luck, boss Attack and the boss HP retune. */
export interface AppliedSetting {
  /** Undefined: the shipped rules. */
  luck: LuckConfig | undefined;
  /** Boss Attack in basis points of the shipped value (10000: shipped). */
  bossAtkBp: number;
  /** Boss HP pool in basis points of the shipped value (10000: shipped). */
  hpScaleBp: number;
}

export const SHIPPED: AppliedSetting = { luck: undefined, bossAtkBp: 10_000, hpScaleBp: 10_000 };

/** The finale input with boss Attack and the HP pool scaled (the pool keeps 1 <= current <= max). */
export function scaleFight(fight: FightInput, a: Pick<AppliedSetting, 'bossAtkBp' | 'hpScaleBp'>) {
  const hp = (n: number): number => Math.max(1, Math.floor((n * a.hpScaleBp) / 10_000));
  return {
    ...fight,
    bossAtk: Math.max(1, Math.floor((fight.bossAtk * a.bossAtkBp) / 10_000)),
    bossHpPool: { max: hp(fight.bossHpPool.max), current: hp(fight.bossHpPool.current) },
  } satisfies FightInput;
}

/** The measurements of one input under one setting. */
export interface CaseMeasure {
  snapshotWeek: number;
  /** Creatures in the row, and how many of them are guards and how many Shield Wall abilities there are. */
  rowSize: number;
  guards: number;
  shields: number;
  /** Win probability with every ability at its default round. */
  pDefault: number;
  /** Win probability with greedily found timings for every ability. */
  pSkilled: number;
  /** Win probability with only the Shield Walls (the basic one and the guards' abilities) best timed. */
  pGuardTimed: number;
  /** Win probability with every Shield Wall ability left out (default timing for the rest). */
  pNoShield: number;
  /** Mean over the Shield Wall abilities of the win probability lost by leaving that one out. */
  looShield: number | null;
  /** Win probability with the guard role taken away from every guard. */
  pNoGuard: number;
  /** Mean over the guards of the win probability lost by taking away that guard's role. */
  looGuard: number | null;
  /** Win probability of the whole week (all three stages with luck), default timings. */
  pWeek: number;
  /** The same with the greedily found timings. */
  pWeekSkilled: number;
  pWeekGuardTimed: number;
  pWeekNoShield: number;
  pWeekNoGuard: number;
  /** Mean creatures knocked out per finale (default timing, the setting's boss HP). */
  knockouts: number;
  /** Damage over boss HP left at the finale start, default timings (seed 0). */
  ratioDefault: number;
  ratioSkilled: number;
  /** Spread of the finale damage between seeds: standard deviation over mean (default timing). */
  damageCv: number;
  /** Mean finale damage with the setting over the damage under the shipped rules (1: no change). */
  damageShift: number;
}

/** True if nothing in the setting is random, so every seed gives the same result. */
export function luckIsOff(luck: LuckConfig | undefined): boolean {
  return (
    luck === undefined ||
    (luck.critChanceBp === 0 &&
      (luck.bossCritChanceBp ?? 0) === 0 &&
      (luck.bossRandomTargetBp ?? 0) === 0 &&
      luck.spreadBp === 0 &&
      luck.surgeChanceBp === 0 &&
      luck.slumpChanceBp === 0)
  );
}

/** Finale damage of an input under a setting: mean, spread (std over mean) and shift over shipped. */
export interface DamageStats {
  mean: number;
  cv: number;
  shift: number;
}

export function damageStats(
  c: LuckCase,
  a: AppliedSetting,
  settings: LuckStudySettings,
  label: string,
): DamageStats {
  const base = `${c.id}:${label}`;
  const fight = scaleFight(c.finale, { bossAtkBp: a.bossAtkBp, hpScaleBp: 10_000 });
  const cvSeeds = luckIsOff(a.luck) ? 1 : Math.min(settings.seeds, 40);
  const damages: number[] = [];
  for (let s = 0; s < cvSeeds; s++) {
    damages.push(finaleDamage(fight, fight.finaleAbilities, a.luck, `${base}:cv:${s}`));
  }
  const dMean = mean(damages) ?? 0;
  const dVar = mean(damages.map((d) => (d - dMean) ** 2)) ?? 0;
  const plain = finaleDamage(c.finale, c.finale.finaleAbilities, undefined, `${base}:plain`);
  return {
    mean: dMean,
    cv: dMean === 0 ? 0 : Math.sqrt(dVar) / dMean,
    shift: plain === 0 ? 1 : dMean / plain,
  };
}

function withoutShield(abilities: readonly AbilityChoice[]): AbilityChoice[] {
  return abilities.filter((a) => !hasShieldWall(a.abilityId));
}

export function measureCase(
  c: LuckCase,
  a: AppliedSetting,
  fullSettings: LuckStudySettings,
  label: string,
  stats: DamageStats,
): CaseMeasure {
  const luck = a.luck;
  // Without randomness the engine ignores the seed (checked with 200 seeds in the tests), so one is enough.
  const settings = luckIsOff(luck) ? { ...fullSettings, seeds: 1, searchSeeds: 1 } : fullSettings;
  const base = `${c.id}:${label}`;
  const fight = scaleFight(c.finale, a);
  const abilities = fight.finaleAbilities;
  const evalSeeds = `${base}:eval`;
  const def = runSeeds(fight, abilities, luck, evalSeeds, settings.seeds);
  const skilledChoices = skilledAbilities(fight, luck, settings, `${base}:search`);
  const skilled = runSeeds(fight, skilledChoices, luck, evalSeeds, settings.seeds);

  // Guards and shields: best-timed Shield Walls only, and what leaving them out costs.
  const shieldKeys = abilities.filter((x) => hasShieldWall(x.abilityId)).map((x) => x.key);
  const guardChoices =
    shieldKeys.length === 0
      ? [...abilities]
      : skilledAbilities(fight, luck, settings, `${base}:search-guard`, (x) =>
          hasShieldWall(x.abilityId),
        );
  const guardTimed =
    shieldKeys.length === 0 ? def : runSeeds(fight, guardChoices, luck, evalSeeds, settings.seeds);
  const noShield =
    shieldKeys.length === 0
      ? def
      : runSeeds(fight, withoutShield(abilities), luck, evalSeeds, settings.seeds);
  const looShield: number[] = [];
  for (const key of shieldKeys) {
    const without = runSeeds(
      fight,
      abilities.filter((x) => x.key !== key),
      luck,
      evalSeeds,
      settings.seeds,
    );
    looShield.push((def.wins - without.wins) / settings.seeds);
  }
  const guardIdx = fight.row.flatMap((slot, i) => (slot.role === 'guard' ? [i] : []));
  const neutral = (only?: number): FightInput => ({
    ...fight,
    row: fight.row.map((slot, i) =>
      slot.role === 'guard' && (only === undefined || only === i) ? neutralGuard(slot) : slot,
    ),
  });
  const noGuard =
    guardIdx.length === 0 ? def : runSeeds(neutral(), abilities, luck, evalSeeds, settings.seeds);
  const looGuard: number[] = [];
  for (const i of guardIdx) {
    const without = runSeeds(neutral(i), abilities, luck, evalSeeds, settings.seeds);
    looGuard.push((def.wins - without.wins) / settings.seeds);
  }

  // Whole week: every stage rolls luck (and the boss hits harder, if the setting says so), so
  // Phase 1 and 2 change the pool the finale starts from. The skilled runs use the timings found
  // above (the same ability keys exist in every week).
  const weekSeeds = Math.max(1, Math.floor(settings.seeds / 2));
  const timingsOf = (list: readonly AbilityChoice[]): Record<string, number> => {
    const t: Record<string, number> = {};
    for (const x of list) if (x.fireAtRound !== undefined) t[x.key] = x.fireAtRound;
    return t;
  };
  const weekWins = (
    timings: Record<string, number>,
    flags: { dropShield?: boolean; neutralGuards?: boolean } = {},
  ): number => {
    let wins = 0;
    for (let s = 0; s < weekSeeds; s++) {
      const week = openRaidWeek(c.boss, c.signed.map(clonePlayer), {
        timings,
        bossAtkBp: a.bossAtkBp,
        hpScaleBp: a.hpScaleBp,
        ...flags,
        ...(luck === undefined ? {} : { luck, luckStages: settings.luckStages }),
      });
      playWholeWeek(
        week,
        createSeededRng(`${base}:week:${s}`),
        createSeededRng(`${base}:loot:${s}`),
      );
      if (week.stages.finale?.cleared === true) wins += 1;
    }
    return wins / weekSeeds;
  };
  const skilledTimings = timingsOf(skilledChoices);
  const pWeek = weekWins({});
  return {
    snapshotWeek: c.snapshotWeek,
    rowSize: fight.row.length,
    guards: guardIdx.length,
    shields: shieldKeys.length,
    pDefault: def.wins / settings.seeds,
    pSkilled: skilled.wins / settings.seeds,
    pGuardTimed: guardTimed.wins / settings.seeds,
    pNoShield: noShield.wins / settings.seeds,
    looShield: mean(looShield),
    pNoGuard: noGuard.wins / settings.seeds,
    looGuard: mean(looGuard),
    pWeek,
    pWeekSkilled: weekWins(skilledTimings),
    pWeekGuardTimed: shieldKeys.length === 0 ? pWeek : weekWins(timingsOf(guardChoices)),
    pWeekNoShield: shieldKeys.length === 0 ? pWeek : weekWins({}, { dropShield: true }),
    pWeekNoGuard: guardIdx.length === 0 ? pWeek : weekWins({}, { neutralGuards: true }),
    knockouts: def.knockouts,
    damageShift: stats.shift,
    damageCv: stats.cv,
    ratioDefault: damageRatio(fight, abilities, luck, `${base}:ratio`),
    ratioSkilled: damageRatio(fight, skilledChoices, luck, `${base}:ratio`),
  };
}

export interface GroupSummary {
  group: string;
  /** Snapshot week (4 or 8) the inputs come from; null for both together. */
  week: number | null;
  /** The boss the inputs are against; null for all four together. */
  boss: string | null;
  inputs: number;
  /** Share of inputs with a win probability of at most 5% or at least 95%. */
  decided: number;
  /** Share of inputs between 15% and 85%. */
  inBand: number;
  /** Average of p x (1 - p) (0.25 is a coin flip, 0 is all or nothing). */
  meanPQ: number;
  /** Average win probability. */
  meanP: number;
  meanSkilled: number;
  /** Mean uplift in points: skilled minus default win probability. */
  uplift: number;
  /** Mean uplift over inputs whose default probability is between 5% and 95%. */
  upliftOpen: number | null;
  /** Share of inputs where skilled timing moves the probability by at least 10 points. */
  upliftOver10: number;
  meanWeekP: number;
  decidedWeek: number;
  inBandWeek: number;
  meanPQWeek: number;
  upliftWeek: number;
  histogram: number[];
  ratioP10: number | null;
  ratioMedian: number | null;
  ratioP90: number | null;
  skilledRatioGain: number;
  /** Mean spread of the finale damage between seeds (standard deviation over mean). */
  damageCv: number;
  /** Mean of the damage shift: boss HP times this keeps the odds centred where they are now. */
  damageShift: number;
  /** Mean creatures knocked out per finale, and as a share of the row. */
  knockouts: number;
  knockoutShare: number;
  /** Share of inputs with at least one guard, and with at least one Shield Wall ability. */
  withGuard: number;
  withShield: number;
  /** Uplift in points from best-timing only the Shield Walls (finale only and whole week). */
  guardUplift: number;
  guardUpliftWeek: number;
  /** Points lost by leaving out every Shield Wall ability (inputs that have one; finale, week). */
  noShieldLoss: number | null;
  noShieldLossWeek: number | null;
  /** Points lost by leaving out one Shield Wall ability (mean over abilities of each input's mean). */
  looShield: number | null;
  /** Points lost by taking the guard role from every guard (inputs that have a guard; finale, week). */
  noGuardLoss: number | null;
  noGuardLossWeek: number | null;
  /** Points lost by taking the role from one guard. */
  looGuard: number | null;
}

function share(values: readonly number[], test: (v: number) => boolean): number {
  return values.length === 0 ? 0 : values.filter(test).length / values.length;
}

export function summarizeGroup(
  group: string,
  measures: readonly CaseMeasure[],
  week: number | null = null,
  boss: string | null = null,
): GroupSummary {
  const p = measures.map((m) => m.pDefault);
  const open = measures.filter((m) => m.pDefault > 0.05 && m.pDefault < 0.95);
  const ratios = measures.map((m) => m.ratioDefault);
  const histogram = new Array<number>(10).fill(0);
  for (const v of p) {
    const bin = Math.min(9, Math.floor(v * 10));
    histogram[bin] = (histogram[bin] ?? 0) + 1;
  }
  const shielded = measures.filter((m) => m.shields > 0);
  const guarded = measures.filter((m) => m.guards > 0);
  const nonNull = (list: readonly (number | null)[]): number | null =>
    mean(list.filter((v): v is number => v !== null));
  return {
    group,
    week,
    boss,
    inputs: measures.length,
    decided: share(p, (v) => v <= 0.05 || v >= 0.95),
    inBand: share(p, (v) => v >= 0.15 && v <= 0.85),
    meanPQ: mean(p.map((v) => v * (1 - v))) ?? 0,
    meanP: mean(p) ?? 0,
    meanSkilled: mean(measures.map((m) => m.pSkilled)) ?? 0,
    uplift: mean(measures.map((m) => m.pSkilled - m.pDefault)) ?? 0,
    upliftOpen: mean(open.map((m) => m.pSkilled - m.pDefault)),
    upliftOver10: share(
      measures.map((m) => m.pSkilled - m.pDefault),
      (v) => v >= 0.1,
    ),
    meanWeekP: mean(measures.map((m) => m.pWeek)) ?? 0,
    inBandWeek: share(
      measures.map((m) => m.pWeek),
      (v) => v >= 0.15 && v <= 0.85,
    ),
    meanPQWeek: mean(measures.map((m) => m.pWeek * (1 - m.pWeek))) ?? 0,
    upliftWeek: mean(measures.map((m) => m.pWeekSkilled - m.pWeek)) ?? 0,
    decidedWeek: share(
      measures.map((m) => m.pWeek),
      (v) => v <= 0.05 || v >= 0.95,
    ),
    histogram,
    ratioP10: percentile(ratios, 10),
    ratioMedian: percentile(ratios, 50),
    ratioP90: percentile(ratios, 90),
    damageCv: mean(measures.map((m) => m.damageCv)) ?? 0,
    damageShift: mean(measures.map((m) => m.damageShift)) ?? 1,
    skilledRatioGain:
      mean(measures.map((m) => m.ratioSkilled / Math.max(1e-9, m.ratioDefault))) ?? 1,
    knockouts: mean(measures.map((m) => m.knockouts)) ?? 0,
    knockoutShare: mean(measures.map((m) => m.knockouts / Math.max(1, m.rowSize))) ?? 0,
    withGuard: measures.length === 0 ? 0 : guarded.length / measures.length,
    withShield: measures.length === 0 ? 0 : shielded.length / measures.length,
    guardUplift: mean(measures.map((m) => m.pGuardTimed - m.pDefault)) ?? 0,
    guardUpliftWeek: mean(measures.map((m) => m.pWeekGuardTimed - m.pWeek)) ?? 0,
    noShieldLoss: mean(shielded.map((m) => m.pDefault - m.pNoShield)),
    noShieldLossWeek: mean(shielded.map((m) => m.pWeek - m.pWeekNoShield)),
    looShield: nonNull(shielded.map((m) => m.looShield)),
    noGuardLoss: mean(guarded.map((m) => m.pDefault - m.pNoGuard)),
    noGuardLossWeek: mean(guarded.map((m) => m.pWeek - m.pWeekNoGuard)),
    looGuard: nonNull(guarded.map((m) => m.looGuard)),
  };
}

export interface LuckSetting {
  label: string;
  /** Undefined: the shipped rules. */
  luck: LuckConfig | undefined;
  /** Boss Attack in basis points of the shipped value (10000 or absent: shipped). */
  bossAtkBp?: number;
  /** Find the boss Attack that knocks out this many creatures per typical finale on average. */
  koTarget?: number;
}

/**
 * Parses `critChanceBp=1500,critBp=5000` over the shipped (all off) luck rules. Two study keys are
 * not luck settings: `bossAtkBp` (boss Attack in basis points of the shipped value, 20000 = double)
 * and `ko` (calibrate boss Attack for that many knockouts per typical finale).
 */
export function parseLuck(text: string): LuckSetting {
  const luck: Record<string, number> = { ...RULES.combat.luck };
  const setting: LuckSetting = { label: text, luck: undefined };
  for (const part of text.split(',')) {
    const [key, value] = part.split('=');
    if (key === undefined || value === undefined || !/^[0-9]{1,6}$/.test(value)) {
      throw new Error(`--luck: cannot read "${part}"`);
    }
    if (key === 'bossAtkBp') {
      if (Number(value) < 1_000 || Number(value) > 1_000_000) {
        throw new Error('--luck: bossAtkBp must be from 1000 to 1000000');
      }
      setting.bossAtkBp = Number(value);
    } else if (key === 'ko') {
      if (Number(value) < 1 || Number(value) > 100) throw new Error('--luck: ko must be 1 to 100');
      setting.koTarget = Number(value);
    } else if (key in luck) {
      luck[key] = Number(value);
    } else {
      throw new Error(`--luck: cannot read "${part}"`);
    }
  }
  setting.luck = luck as unknown as LuckConfig;
  return setting;
}

export interface SettingRow {
  label: string;
  /** What was used: boss Attack and the boss HP retune per group (basis points). */
  bossAtkBp: number;
  hpScaleBp: Record<string, number>;
  groups: GroupSummary[];
}

export interface LuckStudyResult {
  settings: LuckStudySettings;
  retune: boolean;
  rows: SettingRow[];
  cases: number;
}

/**
 * Finds the boss Attack (basis points of shipped) for which a typical finale knocks out `target`
 * creatures on average, with the setting's luck and default ability timings. Bisection on the
 * logarithm of the multiplier over a sample of the typical inputs.
 */
export function calibrateKnockouts(
  cases: readonly LuckCase[],
  luck: LuckConfig | undefined,
  target: number,
  settings: LuckStudySettings,
): number {
  const typical = cases.filter((c) => groupOf(c.signedUp) === 'typical');
  const step = Math.max(1, Math.ceil(typical.length / 24));
  const sample = typical.filter((_, i) => i % step === 0);
  if (sample.length === 0) return 10_000;
  const seeds = luckIsOff(luck) ? 1 : 8;
  const kos = (bp: number): number =>
    mean(
      sample.map(
        (c) =>
          runSeeds(
            scaleFight(c.finale, { bossAtkBp: bp, hpScaleBp: 10_000 }),
            c.finale.finaleAbilities,
            luck,
            `${settings.seed}:ko:${c.id}:${bp}`,
            seeds,
          ).knockouts,
      ),
    ) ?? 0;
  let lo = 10_000;
  let hi = 1_000_000;
  if (kos(lo) >= target) return lo;
  if (kos(hi) < target) return hi;
  for (let i = 0; i < 14; i++) {
    const mid = Math.round(Math.sqrt(lo * hi));
    if (kos(mid) < target) lo = mid;
    else hi = mid;
  }
  return Math.round(Math.sqrt(lo * hi));
}

export function runLuckStudy(
  settings: LuckStudySettings,
  luckSettings: readonly LuckSetting[],
  options: { retune?: boolean } = {},
): LuckStudyResult {
  const cases = buildCases(settings);
  const retune = options.retune === true;
  const all: LuckSetting[] = [{ label: 'off (shipped rules)', luck: undefined }, ...luckSettings];
  const rows = all.map((setting, k): SettingRow => {
    const bossAtkBp =
      setting.koTarget !== undefined
        ? calibrateKnockouts(cases, setting.luck, setting.koTarget, settings)
        : (setting.bossAtkBp ?? 10_000);
    const probe: AppliedSetting = { luck: setting.luck, bossAtkBp, hpScaleBp: 10_000 };
    // Damage first (cheap): the mean shift per group says how much boss HP to move to keep the odds centred.
    const stats = cases.map((c) => damageStats(c, probe, settings, setting.label));
    const hpScaleBp: Record<string, number> = {};
    for (const g of ['small', 'typical', 'large']) {
      const shifts = cases.flatMap((c, i) =>
        groupOf(c.signedUp) === g ? [(stats[i] as DamageStats).shift] : [],
      );
      hpScaleBp[g] = retune && k > 0 ? Math.round((mean(shifts) ?? 1) * 10_000) : 10_000;
    }
    const byGroup = new Map<string, CaseMeasure[]>();
    const typicalByBoss = new Map<string, CaseMeasure[]>();
    cases.forEach((c, i) => {
      const g = groupOf(c.signedUp);
      const applied: AppliedSetting = { ...probe, hpScaleBp: hpScaleBp[g] ?? 10_000 };
      const list = byGroup.get(g) ?? [];
      const m = measureCase(c, applied, settings, setting.label, stats[i] as DamageStats);
      list.push(m);
      byGroup.set(g, list);
      if (g === 'typical')
        typicalByBoss.set(c.boss.id, [...(typicalByBoss.get(c.boss.id) ?? []), m]);
    });
    const groups: GroupSummary[] = [];
    for (const g of ['small', 'typical', 'large']) {
      const list = byGroup.get(g);
      if (list === undefined) continue;
      groups.push(summarizeGroup(g, list));
      for (const w of [4, 8]) {
        const part = list.filter((m) => m.snapshotWeek === w);
        if (part.length > 0) groups.push(summarizeGroup(g, part, w));
      }
    }
    for (const [boss, list] of typicalByBoss)
      groups.push(summarizeGroup('typical', list, null, boss));
    return { label: setting.label, bossAtkBp, hpScaleBp, groups };
  });
  return { settings, retune, rows, cases: cases.length };
}

const pct = (v: number | null, digits = 0): string =>
  v === null ? 'n/a' : `${(v * 100).toFixed(digits)}%`;
const pts = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}`);

export function formatLuckReport(result: LuckStudyResult): string {
  const lines: string[] = [];
  const s = result.settings;
  lines.push(
    `Luck study: ${result.cases} finale inputs, ${s.seeds} seeds each (seed "${s.seed}", search ${s.searchSeeds} seeds x ${s.passes} passes${result.retune ? ', boss HP retuned per group to keep the mean damage' : ''}).`,
  );
  for (const row of result.rows) {
    const hp = Object.entries(row.hpScaleBp)
      .filter(([, bp]) => bp !== 10_000)
      .map(([g, bp]) => `${g} x${(bp / 10_000).toFixed(3)}`)
      .join(', ');
    lines.push(
      '',
      `== ${row.label}${row.bossAtkBp === 10_000 ? '' : ` (boss Attack x${(row.bossAtkBp / 10_000).toFixed(2)})`}${hp === '' ? '' : ` (boss HP ${hp})`}`,
    );
    for (const g of row.groups) {
      const name = `${g.group}${g.week === null ? '' : ` week ${g.week}`}${g.boss === null ? '' : ` vs ${g.boss}`}`;
      lines.push(
        `${name} (${g.inputs} inputs): decided ${pct(g.decided)}, in 15-85% band ${pct(g.inBand)}, mean p(1-p) ${g.meanPQ.toFixed(3)}, mean p ${pct(g.meanP)}`,
        `  skilled timing: mean p ${pct(g.meanSkilled)}, uplift ${(g.uplift * 100).toFixed(1)} points (open inputs ${g.upliftOpen === null ? 'n/a' : `${(g.upliftOpen * 100).toFixed(1)} points`}), >= 10 points on ${pct(g.upliftOver10)} of inputs`,
        `  damage / HP at the finale: p10 ${g.ratioP10?.toFixed(2)}, median ${g.ratioMedian?.toFixed(2)}, p90 ${g.ratioP90?.toFixed(2)}; seed-to-seed spread of damage ${pct(g.damageCv, 1)}, setting changes damage by ${pct(g.damageShift - 1, 1)} on average; skilled timing x${g.skilledRatioGain.toFixed(2)}`,
        `  knockouts per finale ${g.knockouts.toFixed(1)} (${pct(g.knockoutShare, 1)} of the row)`,
        `  guards (${pct(g.withGuard)} of inputs have one, ${pct(g.withShield)} a Shield Wall): best-timed Shield Walls ${pts(g.guardUplift)} points (week ${pts(g.guardUpliftWeek)}); leaving out all Shield Walls ${pts(g.noShieldLoss)} (week ${pts(g.noShieldLossWeek)}), one ${pts(g.looShield)}; guard role removed ${pts(g.noGuardLoss)} (week ${pts(g.noGuardLossWeek)}), one guard ${pts(g.looGuard)}`,
        `  whole week (luck in ${s.luckStages.join(', ')}): mean p ${pct(g.meanWeekP)}, decided ${pct(g.decidedWeek)}, in 15-85% band ${pct(g.inBandWeek)}, mean p(1-p) ${g.meanPQWeek.toFixed(3)}, skilled timing uplift ${(g.upliftWeek * 100).toFixed(1)} points`,
        `  win probability histogram (0-10%, ..., 90-100%): ${g.histogram.join(' ')}`,
      );
    }
  }
  return lines.join('\n');
}
