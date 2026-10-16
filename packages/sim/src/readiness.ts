import {
  RULES,
  READINESS_BANDS,
  content,
  createSeededRng,
  forecastMarginBp,
  readinessBand,
  type ReadinessBand,
} from '@creatures/game';
import {
  forecastFinale,
  forecastWeek,
  simulateFight,
  type AbilityChoice,
  type FightInput,
} from '@creatures/engine';
import { DEFAULT_MIX, DEFAULT_SERVER_SIZE, scaleMix } from './archetypes';
import { chooseSignUps, runEconomy } from './economy';
import { skilledAbilities } from './luck';
import { fightFor, openRaidWeek, playStage, playWholeWeek, type RaidWeek } from './raid';
import { clonePlayer } from './state';
import { mean, percentile } from './util';

/**
 * Calibration of the readiness band (docs/design/progression.md, item 5). For many fixed finale
 * inputs (roster, boss at the sweep rank (`sweepRank`) with the pool scaled up and down, Phase 1 and 2
 * played) it records
 * - the forecast margin the server would show: mean damage over the HP left, `forecastFinale` with
 *   fresh seeds and every ability at its default round;
 * - the real win rate over many other seeds with default timings, and with "skilled-ish" timings:
 *   the abilities of a third of the players (every third one) timed by a short greedy search, the
 *   rest at default, which is what a table where a few players press at the right moment looks
 *   like (the search knows the whole roster, so even this is generous); half the players is shown
 *   as a sensitivity check;
 * - the same for the whole week from Monday (Phase 1, Phase 2 and the finale), with the forecast
 *   of `forecastWeek` (the HP left at the finale is estimated from the two phases).
 * Then it prints the win rate of each band with the thresholds in `RULES.progression.readiness`
 * and the thresholds that would put the band edges at chosen win rates.
 */

export interface ReadinessSettings {
  seed: string;
  /** Economy sims per server size (each gives rosters at weeks 4 and 8). */
  economySims: number;
  counts: number[];
  /**
   * Boss HP of each input in basis points of the sweep-rank boss (10000: as shipped). A rank is
   * a big step on the curve, so ranks alone would leave the middle of the scale nearly empty, where the bands
   * are decided; scaling the pool fills it in.
   */
  hpScalesBp: number[];
  /** Win-rate seeds per input and timing. */
  seeds: number;
  /** Seeds per candidate in the timing search. */
  searchSeeds: number;
  /** At most this many inputs (a fixed, evenly spread subset); 0 for all. */
  maxCases: number;
}

export function defaultReadinessSettings(mode: 'full' | 'quick'): ReadinessSettings {
  return mode === 'quick'
    ? {
        seed: 'readiness',
        economySims: 1,
        counts: [5, 10],
        hpScalesBp: [8_000, 10_000, 12_000],
        seeds: 12,
        searchSeeds: 3,
        maxCases: 12,
      }
    : {
        seed: 'readiness',
        economySims: 3,
        counts: [5, 10, 15],
        hpScalesBp: [6_500, 7_500, 8_500, 9_300, 10_000, 10_800, 11_800, 13_000, 15_000, 18_000],
        seeds: 40,
        searchSeeds: 4,
        maxCases: 400,
      };
}

export interface ReadinessCase {
  id: string;
  signedUp: number;
  boss: string;
  rank: number;
  /** Finale forecast margin in basis points (after Saturday). */
  marginBp: number;
  /** Whole-week forecast margin in basis points (from Monday). */
  weekMarginBp: number;
  /** Finale win rates with default timings, skilled-ish timings (a third of the players) and half of them timing well (0 to 1). */
  pDefault: number;
  pSkilled: number;
  pHalf: number;
  /** Whole-week win rates with the same three timings. */
  pWeekDefault: number;
  pWeekSkilled: number;
  pWeekHalf: number;
}

function winRate(
  fight: FightInput,
  abilities: readonly AbilityChoice[],
  seedBase: string,
  seeds: number,
): number {
  let wins = 0;
  for (let s = 0; s < seeds; s++) {
    const r = simulateFight(
      { ...fight, finaleAbilities: abilities },
      createSeededRng(`${seedBase}:${s}`),
    );
    if (r.cleared) wins += 1;
  }
  return wins / seeds;
}

function timingsOf(list: readonly AbilityChoice[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const x of list) if (x.fireAtRound !== undefined) t[x.key] = x.fireAtRound;
  return t;
}

