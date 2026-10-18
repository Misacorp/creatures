/**
 * What the valley's weather does where it reaches (docs/design/gear-and-creatures-v2.md section 10): trips,
 * Workshop jobs, the daily dungeon and the raid stage of the day. Each test forces the day's Boon and Omen
 * (`Weather.force`, the staging tool's function) so the numbers are known, and checks that what was started
 * under a day keeps it, whatever the sky does afterwards.
 */
import {
  RULES,
  createSeededRng,
  dismantleRange,
  dungeonExperience,
  lengthRules,
  raidExperience,
  tripExperience,
  workshopExperience,
  type PartsBundle,
} from '@creatures/game';
import { firstOfEachRow, type DungeonRunInput } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { eventTimes } from '../src/raid-schedule';
import { addDays, gameDay, zonedTimeToEpoch } from '../src/time';
import { dungeonPlayer } from './dungeon-helpers';
import {
  apiPlayer,
  giveItem,
  giveParts,
  learnBase,
  newKey,
  skipWelcome,
  type Api,
} from './gear-helpers';
import { runCore, type CoreContext } from './helpers';
import {
  HELSINKI,
  HOUR,
  MINUTE,
  W02,
  count,
  forcePool,
  nextGuild,
  rows,
  runRaid,
  seedPlayer,
  storedRuns,
} from './raid-helpers';

/** A Wednesday afternoon in a normal week, a little after the reset: a game day with plenty of it left. */
const AFTERNOON = Date.parse('2027-01-13T12:00:00Z');

const dayOf = (ctx: Pick<CoreContext, 'clock'>): string =>
  gameDay(ctx.clock.t, HELSINKI, RULES.daily.reset);

/** Sets today's weather by hand (drawn days are random; the tests want known ones). */
function sky(ctx: CoreContext, boon: string, omen: string | null = null): void {
  ctx.core.weather.force(dayOf(ctx), boon, omen);
}

/** Two trips at a time, as a player with two finished trips has. */
function twoSlots(ctx: CoreContext, userId: string): void {
  ctx.sql.exec(
    `INSERT INTO account_stats (user_id, stat, value) VALUES (?, 'trips_finished', ?)
     ON CONFLICT(user_id, stat) DO UPDATE SET value = excluded.value`,
    userId,
    RULES.expeditions.slots.secondAfterTrips,
  );
}

const send = (p: Api, creatureId: string, extra: Record<string, unknown> = {}) =>
  p.call('POST', '/api/expeditions', {
    creatureId,
    destination: 'tidepools',
    duration: 'short',
    supplies: [],
    idempotencyKey: newKey(),
    ...extra,
  });

interface TripJson {
  id: string;
  startedAt: number;
  endsAt: number;
  rolls: number;
}

const tripOf = (res: { body: Record<string, unknown> }): TripJson =>
  res.body['expedition'] as TripJson;

const claimTrip = (p: Api, id: string) => p.call('POST', `/api/expeditions/${id}/claim`, {});

const expGained = (res: { body: Record<string, unknown> }): number | undefined =>
  (res.body['result'] as { experience?: { gained: number } }).experience?.gained;

interface StoredTrip {
  weather_json: string | null;
}

const storedTrips = (ctx: CoreContext, id: string): StoredTrip =>
  rows<StoredTrip & Record<string, string | number | null>>(
    ctx.sql,
    'SELECT weather_json FROM expeditions WHERE id = ?',
    id,
  )[0] as StoredTrip;

const weatherUses = (ctx: CoreContext, where: string): number =>
  rows<{ props_json: string }>(
    ctx.sql,
    "SELECT props_json FROM analytics_events WHERE kind = 'weather_use'",
  ).filter((r) => (JSON.parse(r.props_json) as { where: string }).where === where).length;

