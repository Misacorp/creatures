import {
  ELEMENTS,
  RULES,
  addExperience,
  expToNext,
  raidExperience,
  ribbonCeiling,
  ribbonNeeded,
  ribbonParts,
  ribbonsForLevel,
  shardOf,
  treatCost,
  dayCreatureXpParts,
  type Element,
  type ExpGain,
  type PartKind,
  type PartsBundle,
} from '@creatures/game';
import { byPowerDesc, speciesOf, type OwnedCreature } from './data';
import { canPay, pay } from './gear';
import type { RaidWeek } from './raid';
import type { TreatPolicy } from './profiles';
import type { SimPlayer } from './state';

/*
 * Training by activity in the simulator (docs/design/gear-and-creatures-v2.md section 9). Every rule is
 * the game's own (`@creatures/game`: the curve, what each activity pays, the treat's price, the ribbons
 * and their gates); this file holds what a player does with them:
 *
 * - Experience arrives with the activity that earns it: a finished trip pays its explorer, a dungeon
 *   run its three creatures, a raid stage the creatures that fought, a Workshop job its worker. A
 *   creature levels up while the way is open and banks the rest at a ribbon or its evolution.
 * - A player with a training focus (the strongest 3 or 6 creatures) sends those creatures first where a
 *   choice exists (the explorer of a trip) while they can still grow; a player who does not plan (a
 *   `spread` profile) uses whoever the other rules pick.
 * - Treats double one creature's experience for an activity and cost Bait when it starts. Each profile
 *   says which activities it packs one for (`treats`): none, the long trips and the dungeon, or every
 *   trip of 6 hours and more, the dungeon and the longer Workshop jobs. Only focus creatures that can
 *   still grow get one, and only with the Bait in the purse.
 * - A creature waiting at a ribbon gate gets its ribbon at the next check-in that has the materials
 *   (and, for Silver, the creature's own trips). A sim without gear has no materials: the ribbons are free.
 */

/** The ribbons a creature holds: the stored number, or the ones its level is past (a creature a test made). */
export function ribbonsOf(c: OwnedCreature): number {
  return c.ribbons ?? ribbonsForLevel(c.level);
}

/** The highest level a creature can reach now: its species' cap and the next ribbon, whichever is lower. */
export function levelCeiling(c: OwnedCreature): number {
  return Math.min(
    speciesOf(c.speciesId).levelCap,
    RULES.experience.maxLevel,
    ribbonCeiling(ribbonsOf(c)),
  );
}

/** True while experience can still do something for a creature: it can level, or its bank has room. */
export function canGrow(c: OwnedCreature): boolean {
  if (c.level >= RULES.experience.maxLevel) return false;
  if (c.level < levelCeiling(c)) return true;
  return (c.exp ?? 0) < expToNext(c.level);
}

/** Pays experience to a creature (the game's rule) and counts the levels it gained. */
export function giveExperience(
  player: SimPlayer,
  c: OwnedCreature,
  gained: number,
  source: 'trip' | 'dungeon' | 'raid' | 'job' | null,
): ExpGain {
  const g = addExperience(
    {
      level: c.level,
      exp: c.exp ?? 0,
      ribbons: ribbonsOf(c),
      levelCap: speciesOf(c.speciesId).levelCap,
    },
    gained,
  );
  c.level = g.level;
  c.exp = g.exp;
  c.ribbons = g.ribbons;
  player.week.levelUps += g.levelsGained;
  if (source !== null && gained > 0) player.stats[`exp_${source}`] += gained;
  return g;
}

/** Pays a raid stage's experience to every creature of the players that fought it (guests have no owner). */
export function awardRaidExperience(week: RaidWeek, stage: 'phase1' | 'phase2' | 'finale'): void {
  const cleared = week.stages[stage]?.cleared === true;
  const gained = raidExperience(
    stage,
    cleared,
    dayCreatureXpParts(false, week.weather[stage] ?? null),
  );
  const byId = new Map(week.players.map((p) => [p.id, p]));
  for (const slot of week.row) {
    const owner = slot.ownerId === null ? undefined : byId.get(slot.ownerId);
    const creature = owner?.creatures.find((c) => c.id === slot.id);
    if (owner !== undefined && creature !== undefined)
      giveExperience(owner, creature, gained, 'raid');
  }
}

// --- Whom to send where ---

/**
 * The creatures a player trains now: the strongest `focus` of those that can still grow (all of them for
 * `spread`, which has no plan: an empty set stands for "no preference").
 */
