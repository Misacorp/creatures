import { parseArgs } from 'node:util';
import { ARCHETYPES, ARCHETYPE_CONFIG, DEFAULT_MIX, type ArchetypeId } from './archetypes';
import { gearMetrics, wornItems } from './analysis';
import { runEconomy, type EconomyResult, type WeekRecord } from './economy';
import { TARGETS, evaluateTargets, formatValue, describeRequirement } from './targets';
import { applyOverrides } from './tune';
import { mean } from './util';

// The test tsconfig has no Node types; this global exists in Node.
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

const USAGE = `Usage: node packages/sim/scripts/gear.mjs [--set gear.rolls.primary.atk.min=400,...] [--sims N] [--weeks N] [--seed <string>]
Plays N default-server economy sims with gear and N without (same seeds), and prints the gear and crafting targets and a weekly table per archetype. The overrides are the same as tune.mjs's (--set path=integer, array items by index). The raid targets need the whole run: use tune.mjs --full with the same --set.`;

function weekly(
  sims: readonly EconomyResult[],
  archetype: ArchetypeId,
  week: number,
): WeekRecord[] {
  return sims.flatMap((s) =>
    s.players
      .filter((p) => p.archetype === archetype)
      .flatMap((p) => p.weeks.filter((w) => w.week === week)),
  );
}

/** Prints the gear targets and the weekly table; returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  let restore: () => void = () => undefined;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        set: { type: 'string' },
        sims: { type: 'string' },
        weeks: { type: 'string' },
        seed: { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values['help'] === true) throw new Error(USAGE);
    const seed = typeof values['seed'] === 'string' ? values['seed'] : 'leet';
    const sims = typeof values['sims'] === 'string' ? Number(values['sims']) : 24;
    const weeks = typeof values['weeks'] === 'string' ? Number(values['weeks']) : 12;
    if (!Number.isInteger(sims) || sims < 1 || sims > 500)
      throw new Error('--sims must be 1 to 500');
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104) {
      throw new Error('--weeks must be 1 to 104');
    }
    if (typeof values['set'] === 'string') restore = applyOverrides(values['set']);

    const run = (gear: boolean): EconomyResult[] =>
      Array.from({ length: sims }, (_, k) =>
        runEconomy({
          seed: `${seed}:econ:10:${k}`,
          weeks,
          mix: DEFAULT_MIX,
          snapshotWeeks: gear ? [weeks] : [],
          gear,
        }),
      );
    const on = run(true);
    const off = run(false);
    const { metrics } = gearMetrics(on, off, weeks);
    const gearTargets = TARGETS.filter((t) => t.id.startsWith('gear-'));
    for (const t of evaluateTargets(gearTargets, metrics)) {
      const mark = t.status === 'pass' ? 'ok  ' : 'FAIL';
      io.out(
        `${mark} ${t.id}: ${t.measured === null ? 'n/a' : formatValue(t.measured, t.unit)} (needs ${describeRequirement(t)})`,
      );
    }
    io.out(
      `daily Essence held at week 12: ${(metrics['gear.dailyEssenceWeek12'] ?? 0).toFixed(0)}`,
    );
    io.out('');
    io.out(
      'Worn items on the team at the last week (rarity mix, level, enchanted, power, bag, blueprints, parts):',
    );
    for (const r of wornItems(on)) {
      const p = (x: number): string => `${(x * 100).toFixed(0)}%`;
      io.out(
        `  ${r.archetype.padEnd(8)} common ${p(r.rarity.common)} rare ${p(r.rarity.rare)} epic ${p(r.rarity.epic)} festival ${p(r.rarity.festival)} | level ${r.level.toFixed(1)} | enchanted ${p(r.enchanted)} | power +${r.power.toFixed(1)} | bag ${r.bag.toFixed(1)} | blueprints ${r.blueprints.toFixed(1)} | scrap ${r.scrap.toFixed(0)} shards ${r.shards.toFixed(0)} glimmer ${r.glimmer.toFixed(1)}`,
      );
    }
    for (const a of ARCHETYPES) {
      io.out('');
      io.out(
        `${ARCHETYPE_CONFIG[a].label}: week | gear power | share | team power (today) | upgrade levels | crafted | skill | Essence held (today) | Essence spent on gear | scrap`,
      );
      for (let week = 1; week <= weeks; week++) {
        const w = weekly(on, a, week);
        if (w.length === 0) continue;
        const avg = (f: (r: WeekRecord) => number): number => mean(w.map(f)) ?? 0;
        const wOff = weekly(off, a, week);
        const avgOff = (f: (r: WeekRecord) => number): number => mean(wOff.map(f)) ?? 0;
        const power = avg((r) => r.top3Power);
        io.out(
          `  ${String(week).padStart(2)} | ${avg((r) => r.gearPower)
            .toFixed(1)
            .padStart(5)} | ${((avg((r) => r.gearPower) / (power || 1)) * 100)
            .toFixed(1)
            .padStart(5)}% | ${power.toFixed(0)} (${avgOff((r) => r.top3Power).toFixed(0)}) | ${avg(
            (r) => r.gearLevels,
          ).toFixed(
            1,
          )} | ${avg((r) => r.crafted).toFixed(1)} | ${avg((r) => r.skillLevel).toFixed(1)} | ${avg(
            (r) => r.essence,
          ).toFixed(
            0,
          )} (${avgOff((r) => r.essence).toFixed(0)}) | ${avg((r) => r.essenceSpentGear).toFixed(0)} | ${avg(
            (r) => r.scrap,
          ).toFixed(0)}`,
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
