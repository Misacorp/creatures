// The seeded guild with 15 FULL houses, shared by the read budget (`housing-reads.test.ts`) and the query plan audit
// (`query-plan-audit.test.ts`): every part built, every spot filled, every piece, skin, stamp, blueprint and material held, the guestbook
// at its keep, a mailbox with 20 gifts, a trophy hall with every display fed. The worst case of each housing path.
import { canPlace, expeditionContent, type PriceLine } from '@creatures/game';
import { housing as content } from '@creatures/game/housing-content';
import {
  addItem,
  addStamp,
  grantOnce,
  insertDrop,
  upsertPart,
  type Spots,
} from '../src/housing-store';
import { callAs, PLAYERS, userId, type GuildEnv, type World } from './read-world';
import type { GuildCore } from '../src/guild-core';

/** Fills every spot of a room kind with the first piece that fits (a bed only once). */
function furnish(kindId: string): Spots {
  const kind = content.rooms.find((r) => r.id === kindId);
  const spots: Spots = {};
  let bed = false;
  for (const spot of kind?.spots ?? []) {
    if (spot.type === 'display') continue;
    const piece = content.pieces.find((p) => {
      if (!canPlace(content, kindId, spot.id, p.id)) return false;
      const isBed = content.forms.find((f) => f.id === p.form)?.bed === true;
      return !isBed || !bed;
    });
    if (piece === undefined) continue;
    if (content.forms.find((f) => f.id === piece.form)?.bed === true) bed = true;
    spots[spot.id] = { p: piece.id };
  }
  return spots;
}

