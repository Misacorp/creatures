/**
 * One scripted play-through of expeditions v2 through the real routes: a paid send, the end-of-trip
 * choice, a failed risky goal, a safe goal that works (with a journal page and a new slot), a recall,
 * the profile, the destinations and a supply made in the Workshop. `expeditions-fixtures.test.ts` checks
 * that the server still sends the shapes of the files in `apps/activity/src/fixtures`, which were
 * captured from this scenario (`expeditions-capture.test.ts` prints them). Nothing here is hand-written
 * output: every response comes from the server.
 */
import { RULES, createSeededRng, type Rng } from '@creatures/game';
import { creditParts } from '../src/gear-store';
import type { Captured } from './gear-scenario';
import { SCENARIO_START } from './gear-scenario';
import type { CoreContext } from './helpers';
import { seedPlayer } from './raid-helpers';

const HOUR = 3_600_000;

interface Json {
  status: number;
  body: Record<string, unknown>;
}

let keyCounter = 0;
const newKey = (): string => `trips-fixture-${String(++keyCounter).padStart(8, '0')}-key`;

/**
 * The randomness the scenario needs: catches are seeded, and the trip rng is a switch (every draw 0 makes
 * every chance succeed, 9999 makes the goal's chance fail), so the captured outcomes are known.
 */
export function tripsScenarioOptions() {
  const draw = { v: 0 };
  const tripRng: Rng = { nextU32: () => draw.v };
  return {
    draw,
    options: {
      rng: createSeededRng('trips-fixture-catch'),
      gearRng: createSeededRng('trips-fixture-gear'),
      tripRng,
    },
  };
}

