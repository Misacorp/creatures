import type { Rules } from './rules';
import type { Creature, Player } from './types';

/**
 * Honours (docs/design/valley/systems/trials.md): Bronze, Silver and Gold are a checklist across the valley, never a gate. Boxes tick as
 * a creature lives its life (fights it was in, the hours it has worked at a post); the daily graduation gives the honour to every
 * creature whose boxes are ticked and whose level is high enough. Nothing here stops a level.
 */

/** Hours of work a creature needs for Expert and Master (the mastery steps of V-POST-12). */
const expertHours = (rules: Rules): number => rules.posts.mastery[1]?.hours ?? 168;
const masterHours = (rules: Rules): number => rules.posts.mastery[2]?.hours ?? 504;

const fightBoxOpen = (rules: Rules, c: Creature): boolean => {
  const [bronze = 10, silver = 20, gold = 30] = rules.honours.levels;
  if (c.honour === 0) return c.level >= bronze && c.dungeonClears === 0;
  if (c.honour === 1) return c.level >= silver && c.undercroftClears === 0;
  if (c.honour === 2) return c.level >= gold && c.raidClears === 0;
  return false;
};

/**
 * The creatures that fight (the dungeon and the raid): the best by XP. An optimiser carries one lower-level creature with two strong
 * ones (Q41 A: players learn that two creatures can tutor a lower level third for its Bronze): the last place goes to the highest-level
 * creature that still needs a fight box for its next honour (a set-and-forget player leaves the team as it is).
 */
export function fightTeam(p: Player): Creature[] {
  const n = p.rules.fights.team;
  const byXp = [...p.creatures].sort((a, b) => b.xp - a.xp);
  if (p.policy !== 'optimiser' || n < 2) return byXp.slice(0, n);
  const fixed = byXp.slice(0, n - 1);
  const rest = byXp.slice(n - 1);
  const needing = rest.filter((c) => fightBoxOpen(p.rules, c)).sort((a, b) => b.level - a.level)[0];
  const last = needing ?? rest[0];
  return last ? [...fixed, last] : fixed;
}

/** A dungeon run's boxes: every creature in the team has cleared the dungeon, and some runs reach the Undercroft. */
export function tickDungeon(team: readonly Creature[], undercroft: boolean): void {
  for (const c of team) {
    c.dungeonClears += 1;
    if (undercroft) c.undercroftClears += 1;
  }
}

/** The week's raid when the boss falls: the party has cleared a raid. */
export function tickRaid(team: readonly Creature[]): void {
  for (const c of team) c.raidClears += 1;
}

/** Which creature takes a new seat: one not at a post yet, the one with the fewest hours of work, then the highest level. */
export function pickOccupant(p: Player): number {
  const taken = new Set([...p.scoutOcc, ...p.anvilOcc]);
  let best = -1;
  p.creatures.forEach((c, i) => {
    if (taken.has(i)) return;
    const b = best >= 0 ? (p.creatures[best] as Creature) : undefined;
    const work = c.scoutHours + c.smithHours;
    const bw = b ? b.scoutHours + b.smithHours : Infinity;
    if (!b || work < bw || (work === bw && c.level > b.level)) best = i;
  });
  return best;
}

/** At a visit, seats that had nobody (no creature was free) get one now. */
export function fillEmptyPosts(p: Player): void {
  for (const occ of [p.scoutOcc, p.anvilOcc])
    for (let i = 0; i < occ.length; i++) if ((occ[i] ?? -1) < 0) occ[i] = pickOccupant(p);
}

/**
 * An optimiser's visit: a creature that has become a Master of its work moves on and a creature that has not worked yet takes its seat
 * (posts.md: "a Master moving on frees its seat for a newcomer"). A set-and-forget player never moves anyone.
 */
export function rotateMasters(p: Player): void {
  if (p.policy !== 'optimiser') return;
  const master = masterHours(p.rules);
  const swap = (occ: number[], hours: (c: Creature) => number): void => {
    for (let i = 0; i < occ.length; i++) {
      const c = p.creatures[occ[i] ?? -1];
      if (!c || hours(c) < master) continue;
      const taken = new Set([...p.scoutOcc, ...p.anvilOcc]);
      let next = -1;
      p.creatures.forEach((d, k) => {
        if (taken.has(k) || d.scoutHours + d.smithHours > 0) return;
        if (next < 0 || d.level > (p.creatures[next] as Creature).level) next = k;
      });
      if (next >= 0) occ[i] = next;
    }
  };
  swap(p.scoutOcc, (c) => c.scoutHours);
  swap(p.anvilOcc, (c) => c.smithHours);
}

/** Whether a creature's boxes for its next honour are ticked (the level is checked too). */
export function readyForHonour(rules: Rules, c: Creature): boolean {
  const { levels, bronzePostHours, bronzeSmithHours } = rules.honours;
  const work = c.scoutHours + c.smithHours;
  if (c.honour === 0)
    return (
      c.level >= (levels[0] ?? 10) &&
      c.dungeonClears > 0 &&
      work >= bronzePostHours &&
      (c.brought || c.smithHours >= bronzeSmithHours)
    );
  if (c.honour === 1)
    return (
      c.level >= (levels[1] ?? 20) &&
      c.undercroftClears > 0 &&
      Math.max(c.scoutHours, c.smithHours) >= expertHours(rules)
    );
  if (c.honour === 2)
    return (
      c.level >= (levels[2] ?? 30) &&
      c.raidClears > 0 &&
      Math.max(c.scoutHours, c.smithHours) >= masterHours(rules)
    );
  return false;
}

/** The daily graduation (V-TRIAL-4): every creature whose boxes are ticked gets its honour, whether or not its owner is there. */
export function graduate(p: Player): void {
  for (const c of p.creatures) if (c.honour < 3 && readyForHonour(p.rules, c)) c.honour += 1;
}

/** Creatures holding at least Bronze, Silver and Gold. */
export const honourCounts = (p: Player): number[] =>
  [1, 2, 3].map((h) => p.creatures.filter((c) => c.honour >= h).length);
