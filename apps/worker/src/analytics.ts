/**
 * The analytics event log of a guild (table `analytics_events`, migration 16; plan in
 * `docs/design/analytics.md`). Append-only and private by construction:
 *
 * - An event has a kind and typed props. Props hold only ids from content (species, boss, ability),
 *   enums, integers and booleans. There is no free-text field, and every value is checked again when
 *   the event is written, so an unknown id becomes `"unknown"` instead of whatever a caller passed.
 *   Never put a user id, nickname, guild name or other player-typed text in an event.
 * - `actor_hash` is the first 128 bits (32 hex characters) of an HMAC-SHA256 of the Discord user id,
 *   with a key HKDF-derived from the Discord client secret (the same secret source as session
 *   tokens, a distinct `info` label). It is stable for one user and cannot be reversed from reports.
 *   Rotating the secret changes every hash (and invalidates every session): continuity across a
 *   rotation is not promised.
 * - Web Crypto is asynchronous but Durable Object transactions are synchronous, so the hash is
 *   computed once per request, before any transaction (`prepare`), and cached per user in memory;
 *   `record` only reads the cache. A user whose hash is not cached gets a NULL actor.
 * - Events are written inside the transaction where the action happens, as a single INSERT, so an
 *   event exists if and only if the action committed. Idempotent retries that replay a stored result
 *   write nothing.
 * - Times are UTC epoch milliseconds. Raw events are kept `RETENTION_MS` (90 days) and pruned from
 *   the guild alarm.
 */
import {
  DURATION_IDS,
  GEAR_RARITIES,
  JOB_KINDS,
  RARITIES,
  RULES,
  SUPPLIES_IDS,
  content,
  dungeonContent,
  gearContent,
  type DurationId,
  type GearRarity,
  type JobKind,
  type Rarity,
  type Role,
  type SuppliesId,
} from '@creatures/game';
import type { PostFailureKind } from './discord-posts';

/** Raw events and the rows that support them are kept this long. */
export const RETENTION_MS = 90 * 86_400_000;
/** Silence longer than this makes the next authenticated request a new session. */
export const SESSION_GAP_MS = 30 * 60_000;
/** The "last seen" mark of a player is refreshed at most this often (a write per request is too much). */
const SEEN_REFRESH_MS = 60_000;
/** Most rows one prune batch deletes, and most batches one alarm runs. */
const PRUNE_BATCH = 500;
const PRUNE_MAX_BATCHES = 20;
/** `props_json` is never longer than this; a longer one is replaced by `{"truncated":true}`. */
export const MAX_PROPS_CHARS = 1024;
/** Most catches listed in one claim event. */
const MAX_CATCHES = 12;
/** Bound on the in-memory caches (one entry per player who was active). */
const CACHE_MAX = 512;

// --- Typed events ---

export type PhaseName = 'phase1' | 'phase2' | 'finale';
export type CatchResult = 'new' | 'fused' | 'converted';
export type FestivalResult = 'new' | 'fused' | 'converted';

/** Where a gear grant came from. */
export const GEAR_SOURCES = [
  'raid_phase',
  'raid_finale',
  'festival',
  'expedition',
  'welcome',
  'dungeon',
] as const;
export type GearSource = (typeof GEAR_SOURCES)[number];

/** Most items one `gear_drop` event lists. */
const MAX_DROP_ITEMS = 4;

export interface CatchProps {
  species: string;
  rarity: Rarity;
  shiny: boolean;
  result: CatchResult;
}