/** Builds the sample of inputs and measures every one (see the header). */
export function buildReadinessCases(settings: ReadinessSettings): ReadinessCase[] {
  const luck = RULES.combat.luck;
  const all: { id: string; make: () => ReadinessCase }[] = [];
  for (const count of settings.counts) {
    for (let k = 0; k < settings.economySims; k++) {
      const econ = runEconomy({
        seed: `${settings.seed}:econ:${count}:${k}`,
        weeks: 8,
        mix: count === DEFAULT_SERVER_SIZE ? DEFAULT_MIX : scaleMix(count),
        snapshotWeeks: [4, 8],
      });
      for (const snap of econ.snapshots) {
        for (const boss of content.bosses) {
          for (const hpScaleBp of settings.hpScalesBp) {
            const base = `${settings.seed}:case:${count}:${k}:${snap.week}:${boss.id}:${hpScaleBp}`;
            all.push({
              id: base,
              make: () => {
                const signed = chooseSignUps(
                  snap.players.map(clonePlayer),
                  createSeededRng(`${base}:signup`),
                  createSeededRng(`${base}:order`),
                );
                if (signed.length === 0) throw new Error('empty');
                const probe = openRaidWeek(boss, signed.map(clonePlayer), { luck });
                return measure(base, boss.id, signed, probe.rank, hpScaleBp, settings);
              },
            });
          }
        }
      }
    }
  }
  // An even, fixed subset when there are more inputs than wanted.
  const step = settings.maxCases > 0 ? Math.max(1, Math.floor(all.length / settings.maxCases)) : 1;
  const picked = all.filter((_, i) => i % step === 0).slice(0, settings.maxCases || undefined);
  const out: ReadinessCase[] = [];
  for (const c of picked) {
    try {
      out.push(c.make());
    } catch {
      // A snapshot where nobody signed up: skipped.
    }
  }
  return out;
}

function measure(
  base: string,
  bossId: string,
  signed: ReturnType<typeof chooseSignUps>,
  rank: number,
  hpScaleBp: number,
  settings: ReadinessSettings,
): ReadinessCase {
  const luck = RULES.combat.luck;
  const boss = content.bosses.find((b) => b.id === bossId);
  if (boss === undefined) throw new Error(`unknown boss ${bossId}`);
  const fresh = (): RaidWeek =>
    openRaidWeek(boss, signed.map(clonePlayer), { rank, luck, hpScaleBp });

  // Whole-week forecast from Monday: the finale damage over the HP the finale is expected to start
  // with (`forecastWeek`), so one set of thresholds fits Monday and Saturday alike.
  const weekStart = fresh();
  const weekForecast = forecastWeek(
    {
      phase1: fightFor(weekStart, 'phase1').fight,
      phase2: fightFor(weekStart, 'phase2').fight,
      finale: fightFor(weekStart, 'finale').fight,
    },
    createSeededRng(`${base}:wf`),
  );
  const weekMarginBp = forecastMarginBp(weekForecast);

  // Phase 1 and 2 played, then the finale input.
  const week = fresh();
  playStage(week, 'phase1', createSeededRng(`${base}:p1`), createSeededRng(`${base}:l1`));
  playStage(week, 'phase2', createSeededRng(`${base}:p2`), createSeededRng(`${base}:l2`));
  const fight = fightFor(week, 'finale').fight;
  const forecast = forecastFinale(fight, createSeededRng(`${base}:fc`));
  const marginBp = forecastMarginBp(forecast);

  // "Skilled-ish": the abilities of every third player get a timing search (every second for the
  // sensitivity check).
  const owners = [...new Set(fight.finaleAbilities.map((a) => a.playerId))];
  const timed = (every: number): AbilityChoice[] => {
    const players = new Set(owners.filter((_, i) => i % every === 0));
    return skilledAbilities(
      fight,
      luck,
      { searchSeeds: settings.searchSeeds, passes: 1 },
      `${base}:search${every}`,
      (choice) => players.has(choice.playerId),
    );
  };
  const skilled = timed(3);
  const half = timed(2);
  const defaults = fight.finaleAbilities;
  const pDefault = winRate(fight, defaults, `${base}:eval`, settings.seeds);
  const pSkilled = winRate(fight, skilled, `${base}:eval`, settings.seeds);
  const pHalf = winRate(fight, half, `${base}:eval`, settings.seeds);

  const weekSeeds = Math.max(4, Math.floor(settings.seeds / 2));
  const weekWins = (timings: Record<string, number>): number => {
    let wins = 0;
    for (let s = 0; s < weekSeeds; s++) {
      const w = openRaidWeek(boss, signed.map(clonePlayer), { rank, luck, timings, hpScaleBp });
      playWholeWeek(w, createSeededRng(`${base}:w:${s}`), createSeededRng(`${base}:wl:${s}`));
      if (w.stages.finale?.cleared === true) wins += 1;
    }
    return wins / weekSeeds;
  };
  return {
    id: base,
    signedUp: signed.length,
    boss: bossId,
    rank,
    marginBp,
    weekMarginBp,
    pDefault,
    pSkilled,
    pHalf,
    pWeekDefault: weekWins({}),
    pWeekSkilled: weekWins(timingsOf(skilled)),
    pWeekHalf: weekWins(timingsOf(half)),
  };
}

export interface BandRow {
  band: ReadinessBand;
  inputs: number;
  /** Mean win rate of the inputs in the band. */
  pDefault: number | null;
  pSkilled: number | null;
  /** Lowest and highest skilled-ish win rate in the band (10th and 90th percentile). */
  skilledP10: number | null;
  skilledP90: number | null;
}

