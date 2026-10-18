/**
 * One scripted play-through of gear and the workshop through the real routes. The capture test
 * (`gear-capture.test.ts`) writes its responses out as the fixtures in `apps/activity/src/fixtures`,
 * and `gear-fixtures.test.ts` checks that the server still sends the shapes those files have, so the
 * client can build against them. Nothing here is hand-written output: every response comes from the
 * server.
 */
import { content, createSeededRng, type PartsBundle } from '@creatures/game';
import { convertPendingGear } from '../src/gear-convert';
import { grantFestivalGear, grantRaidFinale } from '../src/gear-grants';
import { creditParts } from '../src/gear-store';
import { giveItem } from './gear-helpers';
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
    level: 20,
    species: ['cindle', 'sproutle', 'zipmouse'],
  });
  const [cindle, sproutle, zipmouse] = seeded.creatureIds as [string, string, string];
  // A Setter that has not reached the Charm slot yet, a Guard that has not reached level 20.
  ctx.sql.exec('UPDATE creatures SET level = 9 WHERE id = ?', zipmouse);
  ctx.sql.exec('UPDATE creatures SET level = 14 WHERE id = ?', sproutle);
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
  const give = (
    baseId: string,
    rarity: 'common' | 'rare' | 'epic',
    level: number,
    seed: string,
    lines?: [string, number][],
  ): string =>
    giveItem(ctx.sql, seeded.id, baseId, {
      rarity,
      level,
      seed,
      now: ctx.clock.t,
      ...(lines === undefined ? {} : { lines }),
    });
  const parts = (bundle: PartsBundle): void => creditParts(ctx.sql, seeded.id, bundle);

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
    rng: createSeededRng('fixture-raid-gear-3'),
  };
  const boss = content.bosses[0]?.id ?? '';
  grantRaidFinale(grantDeps, seeded.id, '2027-W01', 3, boss);
  grantFestivalGear(grantDeps, seeded.id, '2027-W01', 'ember', 3, boss);
  // The great one (an Ember Hat), a Scarf for the Guard, a Guard's bell and a Compass.
  const hat = give('emberkeepers-crown', 'epic', 15, 'fixture-hat', [
    ['ember-reaction', 3],
    ['crit-damage-local-pct', 2],
    ['attack-local-pct', 2],
  ]);
  give('bark-shawl', 'rare', 12, 'fixture-scarf', [
    ['aimed-ward', 2],
    ['hp-local-pct', 1],
  ]);
  const bell = give('wardens-bell', 'rare', 13, 'fixture-bell', [
    ['cover', 2],
    ['armor', 1],
  ]);
  const compass = give('crossroads-compass', 'rare', 10, 'fixture-compass', [
    ['quick-feet', 1],
    ['lucky-find', 0],
  ]);
  // One too high for the Setter to wear yet.
  const high = give('thundercap', 'rare', 16, 'fixture-high', [
    ['spark-reaction', 3],
    ['crit-chance', 2],
  ]);
  parts({ scrap: 60, 'tide-shard': 4, 'ember-shard': 4, 'spark-shard': 4, glimmer: 3 });
  ctx.sql.exec(
    "INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, 'kelp-cap', 'common', ?)",
    seeded.id,
    ctx.clock.t,
  );
  // A better base the Crafting level cannot make yet (a Brine Hood needs item level 8: Crafting level 4).
  ctx.sql.exec(
    "INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, 'brine-hood', 'common', ?)",
    seeded.id,
    ctx.clock.t,
  );
  ctx.clock.t += 1000;
  out.responses['gear-loaded'] = (await call('GET', '/api/gear')).body;

  // Equip the epic Hat on the Cindle; take it off; put it on again. Then Equip best for the team.
  await record('gear-equip', 'POST', `/api/gear/${hat}/equip`, { creatureId: cindle });
  await record('gear-unequip', 'POST', `/api/gear/${hat}/equip`, { creatureId: null });
  await record('gear-equip-again', 'POST', `/api/gear/${hat}/equip`, { creatureId: cindle });
  await record('gear-equip-best', 'POST', '/api/gear/equip-best', {
    creatureIds: [cindle, sproutle, zipmouse],
  });

  // The wear rules, as the real errors (before anyone is busy: a busy creature's gear is frozen).
  await fail('POST', `/api/gear/${high}/equip`, { creatureId: zipmouse }); // item level above the creature
  await fail('POST', `/api/gear/${compass}/equip`, { creatureId: zipmouse }); // the Charm slot opens at 13
  await fail('POST', `/api/gear/${bell}/equip`, { creatureId: cindle }); // a Guard's bell on a Payoff

  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'brine-hood',
    idempotencyKey: newKey(),
  }); // a better base needs a higher Crafting level

  // A job: a craft of the Kelp Cap. And an Improve job from before gear v2 still running.
  const craft = await record('job-start-craft', 'POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'kelp-cap',
    reach: 'none',
    idempotencyKey: newKey(),
  });
  ctx.sql.exec(
    `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
     VALUES (?, ?, ?, 'improve', NULL, ?, ?, ?)`,
    '00000000-0000-4000-8000-0000000000aa',
    seeded.id,
    sproutle,
    JSON.stringify({ rarity: 'rare', gearId: 'gone', secondaryIndex: 0, cost: { scrap: 6 } }),
    ctx.clock.t,
    ctx.clock.t + 2 * HOUR,
  );
  out.responses['gear-running'] = (await call('GET', '/api/gear')).body;

  // Busy creatures and a full workshop, as the real errors.
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'kelp-cap',
    idempotencyKey: newKey(),
  }); // the creature is on a job
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: cindle,
    blueprintId: 'kelp-cap',
    idempotencyKey: newKey(),
  }); // both slots are in use
  await fail('POST', '/api/expeditions', {
    creatureId: zipmouse,
    destination: 'tidepools',
    duration: 'short',
    supplies: [],
    idempotencyKey: newKey(),
  });
  const craftJob = (craft.body['result'] as { jobId: string }).jobId;
  await fail('POST', `/api/workshop/jobs/${craftJob}/claim`, { idempotencyKey: newKey() });

  // The time passes: the old Improve job (2 h) is ready first, the craft (3 h) a little later.
  ctx.clock.t += 2 * HOUR + 1000;
  await record(
    'job-claim-retired',
    'POST',
    '/api/workshop/jobs/00000000-0000-4000-8000-0000000000aa/claim',
    { idempotencyKey: newKey() },
  );
  ctx.clock.t += HOUR;
  out.responses['gear-ready'] = (await call('GET', '/api/gear')).body;
  await record('job-claim-craft', 'POST', `/api/workshop/jobs/${craftJob}/claim`, {
    idempotencyKey: newKey(),
  });

  // What a craft and a dismantle would give, before anything starts (the numbers are the server's).
  await record('preview-craft', 'POST', '/api/workshop/preview', {
    kind: 'craft',
    creatureId: cindle,
    blueprintId: 'kelp-cap',
  });
  // Dismantle the Festival piece in a Workshop job (2 hours), claim it, and look at the state again.
  const festive = (
    (out.responses['gear-loaded'] as { items: { id: string; festival: boolean }[] }).items.find(
      (i) => i.festival,
    ) as { id: string }
  ).id;
  await record('preview-dismantle', 'POST', '/api/workshop/preview', {
    kind: 'dismantle',
    creatureId: zipmouse,
    itemIds: [festive],
  });
  const taking = await record('job-start-dismantle', 'POST', '/api/workshop/jobs', {
    kind: 'dismantle',
    creatureId: zipmouse,
    itemIds: [festive],
    idempotencyKey: newKey(),
  });
  ctx.clock.t += 2 * HOUR + 1000;
  await record(
    'job-claim-dismantle',
    'POST',
    `/api/workshop/jobs/${(taking.body['result'] as { jobId: string }).jobId}/claim`,
    { idempotencyKey: newKey() },
  );
  // One more craft left running, so the final state has a running job beside the claimed ones: a
  // Reach for a Rare (it asks for Crafting level 3 and Essence).
  ctx.sql.exec(
    `INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 250)
     ON CONFLICT(user_id, creature_id) DO UPDATE SET xp = excluded.xp`,
    seeded.id,
    cindle,
  );
  ctx.core.credit({
    userId: seeded.id,
    currency: 'essence',
    amount: 100,
    source: 'test',
    idempotencyKey: 'fixture-essence',
  });
  await record('job-start-craft-2', 'POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: cindle,
    blueprintId: 'kelp-cap',
    reach: 'rare',
    idempotencyKey: newKey(),
  });
  out.responses['gear-final'] = (await call('GET', '/api/gear')).body;
  out.responses['collection-state'] = (await call('GET', '/api/state')).body;

  // More errors a player can hit, and what gear v2 removed.
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'trail-cap',
    idempotencyKey: newKey(),
  }); // blueprint not learned
  const reused = newKey();
  const kitJob = await call('POST', '/api/workshop/jobs', {
    kind: 'dismantle',
    creatureId: zipmouse,
    itemIds: [kit],
    idempotencyKey: reused,
  });
  await fail('POST', '/api/workshop/jobs', {
    kind: 'dismantle',
    creatureId: zipmouse,
    itemIds: [hat],
    idempotencyKey: reused,
  }); // the key of another action
  // The kit's job (15 minutes) is claimed, so the creature and the slot are free again.
  ctx.clock.t += 15 * 60_000 + 1000;
  await call(
    'POST',
    `/api/workshop/jobs/${((kitJob.body['result'] ?? {}) as { jobId?: string }).jobId ?? ''}/claim`,
    { idempotencyKey: newKey() },
  );
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'kelp-cap',
    reach: 'epic',
    idempotencyKey: newKey(),
  }); // the Crafting level is too low for a Reach for Epic
  await fail('POST', '/api/workshop/jobs', {
    kind: 'dismantle',
    creatureId: zipmouse,
    itemIds: [hat, bell],
    idempotencyKey: newKey(),
  }); // an Epic and a Rare cannot share a job
  await fail('POST', `/api/gear/${hat}/dismantle`, { idempotencyKey: newKey() }); // dismantling is a job now
  await call('POST', '/api/expeditions', {
    creatureId: sproutle,
    destination: 'tidepools',
    duration: 'short',
    supplies: [],
    idempotencyKey: newKey(),
  });
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: sproutle,
    blueprintId: 'kelp-cap',
    idempotencyKey: newKey(),
  }); // the creature is away on an expedition
  ctx.sql.exec("UPDATE parts SET amount = 0 WHERE kind = 'scrap'");
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'kelp-cap',
    idempotencyKey: newKey(),
  }); // not enough parts
  for (let i = 0; i < 60; i++) give('trail-cap', 'common', 1, `fixture-bulk-${String(i)}`);
  parts({ scrap: 30, 'tide-shard': 3 });
  await fail('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: zipmouse,
    blueprintId: 'kelp-cap',
    idempotencyKey: newKey(),
  }); // the inventory is full
  await fail('POST', `/api/gear/${hat}/equip`, { creatureId: 'not-a-uuid' });
  await fail('POST', '/api/gear/00000000-0000-4000-8000-000000000000/equip', { creatureId: null });
  await fail('POST', `/api/gear/${hat}/upgrade`, { idempotencyKey: newKey() }); // gone with gear v2
  await fail('POST', '/api/workshop/jobs', {
    kind: 'enchant',
    creatureId: zipmouse,
    gearId: hat,
    enchantId: 'ember-fury',
    idempotencyKey: newKey(),
  }); // gone with gear v2
  await fail('POST', '/api/gear/equip-best', { creatureIds: [] });
  return out;
}