/** What can be logged. `kind` names the action; the rest are its props. */
export type AnalyticsEvent =
  | { kind: 'session_start'; returning: boolean }
  | { kind: 'starter_chosen'; species: string }
  | {
      kind: 'expedition_send';
      species: string;
      duration: DurationId;
      supplies: SuppliesId;
      cost: number;
    }
  | {
      kind: 'expedition_claim';
      duration: DurationId;
      supplies: SuppliesId;
      /** Whole minutes the finished expedition waited before it was claimed. */
      waitedMin: number;
      catches: readonly CatchProps[];
    }
  | {
      kind: 'expedition_recall';
      duration: DurationId;
      supplies: SuppliesId;
      /** How much of the expedition had passed, 0 to 100. */
      elapsedPct: number;
      catches: readonly CatchProps[];
    }
  | { kind: 'train'; species: string; level: number; cost: number }
  | { kind: 'evolve'; from: string; to: string; cost: number }
  | {
      /** A catch that fused into a creature the player already had (or paid Bait at the limit). */
      kind: 'fuse';
      species: string;
      rarity: Rarity;
      converted: boolean;
      fusionCount: number;
      bait: number;
    }
  | { kind: 'roster_optout'; optOut: boolean }
  | { kind: 'team_set'; auto: boolean; species: readonly string[] }
  | { kind: 'placement'; action: 'place' | 'unplace'; species: string; slot: number; swap: boolean }
  | { kind: 'ability_pick'; ability: string }
  | { kind: 'autofire_toggle'; target: 'basic' | 'creature'; species: string | null; on: boolean }
  | { kind: 'live_join'; stage: 'lobby' | 'fight'; practice: boolean }
  | {
      kind: 'live_action';
      action: 'fire' | 'hold' | 'unhold';
      ability: string;
      /** Fire: the round it fires in. Hold and unhold: the round the clock was in. */
      round: number;
      /** The round the ability fires in when nobody presses anything. */
      defaultRound: number;
      practice: boolean;
    }
  | {
      kind: 'phase_result';
      phase: PhaseName;
      boss: string;
      rank: number;
      festival: boolean;
      partySize: number;
      win: boolean;
      rounds: number;
      /** The top contributor's share of the party's damage, in basis points. No user is named. */
      topShareBp: number;
    }
  | {
      kind: 'rank_change';
      before: number;
      after: number;
      won: boolean;
      festival: boolean;
      parties: number;
      partiesWon: number;
    }
  | { kind: 'festival_grant'; species: string; result: FestivalResult }
  | {
      /** A grant of gear, parts or a blueprint. Content ids and counts only. */
      kind: 'gear_drop';
      source: GearSource;
      gear: readonly { base: string; rarity: GearRarity }[];
      /** Items that did not fit in a full inventory and became parts instead. */
      converted: number;
      scrap: number;
      shards: number;
      glimmer: number;
      blueprint: string | null;
      blueprintDuplicate: boolean;
    }
  | {
      kind: 'gear_equip';
      base: string;
      rarity: GearRarity;
      level: number;
      /** The species of the creature that got the item (or lost it, for 'unequip'). */
      species: string;
      action: 'equip' | 'unequip';
      /** Another item was taken off to make room. */
      swap: boolean;
    }
  | {
      kind: 'gear_upgrade';
      base: string;
      rarity: GearRarity;
      from: number;
      to: number;
      essence: number;
      scrap: number;
    }
  | {
      kind: 'gear_dismantle';
      base: string;
      rarity: GearRarity;
      level: number;
      scrap: number;
      shards: number;
      glimmer: number;
      unequipped: boolean;
    }
  | {
      kind: 'job_start';
      job: JobKind;
      /** The base crafted, or the base of the item worked on. */
      base: string;
      rarity: GearRarity;
      species: string;
      hours: number;
      skillLevel: number;
    }
  | {
      kind: 'job_claim';
      job: JobKind;
      base: string;
      /** The rarity that came out (a craft) or the item's rarity. */
      rarity: GearRarity;
      /** A craft that came out one rarity above its blueprint. */
      upgraded: boolean;
      enchant: string | null;
      xp: number;
      skillLevel: number;
      leveledUp: boolean;
    }
  | {
      /** A daily dungeon run: how deep, how far it got, what the rooms rolled and who went. */
      kind: 'dungeon_run';
      depth: number;
      /** 1, or 2 for the retry of the first day. */
      attempt: number;
      roomsCleared: number;
      cleared: boolean;
      landmark: boolean;
      /** The room modifiers, by room. */
      modifiers: readonly string[];
      /** The team's species and roles, front to back. */
      team: readonly { species: string; role: Role }[];
      /** How many of the three creatures wore gear. */
      gear: number;
    }
  | {
      /** What a dungeon run paid. Amounts and content ids only. */
      kind: 'dungeon_reward';
      depth: number;
      bait: number;
      essence: number;
      scrap: number;
      shards: number;
      glimmer: number;
      /** Gear items that dropped (and fit, or became parts). */
      gear: number;
      landmark: boolean;
      /** The day of the streak cycle whose bonus was paid (3 or 7), or 0. */
      streakBonusDay: number;
    }
  | {
      kind: 'post_result';
      result: 'sent' | 'retry' | 'failed';
      error: PostFailureKind | null;
      attempts: number;
    };

