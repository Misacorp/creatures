/**
 * Pure rules of the Valley Games (docs/design/valley-games.md): the day's lineup, experience, medals
 * and records. The events themselves are resolved by the engine (`runGamesEvent`).
 */
import { int, type Rng } from '../rng';
import { RULES } from './config';

/** What choosing a lineup needs to know about an event. */
export interface LineupCandidate {
  id: string;
  kind: string;
  team: 1 | 3;
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/**
 * The day's events from `pool`: `count` events (`RULES.games.eventsPerDay`), `teams` of them team
 * events (`RULES.games.teamEventsPerDay`) when the pool has them. No kind twice when the pool allows it
 * (that comes first), then none of yesterday's events (`previousDayIds`) when the pool allows it; the
 * rest is the luck of the draw. Solo events come first in the order drawn, the team events last (the
 * show's closer). A pool smaller than `count` gives all of it. Pure given `rng`.
 */
export function chooseLineup<T extends LineupCandidate>(
  pool: readonly T[],
  rng: Rng,
  previousDayIds: readonly string[] = [],
  count: number = RULES.games.eventsPerDay,
  teams: number = RULES.games.teamEventsPerDay,
): T[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be at least 1');
  if (!Number.isInteger(teams) || teams < 0 || teams > count) {
    throw new RangeError('teams must be from 0 to count');
  }
  const ids = new Set<string>();
  for (const e of pool) {
    if (ids.has(e.id)) throw new RangeError(`duplicate event "${e.id}" in the pool`);
    ids.add(e.id);
  }
  const yesterday = new Set(previousDayIds);
  const order = shuffled(pool, rng);
  const kinds = new Set<string>();
  const pick = (from: readonly T[], n: number, out: T[]): void => {
    const left = [...from];
    while (out.length < n && left.length > 0) {
      let best = 0;
      let bestCost = Number.POSITIVE_INFINITY;
      left.forEach((e, i) => {
        const cost = (kinds.has(e.kind) ? 2 : 0) + (yesterday.has(e.id) ? 1 : 0);
        if (cost < bestCost) {
          bestCost = cost;
          best = i;
        }
      });
      const [e] = left.splice(best, 1) as [T];
      kinds.add(e.kind);
      out.push(e);
    }
  };
  const teamPicks: T[] = [];
  pick(
    order.filter((e) => e.team !== 1),
    teams,
    teamPicks,
  );
  const soloPicks: T[] = [];
  pick(
    order.filter((e) => e.team === 1),
    count - teamPicks.length,
    soloPicks,
  );
  // A pool short of solo events fills up with more team events.
  if (soloPicks.length + teamPicks.length < count) {
    pick(
      order.filter((e) => e.team !== 1 && !teamPicks.includes(e)),
      count - soloPicks.length,
      teamPicks,
    );
  }
  return [...soloPicks, ...teamPicks];
}

export type GamesMedal = 'gold' | 'silver' | 'bronze';
const MEDALS: readonly GamesMedal[] = ['gold', 'silver', 'bronze'];

/**
 * The medal of each standing, in the same order: places 1, 2 and 3 get gold, silver and bronze.
 * Places are competition places (a tie shares the place and the next place is skipped: 1, 1, 3), so
 * a tie shares the medal: two golds and then a bronze.
 */
export function placesToMedals(standings: readonly { place: number }[]): (GamesMedal | null)[] {
  return standings.map((s) => {
    if (!Number.isInteger(s.place) || s.place < 1) throw new RangeError('place must be at least 1');
    return MEDALS[s.place - 1] ?? null;
  });
}

/**
 * Experience for one creature from one event (`RULES.games.xp`): the flat amount for entering, the
 * place's bonus (1st to 3rd; `place` null or past 3rd: none) and the pin's bonus. Every member of a
 * team gets it all.
 */
export function gamesXp(place: number | null, pin: boolean): number {
  const xp = RULES.games.xp;
  const placeXp = place === null ? 0 : (xp.place[place - 1] ?? 0);
  return xp.enter + placeXp + (pin ? xp.pin : 0);
}

/** Medal points of a pocket of medals and pins (`RULES.games.medalPoints`). */
export function medalPoints(pocket: {
  gold: number;
  silver: number;
  bronze: number;
  pin: number;
}): number {
  const p = RULES.games.medalPoints;
  for (const n of [pocket.gold, pocket.silver, pocket.bronze, pocket.pin]) {
    if (!Number.isInteger(n) || n < 0)
      throw new RangeError('medal counts are whole numbers from 0');
  }
  return (
    pocket.gold * p.gold + pocket.silver * p.silver + pocket.bronze * p.bronze + pocket.pin * p.pin
  );
}

/**
 * Whether `score` beats a creature's record `prev` in an event (every kind's score is higher-is-better).
 * A creature's first entry has no record (`prev` undefined): it sets one but earns no pin.
 */
export function beatsRecord(prev: number | undefined, score: number): boolean {
  return prev !== undefined && score > prev;
}