/**
 * A player whose old gear is converted on the first load after the migration: the notice card, and
 * dismissing it. The old rows are written the way migration 27 leaves them (`gear_legacy`,
 * `gear_conversion`) and the real conversion runs.
 */
export async function runConversionScenario(ctx: CoreContext): Promise<Captured> {
  ctx.clock.t = SCENARIO_START;
  const out: Captured = { responses: {}, errors: [], requests: {} };
  const seeded = seedPlayer(ctx, 3, { level: 8, species: ['cindle', 'sproutle', 'zipmouse'] });
  const [cindle, sproutle, zipmouse] = seeded.creatureIds as [string, string, string];
  const old = (
    id: string,
    baseId: string,
    rarity: string,
    level: number,
    enchant: string | null,
    on: string | null,
  ) =>
    ctx.sql.exec(
      `INSERT INTO gear_legacy (id, user_id, base_id, rarity, level, rolls_json, enchant_id, equipped_on, source, created_at)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?, 'test', ?)`,
      id,
      seeded.id,
      baseId,
      rarity,
      level,
      enchant,
      on,
      ctx.clock.t,
    );
  // A worn Attack piece, a worn HP piece, a worn speed piece, and an unworn one.
  old('00000000-0000-4000-8000-000000000001', 'cinder-charm', 'rare', 3, null, cindle);
  old('00000000-0000-4000-8000-000000000002', 'forge-band', 'epic', 5, 'ember-fury', sproutle);
  old('00000000-0000-4000-8000-000000000003', 'static-charm', 'common', 0, null, zipmouse);
  old('00000000-0000-4000-8000-000000000004', 'pearl-trinket', 'epic', 2, null, null);
  ctx.sql.exec(
    "INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, 'trail-charm', 'common', ?), (?, 'fortune-charm', 'rare', ?), (?, 'wave-band', 'rare', ?)",
    seeded.id,
    ctx.clock.t,
    seeded.id,
    ctx.clock.t,
    seeded.id,
    ctx.clock.t,
  );
  ctx.sql.exec('INSERT OR IGNORE INTO gear_conversion (user_id) VALUES (?)', seeded.id);
  ctx.sql.exec(
    "INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, 'welcome', 'welcome', ?, ?)",
    seeded.id,
    JSON.stringify({ gear: [], converted: [], parts: {}, blueprints: [] }),
    ctx.clock.t,
  );
  convertPendingGear({
    storage: ctx.storage,
    now: () => ctx.clock.t,
    rng: createSeededRng('fixture-convert'),
  });
  const user = { id: seeded.id, displayName: seeded.name };
  const secret = await ctx.core.createSession(ctx.guildId, user);
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  out.responses['gear-notice'] = (await call('GET', '/api/gear')).body;
  const dismissed = await call('POST', '/api/gear/conversion/dismiss', {});
  out.responses['gear-notice-dismissed'] = dismissed.body;
  out.requests['gear-notice-dismiss'] = {
    path: '/api/gear/conversion/dismiss',
    method: 'POST',
    body: {},
  };
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
    destination: 'ember-caves',
    duration: 'long',
    supplies: [],
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
