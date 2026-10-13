/**
 * One scripted play-through of gear and the workshop through the real routes. The capture test
 * (`gear-fixtures.test.ts`) writes its responses out as the fixtures in `apps/activity/src/fixtures`,
 * and the same test checks that the server still sends the shapes those files have, so the client can
 * build against them. Nothing here is hand-written output: every response comes from the server.
 */
import { createSeededRng, rollGear, type PartsBundle } from '@creatures/game';
import { grantFestivalGear, grantRaidFinale } from '../src/gear-grants';
import { creditParts, insertItem } from '../src/gear-store';
import type { CoreContext } from './helpers';
import { seedPlayer } from './raid-helpers';

/** Tuesday of week 2027-W02: no raid phase resolves while the scenario runs. */
export const SCENARIO_START = Date.parse('2027-01-12T06:00:00Z');
const HOUR = 3_600_000;

export interface Captured {
  /** Named responses: bodies of successful calls. */
  responses: Record<string, unknown>;
  /** Real error bodies: `{ route, status, body }`. */
  errors: { route: string; status: number; body: unknown }[];
  /** Request bodies the client sends, `{ path, method, body }`, with real ids. */
  requests: Record<string, { path: string; method: string; body: unknown }>;
}

interface Json {
  status: number;
  body: Record<string, unknown>;
}

let keyCounter = 0;
const newKey = (): string => `fixture-${String(++keyCounter).padStart(8, '0')}-key`;

