/**
 * The six contract-fixture sets: the single place that says how each one is played and which files
 * of `apps/activity/src/fixtures` it owns.
 *
 *     pnpm fixtures:capture                  re-capture every set (writes the files)
 *     pnpm fixtures:capture --set gear       one set: branches, creatures, dungeon, expeditions, gear, games
 *     pnpm fixtures:capture --check          write nothing; exit 1 if any file would change
 *
 * How it works. `test/capture/capture-all.test.ts` plays every set here through the real routes and
 * prints the result; `scripts/capture-fixtures.mjs` reads it, gives every UUID a stable id (the first
 * one of a set becomes `00000000-0000-4000-8<set>00-000000000001`, the next `...02`, in order of first
 * appearance, so the same scenario always gives the same ids and the client tests can name them),
 * writes each file whole, and formats it with Prettier. Run it after a server change that moves a
 * response shape, review the diff of the fixtures, and update the client parsers.
 *
 * Each set owns its rngs (`run` builds them), so the capture and the five `*-fixtures.test.ts` files,
 * which compare the SHAPE of a fresh `run()` with the files, always play the same game. When a scenario
 * changes, change it here and in its `*-scenario.ts`, then capture again.
 *
 * Not covered yet (phase 2): the live raid fixtures (`live-*`, `action-*`, `practice-*`, `raid-*`,
 * `errors.json`, `request-bodies.json`) have no scenario. They were written by script, and only
 * hand-written key lists guard them (`raid-live.test.ts`). A `raid-scenario.ts` here would cover them.
 * `dungeon-legacy-*`, `dungeon-run-*`, `dungeon-today*.json` (without the map), `dungeon-replay.json` and
 * `dungeon-team-draft.json` come from the all-at-once run that no longer exists: they are kept, never
 * captured.
 */
import { RULES, createSeededRng } from '@creatures/game';
import { branchesScenarioOptions, runBranchesScenario } from './branches-scenario';
import { creaturesScenarioOptions, runCreaturesScenario } from './creatures-scenario';
import { dungeonScenarioOptions, runDungeonScenario } from './dungeon-scenario';
import { runTripsScenario, tripsScenarioOptions } from './expeditions-scenario';
import type { Captured } from './fixture-contract';
import { gamesScenarioOptions, runGamesScenario } from './games-scenario';
import { runConversionScenario, runExpeditionScenario, runGearScenario } from './gear-scenario';
import { runCore } from './helpers';
import { nextGuild, scriptedThenSeeded } from './raid-helpers';

export interface FixtureSet {
  name: string;
  /** One hex digit that tells the sets' stable ids apart (`00000000-0000-4000-8<nibble>00-...`). */
  nibble: string;
  /** Plays the scenario(s) with this set's own rngs. */
  run(): Promise<Captured>;
  files: {
    /** Capture key of a response to its file in `apps/activity/src/fixtures`. */
    responses: Record<string, string>;
    /** Captured, but deliberately written nowhere (the capture test fails on any other unnamed key). */
    skipped?: readonly string[];
    /** The file of all error rows. */
    errors: string;
    /** The file of the request bodies, if the set sends any. */
    requests?: string;
    /**
     * Capture key of a request to the key it has in `requests` (only these are written). Without it
     * every request keeps its capture key.
     */
    requestKeys?: Record<string, string>;
  };
}

/**
 * Seeded rngs for every random source of the guild, so nothing a scenario touches is live randomness
 * (the cosmetic quirks, for one, are not named by the scenarios themselves). A set
 * passes its own seeds for the rngs its scenario scripts; they win over these. (The talents are seeded
 * by `runCore` already, and the scenarios that script them say so.)
 */
function seededRngs(set: string) {
  const seeded = (name: string) => createSeededRng(`fixture-${set}-${name}`);
  return {
    rng: seeded('catch'),
    raidRng: seeded('raid'),
    readinessRng: seeded('readiness'),
    quirkRng: seeded('quirk'),
    tripRng: seeded('trip'),
    gearRng: seeded('gear'),
    dungeonRng: seeded('dungeon'),
    weatherRng: seeded('weather'),
    gamesRng: seeded('games'),
  };
}

/** `named('a', 'b')` is `{ a: 'a.json', b: 'b.json' }`: the capture key is the file name. */
const named = (...keys: string[]): Record<string, string> =>
  Object.fromEntries(keys.map((k) => [k, `${k}.json`]));

/**
 * Runs a scenario with some `RULES.expeditions` values set (`'tick.xp'`, `'lengths.long.ticks'`) and puts
 * them back afterwards, even when it fails.
 */
