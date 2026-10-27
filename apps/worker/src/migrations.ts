/**
 * The schema migrations of a guild's Durable Object database. `SCHEMA_VERSION` is the version of a
 * fresh database: adding a migration to the end of the list raises it by one (tests use it).
 */
import { whileAwayMigration } from './while-away';
import { analyticsRollupMigration } from './analytics-rollup';
import { creatureNoteMigration } from './creature-note-migration';
import { dismantleMarkMigration } from './dismantle-mark-migration';
import { creatureQuirkMigration } from './creature-quirk-migration';
import { creaturesAMigration } from './creatures-a-migration';
import { creaturesBMigration } from './creatures-b-migration';
import { raidReadinessMigration } from './raid-readiness';
import { raidTeamCacheMigration } from './raid-teams';
import { historyIndexMigration } from './history-index-migration';
import { gamesIndexMigration } from './games-index-migration';
import { dmNotifyMigration } from './dm-migration';
import { dungeonDraftMigration } from './dungeon-draft-migration';
import { dungeonMigration } from './dungeon-migration';
import { dungeonPathMigration } from './dungeon-path-migration';
import { expeditionsMigration } from './expedition-migration';
import { fusionPointsMigration } from './fusion-points-migration';
import { gamesBadgesMigration } from './games-badges-migration';
import { gamesMigrationV39 } from './games-migration';
import { gearMigration } from './gear-migration';
import { gearV2Migration } from './gear-v2-migration';
import { loungeMigration } from './lounge';
import { loungeCompanyMigration } from './lounge-company';
import { maintenanceMigration } from './maintenance';
import { dbReadsMigration } from './read-meter';
import { raidAutofireMigration } from './raid-autofire-migration';
import { raidDifficultyMigration } from './raid-difficulty-migration';
import { raidLiveMigration } from './raid-live-migration';
import { raidLivePacingMigration } from './raid-live-pacing-migration';
import { raidMigration } from './raid-migration';
import { raidPlacementCapMigration } from './raid-placement-cap-migration';
import { raidProgressionMigration } from './raid-progression-migration';
import { weatherMigration } from './weather-migration';
import { workshopConvertMigration } from './workshop-convert-migration';
import { workshopV2Migration } from './workshop-v2-migration';

