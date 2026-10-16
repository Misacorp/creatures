/**
 * One scripted play-through of the duplicate choice and the Talent Book through the real routes: four
 * trips that bring duplicates (with talents the script decides), then Teach (a golden talent into a slot),
 * Fuse, Release and Recommended, "apply Recommended to all", slotting a talent from the book for Bait, and
 * the errors a player can hit. `creatures-fixtures.test.ts` checks that the server still sends the shapes of
 * the files in `apps/activity/src/fixtures`, which were captured from this scenario
 * (`creatures-capture.test.ts` prints them). Nothing here is hand-written output: every response comes
 * from the server.
 */
import { createSeededRng, type Rng } from '@creatures/game';
import { rollMissingTalents } from '../src/talent-store';
import type { Captured } from './gear-scenario';
import { SCENARIO_START } from './gear-scenario';
import type { CoreContext } from './helpers';
import { scriptedThenSeeded, seedPlayer } from './raid-helpers';

interface Json {
  status: number;
  body: Record<string, unknown>;
}

let keyCounter = 0;
const newKey = (): string => `creatures-fixture-${String(++keyCounter).padStart(8, '0')}-key`;

/** A catch that is certain, the first common species of the Tidepools (Splashet), and not shiny. */
const SPLASHET = [0, 0, 0, 1];

/**
 * The same catch once the explorer has a familiarity star, which adds a draw for the deeper area: the middle
 * value says "not deep".
 */
const SPLASHET_STARRED = [0, 0x80000000, 0, 0, 1];

/**
 * The randomness of the scenario: the catches are scripted so every roll brings a Splashet, and the
 * talent draws are scripted so the cards carry known talents: the three seeded creatures' first rolls
 * (Splashes First on the Splashet), then Wet Footprints, a golden Bigger Splash, Puddle Hopper, Splashes
 * First again (already in the book), then Wet Footprints twice more.
 */
export function creaturesScenarioOptions() {
  const catches = [
    ...SPLASHET,
    ...SPLASHET,
    ...SPLASHET,
    ...SPLASHET,
    ...SPLASHET_STARRED,
    ...SPLASHET_STARRED,
  ];
  const talents = [
    [0, 5], // the Cindle: Quick to Pounce
    [0, 5], // the Splashet: Splashes First
    [0, 5], // the Sproutle: Stands Close
    [1, 5], // card 1: Wet Footprints
    [2, 0], // card 2: Bigger Splash, golden
    [3, 5], // card 3: Puddle Hopper
    [0, 5], // card 4: Splashes First (the book has it)
    [1, 5],
    [1, 5],
  ].flat();
  return {
    rng: scriptedThenSeeded(catches, 'creatures-fixture-catch') as Rng,
    talentRng: scriptedThenSeeded(talents, 'creatures-fixture-talent') as Rng,
    gearRng: createSeededRng('creatures-fixture-gear'),
    tripRng: createSeededRng('creatures-fixture-trip'),
  };
}

