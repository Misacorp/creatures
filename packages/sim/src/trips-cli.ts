import { parseArgs } from 'node:util';
import { RULES } from '@creatures/game';
import { ARCHETYPES, ARCHETYPE_CONFIG, DEFAULT_MIX, type ArchetypeId } from './archetypes';
import { TODAY_CASUAL_SPECIES, tripMetrics } from './analysis';
import { runEconomy, type EconomyResult, type WeekRecord } from './economy';
import { TARGETS, evaluateTargets, formatValue, describeRequirement } from './targets';
import { applyOverrides } from './tune';
import { mean, median } from './util';

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

const USAGE = `Usage: node packages/sim/scripts/trips.mjs [--set expeditions.slots.thresholds.1=8,...] [--sims N] [--weeks N] [--long N] [--seed <string>]
Plays N default-server economy sims (and --long N sims of 60 weeks for the slot targets) and prints the expedition targets, the discovery pace against today's and weekly tables. The overrides are the same as tune.mjs's (--set path=integer, array items by index).`;

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

/** Prints the expedition targets and tables; returns the exit code. */
export function main(argv: readonly string[], io: Io = defaultIo): number {
  let restore: () => void = () => undefined;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        set: { type: 'string' },
        sims: { type: 'string' },
        weeks: { type: 'string' },
        long: { type: 'string' },
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
    const long = typeof values['long'] === 'string' ? Number(values['long']) : 6;
    if (!Number.isInteger(sims) || sims < 1 || sims > 500)
      throw new Error('--sims must be 1 to 500');
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104) {
      throw new Error('--weeks must be 1 to 104');
    }
    if (!Number.isInteger(long) || long < 0 || long > 100)
      throw new Error('--long must be 0 to 100');
    if (typeof values['set'] === 'string') restore = applyOverrides(values['set']);

    const run = (count: number, length: number, tag: string): EconomyResult[] =>
      Array.from({ length: count }, (_, k) =>
        runEconomy({
          seed: `${seed}:${tag}:10:${k}`,
          weeks: length,
          mix: DEFAULT_MIX,
          snapshotWeeks: [],
        }),
      );
    const econ = run(sims, weeks, 'econ');
    const longRun = run(long, 60, 'trips-long');
    const metrics = tripMetrics(econ, longRun);
    const targets = TARGETS.filter((t) => t.id.startsWith('exp-'));
    for (const t of evaluateTargets(targets, metrics)) {
      const mark = t.status === 'pass' ? 'ok  ' : t.status === 'fail' ? 'FAIL' : 'n/a ';
      io.out(
        `${mark} ${t.id}: ${t.measured === null ? 'n/a' : formatValue(t.measured, t.unit)} (needs ${describeRequirement(t)})`,
      );
    }
    io.out('');
    io.out(
      'Species owned, casual and daily, against the casual numbers of today (week: now / today):',
    );
    for (let w = 1; w <= Math.min(12, weeks); w++) {
      const c = mean(weekly(econ, 'casual', w).map((r) => r.speciesOwned)) ?? 0;
      const d = mean(weekly(econ, 'daily', w).map((r) => r.speciesOwned)) ?? 0;
      io.out(
        `  week ${String(w).padStart(2)}: casual ${c.toFixed(2)} / ${(TODAY_CASUAL_SPECIES[w - 1] ?? 0).toFixed(2)} | daily ${d.toFixed(2)}`,
      );
    }
    for (const a of ARCHETYPES) {
      io.out('');
      io.out(
        `${ARCHETYPE_CONFIG[a].label}: week | rank sum | slots | trips so far | Bait on lures`,
      );
      for (let w = 1; w <= weeks; w++) {
        const rs = weekly(econ, a, w);
        if (rs.length === 0) continue;
        const avg = (f: (r: WeekRecord) => number): number => mean(rs.map(f)) ?? 0;
        io.out(
          `  ${String(w).padStart(2)} | ${avg((r) => r.rankSum).toFixed(1)} | ${avg((r) => r.slots).toFixed(1)} | ${avg((r) => r.trips).toFixed(0)} | ${avg((r) => r.baitLures).toFixed(0)}`,
        );
      }
    }
    // What each kind of player did with expeditions over the run.
    for (const kind of ['casual', 'daily'] as const) {
      const group = econ.flatMap((s) => s.players.filter((p) => p.archetype === kind));
      const avg = (key: string): number => mean(group.map((p) => p.tripStats[key] ?? 0)) ?? 0;
      io.out('');
      io.out(
        `${kind} players over ${String(weeks)} weeks (averages): trips ${avg('trips_finished').toFixed(0)}, failed ${avg('trips_failed').toFixed(1)}, offers ${avg('offers').toFixed(0)}, goals taken ${avg('pushons_taken').toFixed(0)}, won ${avg('pushons_won').toFixed(0)}, supplies used ${avg('supplies_used').toFixed(0)} (dungeon ${avg('supplies_dungeon').toFixed(0)}, gifts ${avg('supplies_gift').toFixed(0)}, found ${avg('supplies_found').toFixed(0)}, crafted ${avg('supplies_crafted').toFixed(0)}), journal pages ${avg('journal_pages').toFixed(1)}, places ${avg('places_visited').toFixed(1)}, species found on trips ${avg('species_found').toFixed(1)}, catch rolls ${avg('catch_rolls').toFixed(0)}`,
      );
    }
    const dailies = econ.flatMap((s) => s.players.filter((p) => p.archetype === 'daily'));
    io.out('');
    io.out(
      `Trips by length (daily): ${(['short', 'medium', 'long', 'day'] as const)
        .map((l) => `${l} ${(mean(dailies.map((p) => p.tripsByLength[l] ?? 0)) ?? 0).toFixed(0)}`)
        .join(', ')}`,
    );
    if (longRun.length > 0) {
      const at = (week: number): string => {
        const v = longRun.flatMap((s) =>
          s.players
            .filter((p) => p.archetype === 'daily')
            .flatMap((p) => p.weeks.filter((w) => w.week === week).map((w) => w.rankSum)),
        );
        return (median(v) ?? 0).toFixed(1);
      };
      io.out(
        `Rank sum of daily players (median, 60-week sims): ${[1, 2, 4, 6, 8, 13, 17, 26, 39, 52, 60].map((w) => `week ${String(w)}: ${at(w)}`).join(', ')}`,
      );
      const days = [0, 1, 2, 3].map((k) =>
        median(
          longRun.flatMap((s) =>
            s.players
              .filter((p) => p.archetype === 'daily')
              .flatMap((p) =>
                p.slotDays[k] === null || p.slotDays[k] === undefined ? [] : [p.slotDays[k]],
              ),
          ),
        ),
      );
      io.out(
        `Day each slot opened for a daily player (median over ${String(longRun.length)} 60-week sims): slot 2 ${days[0]}, slot 3 ${days[1]}, slot 4 ${days[2]}, slot 5 ${days[3]} (thresholds ${RULES.expeditions.slots.thresholds.join(', ')})`,
      );
    }
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  } finally {
    restore();
  }
}
