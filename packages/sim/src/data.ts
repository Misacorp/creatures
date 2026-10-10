import { content, effectiveStats, type CreatureSpecies, type Stats } from '@creatures/game';

const byId = new Map<string, CreatureSpecies>(content.creatures.map((c) => [c.id, c]));

export function speciesOf(id: string): CreatureSpecies {
  const s = byId.get(id);
  if (s === undefined) throw new Error(`unknown species "${id}"`);
  return s;
}

/** Stage-1 species a player can catch. */
export const CATCHABLE: readonly CreatureSpecies[] = content.creatures.filter(
  (c) => c.catchable && c.stage === 1,
);

export const STARTERS: readonly CreatureSpecies[] = content.creatures.filter((c) => c.starter);

/** One creature a player owns (one per line; fusion adds to `fusionCount`). */
export interface OwnedCreature {
  /** `<playerId>/<line>`: stable across evolution. */
  id: string;
  line: string;
  /** Current species: the stage-1 species, or the evolved one after evolving. */
  speciesId: string;
  level: number;
  fusionCount: number;
}

const statCache = new Map<string, Stats>();

export function creatureStats(
  c: Pick<OwnedCreature, 'speciesId' | 'level' | 'fusionCount'>,
): Stats {
  const key = `${c.speciesId}:${c.level}:${c.fusionCount}`;
  let stats = statCache.get(key);
  if (stats === undefined) {
    stats = effectiveStats(speciesOf(c.speciesId), c.level, c.fusionCount);
    statCache.set(key, stats);
  }
  return stats;
}

/**
 * A creature's power on a 10x scale: Attack x 10 + HP. This is the integer form of
 * `atk + hp / 10`, so rankings never depend on float rounding.
 */
export function creaturePower10(
  c: Pick<OwnedCreature, 'speciesId' | 'level' | 'fusionCount'>,
): number {
  const s = creatureStats(c);
  return s.atk * 10 + s.hp;
}

/** Strongest first; ties by line id so the order is deterministic. */
export function byPowerDesc(creatures: readonly OwnedCreature[]): OwnedCreature[] {
  return [...creatures].sort(
    (a, b) =>
      creaturePower10(b) - creaturePower10(a) || (a.line < b.line ? -1 : a.line > b.line ? 1 : 0),
  );
}

export const TEAM_SIZE = 3;

/** The creatures a player brings to a raid: their 3 highest-power creatures. */
export function pickTeam(creatures: readonly OwnedCreature[]): OwnedCreature[] {
  return byPowerDesc(creatures).slice(0, TEAM_SIZE);
}

/** Team power = sum over the top 3 of (Attack + HP / 10), from `effectiveStats` (fusion included). */
export function teamPower(creatures: readonly OwnedCreature[]): number {
  return pickTeam(creatures).reduce((total, c) => total + creaturePower10(c), 0) / 10;
}