export async function runGearScenario(ctx: CoreContext): Promise<Captured> {
  ctx.clock.t = SCENARIO_START;
  const out: Captured = { responses: {}, errors: [], requests: {} };
  const seeded = seedPlayer(ctx, 1, {
    level: 10,
    species: ['cindle', 'sproutle', 'zipmouse'],
  });
  const [cindle, sproutle, zipmouse] = seeded.creatureIds as [string, string, string];
  ctx.sql.exec('UPDATE creatures SET level = 7 WHERE id = ?', zipmouse);
  const user = { id: seeded.id, displayName: seeded.name };
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
  /** Calls, remembers the request, and stores the response (or the error) under `name`. */
  const record = async (name: string, method: string, path: string, body?: unknown) => {
    const res = await call(method, path, body);
    if (res.status === 200) {
      out.responses[name] = res.body;
      if (body !== undefined) out.requests[name] = { path, method, body };
    } else {
      out.errors.push({
        route: `${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}`,
        status: res.status,
        body: res.body,
      });
    }
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
  const give = (baseId: string, rarity: 'common' | 'rare' | 'epic', seed: string): string =>
    insertItem(
      ctx.sql,
      seeded.id,
      { baseId, rarity, rolls: rollGear(createSeededRng(seed), baseId, rarity) },
      'test',
      ctx.clock.t,
    );
  const parts = (bundle: PartsBundle): void => creditParts(ctx.sql, seeded.id, bundle);

  ctx.core.credit({
    userId: seeded.id,
    currency: 'essence',
    amount: 179,
    source: 'test',
    idempotencyKey: 'fixture-essence',
  });
  ctx.core.credit({
    userId: seeded.id,
    currency: 'bait',
    amount: 100,
    source: 'test',
    idempotencyKey: 'fixture-bait',
  });

  // The first gear load: the welcome kit.
  const first = await record('gear-welcome', 'GET', '/api/gear');
  const kit = (first.body['items'] as { id: string }[])[0]?.id as string;

  // Loot as the raid gives it: a finale roll, a Festival piece and scrap, through the real grants.
  const grantDeps = {
    storage: ctx.storage,
    now: () => ctx.clock.t,
    rng: createSeededRng('fixture-raid-gear'),
  };
  grantRaidFinale(grantDeps, seeded.id, '2027-W01', 3);
  grantFestivalGear(grantDeps, seeded.id, '2027-W01', 'ember');
  const rare = give('volt-band', 'rare', 'fixture-volt');
  const epic = give('phoenix-trinket', 'epic', 'fixture-phoenix');
  parts({ scrap: 60, 'tide-shard': 4, 'ember-shard': 4, 'spark-shard': 4, glimmer: 3 });
  ctx.sql.exec(
    'INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, ?, ?, ?)',
    seeded.id,
    'wave-band',
    'rare',
    ctx.clock.t,
  );
  ctx.clock.t += 1000;
  out.responses['gear-loaded'] = (await call('GET', '/api/gear')).body;

  // Equip the epic trinket on the Cindle; then swap the kit item on, which takes it off.
  await record('gear-equip', 'POST', `/api/gear/${epic}/equip`, { creatureId: cindle });
  await record('gear-unequip', 'POST', `/api/gear/${epic}/equip`, { creatureId: null });
  await record('gear-equip-again', 'POST', `/api/gear/${epic}/equip`, { creatureId: cindle });

  // Upgrade the kit item (Essence and scrap).
  await record('gear-upgrade', 'POST', `/api/gear/${kit}/upgrade`, { idempotencyKey: newKey() });

  // Jobs: a craft and an improve, then (once the craft is done) an enchant.
  const craft = await record('job-start-craft', 'POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'wave-band',
    idempotencyKey: newKey(),
  });
  const improve = await record('job-start-improve', 'POST', '/api/workshop/jobs', {
    kind: 'improve',
    creatureId: sproutle,
    gearId: rare,
    secondaryIndex: 0,
    idempotencyKey: newKey(),
  });
  out.responses['gear-running'] = (await call('GET', '/api/gear')).body;

  // Busy creatures, and a full workshop, as the real errors.
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'wave-band',
    idempotencyKey: newKey(),
  });
  await fail('POST', '/api/workshop/jobs', {
    kind: 'enchant',
    creatureId: cindle,
    gearId: epic,
    enchantId: 'ember-fury',
    idempotencyKey: newKey(),
  }); // both slots are in use
  await fail('POST', '/api/expeditions', {
    creatureId: zipmouse,
    duration: 'short',
    supplies: 'basic',
    idempotencyKey: newKey(),
  });
  await fail('POST', `/api/gear/${rare}/dismantle`, { idempotencyKey: newKey() });
  const craftJob = (craft.body['result'] as { jobId: string }).jobId;
  const improveJob = (improve.body['result'] as { jobId: string }).jobId;
  await fail('POST', `/api/workshop/jobs/${craftJob}/claim`, { idempotencyKey: newKey() });

  // The time passes: the improve (2 h) is ready first, the craft (8 h) later.
  ctx.clock.t += 3 * HOUR;
  out.responses['gear-ready'] = (await call('GET', '/api/gear')).body;
  await record('job-claim-improve', 'POST', `/api/workshop/jobs/${improveJob}/claim`, {
    idempotencyKey: newKey(),
  });
  ctx.clock.t += 6 * HOUR;
  await record('job-claim-craft', 'POST', `/api/workshop/jobs/${craftJob}/claim`, {
    idempotencyKey: newKey(),
  });
  const enchant = await record('job-start-enchant', 'POST', '/api/workshop/jobs', {
    kind: 'enchant',
    creatureId: zipmouse,
    gearId: epic,
    enchantId: 'ember-fury',
    idempotencyKey: newKey(),
  });
  ctx.clock.t += 7 * HOUR;
  await record(
    'job-claim-enchant',
    'POST',
    `/api/workshop/jobs/${(enchant.body['result'] as { jobId: string }).jobId}/claim`,
    { idempotencyKey: newKey() },
  );

  // Dismantle the Festival piece, and look at the state again.
  const festive = (
    (out.responses['gear-loaded'] as { items: { id: string; rarity: string }[] }).items.find(
      (i) => i.rarity === 'festival',
    ) as { id: string }
  ).id;
  parts({ scrap: 30 });
  await record('gear-dismantle', 'POST', `/api/gear/${festive}/dismantle`, {
    idempotencyKey: newKey(),
  });
  // One more craft left running, so the final state has a running job beside the claimed ones.
  await record('job-start-craft-2', 'POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: cindle,
    blueprintId: 'wave-band',
    idempotencyKey: newKey(),
  });
  out.responses['gear-final'] = (await call('GET', '/api/gear')).body;
  out.responses['collection-state'] = (await call('GET', '/api/state')).body;

  // More errors a player can hit.
  const upgradeBody = () => ({ idempotencyKey: newKey() });
  const enchantBody = (enchantId: string) => ({
    kind: 'enchant',
    creatureId: zipmouse,
    gearId: epic,
    enchantId,
    idempotencyKey: newKey(),
  });
  await fail('POST', '/api/workshop/jobs', enchantBody('ember-fury')); // already has it
  await fail('POST', '/api/workshop/jobs', enchantBody('guards-bulwark')); // no Grove shards
  ctx.sql.exec("UPDATE balances SET amount = 0 WHERE currency = 'essence'");
  await fail('POST', `/api/gear/${kit}/upgrade`, upgradeBody()); // no Essence
  ctx.sql.exec("UPDATE parts SET amount = 0 WHERE kind = 'scrap'");
  await fail('POST', `/api/gear/${kit}/upgrade`, upgradeBody()); // no scrap
  ctx.sql.exec('UPDATE gear_items SET level = 5 WHERE id = ?', kit);
  await fail('POST', `/api/gear/${kit}/upgrade`, upgradeBody()); // at the top
  const reused = newKey();
  parts({ scrap: 30 });
  await call('POST', `/api/gear/${kit}/dismantle`, { idempotencyKey: reused }).then(async () => {
    await fail('POST', `/api/gear/${epic}/dismantle`, { idempotencyKey: reused }); // key of another action
  });
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'trail-charm',
    idempotencyKey: newKey(),
  }); // blueprint not learned
  await fail('POST', '/api/workshop/jobs', {
    kind: 'improve',
    creatureId: zipmouse,
    gearId: give('trail-charm', 'common', 'fixture-common'),
    secondaryIndex: 0,
    idempotencyKey: newKey(),
  }); // a Common item has no extra stat to re-roll
  await call('POST', '/api/expeditions', {
    creatureId: sproutle,
    duration: 'short',
    supplies: 'basic',
    idempotencyKey: newKey(),
  });
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: sproutle,
    blueprintId: 'wave-band',
    idempotencyKey: newKey(),
  }); // the creature is away on an expedition
  for (let i = 0; i < 60; i++) give('trail-charm', 'common', `fixture-bulk-${String(i)}`);
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'wave-band',
    idempotencyKey: newKey(),
  }); // the inventory is full
  await fail('POST', `/api/gear/${epic}/equip`, { creatureId: 'not-a-uuid' });
  await fail('POST', '/api/gear/00000000-0000-4000-8000-000000000000/equip', { creatureId: null });
  return out;
}