/** A full house for every player (the pool of player 1 is left to build). */
export function seedHouses(env: GuildEnv, world: World): void {
  const { metered, clock } = env;
  const sql = metered.sql;
  const housing = world.core.housing;
  if (housing === null) throw new Error('housing is off');
  const now = clock.t;
  for (let n = 1; n <= PLAYERS; n++) {
    const id = userId(n);
    housing.ensure(id);
    for (const part of content.parts) {
      if (n === 1 && part.id === 'pool') continue;
      upsertPart(sql, id, part.id, {}, now);
      housing.finishPart(id, part, now);
    }
    for (const piece of content.pieces) addItem(sql, id, 'piece', piece.id, 2, 0, now);
    for (const skin of content.skins) grantOnce(sql, id, 'skin', skin.id, now);
    for (const stamp of content.stamps) grantOnce(sql, id, 'stamp', stamp.id, now);
    for (const m of content.materials) addItem(sql, id, 'material', m.id, 12, 3, now);
    for (const item of [...content.pieces, ...content.skins]) {
      if (item.unlock.kind !== 'starter') grantOnce(sql, id, 'blueprint', item.id, now);
    }
    // Every room furnished, a sleeper on the beds of three rooms.
    const mine = world.creatures[id] ?? [];
    let sleepers = 0;
    for (const row of sql
      .exec<{ room_id: string }>('SELECT room_id FROM house_rooms WHERE user_id = ?', id)
      .toArray()) {
      const [partId, key] = row.room_id.split(':');
      const kindId = content.parts
        .find((p) => p.id === partId)
        ?.rooms.find((r) => r.key === key)?.kind;
      if (kindId === undefined) continue;
      const spots = furnish(kindId);
      for (const spot of Object.values(spots)) {
        const isBed =
          content.forms.find((f) => f.id === content.pieces.find((p) => p.id === spot.p)?.form)
            ?.bed === true;
        const creature = mine[sleepers];
        if (isBed && sleepers < 3 && creature !== undefined) {
          spot.m = creature;
          sleepers++;
        }
      }
      sql.exec(
        'UPDATE house_rooms SET spots_json = ? WHERE user_id = ? AND room_id = ?',
        JSON.stringify(spots),
        id,
        row.room_id,
      );
    }
    // The trophy hall: every display has something to read.
    for (const boss of [
      'tidal-colossus',
      'cinder-wyrm',
      'thornmother',
      'storm-sovereign',
      'old-bogback',
    ]) {
      sql.exec(
        "INSERT INTO house_trophies (user_id, kind, ref, best, wins, last_week) VALUES (?, 'raid', ?, 4, 3, '2027-W02')",
        id,
        boss,
      );
    }
    sql.exec(
      "INSERT INTO house_trophies (user_id, kind, ref, best, wins, last_week) VALUES (?, 'festival', 'sunbird', 0, 1, '2027-W02')",
      id,
    );
    sql.exec(
      'INSERT OR REPLACE INTO games_medals (user_id, gold, silver, bronze, pins) VALUES (?, 5, 4, 3, 9)',
      id,
    );
    for (const [i, creature] of mine.slice(0, 20).entries()) {
      sql.exec(
        'INSERT OR IGNORE INTO games_badges (creature_id, event_id, user_id, wins) VALUES (?, ?, ?, 2)',
        creature,
        `event-${String(i % 4)}`,
        id,
      );
    }
    for (const place of ['market', 'forge', 'bonfire', 'paddock', 'lab', 'house']) {
      for (let project = 1; project <= 4; project++) {
        sql.exec(
          'INSERT OR IGNORE INTO valley_gifts (user_id, place, project, given_milli, plaque) VALUES (?, ?, ?, 1000, 1)',
          id,
          place,
          project,
        );
      }
    }
    sql.exec(
      'INSERT OR REPLACE INTO dungeon_progress (user_id, depth, streak, runs, clears) VALUES (?, 14, 3, 20, 9)',
      id,
    );
    for (const entry of expeditionContent.journal.entries) {
      sql.exec(
        'INSERT OR IGNORE INTO journal (user_id, entry_id, found_at) VALUES (?, ?, 1)',
        id,
        entry.id,
      );
    }
    // A full guestbook, a mailbox with 20 gifts, the drops of two weeks.
    for (let i = 0; i < 30; i++) {
      const visitor = userId(2 + (i % (PLAYERS - 1)));
      addStamp(
        sql,
        id,
        visitor === id ? userId(1) : visitor,
        'paw-print',
        `2027-01-${String(i + 1).padStart(2, '0')}`,
        now - i,
        30,
      );
    }
    for (let i = 0; i < 20; i++) {
      sql.exec(
        "INSERT INTO house_mail (owner_id, from_id, kind, amount, day, at) VALUES (?, ?, 'gift', 5, ?, ?)",
        id,
        `5${String(n * 100 + i).padStart(17, '0')}`,
        `2026-12-${String(i + 1).padStart(2, '0')}`,
        now - i,
      );
    }
    for (let i = 0; i < 14; i++) {
      insertDrop(
        sql,
        id,
        `trip:${String(i)}`,
        now - i * 1000,
        JSON.stringify({ materials: { driftwood: 1 }, blueprint: null, stamp: null }),
      );
    }
  }
}

/** Stock for player 1's pool, a craft and a skin. */
export function stockPlayerOne(env: GuildEnv): void {
  const sql = env.metered.sql;
  const pool = content.parts.find((p) => p.id === 'pool');
  const id = userId(1);
  const lines: PriceLine[] = pool?.price ?? [];
  const bait = lines.filter((l) => l.kind === 'bait').reduce((n, l) => n + l.amount, 0);
  sql.exec(
    `INSERT INTO balances (user_id, currency, amount) VALUES (?, 'bait', ?)
     ON CONFLICT(user_id, currency) DO UPDATE SET amount = amount + excluded.amount`,
    id,
    bait + 5000,
  );
  sql.exec(
    `INSERT INTO parts (user_id, kind, amount) VALUES (?, 'scrap', 20000), (?, 'tide-shard', 30)
     ON CONFLICT(user_id, kind) DO UPDATE SET amount = amount + excluded.amount`,
    id,
    id,
  );
}