describe('trips under the weather', () => {
  it('Fair Winds shortens the trip, Muddy Roads lengthens it, and each trip stores what it was sent under', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await apiPlayer(ctx, 1, { level: 8, creatures: 3 });
        twoSlots(ctx, p.id);
        const [a, b] = p.creatureIds as [string, string];
        const base = lengthRules('short').ms;

        sky(ctx, 'fair-winds');
        const fair = tripOf(await send(p, a));
        expect(fair.endsAt - fair.startedAt).toBe(Math.floor((base * 9_000) / 10_000));
        expect(JSON.parse(storedTrips(ctx, fair.id).weather_json as string)).toMatchObject({
          boon: 'fair-winds',
          omen: null,
          timeBp: -1_000,
        });

        sky(ctx, 'market-day', 'muddy-roads');
        const muddy = tripOf(await send(p, b));
        expect(muddy.endsAt - muddy.startedAt).toBe(Math.floor((base * 11_500) / 10_000));
        expect(JSON.parse(storedTrips(ctx, muddy.id).weather_json as string)).toMatchObject({
          boon: 'market-day',
          omen: 'muddy-roads',
          timeBp: 1_500,
          supplyBp: -3_000,
        });
        // Both were logged, once each.
        expect(weatherUses(ctx, 'trip')).toBe(2);
      },
      { weather: true },
    );
  });

  it('a Boon and an Omen on one day add up: Fair Winds and Muddy Roads cancel to 5% longer', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await apiPlayer(ctx, 1, { level: 8 });
        sky(ctx, 'fair-winds', 'muddy-roads');
        const trip = tripOf(await send(p, p.creatureIds[0] as string));
        expect(trip.endsAt - trip.startedAt).toBe(
          Math.floor((lengthRules('short').ms * 10_500) / 10_000),
        );
      },
      { weather: true },
    );
  });

  it('a day that changes nothing about trips stores nothing and logs nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await apiPlayer(ctx, 1, { level: 8 });
        sky(ctx, 'market-day', 'restless-wind');
        const trip = tripOf(await send(p, p.creatureIds[0] as string));
        expect(trip.endsAt - trip.startedAt).toBe(lengthRules('short').ms);
        expect(storedTrips(ctx, trip.id).weather_json).toBeNull();
        expect(weatherUses(ctx, 'trip')).toBe(0);
      },
      { weather: true },
    );
  });

  it('High Water adds a catch roll to a 12 hour trip at the Tidepools, and to nothing shorter or elsewhere', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await apiPlayer(ctx, 1, { level: 8, creatures: 3 });
        twoSlots(ctx, p.id);
        const [a, b] = p.creatureIds as [string, string, string];
        sky(ctx, 'high-water');
        const base = lengthRules('long').rolls;
        expect(tripOf(await send(p, a, { duration: 'long' })).rolls).toBe(base + 1);
        expect(
          tripOf(await send(p, b, { duration: 'long', destination: 'ember-caves' })).rolls,
        ).toBe(base);
        const q = await apiPlayer(ctx, 2, { level: 8 });
        expect(
          tripOf(await send(q, q.creatureIds[0] as string, { duration: 'medium' })).rolls,
        ).toBe(lengthRules('medium').rolls);
      },
      { weather: true },
    );
  });

  it('Quiet Night keeps the Moonlit Reef open in the afternoon; without it the Reef is closed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await apiPlayer(ctx, 1, { level: 8 });
        const [a] = p.creatureIds as [string];
        ctx.sql.exec(
          'INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, 0)',
          p.id,
          a,
          RULES.expeditions.rank.xpForRank[3] ?? 0,
        );
        const closedOf = async (): Promise<string[]> => {
          const body = (await p.call('GET', '/api/destinations')).body as {
            destinations: { id: string; closed: string[] }[];
          };
          return body.destinations.find((d) => d.id === 'moonlit-reef')?.closed ?? [];
        };
        sky(ctx, 'fair-winds');
        expect(await closedOf()).toEqual(['night']);
        expect(await send(p, a, { destination: 'moonlit-reef' })).toMatchObject({
          status: 409,
          body: { error: 'destination_closed' },
        });
        sky(ctx, 'quiet-night');
        expect(await closedOf()).toEqual([]);
        const sent = await send(p, a, { destination: 'moonlit-reef' });
        expect(sent.status).toBe(200);
        expect(JSON.parse(storedTrips(ctx, tripOf(sent).id).weather_json as string)).toMatchObject({
          reefOpen: true,
        });
      },
      { weather: true },
    );
  });

  it('the claim uses the weather the trip was sent under, never the weather of the day it is claimed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await apiPlayer(ctx, 1, { level: 8 });
        const [a] = p.creatureIds as [string];
        sky(ctx, 'hearty-breakfast');
        const trip = tripOf(await send(p, a));
        ctx.clock.t = trip.endsAt + MINUTE;
        // The sky turns: a Cold Snap cuts experience, but this trip was sent under Hearty Breakfast.
        sky(ctx, 'market-day', 'cold-snap');
        const claimed = await claimTrip(p, trip.id);
        expect(claimed.status).toBe(200);
        expect(expGained(claimed)).toBe(
          tripExperience('short', false, { bp: 2_500, treatMultiplier: 3 }),
        );
        expect(expGained(claimed)).toBeGreaterThan(tripExperience('short', false));
      },
      { weather: true },
    );
  });

  it('a treat triples the experience under Hearty Breakfast, and Cold Snap cuts the plain amount', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await apiPlayer(ctx, 1, { level: 8, creatures: 2 });
        twoSlots(ctx, p.id);
        const [a, b] = p.creatureIds as [string, string];
        ctx.core.credit({
          userId: p.id,
          currency: 'bait',
          amount: 100,
          source: 'test',
          idempotencyKey: 'weather-bait',
        });
        sky(ctx, 'hearty-breakfast');
        const treated = tripOf(await send(p, a, { treat: true }));
        sky(ctx, 'market-day', 'cold-snap');
        const cold = tripOf(await send(p, b));
        ctx.clock.t = Math.max(treated.endsAt, cold.endsAt) + MINUTE;
        expect(expGained(await claimTrip(p, treated.id))).toBe(
          tripExperience('short', true, { bp: 2_500, treatMultiplier: 3 }),
        );
        expect(expGained(await claimTrip(p, cold.id))).toBe(
          tripExperience('short', false, { bp: -2_000, treatMultiplier: null }),
        );
      },
      { weather: true },
    );
  });

  it('a trip with no stored weather (sent before the weather) or damaged weather claims like a plain trip', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await apiPlayer(ctx, 1, { level: 8, creatures: 2 });
        twoSlots(ctx, p.id);
        const [a, b] = p.creatureIds as [string, string];
        sky(ctx, 'hearty-breakfast');
        const first = tripOf(await send(p, a));
        const second = tripOf(await send(p, b));
        ctx.sql.exec('UPDATE expeditions SET weather_json = NULL WHERE id = ?', first.id);
        ctx.sql.exec("UPDATE expeditions SET weather_json = '{not json' WHERE id = ?", second.id);
        ctx.clock.t = Math.max(first.endsAt, second.endsAt) + MINUTE;
        sky(ctx, 'hearty-breakfast');
        expect(expGained(await claimTrip(p, first.id))).toBe(tripExperience('short', false));
        expect(expGained(await claimTrip(p, second.id))).toBe(tripExperience('short', false));
      },
      { weather: true },
    );
  });
});

