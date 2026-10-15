import { parseArgs } from 'node:util';
import { analyseLongRun } from './ladder';
import { LONG_RUN_GROUPS, LONG_RUN_WEEKS } from './ladder';
import { DEFAULT_MIX, DEFAULT_SERVER_SIZE, scaleMix } from './archetypes';
import { runEconomy } from './economy';
import { content, RULES } from '@creatures/game';
import { defaultSettings, runEconomies, runSimulation } from './run';
import { runSweep } from './sweep';
import { describeRequirement, formatValue } from './targets';
import { applyOverrides } from './tune';

// The test tsconfig has no Node types; both globals exist in Node.
declare const console: { log(text: string): void; error(text: string): void };

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const defaultIo: Io = {
  out: (text) => {
    console.log(text);
  },
  err: (text) => {
    console.error(text);
  },
};

const USAGE = `Usage: node packages/sim/scripts/tune.mjs [--set raid.scaling.rankStepBp=3000,progression.seasonResetRanks=1,boss.thornmother.baseHp=4300] [--long N] [--seed <string>] [--full] [--calibrate ROUNDS [--seeds N] [--target 0.5] [--slope 3]]
Tries tuning overrides without editing files. Default: long-run servers only (N per size, default 20). --full also runs the whole simulator and lists every target; --sweep does the same with small long-run and pity sims (faster, for tuning boss HP).`;

/**
 * Boss HP calibration: fits one base HP per boss and one head-count exponent so every boss wins about
 * `target` (default half) of its finales at 5, 10 and 15 players (typical rosters at the rank the old
 * per-level rule would have picked). Each round runs the raid sweep and moves ln(HP) by
 * (win rate - target) / `slope` per point, the rule of thumb the earlier balance passes found (1% more
 * HP is about 3 points of win rate near 50%; with phase floors and a high win rate it is about 2),
 * fitted per boss and for the exponent by least squares on the 5, 10 and 15 player cells. Prints the
 * settings to copy into the content and the rules; it does not write any file.
 */
function calibrate(
  rounds: number,
  seed: string,
  seedCount: number,
  io: Io,
  target = 0.5,
  slope = 3,
): void {
  const seeds = Array.from({ length: seedCount }, (_, i) => (i === 0 ? seed : `${seed}-${i}`));
  const prepared = seeds.map((sd) => {
    const settings = defaultSettings('full', { seed: sd });
    return { sd, settings, snapshots: runEconomies(settings, { baseline: false }).snapshots };
  });
  const sizes = [5, 10, 15];
  for (let round = 1; round <= rounds; round++) {
    const sweep = {
      records: prepared.flatMap(
        (p) =>
          runSweep({
            seed: p.sd,
            runs: p.settings.runsPerCell,
            counts: sizes,
            snapshots: p.snapshots,
          }).records,
      ),
    };
    // Rows: (boss, size) with ln N and the wanted ln HP change.
    const rows: { boss: string; lnN: number; want: number; win: number }[] = [];
    for (const boss of content.bosses) {
      for (const count of sizes) {
        const rs = sweep.records.filter((r) => r.boss === boss.id && r.count === count);
        if (rs.length === 0) continue;
        const win = rs.filter((r) => r.win).length / rs.length;
        const n = rs.reduce((a, r) => a + r.signedUp, 0) / rs.length;
        rows.push({
          boss: boss.id,
          lnN: Math.log(n),
          want: Math.log(1 + (win - target) / slope),
          win,
        });
      }
    }
    // Per boss: ln m = ln beta + d * ln N over its three sizes. Move the boss's exponent by d and
    // its base HP so the mean wanted change is met at the cell sizes (damped by 0.7 each round).
    const summary: string[] = [];
    for (const boss of content.bosses) {
      const mine = rows.filter((r) => r.boss === boss.id);
      if (mine.length === 0) continue;
      const mx = mine.reduce((a, r) => a + r.lnN, 0) / mine.length;
      const my = mine.reduce((a, r) => a + r.want, 0) / mine.length;
      let num = 0;
      let den = 0;
      for (const r of mine) {
        num += (r.lnN - mx) * (r.want - my);
        den += (r.lnN - mx) ** 2;
      }
      const d = den === 0 ? 0 : num / den;
      const old = boss.hpExponent ?? RULES.raid.scaling.hpExponent;
      const e = old.num / old.den;
      const eNew = Math.min(1.6, Math.max(0.8, Math.round((e + 0.7 * d) * 100) / 100));
      boss.hpExponent = { num: Math.round(eNew * 100), den: 100 };
      const change = eNew - e;
      const meanWant = mine.reduce((a, r) => a + (r.want - change * r.lnN), 0) / mine.length;
      boss.baseHp = Math.max(100, Math.round(boss.baseHp * Math.exp(0.7 * meanWant)));
      summary.push(
        `${boss.id.slice(0, 5)} e=${e.toFixed(2)} ` +
          mine.map((r) => `${Math.round(Math.exp(r.lnN))}p:${(r.win * 100).toFixed(0)}`).join(' '),
      );
    }
    io.out(`round ${round}: ${summary.join(' | ')}`);
  }
  for (const boss of content.bosses) {
    io.out(
      `${boss.id} baseHp ${boss.baseHp} hpExponent ${boss.hpExponent?.num ?? '-'}/${boss.hpExponent?.den ?? '-'}`,
    );
  }
}