export async function runCreaturesScenario(ctx: CoreContext, talentRng: Rng): Promise<Captured> {
  ctx.clock.t = SCENARIO_START;
  const out: Captured = { responses: {}, errors: [], requests: {} };
  const seeded = seedPlayer(ctx, 4, { level: 8, species: ['cindle', 'splashet', 'sproutle'] });
  const [explorer, splashet] = seeded.creatureIds as [string, string, string];
  const user = { id: seeded.id, displayName: seeded.name };
  ctx.sql.exec(
    'INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1)',
    seeded.id,
  );
  ctx.core.credit({
    userId: seeded.id,
    currency: 'bait',
    amount: 100,
    source: 'test',
    idempotencyKey: 'creatures-fixture-bait',
  });
  // The creatures of a player from before talents: their open slots are rolled once.
  rollMissingTalents(ctx.storage, talentRng, ctx.clock.t);

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

  /** One short trip of the Cindle to the Tidepools, claimed at once: a duplicate Splashet. */
  const trip = async (name?: string): Promise<Json> => {
    const sent = await call('POST', '/api/expeditions', {
      creatureId: explorer,
      destination: 'tidepools',
      duration: 'short',
      supplies: [],
      idempotencyKey: newKey(),
    });
    const expedition = sent.body['expedition'] as { id: string; endsAt: number };
    ctx.clock.t = expedition.endsAt;
    const path = `/api/expeditions/${expedition.id}/claim`;
    return name === undefined ? call('POST', path, {}) : record(name, 'POST', path, {});
  };
  const pendingOf = (res: Json): { id: string; talent: { id: string } }[] =>
    (res.body['state'] as { pending: { id: string; talent: { id: string } }[] }).pending;

  // Four duplicates arrive.
  await trip('creatures-claim');
  await trip();
  await trip();
  // Three duplicates in a row is the dupe shield's streak: the fourth catch would be a species the player lacks, so the streak is reset.
  ctx.sql.exec('UPDATE player_progress SET dupe_streak = 0');
  const fourth = await trip();
  const cards = pendingOf(fourth);
  if (cards.length !== 4)
    throw new Error(`the scenario needs 4 cards, has ${String(cards.length)}`);
  out.responses['creatures-state'] = (await call('GET', '/api/state')).body;
  const [wet, golden, puddle, again] = cards as unknown as [
    { id: string },
    { id: string },
    { id: string },
    { id: string },
  ];

  // Teach a golden talent: it takes the Splashet's one slot, and the talent it replaces stays in the book.
  await record('creatures-choose-teach', 'POST', `/api/catches/${golden.id}/choose`, {
    choice: 'teach',
    creatureId: splashet,
    slot: 1,
    idempotencyKey: newKey(),
  });
  // Fuse one, release one.
  await record('creatures-choose-fuse', 'POST', `/api/catches/${wet.id}/choose`, {
    choice: 'fuse',
    creatureId: splashet,
    idempotencyKey: newKey(),
  });
  await record('creatures-choose-release', 'POST', `/api/catches/${puddle.id}/choose`, {
    choice: 'release',
    idempotencyKey: newKey(),
  });

  // The errors a player can hit when answering.
  await fail('POST', `/api/catches/${again.id}/choose`, {
    choice: 'teach',
    creatureId: splashet,
    slot: 1,
    idempotencyKey: newKey(),
  }); // the book has that talent already
  await fail('POST', `/api/catches/${again.id}/choose`, {
    choice: 'keep',
    idempotencyKey: newKey(),
  }); // no branch to keep it for
  await fail('POST', `/api/catches/${again.id}/choose`, {
    choice: 'fuse',
    creatureId: explorer,
    idempotencyKey: newKey(),
  }); // not a creature of that line
  await fail('POST', `/api/catches/${wet.id}/choose`, {
    choice: 'release',
    idempotencyKey: newKey(),
  }); // already settled
  await fail('POST', `/api/catches/${again.id}/choose`, {
    choice: 'fuse',
    creatureId: splashet,
    slot: 1,
    idempotencyKey: newKey(),
  }); // an unknown key

  // The card marked Recommended: a Splashes First the book has, so it is a fusion.
  await record('creatures-choose-recommended', 'POST', `/api/catches/${again.id}/choose`, {
    choice: 'recommended',
    idempotencyKey: newKey(),
  });

  // Two more cards (the dupe shield's streak is reset), and one answer for both.
  ctx.sql.exec('UPDATE player_progress SET dupe_streak = 0');
  await trip();
  ctx.sql.exec('UPDATE player_progress SET dupe_streak = 0');
  await trip();
  await record('creatures-recommended-all', 'POST', '/api/catches/recommended', {
    idempotencyKey: newKey(),
  });

  // The Talent Book: Splashes First goes back into the slot, for Bait.
  await record('creatures-slot', 'POST', `/api/creatures/${splashet}/talents/slot`, {
    talentId: 'splashes-first',
    golden: false,
    slot: 1,
    idempotencyKey: newKey(),
  });
  out.responses['creatures-state-after'] = (await call('GET', '/api/state')).body;
  await fail('POST', `/api/creatures/${splashet}/talents/slot`, {
    talentId: 'splashes-first',
    golden: false,
    slot: 1,
    idempotencyKey: newKey(),
  }); // already in that slot
  await fail('POST', `/api/creatures/${splashet}/talents/slot`, {
    talentId: 'splashes-first',
    golden: false,
    slot: 2,
    idempotencyKey: newKey(),
  }); // slot 2 opens at level 20
  await fail('POST', `/api/creatures/${splashet}/talents/slot`, {
    talentId: 'puddle-hopper',
    golden: false,
    slot: 1,
    idempotencyKey: newKey(),
  }); // released, never held
  await fail('POST', `/api/creatures/${splashet}/talents/slot`, {
    talentId: 'splashes-first',
    golden: false,
    slot: 4,
    idempotencyKey: newKey(),
  }); // not a slot
  ctx.sql.exec("UPDATE balances SET amount = 0 WHERE user_id = ? AND currency = 'bait'", seeded.id);
  await fail('POST', `/api/creatures/${splashet}/talents/slot`, {
    talentId: 'bigger-splash',
    golden: true,
    slot: 1,
    idempotencyKey: newKey(),
  }); // no Bait
  return out;
}