export type AnalyticsKind = AnalyticsEvent['kind'];

// --- Sanitizers: every value is re-checked on write ---

const UNKNOWN = 'unknown';
const SPECIES_IDS: ReadonlySet<string> = new Set(content.creatures.map((c) => c.id));
const BOSS_IDS: ReadonlySet<string> = new Set(content.bosses.map((b) => b.id));
const ABILITY_IDS: ReadonlySet<string> = new Set(content.finaleAbilities.map((a) => a.id));
const GEAR_BASE_IDS: ReadonlySet<string> = new Set(gearContent.bases.map((b) => b.id));
const ENCHANT_IDS: ReadonlySet<string> = new Set(gearContent.enchants.map((e) => e.id));
const MODIFIER_IDS: ReadonlySet<string> = new Set(dungeonContent.modifiers.map((m) => m.id));
const ROLE_IDS = ['setter', 'payoff', 'support', 'guard'] as const;
const POST_ERRORS: ReadonlySet<string> = new Set<PostFailureKind>([
  'rate_limited',
  'server_error',
  'network',
  'timeout',
  'forbidden',
  'not_found',
  'rejected',
  'redirect',
]);

const fromSet = (set: ReadonlySet<string>, value: string): string =>
  set.has(value) ? value : UNKNOWN;
const species = (value: string): string => fromSet(SPECIES_IDS, value);
const oneOf = <T extends string>(options: readonly T[], value: string, fallback: T): T =>
  (options as readonly string[]).includes(value) ? (value as T) : fallback;
const int = (value: number, max = 1_000_000_000): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : 0;
const bool = (value: boolean): boolean => Boolean(value);

function catchProps(list: readonly CatchProps[]): unknown[] {
  return list.slice(0, MAX_CATCHES).map((c) => ({
    species: species(c.species),
    rarity: oneOf(RARITIES, c.rarity, 'common'),
    shiny: bool(c.shiny),
    result: oneOf(['new', 'fused', 'converted'] as const, c.result, 'new'),
  }));
}

const gearBase = (value: string): string => fromSet(GEAR_BASE_IDS, value);
const gearRarity = (value: string): GearRarity => oneOf(GEAR_RARITIES, value, 'common');