// --- The Workshop ---

const HOURS3 = 3 * HOUR;

const startCraft = (p: Api, creatureId: string, baseId = 'trail-cap') =>
  p.call('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId,
    blueprintId: baseId,
    idempotencyKey: newKey(),
  });

const startDismantle = (p: Api, creatureId: string, itemIds: string[]) =>
  p.call('POST', '/api/workshop/jobs', {
    kind: 'dismantle',
    creatureId,
    itemIds,
    idempotencyKey: newKey(),
  });

const claimJob = (p: Api, jobId: string) =>
  p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: newKey() });

const jobIdOf = (res: { body: Record<string, unknown> }): string =>
  (res.body['result'] as { jobId: string }).jobId;

interface JobRow {
  started_at: number;
  ends_at: number;
  input_json: string;
}

const jobRow = (ctx: CoreContext, id: string): JobRow =>
  rows<JobRow & Record<string, string | number | null>>(
    ctx.sql,
    'SELECT started_at, ends_at, input_json FROM workshop_jobs WHERE id = ?',
    id,
  )[0] as JobRow;

const inputOf = (ctx: CoreContext, id: string) =>
  JSON.parse(jobRow(ctx, id).input_json) as {
    mods?: { stepUpBonusBp?: number; dismantleTopOfRange?: boolean };
    weather?: { boon: string; omen: string | null; timeBp: number; xpBp: number };
  };

const durationOf = (ctx: CoreContext, id: string): number => {
  const r = jobRow(ctx, id);
  return r.ends_at - r.started_at;
};

async function workshopPlayer(ctx: CoreContext, n = 1): Promise<Api> {
  ctx.clock.t = AFTERNOON;
  const p = await apiPlayer(ctx, n, { level: 5, creatures: 3 });
  skipWelcome(ctx, p.id);
  learnBase(ctx, p.id, 'trail-cap');
  learnBase(ctx, p.id, 'kelp-cap');
  const parts: PartsBundle = { scrap: 200, 'tide-shard': 20, 'spark-shard': 20 };
  giveParts(ctx, p.id, parts);
  return p;
}

