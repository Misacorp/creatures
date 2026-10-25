/**
 * The living room (see `docs/design/living-room.md`): which creature of a player lounges, and the
 * room data of the players an Activity client says are present.
 *
 * A creature does one thing at a time: one on an expedition or a workshop job cannot lounge. A raid
 * does not count, raiders can lounge. The lounger is stored on the player (`players.lounger_id`) and
 * re-picked lazily, when a read finds it gone or busy: the newest free creature that is not Rested today. The spot a player dragged their
 * lounger to belongs to the player (`players.lounge_spot` and `lounge_spot_at`), not to the creature.
 *
 * Everything is synchronous. The user is always an argument supplied from the verified session; the
 * ids of `room` are only who to look up.
 */
import {
  content,
  explorerRank,
  RULES,
  quirkText,
  skillLevel,
  isRoomSpotId,
  itemLines,
} from '@creatures/game';
import {
  rowToItem,
  viewOrSkip,
  wornGearView,
  wornOnCreatures,
  wornRows,
  type WornGear,
} from './gear-store';
import type { LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';

/** The most ids one room request may carry. */
export const ROOM_MAX_USERS = 25;

/**
 * A worn item as the room shows it: the state view's `Creature.gear` plus the text of its lines (the
 * same text as the owner's gear view), so a guild-mate's popover can say "Attack +6%" without the
 * owner's gear list.
 */
export type RoomGear = WornGear & { lines: string[] };

/** One creature of a resident, as the room and its popover show it. */
export interface RoomCreature {
  id: string;
  species: string;
  shiny: boolean;
  level: number;
  nickname: string | null;
  /** An id into the shared lore data, or null for a missing id. */
  quirk: string | null;
  craftingLevel: number;
  explorerRank: number;
  /** True when its owner holds a "first on server" record for this species or its line (read from the records, never from the request). */
  firstOnServer: boolean;
  /** The items it wears, one per slot. */
  gear: RoomGear[];
}

export interface Resident {
  userId: string;
  /** The stored, sanitised display name. */
  name: string;
  /** The lounger, or null when every creature of the player is busy. */
  creature: RoomCreature | null;
  /** The spot the player chose and when (server time), or null: the client then uses its own default. */
  spot: LoungeSpot | null;
}

/** A player's chosen spot in the room: an id from `ROOM_SPOT_IDS` and the server time of the claim. */
export interface LoungeSpot {
  id: string;
  at: number;
}

export interface LoungeDeps {
  storage: LedgerStorage;
  /** The core's clock (UTC epoch ms): the time of a spot claim. */
  now: () => number;
  /** The current game day (`loungeDay`): a `lounge_rest` row of another day counts as nothing paid. */
  gameDay: () => string;
}

type DetailRow = {
  id: string;
  user_id: string;
  species: string;
  shiny: number;
  level: number;
  nickname: string | null;
  quirk_id: string | null;
};

type PlayerRow = {
  user_id: string;
  display_name: string;
  lounge_spot: string | null;
  lounge_spot_at: number | null;
};

/** A stored spot, or null when unset, half-set or an id the room no longer has. */
function toSpot(id: string | null | undefined, at: number | null | undefined): LoungeSpot | null {
  if (typeof id !== 'string' || typeof at !== 'number' || !isRoomSpotId(id)) return null;
  return { id, at };
}

/** Whether the player holds the record for the species or for stage one of its line (as the client's `isFirstOnServer`). */
function holdsFirst(firsts: ReadonlySet<string>, userId: string, species: string): boolean {
  const line = content.creatures.find((c) => c.id === species)?.line;
  const stageOne =
    line === undefined
      ? undefined
      : content.creatures.find((c) => c.line === line && c.stage === 1)?.id;
  return (
    firsts.has(`${userId}:${species}`) ||
    (stageOne !== undefined && firsts.has(`${userId}:${stageOne}`))
  );
}

const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

/**
 * The "busy" rule of the state view, as SQL on a creature `c`: on an expedition or on an open workshop
 * job. (`workshop_jobs_creature_open` answers the job part from its index.)
 */
const FREE = `c.away_expedition_id IS NULL AND NOT EXISTS (
  SELECT 1 FROM workshop_jobs j WHERE j.creature_id = c.id AND j.user_id = c.user_id AND j.claimed_at IS NULL)`;

/** Rested: lounging has paid the creature its daily cap on this game day (as `isRested`). */
const NOT_RESTED = `NOT EXISTS (
  SELECT 1 FROM lounge_rest r WHERE r.creature_id = c.id AND r.day = ? AND r.paid >= ?)`;

export class Lounge {
  constructor(private readonly deps: LoungeDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** Whether the stored lounger is the player's, exists and is free: reads that one creature only. */
  private storedIsFree(userId: string): string | null {
    return (
      this.sql
        .exec<{ id: string }>(
          `SELECT c.id FROM players p JOIN creatures c ON c.id = p.lounger_id
           WHERE p.user_id = ? AND c.user_id = ? AND ${FREE}`,
          userId,
          userId,
        )
        .toArray()[0]?.id ?? null
    );
  }

  /**
   * The newest-caught free creature of the player, one that is not Rested today first. Each query walks
   * `creatures_user` from the newest and stops at its first row.
   */
  private pickFree(userId: string): string | null {
    const day = this.deps.gameDay();
    const { dailyCap } = RULES.experience.lounge;
    const first = (extra: string, ...args: (string | number)[]): string | null =>
      this.sql
        .exec<{ id: string }>(
          `SELECT c.id FROM creatures c WHERE c.user_id = ? AND ${FREE}${extra}
           ORDER BY c.caught_at DESC, c.rowid DESC LIMIT 1`,
          userId,
          ...args,
        )
        .toArray()[0]?.id ?? null;
    return first(` AND ${NOT_RESTED}`, day, dailyCap) ?? first('');
  }

  private stored(userId: string): string | null {
    return (
      this.sql
        .exec<{ lounger_id: string | null }>(
          'SELECT lounger_id FROM players WHERE user_id = ?',
          userId,
        )
        .toArray()[0]?.lounger_id ?? null
    );
  }

  /**
   * The player's lounger: the stored one if it still exists, is theirs and is free; otherwise the newest
   * free creature that is not Rested today, stored (or NULL when all are busy). A player without
   * creatures gets null and nothing is stored.
   */
  resolve(userId: string): string | null {
    const kept = this.storedIsFree(userId);
    if (kept !== null) return kept;
    const picked = this.pickFree(userId);
    if (picked !== this.stored(userId)) {
      this.sql.exec('UPDATE players SET lounger_id = ? WHERE user_id = ?', picked, userId);
    }
    return picked;
  }

  /** Chooses the lounger. 404 unless the creature is the player's, 409 while it is on a trip or a job. */
  choose(userId: string, creatureId: string): Outcome<{ loungerId: string }> {
    return atomically(this.deps.storage, () => {
      const mine = this.sql
        .exec<{ id: string; free: number }>(
          `SELECT c.id, (${FREE}) AS free FROM creatures c WHERE c.id = ? AND c.user_id = ?`,
          creatureId,
          userId,
        )
        .toArray()[0];
      if (mine === undefined) throw new GameError(404, 'creature_not_found');
      if (mine.free !== 1) throw new GameError(409, 'creature_busy');
      this.sql.exec('UPDATE players SET lounger_id = ? WHERE user_id = ?', creatureId, userId);
      return { loungerId: creatureId };
    });
  }

  /**
   * The spot the player chose, or null when never chosen or when the stored id is not a known spot id
   * any more (the room's spots may change between releases).
   */
  spot(userId: string): LoungeSpot | null {
    const row = this.sql
      .exec<{ lounge_spot: string | null; lounge_spot_at: number | null }>(
        'SELECT lounge_spot, lounge_spot_at FROM players WHERE user_id = ?',
        userId,
      )
      .toArray()[0];
    return toSpot(row?.lounge_spot, row?.lounge_spot_at);
  }

  /**
   * Stores the player's spot with the claim time (`now`), or clears both with null. The id has been
   * checked against the spot list by the route's schema. The server does not know who sits where in an
   * Activity instance, so it never checks occupancy: the clients seat claims by (at, userId).
   */
  chooseSpot(userId: string, spotId: string | null): LoungeSpot | null {
    if (spotId === null) {
      this.sql.exec(
        'UPDATE players SET lounge_spot = NULL, lounge_spot_at = NULL WHERE user_id = ?',
        userId,
      );
      return null;
    }
    const at = this.deps.now();
    this.sql.exec(
      'UPDATE players SET lounge_spot = ?, lounge_spot_at = ? WHERE user_id = ?',
      spotId,
      at,
      userId,
    );
    return { id: spotId, at };
  }

  /**
   * The residents among `userIds`: players of this guild who have chosen a starter, in the order asked.
   * Everyone else is left out silently. May write (each lookup can re-pick a lounger), so it runs in
   * one transaction.
   */
  room(userIds: readonly string[]): Resident[] {
    if (userIds.length === 0) return [];
    return this.deps.storage.transactionSync(() => {
      const players = new Map(
        this.sql
          .exec<PlayerRow>(
            `SELECT p.user_id, p.display_name, p.lounge_spot, p.lounge_spot_at FROM players p
             JOIN player_progress pr ON pr.user_id = p.user_id
             WHERE pr.starter_species IS NOT NULL AND p.user_id IN (${placeholders(userIds.length)})`,
            ...userIds,
          )
          .toArray()
          .map((r) => [r.user_id, r] as const),
      );
      const present = userIds.filter((id) => players.has(id));
      const loungers = new Map(present.map((id) => [id, this.resolve(id)] as const));
      const ids = [...loungers.values()].filter((id): id is string => id !== null);
      const details = this.details(ids);
      return present.map((userId) => {
        const loungerId = loungers.get(userId) ?? null;
        const player = players.get(userId);
        return {
          userId,
          name: player?.display_name ?? '',
          creature: loungerId === null ? null : (details.get(loungerId) ?? null),
          spot: toSpot(player?.lounge_spot, player?.lounge_spot_at),
        };
      });
    });
  }

  /**
   * The species each of these players holds a "first on server" record for, as `user:species` keys (the
   * hidden jackpot record is left out, as in the state view).
   */
  private firstHolders(userIds: readonly string[]): Set<string> {
    const owners = [...new Set(userIds)];
    if (owners.length === 0) return new Set();
    return new Set(
      this.sql
        .exec<{ user_id: string; species: string }>(
          `SELECT DISTINCT user_id, species FROM server_firsts
           WHERE kind != 'jackpot' AND user_id IN (${placeholders(owners.length)})`,
          ...owners,
        )
        .toArray()
        .map((r) => `${r.user_id}:${r.species}`),
    );
  }

  /** The room view of each creature id, in five bounded queries. */
  private details(ids: readonly string[]): Map<string, RoomCreature> {
    if (ids.length === 0) return new Map();
    const marks = placeholders(ids.length);
    const rows = this.sql
      .exec<DetailRow>(
        `SELECT id, user_id, species, shiny, level, nickname, quirk_id FROM creatures WHERE id IN (${marks})`,
        ...ids,
      )
      .toArray();
    const crafting = new Map(
      this.sql
        .exec<{ creature_id: string; xp: number }>(
          `SELECT creature_id, xp FROM crafting_skill WHERE creature_id IN (${marks})`,
          ...ids,
        )
        .toArray()
        .map((r) => [r.creature_id, r.xp] as const),
    );
    const explorer = new Map(
      this.sql
        .exec<{ creature_id: string; xp: number }>(
          `SELECT creature_id, xp FROM explorer_progress WHERE creature_id IN (${marks})`,
          ...ids,
        )
        .toArray()
        .map((r) => [r.creature_id, r.xp] as const),
    );
    const worn = wornOnCreatures(this.sql, ids);
    const firsts = this.firstHolders(rows.map((row) => row.user_id));
    return new Map(
      rows.map((row) => {
        return [
          row.id,
          {
            id: row.id,
            species: row.species,
            shiny: row.shiny === 1,
            level: row.level,
            nickname: row.nickname,
            quirk:
              row.quirk_id !== null && quirkText(row.quirk_id) !== undefined ? row.quirk_id : null,
            craftingLevel: skillLevel(crafting.get(row.id) ?? 0),
            explorerRank: explorerRank(explorer.get(row.id) ?? 0),
            firstOnServer: holdsFirst(firsts, row.user_id, row.species),
            // An item the content cannot read is left out of the room, not the whole room.
            gear: wornRows(worn.get(row.id)).flatMap((item) =>
              viewOrSkip('worn item', () => ({
                ...wornGearView(item),
                lines: itemLines(rowToItem(item)).map((l) => l.text),
              })),
            ),
          },
        ] as const;
      }),
    );
  }
}
