/**
 * Raid teams and rows: who fights and where they stand. Shared by the week lifecycle, the phase
 * resolver and the API views. Everything here is synchronous SQL on the guild's database.
 */
import {
  RULES,
  creaturePower,
  strongest,
  effectiveStats,
  type CreatureSpecies,
  type CritBonus,
  type FoldKit,
  type GearMods,
  type GearRules,
  type Stats,
} from '@creatures/game';
import { speciesOf } from './collection';
import { equippedByCreature, wearerOf, wornOnCreatures, type WornBySlot } from './gear-store';
import { foldCreature } from './gear-worn';
import { booksByCreature, booksOfCreatures, foldTalentsOf } from './talent-store';
import type { HeldTalent } from '@creatures/game';

export const RAID_PHASE_STATUSES = ['open', 'phase1', 'phase2', 'finale'] as const;
export type RaidStatus = (typeof RAID_PHASE_STATUSES)[number];

/**
 * A creature as a raid sees it: current stats at the moment of reading, with the items it wears folded
 * in (`applyGear`: Attack, HP, crit and the modifier sheet). Fight inputs are built from these at the moment a phase resolves or the
 * live finale starts and then stored, so later gear changes never touch a fight that was built.
 */
export interface TeamCreature {
  id: string;
  userId: string;
  species: CreatureSpecies;
  level: number;
  fusionCount: number;
  nickname: string | null;
  caughtAt: number;
  /** The stats a fight uses: level, fusion and gear. */
  stats: Stats;
  /** The crit bonus a fight uses (the species' plus gear's); absent when it has neither. */
  crit?: CritBonus;
  /** The modifier sheet its gear fills (`FightSlot.mods`); absent when the gear fills nothing. */
  mods?: GearMods;
  /** What its gear does outside the fight (the dungeon's between-room rest reads it). */
  gearRules: GearRules;
  /** The ids of the gear items folded into `stats`, `crit`, `mods` and `gearRules` (a dungeon run records them). */
  gearIds: string[];
  /** `creaturePower` of `stats` (fusion and gear included). */
  power: number;
  /**
   * What its gear fold needs, to run it again once its place in the row is known (the position lines and
   * gear sets of the row, `placeSlots`): the stats before gear, its crit bonus, who it is, what it wears.
   */
  kit: FoldKit;
}

type CreatureDbRow = {
  id: string;
  user_id: string;
  species: string;
  level: number;
  fusion_count: number;
  nickname: string | null;
  caught_at: number;
};

function toTeamCreature(
  row: CreatureDbRow,
  worn: WornBySlot | undefined,
  book: readonly HeldTalent[] | undefined,
): TeamCreature {
  const species = speciesOf(row.species);
  const talents = foldTalentsOf(row, book);
  const folded = foldCreature(row, worn, talents);
  return {
    id: row.id,
    userId: row.user_id,
    species,
    level: row.level,
    fusionCount: row.fusion_count,
    nickname: row.nickname,
    caughtAt: row.caught_at,
    stats: folded.stats,
    ...(folded.crit === undefined ? {} : { crit: folded.crit }),
    ...(folded.mods === undefined ? {} : { mods: folded.mods }),
    gearRules: folded.rules,
    gearIds: Object.values(worn ?? {}).map((item) => item.id),
    power: creaturePower(folded.stats, folded.mods?.dodgeBp ?? 0),
    kit: {
      stats: effectiveStats(species, row.level, row.fusion_count),
      crit: species.crit,
      wearer: wearerOf(species),
      items: folded.items,
      talents,
    },
  };
}

/**
 * All creatures of a player, oldest first, with their gear and talents folded in. `without` leaves
 * out the worn items with these ids, as if they were not worn: the dungeon loads a creature that joins
 * a run late without any item the run already carries, so one item is never counted twice.
 */
export function loadCreatures(
  sql: SqlStorage,
  userId: string,
  without: ReadonlySet<string> = new Set(),
): TeamCreature[] {
  const worn = equippedByCreature(sql, userId);
  if (without.size > 0) {
    for (const [creatureId, items] of worn) {
      const kept = Object.fromEntries(
        Object.entries(items).filter(([, item]) => !without.has(item.id)),
      ) as WornBySlot;
      worn.set(creatureId, kept);
    }
  }
  const books = booksByCreature(sql, userId);
  return sql
    .exec<CreatureDbRow>(
      'SELECT id, user_id, species, level, fusion_count, nickname, caught_at FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
      userId,
    )
    .toArray()
    .map((row) => toTeamCreature(row, worn.get(row.id), books.get(row.id)));
}

/**
 * The strongest creatures by power (at most `teamSize`), ties to the older creature, then the smaller
 * id, so the order never depends on storage order. A raid team is sorted this way (strongest first),
 * so the order never depends on where or when a creature was placed. Nobody's creatures are picked
 * for them: this only orders the creatures a player placed.
 */
export function autoTeam(creatures: readonly TeamCreature[]): TeamCreature[] {
  return strongest(creatures, RULES.raid.teamSize);
}

/** One placed creature as stored: `rowid` is the order they were placed in (a move places again). */
export type PlacementRow = {
  rowid: number;
  slot: number;
  user_id: string;
  creature_id: string;
};