describe('the Workshop under the weather', () => {
  it('Warm Hearth makes jobs 15% faster and Cold Snap 15% slower, and the preview shows the same time', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await workshopPlayer(ctx);
        const [a, b] = p.creatureIds as [string, string];
        const previewMs = async (creatureId: string): Promise<number> => {
          const res = await p.call('POST', '/api/workshop/preview', {
            kind: 'craft',
            creatureId,
            blueprintId: 'trail-cap',
          });
          return (res.body['result'] as { options: { durationMs: number }[] }).options[0]
            ?.durationMs as number;
        };
        sky(ctx, 'warm-hearth');
        expect(await previewMs(a)).toBe(Math.floor((HOURS3 * 8_500) / 10_000));
        const warm = jobIdOf(await startCraft(p, a));
        expect(durationOf(ctx, warm)).toBe(Math.floor((HOURS3 * 8_500) / 10_000));
        expect(inputOf(ctx, warm).weather).toMatchObject({
          boon: 'warm-hearth',
          omen: null,
          timeBp: -1_500,
        });
        sky(ctx, 'market-day', 'cold-snap');
        expect(await previewMs(b)).toBe(Math.floor((HOURS3 * 11_500) / 10_000));
        const cold = jobIdOf(await startCraft(p, b));
        expect(durationOf(ctx, cold)).toBe(Math.floor((HOURS3 * 11_500) / 10_000));
        expect(weatherUses(ctx, 'job')).toBe(2);
      },
      { weather: true },
    );
  });

  it('a job claims with the experience of the day it started under', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await workshopPlayer(ctx);
        const [a, b] = p.creatureIds as [string, string];
        sky(ctx, 'hearty-breakfast');
        const hearty = jobIdOf(await startCraft(p, a));
        sky(ctx, 'market-day', 'cold-snap');
        const cold = jobIdOf(await startCraft(p, b, 'kelp-cap'));
        ctx.clock.t += 20 * HOUR;
        // The sky now is another one again: both jobs keep their own.
        sky(ctx, 'fair-winds');
        const fromHearty = await claimJob(p, hearty);
        const fromCold = await claimJob(p, cold);
        const gained = (res: { body: Record<string, unknown> }): number =>
          (res.body['result'] as { experience?: { gained: number } }).experience?.gained ?? 0;
        expect(gained(fromHearty)).toBe(
          workshopExperience(180, false, { bp: 2_500, treatMultiplier: 3 }),
        );
        expect(gained(fromCold)).toBe(
          workshopExperience(180, false, { bp: -2_000, treatMultiplier: null }),
        );
      },
      { weather: true },
    );
  });

  it('Market Day boosts only the first craft of the day (+5 pt) and not the second, and the preview shows the boost', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await workshopPlayer(ctx);
        const [a, b] = p.creatureIds as [string, string];
        sky(ctx, 'market-day');
        const stepUp = async (creatureId: string): Promise<number> =>
          (
            (
              await p.call('POST', '/api/workshop/preview', {
                kind: 'craft',
                creatureId,
                blueprintId: 'kelp-cap',
              })
            ).body['result'] as { stepUpBp: number }
          ).stepUpBp;
        // Level 1 and no marks: no step-up at all without the day.
        expect(await stepUp(a)).toBe(500);
        const first = jobIdOf(await startCraft(p, a, 'kelp-cap'));
        expect(inputOf(ctx, first).mods).toEqual({ stepUpBonusBp: 500 });
        // The second craft of the day is a plain one: the preview says so and the job stores nothing.
        expect(await stepUp(b)).toBe(0);
        const second = jobIdOf(await startCraft(p, b, 'kelp-cap'));
        expect(inputOf(ctx, second).mods).toBeUndefined();
        // Another player's day is their own.
        const q = await workshopPlayer(ctx, 2);
        const theirs = jobIdOf(await startCraft(q, q.creatureIds[0] as string, 'kelp-cap'));
        expect(inputOf(ctx, theirs).mods).toEqual({ stepUpBonusBp: 500 });
      },
      { weather: true },
    );
  });

  it('Market Day: a supply craft is not a craft and does not use up the first-craft boost', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await workshopPlayer(ctx);
        const [a, b] = p.creatureIds as [string, string];
        sky(ctx, 'market-day');
        const supply = await p.call('POST', '/api/workshop/jobs', {
          kind: 'supply',
          creatureId: a,
          supplyId: 'satchel-basic',
          idempotencyKey: newKey(),
        });
        expect(supply.status).toBe(200);
        const craft = jobIdOf(await startCraft(p, b, 'kelp-cap'));
        expect(inputOf(ctx, craft).mods).toEqual({ stepUpBonusBp: 500 });
      },
      { weather: true },
    );
  });

  it('Market Day: the first 2 dismantle jobs roll the top of their range and the third does not', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await workshopPlayer(ctx);
        const [a, b] = p.creatureIds as [string, string];
        const item = (seed: string): string => giveItem(ctx.sql, p.id, 'trail-cap', { seed });
        sky(ctx, 'market-day');
        const first = jobIdOf(await startDismantle(p, a, [item('one')]));
        const second = jobIdOf(await startDismantle(p, b, [item('two')]));
        expect(inputOf(ctx, first).mods).toEqual({ dismantleTopOfRange: true });
        expect(inputOf(ctx, second).mods).toEqual({ dismantleTopOfRange: true });
        // Free the slots (every job of the day still counts), then the third is a plain one.
        ctx.clock.t += HOUR;
        await claimJob(p, first);
        await claimJob(p, second);
        const third = jobIdOf(await startDismantle(p, a, [item('three')]));
        expect(inputOf(ctx, third).mods).toBeUndefined();
      },
      { weather: true },
    );
  });

  it('a top-of-range dismantle refunds the top of the range at the claim', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await workshopPlayer(ctx);
        const [a] = p.creatureIds as [string];
        const itemId = giveItem(ctx.sql, p.id, 'trail-cap', { seed: 'top' });
        const before = rows<{ kind: string; amount: number }>(
          ctx.sql,
          "SELECT kind, amount FROM parts WHERE user_id = ? AND kind = 'scrap'",
          p.id,
        )[0]?.amount as number;
        sky(ctx, 'market-day');
        const job = jobIdOf(await startDismantle(p, a, [itemId]));
        ctx.clock.t += HOUR;
        const claimed = await claimJob(p, job);
        const range = (claimed.body['result'] as { parts: PartsBundle }).parts.scrap as number;
        // Level 1 trail cap, common: its range tops at the highest scrap of a common piece.
        expect(range).toBe(
          dismantleRange([{ baseId: 'trail-cap', rarity: 'common', itemLevel: 1 }]).scrap.max,
        );
        const after = rows<{ amount: number }>(
          ctx.sql,
          "SELECT amount FROM parts WHERE user_id = ? AND kind = 'scrap'",
          p.id,
        )[0]?.amount as number;
        expect(after - before).toBe(range);
      },
      { weather: true },
    );
  });

  it('the counts start again with the next game day, and jobs of the day before do not count', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await workshopPlayer(ctx);
        const [a] = p.creatureIds as [string, string, string];
        sky(ctx, 'market-day');
        const today = jobIdOf(await startCraft(p, a, 'kelp-cap'));
        expect(inputOf(ctx, today).mods).toEqual({ stepUpBonusBp: 500 });
        ctx.clock.t += 4 * HOUR;
        await claimJob(p, today);
        // After the reset: a new day, a new Market Day, a first craft again.
        ctx.clock.t = zonedTimeToEpoch(addDays(dayOf(ctx), 1), 13, 37, HELSINKI) + 5 * MINUTE;
        await ctx.core.alarm();
        sky(ctx, 'market-day');
        const tomorrow = jobIdOf(await startCraft(p, a, 'kelp-cap'));
        expect(inputOf(ctx, tomorrow).mods).toEqual({ stepUpBonusBp: 500 });
      },
      { weather: true },
    );
  });

  it('a day with no Workshop effect stores nothing with the job', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await workshopPlayer(ctx);
        sky(ctx, 'fair-winds', 'restless-wind');
        const job = jobIdOf(await startCraft(p, p.creatureIds[0] as string));
        expect(inputOf(ctx, job)).not.toHaveProperty('weather');
        expect(inputOf(ctx, job)).not.toHaveProperty('mods');
        expect(durationOf(ctx, job)).toBe(HOURS3);
        expect(weatherUses(ctx, 'job')).toBe(0);
      },
      { weather: true },
    );
  });
});

