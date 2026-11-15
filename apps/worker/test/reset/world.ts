// A small staging-shaped world for the reset's tests: three players, a bot, ties, a dev creature, a private note, blueprints,
// Crafting, Explorer and dungeon rows, plus a few rows in tables the wipe must delete.
import { content } from '@creatures/game';
import type { CoreContext } from '../helpers';

export const KEY = 'test-only-settler-hmac-key-0123456789';
export const DAY = 86_400_000;

export const ANN = '800000000000000001';
export const BOB = '800000000000000002';
export const CY = '800000000000000003';
export const BOT = 'dev-guest-0';

/** A hostile nickname: markdown, a user mention, @everyone, a channel link, a custom emoji, a link. */
export const HOSTILE =
  '**BIG** @everyone <@123456789012345678> <#42> <:x:1> [a](http://x.test) `c`';

const lineOf = (species: string): string => {
  const s = content.creatures.find((c) => c.id === species);
  if (s === undefined) throw new Error(`unknown species ${species}`);
  return s.line;
};

export interface Made {
  annCindle: string;
  bobAshmole: string;
}

export function seedWorld(ctx: Pick<CoreContext, 'sql' | 'clock'>): Made {
  const t = ctx.clock.t;
  const player = (id: string, name: string, createdAt: number): void => {
    ctx.sql.exec(
      'INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
      id,
      name,
      createdAt,
      t,
    );
  };
  let n = 0;
  const creature = (o: {
    user: string;
    species: string;
    level: number;
    origin: string;
    caught: number;
    nickname?: string;
    shiny?: boolean;
    note?: string;
  }): string => {
    const id = `c-${String(++n)}`;
    ctx.sql.exec(
      `INSERT INTO creatures (id, user_id, line, species, level, fusion_count, shiny, nickname, origin, caught_at, quirk_id, ribbons, note)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, 0, ?)`,
      id,
      o.user,
      lineOf(o.species),
      o.species,
      o.level,
      o.shiny === true ? 1 : 0,
      o.nickname ?? null,
      o.origin,
      o.caught,
      o.note ?? null,
    );
    return id;
  };
  player(ANN, 'Ann', t - 30 * DAY);
  player(BOB, 'Bob', t - 29 * DAY);
  player(CY, 'Cy', t - 3 * DAY);
  player(BOT, 'Bot', t - 3 * DAY);

  // Starters are never "first" (Bob's starter sproutle is older than Ann's). Ann and Bob caught a zipmouse at the same instant: they share it.
  creature({ user: ANN, species: 'splashet', level: 3, origin: 'starter', caught: t - 30 * DAY });
  const annCindle = creature({
    user: ANN,
    species: 'pyrelynx',
    level: 20,
    origin: 'expedition',
    caught: t - 20 * DAY,
    nickname: 'Pebbles',
  });
  creature({
    user: ANN,
    species: 'sproutle',
    level: 12,
    origin: 'expedition',
    caught: t - 10 * DAY,
    nickname: HOSTILE,
    shiny: true,
    note: 'a private note nobody may keep',
  });
  creature({ user: BOB, species: 'sproutle', level: 4, origin: 'starter', caught: t - 29 * DAY });
  creature({ user: BOB, species: 'zipmouse', level: 20, origin: 'festival', caught: t - 15 * DAY });
  const bobAshmole = creature({
    user: BOB,
    species: 'ashmole',
    level: 31,
    origin: 'expedition',
    caught: t - 5 * DAY,
    nickname: 'Ember',
  });
  // Cy: a dev-tool creature (does not count for firsts), and a bot's creature (the bot is not a settler).
  creature({ user: CY, species: 'mistnewt', level: 7, origin: 'dev', caught: t - 40 * DAY });
  creature({ user: BOT, species: 'stormray', level: 50, origin: 'guest', caught: t - 50 * DAY });
  creature({
    user: ANN,
    species: 'zipmouse',
    level: 9,
    origin: 'expedition',
    caught: t - 15 * DAY,
  });
  // So: Ann is first cindle, sproutle and zipmouse; Bob is first zipmouse (shared) and ashmole; nobody is first mistnewt or stormray.

  ctx.sql.exec(
    `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed, cleared, rooms_cleared, summary_json, rewards_json, created_at)
     VALUES ('r1', ?, '2027-01-01', 1, 'k1', 'f', 18, 's', 1, 5, '{}', '{}', ?),
            ('r2', ?, '2027-01-02', 1, 'k2', 'f', 25, 's', 0, 2, '{}', '{}', ?),
            ('r3', ?, '2027-01-03', 1, 'k3', 'f', 7, 's', 1, 5, '{}', '{}', ?)`,
    ANN,
    t,
    ANN,
    t,
    BOB,
    t,
  );
  ctx.sql.exec(
    "INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, 'a', 'common', ?), (?, 'b', 'common', ?), (?, 'c', 'common', ?)",
    ANN,
    t,
    ANN,
    t,
    BOB,
    t,
  );
  ctx.sql.exec(
    'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 100000)',
    BOB,
    bobAshmole,
  );
  ctx.sql.exec(
    'INSERT INTO crafting_skill (user_id, creature_id, xp) VALUES (?, ?, 0)',
    ANN,
    annCindle,
  );
  ctx.sql.exec(
    'INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, 100000, 9)',
    ANN,
    annCindle,
  );
  // Rows in tables that must go.
  ctx.sql.exec(
    "INSERT INTO balances (user_id, currency, amount) VALUES (?, 'bait', 50), (?, 'bait', 7)",
    ANN,
    BOB,
  );
  ctx.sql.exec(
    'INSERT INTO player_progress (user_id, starter_species) VALUES (?, ?)',
    ANN,
    'splashet',
  );
  return { annCindle, bobAshmole };
}
