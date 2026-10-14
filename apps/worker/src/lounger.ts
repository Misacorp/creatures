/**
 * The living room (see `docs/design/living-room.md`): which creature of a player lounges, and the
 * room data of the players an Activity client says are present.
 *
 * A creature does one thing at a time: one on an expedition or a workshop job cannot lounge. A raid
 * does not count, raiders can lounge. The lounger is stored on the player (`players.lounger_id`) and
 * re-picked lazily, at random, when a read finds it gone or busy.
 *
 * Everything is synchronous. The user is always an argument supplied from the verified session; the
 * ids of `room` are only who to look up.
 */
import {
  explorerRank,
  pickLounger,
  quirkText,
  skillLevel,
  createCryptoRng,
  type Rng,
} from '@creatures/game';
import { openJobsByCreature } from './gear-store';
import type { LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';

/** The most ids one room request may carry. */
export const ROOM_MAX_USERS = 25;

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
}

export interface Resident {
  userId: string;
  /** The stored, sanitised display name. */
  name: string;
  /** The lounger, or null when every creature of the player is busy. */
  creature: RoomCreature | null;
}

export interface LoungeDeps {
  storage: LedgerStorage;
  /** Live randomness for the pick. Defaults to crypto; tests inject a seeded one. */
  rng?: Rng;
}

type CreatureStub = { id: string; away_expedition_id: string | null };

type DetailRow = {
  id: string;
  species: string;
  shiny: number;
  level: number;
  nickname: string | null;
  quirk_id: string | null;
};

const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

export class Lounge {
  private readonly rng: Rng;

  constructor(private readonly deps: LoungeDeps) {
    this.rng = deps.rng ?? createCryptoRng((array) => crypto.getRandomValues(array));
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private stubs(userId: string): CreatureStub[] {
    return this.sql
      .exec<CreatureStub>(
        'SELECT id, away_expedition_id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
        userId,
      )
      .toArray();
  }

  /** The same "busy" rule as the state view: on an expedition or on an open workshop job. */
  private idleIds(userId: string, stubs: readonly CreatureStub[]): string[] {
    const jobs = openJobsByCreature(this.sql, userId);
    return stubs.filter((c) => c.away_expedition_id === null && !jobs.has(c.id)).map((c) => c.id);
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
   * The player's lounger: the stored one if it still exists, is theirs and is idle; otherwise a new
   * random idle creature, stored (or NULL when all are busy). A player without creatures gets null and
   * nothing is stored.
   */
  resolve(userId: string): string | null {
    const stubs = this.stubs(userId);
    if (stubs.length === 0) return null;
    const idle = this.idleIds(userId, stubs);
    const stored = this.stored(userId);
    if (stored !== null && idle.includes(stored)) return stored;
    const picked = pickLounger(idle, this.rng);
    if (picked !== stored) {
      this.sql.exec('UPDATE players SET lounger_id = ? WHERE user_id = ?', picked, userId);
    }
    return picked;
  }

  /** Chooses the lounger. 404 unless the creature is the player's, 409 while it is on a trip or a job. */
  choose(userId: string, creatureId: string): Outcome<{ loungerId: string }> {
    return atomically(this.deps.storage, () => {
      const mine = this.stubs(userId).filter((c) => c.id === creatureId);
      if (mine.length === 0) throw new GameError(404, 'creature_not_found');
      if (this.idleIds(userId, mine).length === 0) throw new GameError(409, 'creature_busy');
      this.sql.exec('UPDATE players SET lounger_id = ? WHERE user_id = ?', creatureId, userId);
      return { loungerId: creatureId };
    });
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
          .exec<{ user_id: string; display_name: string }>(
            `SELECT p.user_id, p.display_name FROM players p
             JOIN player_progress pr ON pr.user_id = p.user_id
             WHERE pr.starter_species IS NOT NULL AND p.user_id IN (${placeholders(userIds.length)})`,
            ...userIds,
          )
          .toArray()
          .map((r) => [r.user_id, r.display_name] as const),
      );
      const present = userIds.filter((id) => players.has(id));
      const loungers = new Map(present.map((id) => [id, this.resolve(id)] as const));
      const ids = [...loungers.values()].filter((id): id is string => id !== null);
      const details = this.details(ids);
      return present.map((userId) => {
        const loungerId = loungers.get(userId) ?? null;
        return {
          userId,
          name: players.get(userId) ?? '',
          creature: loungerId === null ? null : (details.get(loungerId) ?? null),
        };
      });
    });
  }

  /** The room view of each creature id, in three bounded queries. */
  private details(ids: readonly string[]): Map<string, RoomCreature> {
    if (ids.length === 0) return new Map();
    const marks = placeholders(ids.length);
    const rows = this.sql
      .exec<DetailRow>(
        `SELECT id, species, shiny, level, nickname, quirk_id FROM creatures WHERE id IN (${marks})`,
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
    return new Map(
      rows.map((row) => [
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
        },
      ]),
    );
  }
}