async function withRules<T>(values: Record<string, number>, run: () => Promise<T>): Promise<T> {
  const holder = (path: string): { target: Record<string, number>; key: string } => {
    const parts = path.split('.');
    let target = RULES.expeditions as unknown as Record<string, unknown>;
    for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
    return { target: target as Record<string, number>, key: parts.at(-1) as string };
  };
  const before = Object.keys(values).map((path) => {
    const { target, key } = holder(path);
    return { path, was: target[key] as number };
  });
  for (const [path, value] of Object.entries(values)) {
    const { target, key } = holder(path);
    target[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const { path, was } of before) {
      const { target, key } = holder(path);
      target[key] = was;
    }
  }
}

/** Several scenario runs (each in its own guild) as one capture. */
function merge(runs: Captured[]): Captured {
  const out: Captured = { responses: {}, errors: [], requests: {} };
  for (const run of runs) {
    Object.assign(out.responses, run.responses);
    out.errors.push(...run.errors);
    Object.assign(out.requests, run.requests);
  }
  return out;
}

export const FIXTURE_SETS: readonly FixtureSet[] = [
  {
    name: 'branches',
    nibble: '1',
    run: () => {
      const options = { ...seededRngs('branches'), ...branchesScenarioOptions() };
      return runCore(nextGuild(), (ctx) => runBranchesScenario(ctx, options.talentRng), options);
    },
    files: {
      responses: named(
        'branches-state',
        'branches-claim',
        'branches-keep',
        'branches-evolve',
        'branches-evolve-other',
        'branches-state-after',
      ),
      errors: 'branches-errors.json',
      requests: 'branches-request-bodies.json',
    },
  },
  {
    name: 'creatures',
    nibble: '2',
    run: () => {
      const options = { ...seededRngs('creatures'), ...creaturesScenarioOptions() };
      return runCore(nextGuild(), (ctx) => runCreaturesScenario(ctx, options.talentRng), options);
    },
    files: {
      responses: named(
        'creatures-claim',
        'creatures-state',
        'creatures-choose-teach',
        'creatures-choose-fuse',
        'creatures-choose-release',
        'creatures-choose-recommended',
        'creatures-recommended-all',
        'creatures-slot',
        'creatures-state-after',
      ),
      errors: 'creatures-errors.json',
      requests: 'creatures-request-bodies.json',
    },
  },
  {
    name: 'dungeon',
    nibble: '3',
    run: () =>
      runCore(nextGuild(), (ctx) => runDungeonScenario(ctx), {
        ...seededRngs('dungeon'),
        ...dungeonScenarioOptions(),
      }),
    files: {
      responses: named(
        'dungeon-today-map',
        'dungeon-today-active',
        'dungeon-start',
        'dungeon-act-fight',
        'dungeon-act-event-pending',
        'dungeon-act-event',
        'dungeon-act-camp-pending',
        'dungeon-act-camp',
        'dungeon-act-home',
        'dungeon-act-defeat',
        'dungeon-act-cleared',
        'dungeon-replay-path',
        'dungeon-act-door',
        'dungeon-act-descend-pending',
        'dungeon-act-descend',
        'dungeon-act-keeper',
      ),
      errors: 'dungeon-errors.json',
      requests: 'dungeon-request-bodies.json',
    },
  },
  {
    name: 'expeditions',
    nibble: '4',
    run: () => {
      const { draw, options } = tripsScenarioOptions();
      // The scenario plays a trip of one tick that is worth the XP of the old 12 hour trip and whose every
      // loot table is certain (a shard, scrap, glimmer, a blueprint, a supply), so the claims keep the
      // small, known shape the client tests read; the trip rng is a switch, so one tick is one page too.
      return withRules(
        {
          'lengths.long.ticks': 1,
          'tick.xp': 300,
          'tick.scrapBp': 10_000,
          'tick.shardBp': 10_000,
          'tick.glimmerBp': 10_000,
          'tick.blueprintBp': 10_000,
          'tick.supplyBp': 10_000,
          'tick.gearBp': 0,
        },
        () =>
          runCore(nextGuild(), (ctx) => runTripsScenario(ctx, draw), {
            ...seededRngs('expeditions'),
            ...options,
          }),
      );
    },
    files: {
      responses: named(
        'expedition-send',
        'expedition-send-2',
        'expedition-send-3',
        'expedition-state-offer',
        'expedition-state-after',
        'expedition-push-on',
        'expedition-claim-failed',
        'expedition-claim-worked',
        'expedition-claim-recall',
        'expedition-profile',
        'expedition-destinations',
        'workshop-start-supply',
        'workshop-claim-supply',
      ),
      errors: 'expedition-errors.json',
      requests: 'expedition-request-bodies.json',
    },
  },
  {
    name: 'gear',
    nibble: '5',
    run: async () => {
      const main = await runCore(nextGuild(), (ctx) => runGearScenario(ctx), {
        ...seededRngs('gear'),
        gearRng: createSeededRng('fixture-gear'),
      });
      const converted = await runCore(nextGuild(), (ctx) => runConversionScenario(ctx), {
        ...seededRngs('gear'),
        gearRng: createSeededRng('fixture-gear'),
      });
      // A 12 hour trip is 15 ticks: the chances of a glimmer and a blueprint are raised (and no gear piece
      // drops) so that the claim shows a shard, a glimmer, a blueprint and a found supply next to the scrap.
      const tick = RULES.expeditions.tick as unknown as Record<string, number>;
      const before = { ...tick };
      Object.assign(tick, {
        shardBp: 3_000,
        glimmerBp: 2_500,
        blueprintBp: 1_500,
        supplyBp: 1_500,
        gearBp: 0,
      });
      let expedition: Captured;
      try {
        expedition = await runCore(nextGuild(), (ctx) => runExpeditionScenario(ctx), {
          ...seededRngs('gear'),
          // A catch that is certain (a new creature), so the claim shows a catch next to the loot.
          rng: scriptedThenSeeded([0, 0, 0, 1], 'fixture-catch'),
          tripRng: createSeededRng('fixture-trip'),
          gearRng: createSeededRng('fixture-exp'),
        });
      } finally {
        Object.assign(tick, before);
      }
      return merge([main, converted, expedition]);
    },
    files: {
      responses: {
        'gear-welcome': 'gear-welcome.json',
        'gear-ready': 'gear-ready.json',
        'gear-running': 'gear-running.json',
        'gear-final': 'gear-state.json',
        'gear-equip': 'gear-equip.json',
        'gear-unequip': 'gear-unequip.json',
        'gear-equip-best': 'gear-equip-best.json',
        'job-start-craft': 'workshop-start-craft.json',
        'job-claim-craft': 'workshop-claim-craft.json',
        'job-claim-retired': 'workshop-claim-retired.json',
        'job-start-dismantle': 'workshop-start-dismantle.json',
        'job-claim-dismantle': 'workshop-claim-dismantle.json',
        'preview-craft': 'workshop-preview-craft.json',
        'preview-dismantle': 'workshop-preview-dismantle.json',
        'collection-state': 'collection-state.json',
        'gear-notice': 'gear-notice.json',
        'gear-notice-dismissed': 'gear-notice-dismissed.json',
        'expedition-claim-loot': 'expedition-claim-loot.json',
      },
      skipped: ['gear-loaded', 'gear-equip-again', 'job-start-craft-2'],
      errors: 'gear-errors.json',
      requests: 'gear-request-bodies.json',
      // The names the client tests use for the requests (`gear-request-bodies.json`).
      requestKeys: {
        'gear-equip': 'equip',
        'gear-unequip': 'unequip',
        'gear-equip-best': 'equip-best',
        'job-start-craft': 'job-craft',
        'job-start-craft-2': 'job-craft-reach',
        'job-start-dismantle': 'job-dismantle',
        'job-claim-craft': 'job-claim',
        'preview-craft': 'preview-craft',
        'preview-dismantle': 'preview-dismantle',
        'expedition-claim': 'expedition-claim',
        'gear-notice-dismiss': 'notice-dismiss',
      },
    },
  },
  {
    name: 'games',
    nibble: '6',
    run: () =>
      runCore(nextGuild(), (ctx) => runGamesScenario(ctx), {
        ...seededRngs('games'),
        ...gamesScenarioOptions(),
      }),
    files: {
      responses: named(
        'games-entries',
        'games-entry',
        'games-entry-team',
        'games-locked',
        'games-show',
        'games-after',
        'games-creature',
        'games-stall-buy',
        'games-stall-buy-bait',
      ),
      errors: 'games-errors.json',
      requests: 'games-request-bodies.json',
    },
  },
];

/** The set called `name`; throws on a name the manifest does not have. */
export function fixtureSet(name: string): FixtureSet {
  const found = FIXTURE_SETS.find((s) => s.name === name);
  if (found === undefined) throw new Error(`no fixture set called ${name}`);
  return found;
}