/** Versioned schema migrations; index 0 is version 1. Never edit a released migration. */
export const MIGRATIONS: readonly ((sql: SqlStorage) => void)[] = [
  (sql) => {
    sql.exec(`CREATE TABLE players (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES players(user_id),
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX sessions_user_id ON sessions(user_id)');
  },
  (sql) => {
    // No foreign key to players: leet credits can arrive for Discord users who have not opened
    // the game yet, and they see the balance on first login.
    sql.exec(`CREATE TABLE ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ('bait', 'essence')),
      amount INTEGER NOT NULL CHECK (amount <> 0),
      source TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      meta TEXT,
      result TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, idempotency_key)
    )`);
    sql.exec('CREATE INDEX ledger_user_id_id ON ledger(user_id, id)');
    sql.exec(`CREATE TABLE balances (
      user_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      PRIMARY KEY (user_id, currency)
    )`);
    sql.exec(`CREATE TABLE leet_sync (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cursor TEXT,
      since_date TEXT NOT NULL,
      last_synced_at INTEGER
    )`);
  },
  (sql) => {
    // The guild this object serves, written on first session creation. The Worker verifies the
    // guild with Discord, so the Durable Object does not rely on `ctx.id.name`.
    sql.exec(`CREATE TABLE guild_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      guild_id TEXT NOT NULL
    )`);
  },
  (sql) => {
    // One creature per (player, line): duplicates fuse into it. No foreign keys, as in the ledger:
    // rows are only written by this module, always inside a transaction.
    sql.exec(`CREATE TABLE creatures (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      line TEXT NOT NULL,
      species TEXT NOT NULL,
      level INTEGER NOT NULL CHECK (level >= 1),
      fusion_count INTEGER NOT NULL DEFAULT 0 CHECK (fusion_count BETWEEN 0 AND 5),
      shiny INTEGER NOT NULL DEFAULT 0,
      nickname TEXT,
      away_expedition_id TEXT,
      origin TEXT NOT NULL,
      caught_at INTEGER NOT NULL,
      UNIQUE (user_id, line)
    )`);
    sql.exec(`CREATE TABLE expeditions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      creature_id TEXT NOT NULL,
      duration TEXT NOT NULL,
      supplies TEXT NOT NULL,
      rolls INTEGER NOT NULL,
      cost INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'claimed')),
      claimed_at INTEGER,
      result TEXT
    )`);
    sql.exec('CREATE INDEX expeditions_user_status ON expeditions(user_id, status)');
    sql.exec(`CREATE TABLE player_progress (
      user_id TEXT PRIMARY KEY,
      starter_species TEXT,
      expeditions_claimed INTEGER NOT NULL DEFAULT 0,
      dupe_streak INTEGER NOT NULL DEFAULT 0
    )`);
    // "First on server": every user who got the species in the drop that first produced it.
    sql.exec(`CREATE TABLE server_firsts (
      kind TEXT NOT NULL CHECK (kind IN ('catch', 'evolve')),
      species TEXT NOT NULL,
      user_id TEXT NOT NULL,
      drop_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (kind, species, user_id)
    )`);
  },
  (sql) => {
    // The guild's IANA timezone. The default is written out (not interpolated) because a released
    // migration must never change; it equals DEFAULT_GUILD_TIMEZONE.
    sql.exec("ALTER TABLE guild_meta ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Helsinki'");
  },
  (sql) => {
    // Sync health, shown to players. `last_error` is an error kind only (never a message, URL or
    // key); `last_days` is the number of days processed by the last successful run.
    sql.exec('ALTER TABLE leet_sync ADD COLUMN last_attempt_at INTEGER');
    sql.exec('ALTER TABLE leet_sync ADD COLUMN last_error TEXT');
    sql.exec('ALTER TABLE leet_sync ADD COLUMN last_days INTEGER');
  },
  (sql) => {
    // Which kind of leet source ('http' or 'mock') the stored cursor belongs to. When the
    // configured source changes, the cursor from the old source is meaningless and is reset.
    sql.exec('ALTER TABLE leet_sync ADD COLUMN source TEXT');
  },
  // Version 8: the weekly raid (see raid-migration.ts).
  raidMigration,
  (sql) => {
    // The channel the Activity was most recently launched from (Discord's verified location), and
    // the queue of posts to it. `key` is unique per announced thing, so a post is queued once.
    sql.exec('ALTER TABLE guild_meta ADD COLUMN announce_channel_id TEXT');
    sql.exec(`CREATE TABLE discord_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX discord_posts_due ON discord_posts(status, next_attempt_at)');
  },
  // Version 10: the live finale (see raid-live-migration.ts).
  raidLiveMigration,
  (sql) => {
    // A server admin can pin the announcement channel: while pinned, logins no longer change
    // `announce_channel_id`. Each session also remembers the channel it was launched from (Discord's
    // verified location; null for sessions made before this migration).
    sql.exec(
      'ALTER TABLE guild_meta ADD COLUMN announce_channel_pinned INTEGER NOT NULL DEFAULT 0',
    );
    sql.exec('ALTER TABLE sessions ADD COLUMN channel_id TEXT');
  },
  // Version 12: the Boss Rank ladder, seasons and Festival weeks (see raid-progression-migration.ts).
  raidProgressionMigration,
  // Version 13: a personality quirk for every creature (see creature-quirk-migration.ts).
  creatureQuirkMigration,
  // Version 14: auto fire preferences for the finale (see raid-autofire-migration.ts).
  raidAutofireMigration,
  // Version 15: content-paced live rounds (see raid-live-pacing-migration.ts).
  raidLivePacingMigration,
  (sql) => {
    // Version 16: the analytics event log (see analytics.ts and docs/design/analytics.md). Events hold
    // ids from content, enums, integers and booleans only, and a hashed actor; never names or text.
    sql.exec(`CREATE TABLE analytics_events (
      id INTEGER PRIMARY KEY,
      at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      actor_hash TEXT,
      props_json TEXT NOT NULL
    )`);
    sql.exec('CREATE INDEX analytics_events_at ON analytics_events(at)');
    // Session detection: when each (hashed) player was last seen.
    sql.exec(`CREATE TABLE analytics_seen (
      actor_hash TEXT PRIMARY KEY,
      last_at INTEGER NOT NULL
    )`);
    // Once-only marks (for example one live join per player per finale), keyed by a hashed label.
    sql.exec(`CREATE TABLE analytics_once (
      key TEXT PRIMARY KEY,
      at INTEGER NOT NULL
    )`);
  },
  // Version 17: gear, parts, blueprints, the workshop and the Crafting skill (see gear-migration.ts).
  gearMigration,
  // Version 18: the daily dungeon's runs, personal progress and day seeds (see dungeon-migration.ts).
  dungeonMigration,
  // Version 19: expeditions v2, explorer ranks, familiarity, the journal, account stats, supplies and the
  // slot wipe (see expedition-migration.ts).
  expeditionsMigration,
  // Version 20: the daily analytics rollups (see analytics-rollup.ts).
  analyticsRollupMigration,
  (sql) => {
    // Version 21: the living room's lounger (see lounger.ts and docs/design/living-room.md). The
    // creature that lounges for each player; NULL until first needed (picked lazily, no backfill).
    sql.exec('ALTER TABLE players ADD COLUMN lounger_id TEXT');
  },
  // Version 22: repairs raid boards with more than three creatures of one player (see
  // raid-placement-cap-migration.ts).
  raidPlacementCapMigration,
  (sql) => {
    // Version 23: the spot a player has chosen in the living room (see lounger.ts and
    // docs/design/living-room.md). An id from the shared spot list and the server time of the claim;
    // both NULL until the player drags their creature somewhere (no backfill).
    sql.exec('ALTER TABLE players ADD COLUMN lounge_spot TEXT');
    sql.exec('ALTER TABLE players ADD COLUMN lounge_spot_at INTEGER');
  },
  // Version 24: the raid difficulty version of each week (see raid-difficulty-migration.ts).
  raidDifficultyMigration,
  (sql) => {
    // Version 25: the daily Bait allowance (see allowance.ts). One row per player and game day that
    // was paid (the Bait itself is a ledger credit keyed `allowance:<day>`); `announced` is set when
    // /api/me has told the player, so the client shows the allowance once. Older rows are pruned.
    sql.exec(`CREATE TABLE daily_allowance (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      granted_at INTEGER NOT NULL,
      announced INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    )`);
  },
  // Version 26: the saved dungeon team draft (see dungeon-draft-migration.ts).
  dungeonDraftMigration,
  // Version 27: gear v2, the new item table, blueprint marks and the conversion list (see
  // gear-v2-migration.ts; the conversion itself runs after the migrations, see gear-convert.ts).
  gearV2Migration,
  // Version 28: talents, the Talent Book, pending duplicates and two creatures per branching line (see
  // creatures-a-migration.ts; the existing creatures' talents are rolled after the migrations, see
  // talent-store.ts).
  creaturesAMigration,
  // Version 29: the crafting loop: dismantle jobs and the nominal minutes a job worked (see
  // workshop-v2-migration.ts).
  workshopV2Migration,
  // Version 30: creature experience and ribbons, the trip treat flag and the pity counters (see
  // creatures-b-migration.ts).
  creaturesBMigration,
  // Version 31: Boons and Omens, the drawn days and the weather stored on trips (see
  // weather-migration.ts).
  weatherMigration,
  (sql) => {
    // Version 32: who put each raid placement on the board. NULL is the owner; otherwise the teammate
    // who moved it for a player who was away (the away assist is gone since 2026-10-26: the column is no
    // longer written or read). Existing rows are the owners'.
    sql.exec('ALTER TABLE raid_placements ADD COLUMN placed_by TEXT');
  },
  // Version 33: the lounge message and the Activity instances it tracks (see lounge.ts).
  loungeMigration,
  // Version 34: the daily dungeon on a map: run status and state, the day's map and the steps of a run
  // (see dungeon-path-migration.ts). Staging ran it first as 32 and then as 33, before the raid's
  // `placed_by` and the lounge took those numbers, so it checks every step and also makes sure those two
  // migrations' tables and column exist.
  dungeonPathMigration,
  // Version 35: what lounging with company has paid each player (see lounge-company.ts).
  loungeCompanyMigration,
  // Version 36: Workshop conversion jobs, refine and recycle (see workshop-convert-migration.ts).
  workshopConvertMigration,
  // Version 37: fusion points per creature (see fusion-points-migration.ts).
  fusionPointsMigration,
  // Version 38: the daily maintenance mark and the rollup's metric index (see maintenance.ts).
  maintenanceMigration,
  // Version 39: the Valley Games, made safe for staging databases that ran it as 38 (see
  // games-migration.ts).
  gamesMigrationV39,
  // Version 40: the Valley Games' event badges, wins per creature and event, back-filled from the
  // awarded gold placings (see games-badges-migration.ts).
  gamesBadgesMigration,
  // Version 41: opt-in Discord DMs, their queue and the log of what was sent (see dm-migration.ts).
  dmNotifyMigration,
  // Version 42: indexes for the Valley Games' day lookups (see games-index-migration.ts).
  gamesIndexMigration,
  // Version 43: rows read per game day and source (see read-meter.ts).
  dbReadsMigration,
  // Version 44: indexes for a player's recent trips and worn gear (see history-index-migration.ts).
  historyIndexMigration,
  // Version 45: the raid view's stored readiness bands (see raid-readiness.ts) and teammates' teams (the
  // teams table is no longer used since 2026-10-26, see `raidTeamCacheMigration` in raid-teams.ts).
  (sql) => {
    raidReadinessMigration(sql);
    raidTeamCacheMigration(sql);
  },
  // Version 46: what was paid while a player was away (see while-away.ts).
  whileAwayMigration,
  // Version 47: a private note per creature (see creature-note-migration.ts).
  creatureNoteMigration,
  // Version 48: items marked for dismantling and the day's dismantled count (see dismantle-mark-migration.ts).
  dismantleMarkMigration,
];

/** The schema version of a fresh database. */
export const SCHEMA_VERSION = MIGRATIONS.length;
