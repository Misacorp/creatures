/**
 * A guild database as staging held it after commit b9cb38d ("Creatures B"), the first release of gear v2,
 * before the base-stats work edited migration 27 and the item shape in place (commit 20b9c42).
 *
 * What differed then, and is written here exactly as the old code wrote it:
 * - `gear_items` had the rarity CHECK `('common', 'rare', 'epic', 'festival')` (Festival was a rarity);
 * - items carried the old line ids, including `sturdy-blow` (removed since) and `attack`, `hp` and
 *   `thick-coat` as rollable lines of Hats and Scarves (they are Charm and talent lines now);
 * - jobs, results and grants stored the rarity `festival` in item snapshots and loot;
 * - there was no `level_reset` table, and creatures held their old (unhalved) levels.
 *
 * The rows are inserted by SQL, not through the game, because the code that wrote them is gone.
 */
import { ribbonsForLevel } from '@creatures/game';
import { apiPlayer, type Api } from './gear-helpers';
import type { CoreContext } from './helpers';
import { HOUR } from './kit';

/** `gear_items` exactly as migration 27 made it at b9cb38d. */
export function oldGearItemsTable(sql: SqlStorage): void {
  sql.exec('DROP TABLE gear_items');
  sql.exec(`CREATE TABLE gear_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    base_id TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('hat', 'scarf', 'charm')),
    tag TEXT NOT NULL,
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'festival')),
    item_level INTEGER NOT NULL CHECK (item_level BETWEEN 1 AND 20),
    lines_json TEXT NOT NULL,
    made_by TEXT,
    made_by_name TEXT,
    made_at INTEGER,
    origin_json TEXT NOT NULL DEFAULT '{}',
    equipped_on TEXT,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  // The rest of the database is today's (migration 48 is recorded as done), so the table has its mark column.
  sql.exec('ALTER TABLE gear_items ADD COLUMN dismantle_mark INTEGER NOT NULL DEFAULT 0');
  sql.exec('CREATE INDEX gear_items_user ON gear_items(user_id, created_at)');
  sql.exec(
    'CREATE UNIQUE INDEX gear_items_worn ON gear_items(equipped_on, slot) WHERE equipped_on IS NOT NULL',
  );
}

export interface OldItem {
  id: string;
  baseId: string;
  slot: 'hat' | 'scarf' | 'charm';
  tag: string;
  rarity: 'common' | 'rare' | 'epic' | 'festival';
  level: number;
  lines: { id: string; tier: number }[];
  on?: string | null;
  source?: string;
  origin?: object;
}

export interface Staging {
  player: Api;
  /** Creature ids: 0 is level 30, 1 level 12, 2 level 20, 3 to 5 level 6 with open jobs. */
  c: string[];
  items: Record<string, string>;
  jobs: Record<string, string>;
}

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * One player the way Misa's staging account would look: converted items with old base and line ids
 * (some worn), Festival-rarity pieces, open and claimed craft, dismantle, supply and improve jobs, and
 * old grants (loot records).
 */
export async function seedStagingPlayer(
  ctx: CoreContext,
  n: number,
  /** Which two of `craftRunning`, `dismantleReady`, `supplyRunning` and `improveReady` are open (the workshop has two slots). */
  openJobs: readonly string[] = ['dismantleReady', 'improveReady'],
): Promise<Staging> {
  const player = await apiPlayer(ctx, n, {
    creatures: 6,
    level: 20,
    species: ['cindle', 'sproutle', 'zipmouse', 'splashet', 'stormray', 'mossback'],
  });
  const c = player.creatureIds;
  const sql = ctx.sql;
  const now = ctx.clock.t;
  const levels = [30, 12, 20, 6, 6, 6];
  c.forEach((id, i) => {
    const level = levels[i] ?? 6;
    // b9cb38d had `exp` and `ribbons` (migration 30) and the old levels; no halving yet.
    sql.exec(
      'UPDATE creatures SET level = ?, exp = ?, ribbons = ? WHERE id = ?',
      level,
      (i * 37) % 90,
      ribbonsForLevel(level),
      id,
    );
  });

  const items: OldItem[] = [
    {
      id: uuid(1),
      baseId: 'trail-cap',
      slot: 'hat',
      tag: 'neutral',
      rarity: 'rare',
      level: 4,
      lines: [
        { id: 'sturdy-blow', tier: 2 },
        { id: 'hp', tier: 1 },
      ],
      on: c[0] ?? null,
      source: 'converted',
      origin: { kind: 'converted' },
    },
    {
      id: uuid(2),
      baseId: 'patch-scarf',
      slot: 'scarf',
      tag: 'neutral',
      rarity: 'epic',
      level: 4,
      lines: [
        { id: 'thick-coat', tier: 3 },
        { id: 'attack', tier: 1 },
        { id: 'sturdy-blow', tier: 0 },
      ],
      source: 'converted',
      origin: { kind: 'converted' },
    },
    {
      id: uuid(3),
      baseId: 'festival-hearth-scarf',
      slot: 'scarf',
      tag: 'ember',
      rarity: 'festival',
      level: 4,
      lines: [
        { id: 'sturdy-blow', tier: 1 },
        { id: 'hp', tier: 0 },
      ],
      on: c[1] ?? null,
      source: 'converted',
      origin: { kind: 'converted' },
    },
    {
      id: uuid(4),
      baseId: 'festival-lantern-charm',
      slot: 'charm',
      tag: 'tide',
      rarity: 'festival',
      level: 4,
      lines: [{ id: 'attack', tier: 2 }],
      on: c[0] ?? null,
      source: 'converted',
      origin: { kind: 'converted' },
    },
    {
      id: uuid(5),
      baseId: 'trail-charm',
      slot: 'charm',
      tag: 'neutral',
      rarity: 'common',
      level: 4,
      lines: [{ id: 'sturdy-blow', tier: 1 }],
      on: c[2] ?? null,
      source: 'converted',
      origin: { kind: 'converted' },
    },
    {
      id: uuid(6),
      baseId: 'kelp-cap',
      slot: 'hat',
      tag: 'tide',
      rarity: 'common',
      level: 3,
      lines: [],
      source: 'raid_finale',
      origin: { kind: 'raid', boss: 'tidal-colossus', rank: 1 },
    },
    {
      id: uuid(7),
      baseId: 'cinder-charm',
      slot: 'charm',
      tag: 'ember',
      rarity: 'rare',
      level: 5,
      lines: [
        { id: 'attack', tier: 3 },
        { id: 'hp', tier: 2 },
      ],
      source: 'dungeon',
      origin: { kind: 'dungeon', depth: 3 },
    },
  ];
  for (const o of items) {
    sql.exec(
      `INSERT INTO gear_items (id, user_id, base_id, slot, tag, rarity, item_level, lines_json, made_by,
         made_by_name, made_at, origin_json, equipped_on, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
      o.id,
      player.id,
      o.baseId,
      o.slot,
      o.tag,
      o.rarity,
      o.level,
      JSON.stringify(o.lines),
      JSON.stringify(o.origin ?? {}),
      o.on ?? null,
      o.source ?? 'test',
      now - HOUR,
    );
  }

  // Blueprints (the old table has a rarity column and marks).
  for (const [baseId, marks] of [
    ['trail-cap', 1],
    ['kelp-cap', 0],
    ['cinder-charm', 2],
  ] as const) {
    sql.exec(
      "INSERT INTO blueprints (user_id, base_id, rarity, learned_at, marks) VALUES (?, ?, 'common', ?, ?)",
      player.id,
      baseId,
      now - 5 * HOUR,
      marks,
    );
  }
  sql.exec(
    `INSERT INTO parts (user_id, kind, amount) VALUES (?, 'scrap', 200), (?, 'glimmer', 30),
       (?, 'tide-shard', 20), (?, 'ember-shard', 20), (?, 'grove-shard', 20), (?, 'spark-shard', 20)`,
    ...Array<string>(6).fill(player.id),
  );

  const common = { xp: 20, skillXp: 120, skillLevel: 2, leveledUp: false };
  const jobs: Record<string, string> = {};
  const job = (
    name: string,
    n: number,
    creature: string | undefined,
    kind: string,
    input: object,
    start: number,
    end: number,
    claimed: number | null,
    result: object | null,
  ): void => {
    // The workshop has two slots: only one pair of the four open jobs is open in a given database.
    if (claimed === null && !openJobs.includes(name)) return;
    const id = uuid(100 + n);
    jobs[name] = id;
    sql.exec(
      `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at,
         claimed_at, result_json, work_minutes)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      id,
      player.id,
      creature ?? 'none',
      kind,
      JSON.stringify(input),
      start,
      end,
      claimed,
      result === null ? null : JSON.stringify(result),
      claimed === null ? 0 : 60,
    );
  };
  const cost = { scrap: 6 };
  // Open: a running craft, a finished dismantle (its snapshots hold a Festival-rarity piece) and a
  // running supply, plus an Improve from before gear v2 that is ready.
  job(
    'craftRunning',
    1,
    c[3],
    'craft',
    { baseId: 'trail-cap', cost, reach: 'none', marks: 1, level: 3 },
    now - HOUR,
    now + 4 * HOUR,
    null,
    null,
  );
  job(
    'dismantleReady',
    2,
    c[4],
    'dismantle',
    {
      cost: {},
      level: 3,
      items: [
        { baseId: 'festival-hearth-scarf', rarity: 'festival', itemLevel: 4 },
        { baseId: 'acorn-cap', rarity: 'rare', itemLevel: 4 },
      ],
    },
    now - 5 * HOUR,
    now - HOUR,
    null,
    null,
  );
  job(
    'supplyRunning',
    3,
    c[5],
    'supply',
    { supplyId: 'map-scrap-basic', cost: { scrap: 2 } },
    now - HOUR,
    now + 2 * HOUR,
    null,
    null,
  );
  job(
    'improveReady',
    4,
    c[5],
    'improve',
    { gearId: uuid(99), cost: { scrap: 10 } },
    now - 6 * HOUR,
    now - 2 * HOUR,
    null,
    null,
  );
  // Claimed, newest first in the view: a craft, a dismantle of a Festival piece, a supply and a retired Improve.
  job(
    'craftClaimed',
    5,
    c[0],
    'craft',
    { baseId: 'kelp-cap', cost, reach: 'none', marks: 0, level: 3 },
    now - 30 * HOUR,
    now - 26 * HOUR,
    now - 25 * HOUR,
    {
      kind: 'craft',
      gearId: uuid(6),
      baseId: 'kelp-cap',
      rarity: 'common',
      itemLevel: 6,
      reach: 'none',
      upgraded: false,
      ...common,
    },
  );
  job(
    'dismantleClaimed',
    6,
    c[1],
    'dismantle',
    {
      cost: {},
      level: 3,
      items: [{ baseId: 'festival-lantern-charm', rarity: 'festival', itemLevel: 5 }],
    },
    now - 24 * HOUR,
    now - 20 * HOUR,
    now - 19 * HOUR,
    {
      kind: 'dismantle',
      items: [{ baseId: 'festival-lantern-charm', rarity: 'festival', itemLevel: 5 }],
      parts: { scrap: 14, glimmer: 2 },
      essence: 3,
      learned: [],
      marked: [],
      ...common,
    },
  );
  job(
    'supplyClaimed',
    7,
    c[2],
    'supply',
    { supplyId: 'map-scrap-basic', cost: { scrap: 2 } },
    now - 18 * HOUR,
    now - 16 * HOUR,
    now - 15 * HOUR,
    { kind: 'supply', supplyId: 'map-scrap-basic', amount: 2, ...common },
  );
  job(
    'retiredClaimed',
    8,
    c[3],
    'improve',
    { gearId: uuid(98), cost: { scrap: 4 } },
    now - 60 * HOUR,
    now - 50 * HOUR,
    now - 49 * HOUR,
    { kind: 'retired', was: 'improve', refund: { scrap: 4 }, ...common },
  );

  // Loot records (grants) as the b9cb38d code stored them: item levels are there, Festival is a rarity.
  const grant = (key: string, source: string, view: object, at: number): void => {
    sql.exec(
      'INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, ?, ?, ?, ?)',
      player.id,
      key,
      source,
      JSON.stringify(view),
      at,
    );
  };
  grant(
    'welcome',
    'welcome',
    {
      gear: [{ id: uuid(6), baseId: 'trail-cap', rarity: 'common', itemLevel: 1 }],
      converted: [],
      parts: { scrap: 10 },
      blueprints: [{ baseId: 'trail-cap', duplicate: false }],
    },
    now - 90 * HOUR,
  );
  grant(
    'festival:2027-W01',
    'festival',
    {
      gear: [{ id: uuid(3), baseId: 'festival-hearth-scarf', rarity: 'festival', itemLevel: 5 }],
      converted: [{ baseId: 'festival-lantern-charm', rarity: 'festival', itemLevel: 5 }],
      parts: { scrap: 3 },
      blueprints: [],
    },
    now - 80 * HOUR,
  );
  grant(
    'raid:2027-W01:finale',
    'raid_finale',
    {
      gear: [{ id: uuid(7), baseId: 'cinder-charm', rarity: 'epic', itemLevel: 5 }],
      converted: [],
      parts: {},
      blueprints: [{ baseId: 'kelp-cap', duplicate: true, marks: 1 }],
    },
    now - 70 * HOUR,
  );

  // Converted, with the one-time notice, long ago.
  sql.exec(
    'INSERT OR REPLACE INTO gear_conversion (user_id, converted_at, notice_json, seen_at) VALUES (?, ?, NULL, ?)',
    player.id,
    now - 100 * HOUR,
    now - 99 * HOUR,
  );
  return {
    player,
    c,
    items: Object.fromEntries(items.map((o, i) => [`i${String(i + 1)}`, o.id])),
    jobs,
  };
}

/**
 * Puts a freshly migrated database back to what staging held at b9cb38d: the old item table and no
 * level-reset list. Call before seeding; then `core.migrate()` plays "the first start of 20b9c42".
 */
export function rewindToB9cb38d(ctx: CoreContext): void {
  oldGearItemsTable(ctx.sql);
  ctx.sql.exec('DROP TABLE IF EXISTS level_reset');
}