/** The props object of an event, rebuilt field by field from checked values. */
export function propsOf(event: AnalyticsEvent): Record<string, unknown> {
  switch (event.kind) {
    case 'session_start':
      return { returning: bool(event.returning) };
    case 'starter_chosen':
      return { species: species(event.species) };
    case 'expedition_send':
      return {
        species: species(event.species),
        duration: oneOf(DURATION_IDS, event.duration, 'short'),
        supplies: oneOf(SUPPLIES_IDS, event.supplies, 'basic'),
        cost: int(event.cost),
      };
    case 'expedition_claim':
      return {
        duration: oneOf(DURATION_IDS, event.duration, 'short'),
        supplies: oneOf(SUPPLIES_IDS, event.supplies, 'basic'),
        waitedMin: int(event.waitedMin),
        catches: catchProps(event.catches),
      };
    case 'expedition_recall':
      return {
        duration: oneOf(DURATION_IDS, event.duration, 'short'),
        supplies: oneOf(SUPPLIES_IDS, event.supplies, 'basic'),
        elapsedPct: int(event.elapsedPct, 100),
        catches: catchProps(event.catches),
      };
    case 'train':
      return { species: species(event.species), level: int(event.level), cost: int(event.cost) };
    case 'evolve':
      return { from: species(event.from), to: species(event.to), cost: int(event.cost) };
    case 'fuse':
      return {
        species: species(event.species),
        rarity: oneOf(RARITIES, event.rarity, 'common'),
        converted: bool(event.converted),
        fusionCount: int(event.fusionCount, 99),
        bait: int(event.bait),
      };
    case 'roster_optout':
      return { optOut: bool(event.optOut) };
    case 'team_set':
      return { auto: bool(event.auto), species: event.species.slice(0, 3).map(species) };
    case 'placement':
      return {
        action: oneOf(['place', 'unplace'] as const, event.action, 'place'),
        species: species(event.species),
        slot: int(event.slot, 99),
        swap: bool(event.swap),
      };
    case 'ability_pick':
      return { ability: fromSet(ABILITY_IDS, event.ability) };
    case 'autofire_toggle':
      return {
        target: event.target === 'creature' ? 'creature' : 'basic',
        species: event.species === null ? null : species(event.species),
        on: bool(event.on),
      };
    case 'live_join':
      return { stage: event.stage === 'lobby' ? 'lobby' : 'fight', practice: bool(event.practice) };
    case 'live_action':
      return {
        action: oneOf(['fire', 'hold', 'unhold'] as const, event.action, 'fire'),
        ability: fromSet(ABILITY_IDS, event.ability),
        round: int(event.round, 99),
        defaultRound: int(event.defaultRound, 99),
        practice: bool(event.practice),
      };
    case 'phase_result':
      return {
        phase: oneOf(['phase1', 'phase2', 'finale'] as const, event.phase, 'phase1'),
        boss: fromSet(BOSS_IDS, event.boss),
        rank: int(event.rank, 999),
        festival: bool(event.festival),
        partySize: int(event.partySize, 999),
        win: bool(event.win),
        rounds: int(event.rounds, 99),
        topShareBp: int(event.topShareBp, 10_000),
      };
    case 'rank_change':
      return {
        before: int(event.before, 999),
        after: int(event.after, 999),
        won: bool(event.won),
        festival: bool(event.festival),
        parties: int(event.parties, 999),
        partiesWon: int(event.partiesWon, 999),
      };
    case 'festival_grant':
      return {
        species: species(event.species),
        result: oneOf(['new', 'fused', 'converted'] as const, event.result, 'new'),
      };
    case 'gear_drop':
      return {
        source: oneOf(GEAR_SOURCES, event.source, 'raid_phase'),
        gear: event.gear
          .slice(0, MAX_DROP_ITEMS)
          .map((g) => ({ base: gearBase(g.base), rarity: gearRarity(g.rarity) })),
        converted: int(event.converted, 99),
        scrap: int(event.scrap),
        shards: int(event.shards),
        glimmer: int(event.glimmer),
        blueprint: event.blueprint === null ? null : gearBase(event.blueprint),
        blueprintDuplicate: bool(event.blueprintDuplicate),
      };
    case 'gear_equip':
      return {
        base: gearBase(event.base),
        rarity: gearRarity(event.rarity),
        level: int(event.level, RULES.gear.maxLevel),
        species: species(event.species),
        action: event.action === 'unequip' ? 'unequip' : 'equip',
        swap: bool(event.swap),
      };
    case 'gear_upgrade':
      return {
        base: gearBase(event.base),
        rarity: gearRarity(event.rarity),
        from: int(event.from, RULES.gear.maxLevel),
        to: int(event.to, RULES.gear.maxLevel),
        essence: int(event.essence),
        scrap: int(event.scrap),
      };
    case 'gear_dismantle':
      return {
        base: gearBase(event.base),
        rarity: gearRarity(event.rarity),
        level: int(event.level, RULES.gear.maxLevel),
        scrap: int(event.scrap),
        shards: int(event.shards),
        glimmer: int(event.glimmer),
        unequipped: bool(event.unequipped),
      };
    case 'job_start':
      return {
        job: oneOf(JOB_KINDS, event.job, 'craft'),
        base: gearBase(event.base),
        rarity: gearRarity(event.rarity),
        species: species(event.species),
        hours: int(event.hours, 99),
        skillLevel: int(event.skillLevel, 99),
      };
    case 'job_claim':
      return {
        job: oneOf(JOB_KINDS, event.job, 'craft'),
        base: gearBase(event.base),
        rarity: gearRarity(event.rarity),
        upgraded: bool(event.upgraded),
        enchant: event.enchant === null ? null : fromSet(ENCHANT_IDS, event.enchant),
        xp: int(event.xp, 100_000),
        skillLevel: int(event.skillLevel, 99),
        leveledUp: bool(event.leveledUp),
      };
    case 'dungeon_run':
      return {
        depth: int(event.depth, 9_999),
        attempt: int(event.attempt, 2),
        roomsCleared: int(event.roomsCleared, 99),
        cleared: bool(event.cleared),
        landmark: bool(event.landmark),
        modifiers: event.modifiers.slice(0, 6).map((m) => fromSet(MODIFIER_IDS, m)),
        team: event.team
          .slice(0, 3)
          .map((t) => ({ species: species(t.species), role: oneOf(ROLE_IDS, t.role, 'setter') })),
        gear: int(event.gear, 3),
      };
    case 'dungeon_reward':
      return {
        depth: int(event.depth, 9_999),
        bait: int(event.bait),
        essence: int(event.essence),
        scrap: int(event.scrap),
        shards: int(event.shards),
        glimmer: int(event.glimmer),
        gear: int(event.gear, 99),
        landmark: bool(event.landmark),
        streakBonusDay: int(event.streakBonusDay, 99),
      };
    case 'post_result':
      return {
        result: oneOf(['sent', 'retry', 'failed'] as const, event.result, 'failed'),
        error:
          event.error === null ? null : POST_ERRORS.has(event.error) ? event.error : 'rejected',
        attempts: int(event.attempts, 99),
      };
  }
}