export function focusSet(player: SimPlayer): Set<string> {
  const focus = player.profile.trainFocus;
  if (focus === 'spread') return new Set();
  const growing = byPowerDesc(player.creatures.filter(canGrow));
  // A creature that is still working towards its evolution goes first when the profile pushes it.
  const push = player.profile.evolutionPush
    ? growing.filter((c) => {
        const evo = speciesOf(c.speciesId).evolvesTo;
        return evo !== undefined && c.level < evo.level;
      })
    : [];
  const ordered = [...push.slice(0, 1), ...growing.filter((c) => !push.slice(0, 1).includes(c))];
  return new Set(ordered.slice(0, focus).map((c) => c.id));
}

/** A list of creatures with the player's focus creatures first (the order inside each part is kept). */
export function focusFirst(player: SimPlayer, creatures: OwnedCreature[]): OwnedCreature[] {
  const focus = focusSet(player);
  if (focus.size === 0) return creatures;
  return [
    ...creatures.filter((c) => focus.has(c.id)),
    ...creatures.filter((c) => !focus.has(c.id)),
  ];
}

// --- Treats ---

export type TreatActivity =
  { kind: 'trip'; hours: number } | { kind: 'dungeon' } | { kind: 'job'; hours: number };

/** Whether the profile's policy packs a treat for this activity (before the Bait and the creature are looked at). */
function policyTreats(policy: TreatPolicy, activity: TreatActivity): boolean {
  if (policy === 'none') return false;
  if (activity.kind === 'dungeon') return true;
  if (activity.kind === 'trip')
    return policy === 'all' ? activity.hours >= 6 : activity.hours >= 12;
  return policy === 'all' && activity.hours >= 3;
}

/**
 * Decides and pays a treat for `creature` as an activity starts: the policy wants one, the creature is in
 * the focus and can still grow, and the purse holds the Bait. Returns whether it was packed (the Bait is
 * taken now).
 */
export function packTreat(
  player: SimPlayer,
  creature: OwnedCreature,
  activity: TreatActivity,
): boolean {
  if (!policyTreats(player.profile.treats, activity)) return false;
  if (!canGrow(creature)) return false;
  const focus = focusSet(player);
  if (focus.size > 0 && !focus.has(creature.id)) return false;
  const cost = treatCost(creature.level);
  if (player.bait < cost) return false;
  player.bait -= cost;
  player.week.baitTreats += cost;
  player.stats.treats += 1;
  return true;
}

// --- Ribbons ---

/** Finished trips of one creature (the Silver Ribbon asks for five). */
export function creatureTrips(player: SimPlayer, creatureId: string): number {
  let trips = 0;
  for (const [key, record] of Object.entries(player.familiarity)) {
    if (key.startsWith(`${creatureId}|`)) trips += record.trips;
  }
  return trips;
}

/**
 * Buys the ribbon of every creature that waits for one and can pay it (strongest first). With gear
 * modelled it costs scrap, shards of the creature's element, glimmer and finished trips; without, the
 * materials do not exist and the ribbon is free. The banked experience is spent at once.
 */
export function buyRibbons(player: SimPlayer, materials: boolean): void {
  for (const c of byPowerDesc(player.creatures)) {
    const def = ribbonNeeded(c.level, ribbonsOf(c));
    if (def === null) continue;
    if (materials) {
      if (creatureTrips(player, c.id) < def.trips) continue;
      const cost = ribbonParts(def, speciesOf(c.speciesId).element);
      if (!canPay(player, cost)) continue;
      pay(player, cost);
    }
    c.ribbons = ribbonsOf(c) + 1;
    player.stats.ribbons += 1;
    giveExperience(player, c, 0, null);
  }
}

/** How close to a gate a creature must be before the player starts keeping the ribbon's materials back. */
const RESERVE_LEVELS = 2;

/**
 * The parts a player keeps back for ribbons: for every creature within `RESERVE_LEVELS` levels of the
 * gate it waits at (or already waiting), the cost of the next ribbon. The crafting plans leave these
 * alone (a Silver Ribbon needs 5 shards of one element, which a craft would otherwise spend).
 */
export function ribbonReserve(player: SimPlayer): PartsBundle {
  const reserve: PartsBundle = {};
  for (const c of player.creatures) {
    const next = RULES.experience.ribbons[ribbonsOf(c)];
    if (next === undefined || c.level < next.level - RESERVE_LEVELS || c.level > next.level)
      continue;
    const cost = ribbonParts({ ...next, id: next.id }, speciesOf(c.speciesId).element);
    for (const [kind, amount] of Object.entries(cost) as [PartKind, number][]) {
      reserve[kind] = (reserve[kind] ?? 0) + amount;
    }
  }
  return reserve;
}

/** The elements whose shards the reserved ribbons still lack: trips there bring them. */
export function ribbonShardsWanted(player: SimPlayer): Set<Element> {
  const reserve = ribbonReserve(player);
  return new Set(
    ELEMENTS.filter((e) => (reserve[shardOf(e)] ?? 0) > player.gear.parts[shardOf(e)]),
  );
}