// --- The dungeon ---

interface DungeonRow {
  input_json: string;
  summary_json: string;
}

const lastRun = (ctx: CoreContext) =>
  rows<DungeonRow & Record<string, string | number | null>>(
    ctx.sql,
    'SELECT input_json, summary_json FROM dungeon_runs ORDER BY rowid DESC LIMIT 1',
  )[0] as DungeonRow;

describe('the dungeon under the weather', () => {
  it('fights with the day on every creature, the luck and the foes, stores it in the input and names it in the summary', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await dungeonPlayer(ctx, 1);
        sky(ctx, 'fair-winds', 'heatwave');
        const res = await p.run();
        expect(res.status).toBe(200);
        expect(res.body.run.weather).toEqual({ boon: 'fair-winds', omen: 'heatwave' });
        const input = JSON.parse(lastRun(ctx).input_json) as DungeonRunInput;
        expect(input.team).toHaveLength(3);
        for (const slot of input.team) {
          expect(slot.mods).toMatchObject({ firstHitBp: 1_000, takenBp: -800 });
          expect(slot.mods?.wardBp?.ember).toBeLessThan(0);
        }
        expect(input.bossAttacks).toBeUndefined();
        expect(weatherUses(ctx, 'dungeon')).toBe(1);
      },
      { weather: true },
    );
  });

  it("Clear Skies raises the crit chance, Static Sky the foes', Stormfront adds a boss attack", async () => {
    const luck = RULES.combat.luck;
    const runUnder = async (boon: string, omen: string | null): Promise<DungeonRunInput> =>
      runCore(
        nextGuild(),
        async (ctx) => {
          ctx.clock.t = AFTERNOON;
          const p = await dungeonPlayer(ctx, 1);
          sky(ctx, boon, omen);
          expect((await p.run()).status).toBe(200);
          return JSON.parse(lastRun(ctx).input_json) as DungeonRunInput;
        },
        { weather: true },
      );
    const clear = await runUnder('clear-skies', 'static-sky');
    expect(clear.luck.critChanceBp).toBe(luck.critChanceBp + 300);
    expect(clear.luck.bossCritChanceBp).toBe((luck.bossCritChanceBp ?? 0) + 400);
    const storm = await runUnder('market-day', 'stormfront');
    expect(storm.bossAttacks).toBe(2);
    expect(storm.luck).toEqual(luck);
    const plain = await runUnder('market-day', null);
    expect(plain.bossAttacks).toBeUndefined();
    expect(plain.luck).toEqual(luck);
    // A day with nothing for a creature's sheet leaves the sheet alone.
    for (const slot of plain.team) expect(slot.mods).toBeUndefined();
  });

  it('Kind Rain, Morning Haze and Bramble Season go into the stored run input; a plain day stores none of them', async () => {
    const runUnder = async (boon: string, omen: string | null): Promise<DungeonRunInput> =>
      runCore(
        nextGuild(),
        async (ctx) => {
          ctx.clock.t = AFTERNOON;
          const p = await dungeonPlayer(ctx, 1);
          sky(ctx, boon, omen);
          expect((await p.run()).status).toBe(200);
          return JSON.parse(lastRun(ctx).input_json) as DungeonRunInput;
        },
        { weather: true },
      );
    const rain = await runUnder('kind-rain', null);
    expect(rain.rainHealBp).toBe(200);
    expect(rain).not.toHaveProperty('hazeLeft');
    expect(rain).not.toHaveProperty('brambleBp');
    const haze = await runUnder('market-day', 'morning-haze');
    expect(haze.hazeLeft).toBe(true);
    expect(haze).not.toHaveProperty('rainHealBp');
    const bramble = await runUnder('market-day', 'bramble-season');
    expect(bramble.brambleBp).toBe(3_000);
    const plain = await runUnder('market-day', null);
    for (const key of ['rainHealBp', 'hazeLeft', 'brambleBp'])
      expect(plain).not.toHaveProperty(key);
  });

  it('Market Day pays a scrap more for every room cleared, and nothing more otherwise', async () => {
    const scrapUnder = async (boon: string): Promise<{ scrap: number; rooms: number }> =>
      runCore(
        nextGuild(),
        async (ctx) => {
          ctx.clock.t = AFTERNOON;
          const p = await dungeonPlayer(ctx, 1);
          sky(ctx, boon);
          const res = await p.run();
          expect(res.status).toBe(200);
          const run = res.body.run;
          return { scrap: run.rewards.parts.scrap ?? 0, rooms: run.roomsCleared };
        },
        {
          weather: true,
          dungeonRng: createSeededRng('market-scrap'),
          gearRng: createSeededRng('market-scrap-gear'),
        },
      );
    // The same seeds: the same fights (Quiet Night changes nothing in a room) and the same loot.
    const plain = await scrapUnder('quiet-night');
    const market = await scrapUnder('market-day');
    expect(market.rooms).toBe(plain.rooms);
    expect(plain.rooms).toBeGreaterThan(0);
    expect(market.scrap - plain.scrap).toBe(market.rooms);
  });

  it('Hearty Breakfast gives each creature 25% more experience for the run', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await dungeonPlayer(ctx, 1);
        sky(ctx, 'hearty-breakfast');
        const res = await p.run();
        const run = res.body.run;
        const gained = run.rewards.experience?.map((e) => e.gained) ?? [];
        expect(gained).toHaveLength(3);
        const want = dungeonExperience(run.roomsCleared, run.cleared, false, {
          bp: 2_500,
          treatMultiplier: 3,
        });
        expect(gained).toEqual([want, want, want]);
        expect(want).toBeGreaterThan(dungeonExperience(run.roomsCleared, run.cleared, false));
      },
      { weather: true },
    );
  });

  it('a run replays as it was fought, whatever the weather is later', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = AFTERNOON;
        const p = await dungeonPlayer(ctx, 1);
        sky(ctx, 'fair-winds', 'heavy-rain');
        const run = (await p.run()).body.run;
        const before = JSON.stringify((await p.replay(run.id)).body);
        sky(ctx, 'clear-skies', 'cold-snap');
        expect(JSON.stringify((await p.replay(run.id)).body)).toBe(before);
      },
      { weather: true },
    );
  });
});