/** A props JSON string, or `{"truncated":true}` if it is longer than `MAX_PROPS_CHARS`. */
export function capJson(json: string): string {
  return json.length <= MAX_PROPS_CHARS ? json : '{"truncated":true}';
}

/** The stored JSON of an event's props: never longer than `MAX_PROPS_CHARS`. */
export function serializeProps(event: AnalyticsEvent): string {
  return capJson(JSON.stringify(propsOf(event)));
}

// --- The actor hash ---

const encoder = new TextEncoder();

// The derived key for the most recent secret, per isolate (like the session key). A failure is not cached.
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function actorKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret === secret) return cachedKey.key;
  const key = (async () => {
    const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
      'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode('leet-creatures/analytics'),
        info: encoder.encode('analytics-actor-v1'),
      },
      material,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    );
  })();
  const entry = { secret, key };
  cachedKey = entry;
  key.catch(() => {
    if (cachedKey === entry) cachedKey = null;
  });
  return key;
}

/** 32 lowercase hex characters (128 bits) of HMAC-SHA256(user id), keyed from `secret`. */
export async function actorHash(secret: string, userId: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await actorKey(secret), encoder.encode(userId));
  return Array.from(new Uint8Array(mac).subarray(0, 16), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

// --- The writer ---

interface AnalyticsStorage {
  sql: SqlStorage;
  transactionSync<T>(fn: () => T): T;
}

export interface AnalyticsOptions {
  storage: AnalyticsStorage;
  now: () => number;
  /**
   * The secret the actor key is derived from (the Discord client secret). Empty or absent: no actor
   * is ever identified, so events carry a NULL actor and sessions are not tracked.
   */
  secret?: string;
}

function remember<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (!map.has(key) && map.size >= CACHE_MAX) {
    const oldest = map.keys().next();
    if (oldest.done !== true) map.delete(oldest.value);
  }
  map.set(key, value);
}

export class Analytics {
  /** Actor hash per user id, filled by `prepare` before a request enters any transaction. */
  private readonly hashes = new Map<string, string>();
  /** When each actor's "last seen" mark was last written, to keep that write rare. */
  private readonly seenWritten = new Map<string, number>();
  /** Once-per-key marks already stored by this isolate (see `once`). */
  private readonly onceDone = new Set<string>();

  constructor(private readonly options: AnalyticsOptions) {}

  private get sql(): SqlStorage {
    return this.options.storage.sql;
  }