/** What a housing path is wrapped in: the read budget measures it, the plan audit only runs it. */
export type Around = (name: string, run: () => Promise<unknown>) => Promise<void>;

/**
 * Runs every housing path as player 1 (a partial payment, the payment that finishes the pool, a craft, a placement, a skin, a housemate,
 * a gift, a stamp, the mailbox, "seen", the three reads and the catalogue). `core` is an object of the world's build with housing on.
 */
export async function runHousingPaths(
  env: GuildEnv,
  world: World,
  core: GuildCore,
  around: Around,
): Promise<void> {
  const { metered } = env;
  const call = (n: number, path: string, method = 'GET', body?: unknown) =>
    callAs(core, world.secrets, n, path, { method, ...(body === undefined ? {} : { body }) });
  const k = (n: string): string => `read-housing-${n}-key`;
  await around('own', () => call(1, '/api/house'));
  await around('visit', () => call(1, `/api/houses/${userId(2)}`));
  await around('list', () => call(1, '/api/houses'));
  await around('catalogue', () => call(1, '/api/house/catalogue'));
  // A part paid into without finishing it (the common call): a partial payment.
  await around('pay', () =>
    call(1, '/api/house/build', 'POST', {
      partId: 'pool',
      pay: { bait: 50 },
      idempotencyKey: k('pay'),
    }),
  );
  // The pool, paid in full in one call: the part is built and its room made.
  await around('build', () =>
    call(1, '/api/house/build', 'POST', {
      partId: 'pool',
      pay: {
        bait: 400,
        scrap: 2600,
        shards: { tide: 25 },
        materials: { 'sea-glass': 12, moonstone: 12, 'cinder-garnet': 12, 'storm-quartz': 12 },
      },
      idempotencyKey: k('build'),
    }),
  );
  await around('craft', () =>
    call(1, '/api/house/craft', 'POST', { itemId: 'rocking-chair', idempotencyKey: k('craft') }),
  );
  await around('place', () =>
    call(1, '/api/house/place', 'PUT', {
      roomId: 'hut:hearth',
      spotId: 'floor-small-b',
      pieceId: 'cosy-chair',
    }),
  );
  await around('skin', () =>
    call(1, '/api/house/skin', 'PUT', { target: 'exterior', roof: 'slate' }),
  );
  const bed = metered.sql
    .exec<{ room_id: string; spots_json: string }>(
      "SELECT room_id, spots_json FROM house_rooms WHERE user_id = ? AND (spots_json LIKE '%-bed%' OR spots_json LIKE '%hammock%') LIMIT 1",
      userId(1),
    )
    .one();
  const spots = JSON.parse(bed.spots_json) as Spots;
  const bedSpot = Object.entries(spots).find(([, s]) => /-bed$|hammock/.test(s.p))?.[0] ?? '';
  const creature = (world.creatures[userId(1)] ?? [])[5] ?? '';
  await around('housemate', () =>
    call(1, '/api/house/housemate', 'PUT', {
      roomId: bed.room_id,
      spotId: bedSpot,
      creatureId: creature,
    }),
  );
  await around('gift', () =>
    call(1, `/api/houses/${userId(2)}/gift`, 'POST', { idempotencyKey: k('gift') }),
  );
  await around('stamp', () =>
    call(1, `/api/houses/${userId(3)}/stamp`, 'POST', { stampId: 'paw-print' }),
  );
  await around('collect', () =>
    call(1, '/api/house/mail/collect', 'POST', { idempotencyKey: k('collect') }),
  );
  await around('seen', () => call(1, '/api/house/seen', 'POST', {}));
}

/** The world's build with housing on, full houses seeded, player 1's stock in place: what both checks start from. */
export function housingCore(env: GuildEnv, world: World, build: string): GuildCore {
  const core = env.mk(build, { housing: true });
  seedHouses(env, { ...world, core });
  stockPlayerOne(env);
  return core;
}