export async function runTripsScenario(ctx: CoreContext, draw: { v: number }): Promise<Captured> {
  ctx.clock.t = SCENARIO_START;
  const out: Captured = { responses: {}, errors: [], requests: {} };
  const seeded = seedPlayer(ctx, 3, { level: 8, species: ['cindle', 'splashet', 'sproutle'] });
  const [explorer, second] = seeded.creatureIds as [string, string, string];
  const user = { id: seeded.id, displayName: seeded.name };
  ctx.sql.exec(
    'INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1)',
    seeded.id,
  );
  ctx.core.credit({
    userId: seeded.id,
    currency: 'bait',
    amount: 300,
    source: 'test',
    idempotencyKey: 'trips-fixture-bait',
  });
  // Rank 3 for the explorer (a risky goal can come up), two finished trips so far (the next opens a slot).
  ctx.sql.exec(
    'INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, ?, 0)',
    seeded.id,
    explorer,
    RULES.expeditions.rank.xpForRank[2] ?? 0,
  );
  ctx.sql.exec(
    `INSERT INTO account_stats (user_id, stat, value) VALUES (?, 'trips_finished', ?)`,
    seeded.id,
    RULES.expeditions.slots.secondAfterTrips - 1,
  );
  ctx.sql.exec(
    "INSERT INTO supplies (user_id, supply_id, amount) VALUES (?, 'lure-great', 3)",
    seeded.id,
  );

  let secret = await ctx.core.createSession(ctx.guildId, user);
  let signedAt = ctx.clock.t;
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    if (ctx.clock.t - signedAt >= 30 * 60_000) {
      secret = await ctx.core.createSession(ctx.guildId, user);
      signedAt = ctx.clock.t;
    }
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  const record = async (name: string, method: string, path: string, body?: unknown) => {
    const res = await call(method, path, body);
    if (res.status !== 200)
      throw new Error(`${method} ${path} failed: ${JSON.stringify(res.body)}`);
    out.responses[name] = res.body;
    if (body !== undefined) out.requests[name] = { path, method, body };
    return res;
  };
  const fail = async (method: string, path: string, body: unknown) => {
    const res = await call(method, path, body);
    if (res.status === 200) throw new Error(`${method} ${path} was meant to fail`);
    out.errors.push({
      route: `${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}`,
      status: res.status,
      body: res.body,
    });
    return res;
  };
  const sendBody = (creatureId: string, extra: Record<string, unknown> = {}) => ({
    creatureId,
    destination: 'tidepools',
    duration: 'long',
    supplies: [],
    idempotencyKey: newKey(),
    ...extra,
  });
  const idOf = (res: Json): string => (res.body['expedition'] as { id: string }).id;
  const endOf = (res: Json): number => (res.body['expedition'] as { endsAt: number }).endsAt;

  // A paid send: a supply from stock and one bought for Bait.
  const sent = await record(
    'expedition-send',
    'POST',
    '/api/expeditions',
    sendBody(explorer, {
      supplies: [
        { id: 'lure-great', source: 'owned' },
        { id: 'map-scrap-basic', source: 'buy' },
      ],
    }),
  );
  const tripId = idOf(sent);
  // The errors a player can hit when sending.
  await fail('POST', '/api/expeditions', sendBody(explorer)); // the creature is away
  await fail('POST', '/api/expeditions', sendBody(second)); // the one slot is in use
  await fail('POST', '/api/expeditions', { ...sendBody(second), extra: 1 }); // an unknown key
  await fail('POST', `/api/expeditions/${tripId}/push-on`, { goalId: 'forage' }); // not ready yet

  // The trip ends: the state carries the offer.
  ctx.clock.t = endOf(sent);
  const offered = await record('expedition-state-offer', 'GET', '/api/state');
  const goals =
    (
      offered.body['expeditions'] as {
        id: string;
        offer: { goals: { id: string; risk: string }[] };
      }[]
    ).find((e) => e.id === tripId)?.offer?.goals ?? [];
  const risky = goals.find((g) => g.risk === 'risky');
  const safe = goals.find((g) => g.risk === 'safe');
  if (risky === undefined || safe === undefined) throw new Error('the scenario needs both goals');
  await fail('POST', `/api/expeditions/${tripId}/push-on`, { goalId: 'ancient-vault' }); // not offered

  // A risky goal that fails: the whole trip brings nothing home.
  const chosen = await record('expedition-push-on', 'POST', `/api/expeditions/${tripId}/push-on`, {
    goalId: risky.id,
  });
  await fail('POST', `/api/expeditions/${tripId}/push-on`, { goalId: safe.id }); // already chosen
  ctx.clock.t = (chosen.body['expedition'] as { pushOn: { endsAt: number } }).pushOn.endsAt + 1;
  draw.v = 9_999;
  const failedPath = `/api/expeditions/${tripId}/claim`;
  await record('expedition-claim-failed', 'POST', failedPath, {});
  out.requests['expedition-claim'] = { path: failedPath, method: 'POST', body: {} };
  draw.v = 0;

  // With the slot free again: the other ways a send can be refused.
  await fail('POST', '/api/expeditions', sendBody(second, { destination: 'old-crossroads' })); // needs rank 2
  await fail('POST', '/api/expeditions', sendBody(second, { destination: 'festival-grounds' })); // not Festival week
  await fail('POST', '/api/expeditions', sendBody(second, { duration: 'day' })); // needs a higher rank
  await fail(
    'POST',
    '/api/expeditions',
    sendBody(second, { supplies: [{ id: 'lure-good', source: 'owned' }] }),
  ); // none in stock
  await fail(
    'POST',
    '/api/expeditions',
    sendBody(second, {
      supplies: [
        { id: 'lure-basic', source: 'buy' },
        { id: 'lure-good', source: 'buy' },
      ],
    }),
  ); // two of a kind
  // A safe goal that works, with a journal page and the second slot opening.
  const next = await record(
    'expedition-send-2',
    'POST',
    '/api/expeditions',
    sendBody(explorer, { supplies: [{ id: 'lure-great', source: 'owned' }] }),
  );
  const nextId = idOf(next);
  ctx.clock.t = endOf(next);
  const seen = await call('GET', '/api/state');
  const offer = (
    seen.body['expeditions'] as {
      id: string;
      offer: { goals: { id: string; risk: string }[] } | null;
    }[]
  ).find((e) => e.id === nextId)?.offer;
  const safeGoal = offer?.goals.find((g) => g.risk === 'safe');
  if (safeGoal === undefined) throw new Error('no safe goal offered');
  const taken = await call('POST', `/api/expeditions/${nextId}/push-on`, { goalId: safeGoal.id });
  ctx.clock.t = (taken.body['expedition'] as { pushOn: { endsAt: number } }).pushOn.endsAt + 1;
  await record('expedition-claim-worked', 'POST', `/api/expeditions/${nextId}/claim`, {});
  out.responses['expedition-state-after'] = (await call('GET', '/api/state')).body;

  // A recall: a trip claimed half way.
  const third = await record('expedition-send-3', 'POST', '/api/expeditions', sendBody(second));
  const thirdId = idOf(third);
  ctx.clock.t += 6 * HOUR;
  await record('expedition-claim-recall', 'POST', `/api/expeditions/${thirdId}/claim`, {});

  // The profile and the destinations.
  await record('expedition-profile', 'GET', '/api/profile');
  await record('expedition-destinations', 'GET', '/api/destinations');

  // A supply from the Workshop.
  creditParts(ctx.sql, seeded.id, { scrap: 10 });
  const started = await record('workshop-start-supply', 'POST', '/api/workshop/jobs', {
    kind: 'supply',
    creatureId: explorer,
    supplyId: 'lure-basic',
    idempotencyKey: newKey(),
  });
  const jobId = (started.body['result'] as { jobId: string }).jobId;
  ctx.clock.t += 8 * HOUR;
  await record('workshop-claim-supply', 'POST', `/api/workshop/jobs/${jobId}/claim`, {
    idempotencyKey: newKey(),
  });
  await fail('POST', '/api/workshop/jobs', {
    kind: 'supply',
    creatureId: explorer,
    supplyId: 'lure-great',
    idempotencyKey: newKey(),
  }); // the Crafting level is too low
  return out;
}