// --- The raid ---

describe('the raid stage under the weather', () => {
  const CHANNEL = '555555555555555555';
  const players = (ctx: CoreContext, n: number) =>
    Array.from({ length: n }, (_, i) => seedPlayer(ctx, i + 1, { level: 15 }));

  /** The game day of Phase 1 (Friday 13:37 guild time): the weather it fights under. */
  const phase1Day = (): string =>
    gameDay(eventTimes(W02.id, HELSINKI).phase1, HELSINKI, RULES.daily.reset);

  it('puts the day on every creature of the row and into the luck, and keeps it in the stored input', async () => {
    await runRaid(
      (ctx) => {
        players(ctx, 4);
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.core.weather.force(phase1Day(), 'clear-skies', 'heavy-rain');
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const run = storedRuns(ctx.sql)[0];
        if (run === undefined) throw new Error('phase 1 did not run');
        expect(run.phase).toBe('phase1');
        expect(run.input.row.length).toBeGreaterThan(0);
        for (const slot of run.input.row) expect(slot.mods).toMatchObject({ areaBp: -1_000 });
        expect(run.input.luck?.critChanceBp).toBe(RULES.combat.luck.critChanceBp + 300);
        expect(run.input.bossAttacks).toBeUndefined();
        expect(weatherUses(ctx, 'raid')).toBe(1);
      },
      { core: { weather: true } },
    );
  });

  it('Stormfront makes the boss attack twice a round; the day before and after fight without it', async () => {
    await runRaid(
      (ctx) => {
        players(ctx, 4);
        ctx.core.raid.currentWeek(HELSINKI);
        const times = eventTimes(W02.id, HELSINKI);
        const day = (at: number): string => gameDay(at, HELSINKI, RULES.daily.reset);
        ctx.core.weather.force(day(times.phase1), 'market-day', 'stormfront');
        ctx.core.weather.force(day(times.phase2), 'market-day', null);
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        const [one, two] = storedRuns(ctx.sql);
        expect(one?.input.bossAttacks).toBe(2);
        expect(two?.input.bossAttacks).toBeUndefined();
        expect(two?.input.row.every((s) => s.mods === undefined)).toBe(true);
      },
      { core: { weather: true } },
    );
  });

  it('Kind Rain, Morning Haze and Bramble Season go into the stage input; Haze names the first creature of each row', async () => {
    await runRaid(
      (ctx) => {
        players(ctx, 4);
        ctx.core.raid.currentWeek(HELSINKI);
        const times = eventTimes(W02.id, HELSINKI);
        const day = (at: number): string => gameDay(at, HELSINKI, RULES.daily.reset);
        ctx.core.weather.force(day(times.phase1), 'kind-rain', 'morning-haze');
        ctx.core.weather.force(day(times.phase2), 'market-day', 'bramble-season');
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        const [one, two] = storedRuns(ctx.sql);
        if (one === undefined || two === undefined) throw new Error('the stages did not run');
        expect(one.input.rainHealBp).toBe(200);
        expect(one.input.brambleBp).toBeUndefined();
        const ids = one.input.row.map((s) => s.id);
        expect(one.input.skipFirstTurn).toEqual(firstOfEachRow(one.input.row));
        for (const id of one.input.skipFirstTurn ?? []) expect(ids).toContain(id);
        expect(two.input.brambleBp).toBe(3_000);
        expect(two.input.rainHealBp).toBeUndefined();
        expect(two.input.skipFirstTurn).toBeUndefined();
      },
      { core: { weather: true } },
    );
  });

  it('a stage that runs late fights under the weather of its own day', async () => {
    await runRaid(
      (ctx) => {
        players(ctx, 4);
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.core.weather.force(phase1Day(), 'fair-winds', null);
        // The object slept: two days later the stage runs, and the sky of that day is another one.
        ctx.core.weather.force(addDays(phase1Day(), 2), 'quiet-night', null);
        ctx.clock.t = zonedTimeToEpoch(addDays(phase1Day(), 2), 15, 0, HELSINKI);
        forcePool(ctx.sql, 20_000);
        ctx.core.raid.runDue(HELSINKI);
        const run = storedRuns(ctx.sql)[0];
        expect(run?.phase).toBe('phase1');
        for (const slot of run?.input.row ?? []) {
          expect(slot.mods).toEqual({ firstHitBp: 1_000 });
        }
      },
      { core: { weather: true } },
    );
  });

  it('pays the experience of the day the stage was fought under (Hearty Breakfast: 25% more)', async () => {
    await runRaid(
      (ctx) => {
        players(ctx, 4);
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.core.weather.force(phase1Day(), 'hearty-breakfast', null);
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const run = storedRuns(ctx.sql)[0];
        const gained = rows<{ props_json: string }>(
          ctx.sql,
          "SELECT props_json FROM analytics_events WHERE kind = 'creature_exp'",
        )
          .map((r) => JSON.parse(r.props_json) as { source: string; gained: number })
          .filter((e) => e.source === 'raid');
        expect(gained.length).toBeGreaterThan(0);
        const want = raidExperience('phase1', run?.result.cleared === true, {
          bp: 2_500,
          treatMultiplier: 3,
        });
        for (const e of gained) expect(e.gained).toBe(want);
      },
      { core: { weather: true } },
    );
  });

  it('says the sky in the Monday reveal and in the stage post, in one escaped line', async () => {
    await runRaid(
      async (ctx) => {
        const seeded = players(ctx, 4);
        const first =
          seeded[0] ??
          (() => {
            throw new Error('no players');
          })();
        // The sky of the reveal's day, set before the week opens and the reveal is queued.
        ctx.core.weather.force(dayOf(ctx), 'bonfire-night', 'cold-snap');
        await ctx.core.createSession(
          ctx.guildId,
          { id: first.id, displayName: first.name },
          CHANNEL,
        );
        const posts = () =>
          rows<{ key: string; content: string }>(
            ctx.sql,
            'SELECT key, content FROM discord_posts ORDER BY id',
          );
        expect(posts()[0]?.content).toContain("Today's sky: Bonfire Night and Cold Snap.");
        ctx.core.weather.force(phase1Day(), 'market-day', 'long-shadows');
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const stage = posts().find((p) => p.key.includes(':phase1:'));
        expect(stage?.content).toContain('Sky: Market Day and Long Shadows.');
        expect(count(ctx.sql, 'discord_posts')).toBeGreaterThanOrEqual(2);
      },
      { core: { weather: true } },
    );
  });

  it('a valley without weather fights exactly as before: no mods, no weather in the luck', async () => {
    await runRaid((ctx) => {
      players(ctx, 4);
      ctx.core.raid.currentWeek(HELSINKI);
      forcePool(ctx.sql, 20_000);
      ctx.clock.t = W02.afterPhase1;
      ctx.core.raid.runDue(HELSINKI);
      const run = storedRuns(ctx.sql)[0];
      for (const slot of run?.input.row ?? []) expect(slot.mods).toBeUndefined();
      expect(run?.input.bossAttacks).toBeUndefined();
      expect(weatherUses(ctx, 'raid')).toBe(0);
    });
  });
});
