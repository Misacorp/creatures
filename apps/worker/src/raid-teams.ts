/**
 * Raid teams and rows: who fights and where they stand. Shared by the week lifecycle, the phase
 * resolver and the API views. Everything here is synchronous SQL on the guild's database.
 */
import { RULES, creaturePower, effectiveStats, type CreatureSpecies } from '@creatures/game';
import { speciesOf, type ErrorStatus } from './collection';

/** Thrown inside a transaction to roll it back and answer with an error. */
export class RaidError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
  ) {
    super(code);
    this.name = 'RaidError';
  }
}

export const RAID_PHASE_STATUSES = ['open', 'phase1', 'phase2', 'finale'] as const;
export type RaidStatus = (typeof RAID_PHASE_STATUSES)[number];

/** A creature as a raid sees it: current stats at the moment of reading. */
export interface TeamCreature {
  id: string;
  userId: string;
  species: CreatureSpecies;
  level: number;
  fusionCount: number;
  nickname: string | null;
  caughtAt: number;
  /** `creaturePower` of the effective stats (fusion included). */
  power: number;
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

function toTeamCreature(row: CreatureDbRow): TeamCreature {
  const species = speciesOf(row.species);
  return {
    id: row.id,
    userId: row.user_id,
    species,
    level: row.level,
    fusionCount: row.fusion_count,
    nickname: row.nickname,
    caughtAt: row.caught_at,
    power: creaturePower(effectiveStats(species, row.level, row.fusion_count)),
  };
}

/** All creatures of a player, oldest first. */
export function loadCreatures(sql: SqlStorage, userId: string): TeamCreature[] {
  return sql
    .exec<CreatureDbRow>(
      'SELECT id, user_id, species, level, fusion_count, nickname, caught_at FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
      userId,
    )
    .toArray()
    .map(toTeamCreature);
}

/**
 * The automatic team: the player's strongest creatures by power (at most `teamSize`). Ties go to
 * the older creature, then the smaller id, so the pick never depends on storage order.
 *
 * Creatures away on an expedition are NOT excluded: they still fight (see
 * `docs/design/m4-raids.md`, "Away creatures"). Expeditions and raids do not block each other.
 */
export function autoTeam(creatures: readonly TeamCreature[]): TeamCreature[] {
  return [...creatures]
    .sort(
      (a, b) =>
        b.power - a.power || a.caughtAt - b.caughtAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, RULES.raid.teamSize);
}

/** Sum of the power of a team. */
export function teamPower(team: readonly TeamCreature[]): number {
  return team.reduce((total, c) => total + c.power, 0);
}

/** The chosen creature ids of a player this week, or null for the automatic team. */
export function chosenTeamIds(sql: SqlStorage, weekId: string, userId: string): string[] | null {
  const row = sql
    .exec<{
      creature_ids: string | null;
    }>('SELECT creature_ids FROM raid_teams WHERE week_id = ? AND user_id = ?', weekId, userId)
    .toArray()[0];
  if (row?.creature_ids == null) return null;
  try {
    const parsed: unknown = JSON.parse(row.creature_ids);
    if (Array.isArray(parsed) && parsed.every((x): x is string => typeof x === 'string')) {
      return parsed;
    }
  } catch {
    // Fall through: a damaged value means the automatic team.
  }
  return null;
}

/**
 * The creatures a player brings to this week's raid: the chosen ones if they all still belong to
 * the player, otherwise the automatic team.
 */
export function effectiveTeam(
  sql: SqlStorage,
  weekId: string,
  userId: string,
): { mode: 'auto' | 'chosen'; creatures: TeamCreature[] } {
  const owned = loadCreatures(sql, userId);
  const ids = chosenTeamIds(sql, weekId, userId);
  if (ids !== null) {
    const byId = new Map(owned.map((c) => [c.id, c]));
    const chosen = ids.map((id) => byId.get(id));
    if (chosen.every((c): c is TeamCreature => c !== undefined)) {
      return { mode: 'chosen', creatures: chosen };
    }
  }
  return { mode: 'auto', creatures: autoTeam(owned) };
}

/**
 * Slots in a party's shared row: three per member, or `guestRowSize` when fewer than
 * `guestsBelowPlayers` members take part (guests fill the rest).
 */
export function rowLength(memberCount: number): number {
  return memberCount < RULES.combat.guestsBelowPlayers
    ? RULES.combat.guestRowSize
    : memberCount * RULES.raid.teamSize;
}