  /**
   * Computes and remembers the actor hash of a user. Call it once per request, before any
   * transaction that may log an event for the user. Never throws: without a hash, events simply
   * have no actor.
   */
  async prepare(userId: string): Promise<void> {
    const secret = this.options.secret ?? '';
    if (secret === '' || this.hashes.has(userId)) return;
    try {
      remember(this.hashes, userId, await actorHash(secret, userId));
    } catch (err) {
      console.error('analytics hash failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** The user's cached actor hash, or null (no secret, or `prepare` was not called). */
  hashFor(userId: string): string | null {
    return this.hashes.get(userId) ?? null;
  }

  /**
   * Appends one event: a single INSERT. Call it inside the transaction of the action it describes.
   * `actorId` is the Discord user id of the player who acted (hashed here, never stored); omit it for
   * guild-level events. Never throws, so logging can never undo a game action.
   */
  record(event: AnalyticsEvent, actorId?: string): void {
    try {
      this.sql.exec(
        'INSERT INTO analytics_events (at, kind, actor_hash, props_json) VALUES (?, ?, ?, ?)',
        this.options.now(),
        event.kind,
        actorId === undefined ? null : this.hashFor(actorId),
        serializeProps(event),
      );
    } catch (err) {
      console.error('analytics write failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /**
   * Notes that the player made an authenticated request, and logs `session_start` when their last
   * activity is more than `SESSION_GAP_MS` ago. The mark is refreshed at most once a minute. Call it
   * after `prepare`, outside a transaction (it opens its own small one when it must write).
   */
  touch(userId: string): void {
    const hash = this.hashFor(userId);
    if (hash === null) return;
    const now = this.options.now();
    const written = this.seenWritten.get(hash);
    if (written !== undefined && now - written < SEEN_REFRESH_MS) return;
    try {
      this.options.storage.transactionSync(() => {
        const row = this.sql
          .exec<{ last_at: number }>(
            'SELECT last_at FROM analytics_seen WHERE actor_hash = ?',
            hash,
          )
          .toArray()[0];
        if (row === undefined || now - row.last_at > SESSION_GAP_MS) {
          this.record({ kind: 'session_start', returning: row !== undefined }, userId);
        }
        this.sql.exec(
          `INSERT INTO analytics_seen (actor_hash, last_at) VALUES (?, ?)
           ON CONFLICT(actor_hash) DO UPDATE SET last_at = excluded.last_at`,
          hash,
          now,
        );
      });
      remember(this.seenWritten, hash, now);
    } catch (err) {
      console.error('analytics touch failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /**
   * True the first time `label` is seen for this player (for example one join per player per
   * finale). Stored as a hashed key, so it survives restarts; the check is remembered in memory, so
   * a hot read path writes at most once per key. False without an actor hash.
   */
  once(userId: string, label: string): boolean {
    const hash = this.hashFor(userId);
    if (hash === null) return false;
    const key = `${label}:${hash}`;
    if (this.onceDone.has(key)) return false;
    if (this.onceDone.size >= CACHE_MAX) this.onceDone.clear();
    this.onceDone.add(key);
    try {
      return (
        this.sql
          .exec(
            'INSERT OR IGNORE INTO analytics_once (key, at) VALUES (?, ?) RETURNING key',
            key,
            this.options.now(),
          )
          .toArray().length > 0
      );
    } catch (err) {
      console.error('analytics once failed', err instanceof Error ? err.name : 'unknown');
      return false;
    }
  }

  /**
   * Deletes events and support rows older than `RETENTION_MS`, in batches so one run is bounded.
   * Returns true when old rows may remain (the next alarm continues). Never throws.
   */
  prune(): boolean {
    const cutoff = this.options.now() - RETENTION_MS;
    try {
      let more = false;
      for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
        const deleted = this.sql
          .exec(
            `DELETE FROM analytics_events WHERE id IN
               (SELECT id FROM analytics_events WHERE at < ? ORDER BY at LIMIT ?) RETURNING id`,
            cutoff,
            PRUNE_BATCH,
          )
          .toArray().length;
        more = deleted >= PRUNE_BATCH;
        if (!more) break;
      }
      this.sql.exec('DELETE FROM analytics_seen WHERE last_at < ?', cutoff);
      this.sql.exec('DELETE FROM analytics_once WHERE at < ?', cutoff);
      return more;
    } catch (err) {
      console.error('analytics prune failed', err instanceof Error ? err.name : 'unknown');
      return false;
    }
  }
}