/** Win rates per band for a list of (margin, default win rate, skilled-ish win rate) points. */
export function bandRows(
  points: readonly { marginBp: number; pDefault: number; pSkilled: number }[],
  bandOf: (marginBp: number) => ReadinessBand = (m) => readinessBand({ damage: m, hpLeft: 10_000 }),
): BandRow[] {
  return READINESS_BANDS.map((band) => {
    const rs = points.filter((p) => bandOf(p.marginBp) === band);
    return {
      band,
      inputs: rs.length,
      pDefault: mean(rs.map((r) => r.pDefault)),
      pSkilled: mean(rs.map((r) => r.pSkilled)),
      skilledP10: percentile(
        rs.map((r) => r.pSkilled),
        10,
      ),
      skilledP90: percentile(
        rs.map((r) => r.pSkilled),
        90,
      ),
    };
  });
}

/**
 * The margin at which the skilled-ish win rate crosses `target` (0 to 1), by isotonic smoothing of
 * the cases sorted by margin (pool-adjacent-violators), then interpolating between the two
 * neighbouring points. Null if the data never reaches it.
 */
export function marginAtWinRate(
  points: readonly { marginBp: number; p: number }[],
  target: number,
): number | null {
  const sorted = [...points].sort((a, b) => a.marginBp - b.marginBp);
  const blocks: { sum: number; n: number; lo: number; hi: number }[] = [];
  for (const pt of sorted) {
    blocks.push({ sum: pt.p, n: 1, lo: pt.marginBp, hi: pt.marginBp });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a === undefined || b === undefined || a.sum / a.n <= b.sum / b.n) break;
      blocks.splice(blocks.length - 2, 2, {
        sum: a.sum + b.sum,
        n: a.n + b.n,
        lo: a.lo,
        hi: b.hi,
      });
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i] as (typeof blocks)[number];
    if (b.sum / b.n >= target) {
      const prev = blocks[i - 1];
      if (prev === undefined) return Math.round(b.lo);
      const p0 = prev.sum / prev.n;
      const p1 = b.sum / b.n;
      const x0 = (prev.lo + prev.hi) / 2;
      const x1 = (b.lo + b.hi) / 2;
      return Math.round(p1 === p0 ? x1 : x0 + ((target - p0) / (p1 - p0)) * (x1 - x0));
    }
  }
  return null;
}

const pct = (x: number | null, d = 0): string => (x === null ? 'n/a' : `${(x * 100).toFixed(d)}%`);

export function formatReadinessReport(cases: readonly ReadinessCase[]): string {
  const lines: string[] = [];
  const r = RULES.progression.readiness;
  lines.push(
    `Readiness calibration: ${cases.length} finale inputs. Thresholds in the rules: even from ${r.evenFromBp}, likely from ${r.likelyFromBp}, strong from ${r.strongFromBp} (margin in basis points, 10000 = exactly enough damage).`,
  );
  type Point = { marginBp: number; pDefault: number; pSkilled: number; pHalf: number };
  const show = (title: string, points: Point[]): void => {
    lines.push('', title);
    lines.push(
      'band      | inputs | default win | skilled-ish win (a third) | skilled-ish p10 to p90 | half the players',
    );
    for (const b of bandRows(points)) {
      const rs = points.filter(
        (p) => readinessBand({ damage: p.marginBp, hpLeft: 10_000 }) === b.band,
      );
      lines.push(
        `${b.band.padEnd(9)} | ${String(b.inputs).padStart(6)} | ${pct(b.pDefault).padStart(11)} | ${pct(b.pSkilled).padStart(25)} | ${pct(b.skilledP10)} to ${pct(b.skilledP90)} | ${pct(mean(rs.map((x) => x.pHalf)))}`,
      );
    }
    const at = (key: 'pDefault' | 'pSkilled' | 'pHalf', target: number): string =>
      String(
        marginAtWinRate(
          points.map((p) => ({ marginBp: p.marginBp, p: p[key] })),
          target,
        ) ?? 'n/a',
      );
    lines.push(
      'margin (bp) where the win rate reaches:     15%      30%      50%      70%      90%',
    );
    for (const [label, key] of [
      ['default timing', 'pDefault'],
      ['skilled-ish (a third)', 'pSkilled'],
      ['half the players', 'pHalf'],
    ] as const) {
      lines.push(
        `  ${label.padEnd(24)} ${[0.15, 0.3, 0.5, 0.7, 0.9].map((t) => at(key, t).padStart(8)).join(' ')}`,
      );
    }
  };
  show(
    'After Saturday (forecast of the finale against the HP left):',
    cases.map((c) => ({
      marginBp: c.marginBp,
      pDefault: c.pDefault,
      pSkilled: c.pSkilled,
      pHalf: c.pHalf,
    })),
  );
  show(
    'From Monday (`forecastWeek`: finale damage over the HP the finale should start with; win rate of the whole week):',
    cases.map((c) => ({
      marginBp: c.weekMarginBp,
      pDefault: c.pWeekDefault,
      pSkilled: c.pWeekSkilled,
      pHalf: c.pWeekHalf,
    })),
  );
  return lines.join('\n');
}