/** Long-run summary lines for the overrides (and optionally the whole run's failing targets). */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  let restore: () => void = () => undefined;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        set: { type: 'string' },
        long: { type: 'string' },
        seed: { type: 'string' },
        full: { type: 'boolean' },
        sweep: { type: 'boolean' },
        calibrate: { type: 'string' },
        seeds: { type: 'string' },
        target: { type: 'string' },
        slope: { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values['help'] === true) throw new Error(USAGE);
    const seed = typeof values['seed'] === 'string' ? values['seed'] : 'leet';
    const long = typeof values['long'] === 'string' ? Number(values['long']) : 20;
    if (!Number.isInteger(long) || long < 1 || long > 500)
      throw new Error('--long must be 1 to 500');
    if (typeof values['set'] === 'string') restore = applyOverrides(values['set']);

    if (typeof values['calibrate'] === 'string') {
      const rounds = Number(values['calibrate']);
      if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20)
        throw new Error('--calibrate must be 1 to 20');
      const seedCount = typeof values['seeds'] === 'string' ? Number(values['seeds']) : 1;
      if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 12)
        throw new Error('--seeds must be 1 to 12');
      const target = typeof values['target'] === 'string' ? Number(values['target']) : 0.5;
      if (!(target > 0 && target < 1)) throw new Error('--target must be between 0 and 1');
      const slope = typeof values['slope'] === 'string' ? Number(values['slope']) : 3;
      if (!(slope > 0 && slope <= 20)) throw new Error('--slope must be above 0 and at most 20');
      calibrate(rounds, seed, seedCount, io, target, slope);
      return 0;
    }

    const groups = LONG_RUN_GROUPS.map((g) => ({
      id: g.id,
      sims: Array.from({ length: long }, (_, k) =>
        runEconomy({
          seed: `${seed}:long:${g.count}:${k}`,
          weeks: LONG_RUN_WEEKS,
          mix: g.count === DEFAULT_SERVER_SIZE ? DEFAULT_MIX : scaleMix(g.count),
          snapshotWeeks: [],
        }),
      ),
    }));
    const { stats } = analyseLongRun(groups);
    const pct = (x: number | null): string => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
    for (const g of stats) {
      io.out(
        `${g.id.padEnd(8)} win ${pct(g.winRate)} (normal ${pct(g.normalWinRate)}, festival ${pct(g.festivalWinRate)}, wk1-10 ${pct(g.winRateEarly)}, wk11+ ${pct(g.winRateLate)}) ` +
          `gap ${g.medianRankUpGap ?? 'n/a'} streak>4 ${pct(g.lossStreakShare)} longest ${g.longestLossStreak} ` +
          `rank place ${g.placementRank} -> ${g.finalRankMedian} (${g.finalRankP10}-${g.finalRankP90})`,
      );
    }
    if (values['full'] === true || values['sweep'] === true) {
      const base = defaultSettings('full', { seed });
      // --sweep keeps the raid sweep and the economy sims, and shrinks the slow long-run and pity sims.
      const settings = values['sweep'] === true ? { ...base, longRunSims: 2, pitySims: 4 } : base;
      const out = runSimulation(settings);
      for (const b of out.analysis.typicalByBoss) {
        const cells = out.analysis.cells
          .filter((c) => c.boss === b.boss)
          .map((c) => `${c.count}p ${pct(c.finaleWinRate)} (P2 ${pct(c.phase2ClearRate)})`)
          .join(', ');
        io.out(`  ${b.boss.padEnd(16)} typical ${pct(b.finaleWinRate)}  ${cells}`);
      }
      io.out(
        `  creatures (contribution vs rarity median): ${out.analysis.creatures
          .map(
            (c) =>
              `${c.name}${c.festival ? '*' : ''} ${c.ratio === null ? 'n/a' : c.ratio.toFixed(2)}`,
          )
          .join(', ')}`,
      );
      const fails = out.evaluation.filter((t) => t.status === 'fail');
      io.out(`full run: ${out.evaluation.length - fails.length} passed, ${fails.length} failed`);
      for (const t of out.evaluation) {
        const mark = t.status === 'pass' ? 'ok  ' : 'FAIL';
        io.out(
          `  ${mark} ${t.id}: ${t.measured === null ? 'n/a' : formatValue(t.measured, t.unit)} (needs ${describeRequirement(t)})`,
        );
      }
    }
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  } finally {
    restore();
  }
}