/**
 * A twelve hour expedition whose loot has a shard, a glimmer and a blueprint (the gear rng the test
 * injects is scripted to hit every chance), claimed through the real route.
 */
export async function runExpeditionScenario(ctx: CoreContext): Promise<Captured> {
  ctx.clock.t = SCENARIO_START;
  const out: Captured = { responses: {}, errors: [], requests: {} };
  const seeded = seedPlayer(ctx, 2, { level: 8, species: ['cindle', 'splashet', 'sproutle'] });
  const user = { id: seeded.id, displayName: seeded.name };
  ctx.sql.exec(
    'INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1)',
    seeded.id,
  );
  ctx.core.credit({
    userId: seeded.id,
    currency: 'bait',
    amount: 200,
    source: 'test',
    idempotencyKey: 'fixture-bait-2',
  });
  let secret = await ctx.core.createSession(ctx.guildId, user);
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  const sent = await call('POST', '/api/expeditions', {
    creatureId: seeded.creatureIds[0],
    duration: 'long',
    supplies: 'basic',
    idempotencyKey: newKey(),
  });
  const expedition = sent.body['expedition'] as { id: string; endsAt: number };
  ctx.clock.t = expedition.endsAt;
  secret = await ctx.core.createSession(ctx.guildId, user);
  const path = `/api/expeditions/${expedition.id}/claim`;
  const claimed = await call('POST', path, {});
  out.responses['expedition-claim-loot'] = claimed.body;
  out.requests['expedition-claim'] = { path, method: 'POST', body: {} };
  return out;
}