/**
 * At most `teamSize` placements per player, chosen deterministically: creatures in `preferred`
 * first, then the earliest placed (`rowid`), then the lowest slot. Pure. No player has more than
 * three creatures on the board (a stale row used to make a fourth); this is the one rule that
 * decides which survive, used by the data repair and by every read and write of placements.
 */
export function capPlacements<T extends PlacementRow>(
  rows: readonly T[],
  preferred: ReadonlySet<string> = new Set(),
): T[] {
  const byUser = new Map<string, T[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id);
    if (list === undefined) byUser.set(row.user_id, [row]);
    else list.push(row);
  }
  const kept = new Set<T>();
  for (const list of byUser.values()) {
    list
      .sort(
        (a, b) =>
          Number(preferred.has(b.creature_id)) - Number(preferred.has(a.creature_id)) ||
          a.rowid - b.rowid ||
          a.slot - b.slot,
      )
      .slice(0, RULES.raid.teamSize)
      .forEach((row) => kept.add(row));
  }
  return rows.filter((row) => kept.has(row));
}

/**
 * The placements of one party this week, at most three per player (see `capPlacements`). Only
 * creatures their placing player still owns count.
 */
export function partyPlacements(sql: SqlStorage, weekId: string, party: number): PlacementRow[] {
  return capPlacements(
    sql
      .exec<PlacementRow>(
        `SELECT p.rowid AS rowid, p.slot AS slot, p.user_id AS user_id, p.creature_id AS creature_id
         FROM raid_placements p JOIN creatures c ON c.id = p.creature_id AND c.user_id = p.user_id
         WHERE p.week_id = ? AND p.party = ? ORDER BY p.rowid`,
        weekId,
        party,
      )
      .toArray(),
  );
}

/** Sum of the power of a team. */
export function teamPower(team: readonly TeamCreature[]): number {
  return team.reduce((total, c) => total + c.power, 0);
}

/**
 * The creatures a player brings to this week's raid: the ones they placed on the board, and only
 * those (at most three, see `capPlacements`; a placement of a creature they no longer own does not
 * count). Nothing is picked for them: a player who placed nothing brings nothing and is not in the
 * raid. Loaded by id, with gear and talents folded in (never the whole collection). Sorted strongest
 * first, so the order never depends on where or when a creature was placed.
 */
export function raidTeam(sql: SqlStorage, weekId: string, userId: string): TeamCreature[] {
  return teamOfPlacements(
    sql,
    userId,
    sql
      .exec<PlacementRow>(
        `SELECT p.rowid AS rowid, p.slot AS slot, p.user_id AS user_id, p.creature_id AS creature_id
         FROM raid_placements p JOIN creatures c ON c.id = p.creature_id AND c.user_id = p.user_id
         WHERE p.week_id = ? AND p.user_id = ? ORDER BY p.rowid`,
        weekId,
        userId,
      )
      .toArray(),
  );
}

/**
 * A player's raid team out of placement rows that were already read (a party's, see `partyPlacements`): only
 * their own rows count, at most three. Loads those creatures by id, strongest first.
 */
export function teamOfPlacements(
  sql: SqlStorage,
  userId: string,
  placements: readonly PlacementRow[],
): TeamCreature[] {
  const mine = capPlacements(placements.filter((p) => p.user_id === userId));
  return autoTeam(
    loadCreaturesById(
      sql,
      userId,
      mine.map((r) => r.creature_id),
    ),
  );
}

/**
 * Migration 45 (with `raid_readiness`) made this table; it is no longer read or written (a raid team is
 * just the placed creatures, so there is nothing to cache). The function stays because a released
 * migration is never edited.
 */
export function raidTeamCacheMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE raid_team_cache (
    week_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    creature_ids TEXT NOT NULL,
    at INTEGER NOT NULL,
    stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
    PRIMARY KEY (week_id, user_id)
  )`);
}

/** Some of a player's creatures by id, loaded like `loadCreatures` (gear and talents folded in). */
export function loadCreaturesById(
  sql: SqlStorage,
  userId: string,
  ids: readonly string[],
): TeamCreature[] {
  if (ids.length === 0) return [];
  const worn = wornOnCreatures(sql, ids);
  const books = booksOfCreatures(sql, ids);
  // By id (the primary key), the owner checked here: `user_id = ?` in the query walked their whole list.
  return sql
    .exec<CreatureDbRow>(
      `SELECT id, user_id, species, level, fusion_count, nickname, caught_at FROM creatures
       WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ...ids,
    )
    .toArray()
    .filter((row) => row.user_id === userId)
    .sort((a, b) => a.caught_at - b.caught_at)
    .map((row) => toTeamCreature(row, worn.get(row.id), books.get(row.id)));
}

/**
 * Slots in a row made for `memberCount` players: three each, or `guestRowSize` when fewer than
 * `guestsBelowPlayers` take part (guests fill the rest). A party's real row also follows the active
 * roster and the slots in use: see `partyRowLength` in raid-roster.ts.
 */
export function rowLength(memberCount: number): number {
  return memberCount < RULES.combat.guestsBelowPlayers
    ? RULES.combat.guestRowSize
    : memberCount * RULES.raid.teamSize;
}
