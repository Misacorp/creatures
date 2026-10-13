import {
  EXPEDITION_LENGTHS,
  RULES,
  applyCatchToCollection,
  chance,
  closedReasons,
  content,
  deepOpen,
  destinationDef,
  expectedTripWorth,
  expeditionContent,
  explorerRank,
  familiarityStars,
  foundSupplyId,
  goalDef,
  goalOddsBp,
  goalWorks,
  goalWorthRatio,
  int,
  journalChanceBp,
  journalEntry,
  journalPool,
  kitOf,
  lengthOpen,
  lengthRules,
  milestoneBonuses,
  expeditionConvertBait,
  partsOfSpec,
  rankSum,
  rollBlueprint,
  rollGearDrop,
  rollJournal,
  rollOffer,
  rollTripCatches,
  rollTripLoot,
  rankGiftsBetween,
  rollWorth,
  seasonOf,
  slotsFor,
  supplyDef,
  tripMs,
  tripRolls,
  tripXp,
  weeklySpecial,
  allSpecies,
  type DestinationDef,
  type ExpeditionLength,
  type FamiliarityRecord,
  type PartsBundle,
  type PushOnGoalDef,
  type Rarity,
  type Rng,
  type SupplyDef,
  type TwistEffect,
} from '@creatures/game';
import { ARCHETYPE_CONFIG } from './archetypes';
import { CATCHABLE, speciesOf, type OwnedCreature } from './data';
import { creditParts, grantItem, learnBlueprint, onJob, type GearContext } from './gear';
import type { PendingExpedition, SimPlayer } from './state';

/**
 * Expeditions v2 in the simulator. Every formula is the game's own (`@creatures/game`: catches, loot,
 * odds, offers, goals, journal, XP, slots); this file only holds what a player does with them.
 *
 * At a check-in the player:
 * 1. Claims every trip that is done. A trip that has just ended rolls its end-of-trip choice (the offer);
 *    a goal is taken when it costs no waiting (its extra hours counted from the end of the trip are over
 *    already) and is not a bad gamble (`goalWorthRatio` of at least `minGoalRatio`).
 * 2. Plans new trips into the free slots (`slotsFor` the rank sum). Each slot takes the creature with
 *    the highest explorer rank (ranks open places, the 24 hour trip and the better goals), the place
 *    where the most unowned species can be found, the length that pays the most per hour until the next
 *    check-in, and supplies: those in stock first, then the ones worth buying within the Bait budget.
 */
export const TRIP_POLICY = {
  /** A goal is taken when its worth ratio is at least this (basis points of 1). */
  minGoalRatioBp: 9_700,
  /** A supply is bought when its estimated worth is at least this many basis points of its price. */
  buyWorthBp: 3_000,
  /** What a goal that gives gear is worth extra when goals are compared, as a ratio (basis points of 1). */
  gearLikingBp: 800,
  /** While the second slot is closed, a player who checks in often takes the longest trip claimed within this many hours. */
  quickGapHours: 13,
  /** A casual's next check-in is this many hours away, whatever the trip's length. */
  casualGapHours: 84,
  /** Check-in hours of a player who checks in twice a day. */
  checkInHours: [9, 20] as const,
  /** A place a creature has begun on, but whose deeper area is still shut, is worth this much more. */
  finishFamiliarity: 2,
  /** What finding a species the player does not own yet is worth in Bait, when supplies are compared. */
  newSpeciesWorth: 40,
  /** Unowned species are worth this much more than the base when a place is chosen, by rarity. */
  speciesWeight: { common: 1, rare: 2, epic: 4 },
} as const;

const HOUR_MS = 3_600_000;

/** What a check-in knows about time and randomness for trips. */
export interface TripContext {
  /** Absolute simulated hour (since the start of the sim). */
  hour: number;
  /** Day index since the start of the sim. */
  day: number;
  /** The raid week's index (the same number that rotates bosses and places the Festival). */
  weekIndex: number;
  /** Catches. */
  catches: Rng;
  /** Offers, push-on results and the journal. */
  trip: Rng;
  /** Parts, supplies and gear: absent in a sim without gear (trips then only bring catches). */
  gear?: GearContext;
}

// --- Ranks, slots and what is open ---

export function rankOfCreature(player: SimPlayer, creatureId: string): number {
  return explorerRank(player.explorerXp[creatureId] ?? 0);
}

export function playerRankSum(player: SimPlayer): number {
  return rankSum(player.creatures.map((c) => rankOfCreature(player, c.id)));
}

export function slotsOfPlayer(player: SimPlayer): number {
  return slotsFor(playerRankSum(player), player.stats.trips_finished);
}

function recordSlotDays(player: SimPlayer, day: number): void {
  const slots = slotsOfPlayer(player);
  for (let k = 0; k < player.slotDays.length; k++) {
    if (slots >= k + 2 && player.slotDays[k] === null) player.slotDays[k] = day;
  }
}

function localHour(hour: number): number {
  return ((Math.floor(hour) % 24) + 24) % 24;
}

function festivalWeek(weekIndex: number): boolean {
  return seasonOf(Math.max(0, weekIndex)).festival;
}

function famKey(creatureId: string, destinationId: string): string {
  return `${creatureId}|${destinationId}`;
}

function famOf(player: SimPlayer, creatureId: string, destinationId: string): FamiliarityRecord {
  return (
    player.familiarity[famKey(creatureId, destinationId)] ?? {
      trips: 0,
      found: [],
      shiny: false,
    }
  );
}

// --- Choosing a trip ---

/** The first check-in at or after `hour` of a player who checks in twice a day. */
function nextCheckIn(hour: number): number {
  const day = Math.floor(hour / 24);
  for (let d = day; d <= day + 2; d++) {
    for (const h of TRIP_POLICY.checkInHours) {
      if (d * 24 + h >= hour) return d * 24 + h;
    }
  }
  return hour;
}

/**
 * The length that pays the most per hour of the slot being busy: a trip ties its slot up until the
 * check-in at which it is claimed. Casuals check in every few days, so they take the longest trip they
 * may; the others compare the worth of each length with the time until the check-in that claims it.
 */
export function chooseLength(player: SimPlayer, rank: number, hour: number): ExpeditionLength {
  const open = EXPEDITION_LENGTHS.filter((l) => lengthOpen(l, rank));
  const twiceDaily = ARCHETYPE_CONFIG[player.archetype].checkIns === 'twice_daily';
  // A new player who checks in often does short trips to finish the 3 that open the second slot.
  if (twiceDaily && slotsOfPlayer(player) < 2) {
    const quick = open.filter(
      (l) => nextCheckIn(hour + tripMs(l, rank) / HOUR_MS) - hour <= TRIP_POLICY.quickGapHours,
    );
    const longest = quick.at(-1);
    if (longest !== undefined) return longest;
  }
  let best: ExpeditionLength = open[0] ?? 'short';
  let bestRate = -1;
  for (const length of open) {
    const ready = hour + tripMs(length, rank) / HOUR_MS;
    const gap = twiceDaily
      ? nextCheckIn(ready) - hour
      : Math.max(TRIP_POLICY.casualGapHours, ready - hour);
    const rate = expectedTripWorth(length) / gap;
    if (rate >= bestRate) {
      best = length;
      bestRate = rate;
    }
  }
  return best;
}

/** The share of the species of one rarity that a trip there can find and the player does not own yet. */
function newShare(player: SimPlayer, dest: DestinationDef, stars: number, rarity: Rarity): number {
  const owned = ownedLines(player);
  const here = (deepOpen(dest, stars, []) ? allSpecies(dest) : dest.species)
    .map((id) => speciesOf(id))
    .filter((s) => s.rarity === rarity);
  if (here.length === 0) return 0;
  return here.filter((s) => !owned.has(s.line)).length / here.length;
}

function ownedLines(player: SimPlayer): Set<string> {
  return new Set(player.creatures.map((c) => c.line));
}

/** How much a place is worth to a creature now: unowned species there (rarer is worth more), plus a little. */
function placeScore(
  player: SimPlayer,
  creature: OwnedCreature,
  dest: DestinationDef,
  stars: number,
  tripsThere: number,
  twistDestination: string,
): number {
  const owned = ownedLines(player);
  const element = speciesOf(creature.speciesId).element;
  const here = deepOpen(dest, stars, []) ? allSpecies(dest) : dest.species;
  let score = 0.3;
  for (const id of here) {
    const s = speciesOf(id);
    if (owned.has(s.line)) continue;
    score +=
      TRIP_POLICY.speciesWeight[s.rarity] *
      (s.element === element ? 1.5 : 1) *
      (s.festival ? 2 : 1);
  }
  if (dest.id === twistDestination) score += 0.8;
  // A creature that has started on a place keeps at it until the deeper area opens (3 trips there).
  if (stars === 0 && tripsThere > 0 && dest.deep.species.length > 0)
    score += TRIP_POLICY.finishFamiliarity;
  if (dest.element !== null) score *= player.taste[dest.element] ?? 1;
  // A place with pages left in the journal, or never visited, is worth a trip too.
  const found = new Set(player.journal);
  if (
    journalPool(expeditionContent.journal.entries, dest.id, found).some((e) => e.place === dest.id)
  ) {
    score += 0.6;
  }
  if (!player.visited.includes(dest.id)) score += 0.6;
  return score;
}

export function chooseDestination(
  player: SimPlayer,
  creature: OwnedCreature,
  ctx: Pick<TripContext, 'hour' | 'weekIndex' | 'trip'>,
): DestinationDef {
  const rank = rankOfCreature(player, creature.id);
  const special = weeklySpecial(ctx.weekIndex).destination;
  // Players lean towards the places that are worth most to them but do not all go to the same one:
  // a place is picked with a chance in proportion to its score.
  const options: { dest: DestinationDef; weight: number }[] = [];
  for (const dest of expeditionContent.destinations) {
    const closed = closedReasons(dest, {
      rank,
      localHour: localHour(ctx.hour),
      festivalWeek: festivalWeek(ctx.weekIndex),
    });
    if (closed.length > 0) continue;
    const fam = famOf(player, creature.id, dest.id);
    const stars = familiarityStars(dest, fam);
    const score = placeScore(player, creature, dest, stars, fam.trips, special);
    options.push({ dest, weight: Math.max(1, Math.round(score * 100)) });
  }
  const total = options.reduce((n, o) => n + o.weight, 0);
  let roll = total === 0 ? 0 : int(ctx.trip, total);
  for (const o of options) {
    if (roll < o.weight) return o.dest;
    roll -= o.weight;
  }
  const fallback = expeditionContent.destinations[0];
  if (fallback === undefined) throw new Error('content has no destinations');
  return fallback;
}

// --- Supplies ---

/** The estimated worth, in Bait, of one supply on a trip (a policy estimate, not a game rule). */
export function supplyGain(
  player: SimPlayer,
  def: SupplyDef,
  trip: { length: ExpeditionLength; dest: DestinationDef; stars: number },
): number {
  const discovery = (rarity: Rarity): number => newShare(player, trip.dest, trip.stars, rarity);
  const w = RULES.expeditions.worth;
  const l = lengthRules(trip.length);
  const odds = RULES.expeditions.defaultOddsBp;
  const offer = (def.offerBp / 10_000) * 12;
  switch (def.kind) {
    case 'lure': {
      const perRoll =
        (def.rareUpBp * (w.roll.rare - w.roll.common) +
          def.epicUpBp * (w.roll.epic - w.roll.common)) /
        10_000;
      const found = (def.rareUpBp * discovery('rare') + def.epicUpBp * discovery('epic')) / 10_000;
      return l.rolls * (perRoll + found * TRIP_POLICY.newSpeciesWorth) + offer;
    }
    case 'map-scrap': {
      const extra = Math.max(1, Math.floor((l.rolls * def.rollsBp) / 10_000));
      const fresh =
        (odds.common * discovery('common') +
          odds.rare * discovery('rare') +
          odds.epic * discovery('epic')) /
        10_000;
      return extra * (rollWorth(odds) + fresh * TRIP_POLICY.newSpeciesWorth) + offer;
    }
    case 'lantern': {
      const hasDeep = trip.dest.deep.species.length > 0;
      return (def.deepBp / 10_000) * l.rolls * (hasDeep ? 9 : 3) + offer;
    }
    case 'satchel': {
      const parts = l.loot.scrap * w.scrap + (l.loot.shardBp * w.shard) / 10_000;
      return (def.partsBp / 10_000) * parts + (def.supplyBp / 10_000) * averagePrice() + offer;
    }
  }
}

let cachedAverage: number | null = null;
function averagePrice(): number {
  cachedAverage ??=
    expeditionContent.supplies.filter((s) => s.tier === 'basic').reduce((n, s) => n + s.price, 0) /
    expeditionContent.supplies.filter((s) => s.tier === 'basic').length;
  return cachedAverage;
}

/**
 * The supplies a trip carries: those in stock that help, then supplies worth buying while the budget
 * lasts, best first, never two of a kind and at most `maxSupplies`. Returns the kit and the Bait it
 * costs; takes nothing from the player.
 */
export function chooseKit(
  player: SimPlayer,
  trip: { length: ExpeditionLength; dest: DestinationDef; stars: number },
  budget: number,
): { kit: string[]; bought: string[]; cost: number } {
  const options = expeditionContent.supplies
    .map((def) => {
      const owned = (player.supplies[def.id] ?? 0) > 0;
      const gain = supplyGain(player, def, trip);
      return { def, owned, gain, score: gain - (owned ? 0 : def.price) };
    })
    .filter((o) =>
      o.owned
        ? o.gain > 0
        : o.def.price <= budget && o.gain * 10_000 >= o.def.price * TRIP_POLICY.buyWorthBp,
    )
    .sort((a, b) => b.score - a.score || (a.def.id < b.def.id ? -1 : 1));
  const kit: string[] = [];
  const bought: string[] = [];
  const kinds = new Set<string>();
  let cost = 0;
  for (const o of options) {
    if (kit.length >= RULES.expeditions.maxSupplies) break;
    if (kinds.has(o.def.kind)) continue;
    if (!o.owned && cost + o.def.price > budget) continue;
    kinds.add(o.def.kind);
    kit.push(o.def.id);
    if (!o.owned) {
      bought.push(o.def.id);
      cost += o.def.price;
    }
  }
  return { kit, bought, cost };
}

// --- Sending ---

function twistEffect(id: string | null): TwistEffect | null {
  if (id === null) return null;
  return expeditionContent.specials.twists.find((t) => t.id === id)?.effect ?? null;
}

/**
 * Sends trips into the free slots with a Bait budget for supplies. Returns the Bait spent on supplies.
 * The explorer is the idle creature of the highest rank (ties by element gap, then id).
 */
export function sendTrips(
  player: SimPlayer,
  ctx: TripContext,
  budget: number,
  explorerOrder: (idle: OwnedCreature[]) => OwnedCreature[],
): number {
  let left = budget;
  let spent = 0;
  const away = new Set(player.expeditions.map((e) => e.explorerId));
  const idle = explorerOrder(
    player.creatures.filter((c) => !away.has(c.id) && !onJob(player, c.id)),
  );
  const free = slotsOfPlayer(player) - player.expeditions.length;
  const special = weeklySpecial(ctx.weekIndex);
  const senders = idle.slice(0, Math.max(0, free));
  for (const [k, creature] of senders.entries()) {
    const rank = rankOfCreature(player, creature.id);
    const dest = chooseDestination(player, creature, ctx);
    const length = chooseLength(player, rank, ctx.hour);
    const stars = familiarityStars(dest, famOf(player, creature.id, dest.id));
    // Each trip may use an equal share of what is left of the budget.
    const picked = chooseKit(
      player,
      { length, dest, stars },
      Math.floor(left / (senders.length - k)),
    );
    for (const id of picked.kit) {
      if (picked.bought.includes(id)) {
        player.stats.supplies_bought += 1;
      } else {
        player.supplies[id] = (player.supplies[id] ?? 0) - 1;
      }
    }
    player.stats.supplies_used += picked.kit.length;
    left -= picked.cost;
    spent += picked.cost;
    const twist = special.destination === dest.id ? special.twist : null;
    const kit = kitOf(picked.kit);
    player.expeditions.push({
      explorerId: creature.id,
      length,
      destination: dest.id,
      kit: picked.kit,
      rolls: tripRolls(length, kit, twist === null ? null : twist.effect),
      twist: twist === null ? null : twist.id,
      startHour: ctx.hour,
      endsAtHour: ctx.hour + tripMs(length, rank) / HOUR_MS,
    });
  }
  return spent;
}

// --- Claiming ---

/** The goal a player takes from an offer: the best that costs no waiting and is not a bad gamble. */
function chooseGoal(
  trip: PendingExpedition,
  hour: number,
): { goal: PushOnGoalDef; endsAtHour: number } | null {
  let best: { goal: PushOnGoalDef; endsAtHour: number; ratio: number } | null = null;
  for (const id of trip.offer ?? []) {
    const goal = goalDef(id);
    if (goal === undefined || goalOddsBp(goal, trip.length) === undefined) continue;
    const endsAtHour = trip.endsAtHour + goal.extraHours;
    if (endsAtHour > hour) continue; // would mean waiting for the next check-in
    const ratio = goalWorthRatio(goal, trip.length);
    if (ratio * 10_000 < TRIP_POLICY.minGoalRatioBp) continue;
    // Players like gear: a fair gamble for a piece of gear beats a small sure thing.
    const liking = ratio + (goal.reward.gear === undefined ? 0 : TRIP_POLICY.gearLikingBp / 10_000);
    if (best === null || liking > best.ratio) best = { goal, endsAtHour, ratio: liking };
  }
  return best;
}

function addParts(player: SimPlayer, parts: PartsBundle, ctx: TripContext): void {
  if (ctx.gear !== undefined) creditParts(player, parts);
}

/** Claims every trip that is done by `ctx.hour`, including the end-of-trip choice. */
export function claimTrips(player: SimPlayer, ctx: TripContext): void {
  const pending = player.expeditions;
  player.expeditions = [];
  for (const trip of pending) {
    if (trip.endsAtHour > ctx.hour) {
      player.expeditions.push(trip);
      continue;
    }
    const explorer = player.creatures.find((c) => c.id === trip.explorerId);
    if (explorer === undefined) continue;
    if (trip.offer === undefined) {
      const bonuses = milestoneBonuses({ ...player.stats });
      trip.offer = rollOffer(ctx.trip, {
        goals: expeditionContent.goals,
        length: trip.length,
        rank: rankOfCreature(player, explorer.id),
        kit: kitOf(trip.kit),
        milestoneOfferBp: bonuses.offerBp,
      });
      player.stats.offers += 1;
    }
    if (trip.push === undefined && trip.offer.length > 0) {
      const taken = chooseGoal(trip, ctx.hour);
      if (taken !== null) {
        trip.push = { goalId: taken.goal.id, endsAtHour: taken.endsAtHour };
        player.stats.pushons_taken += 1;
      }
    }
    if (trip.push !== undefined && trip.push.endsAtHour > ctx.hour) {
      player.expeditions.push(trip);
      continue;
    }
    payTrip(player, explorer, trip, ctx);
  }
}

/** What a finished trip brings: the goal (if any) first, then catches, loot, XP, familiarity, the journal. */
function payTrip(
  player: SimPlayer,
  explorer: OwnedCreature,
  trip: PendingExpedition,
  ctx: TripContext,
): void {
  const dest = destinationDef(trip.destination);
  if (dest === undefined) return;
  const goal = trip.push === undefined ? undefined : goalDef(trip.push.goalId);
  let worked = false;
  if (goal !== undefined) {
    worked = goalWorks(ctx.trip, goal, trip.length);
    if (!worked && goal.risk === 'risky') {
      player.stats.trips_failed += 1;
      return;
    }
    if (worked) player.stats.pushons_won += 1;
  }
  const reward = worked && goal !== undefined ? goal.reward : null;
  const species = speciesOf(explorer.speciesId);
  const kit = kitOf(trip.kit);
  const twist = twistEffect(trip.twist);
  const bonuses = milestoneBonuses({ ...player.stats });
  const rank = rankOfCreature(player, explorer.id);
  const famBefore = famOf(player, explorer.id, dest.id);
  const starsBefore = familiarityStars(dest, famBefore);

  const { results, dupeStreak } = rollTripCatches(
    ctx.catches,
    trip.rolls + (reward?.catchRolls ?? 0),
    {
      content,
      destination: dest,
      length: trip.length,
      explorer: { element: species.element, role: species.role },
      kit,
      stars: starsBefore,
      milestoneRarityBp: bonuses.rarityBp,
      twist,
      ownedLines: ownedLines(player),
      dupeStreak: player.dupeStreak,
      firstExpedition: !player.firstExpeditionDone,
    },
  );
  player.dupeStreak = dupeStreak;
  player.firstExpeditionDone = true;
  player.stats.catch_rolls += results.length;
  for (const caught of results) {
    const existing = player.creatures.find((c) => c.line === caught.species.line);
    const outcome = applyCatchToCollection(
      existing === undefined ? undefined : { fusionCount: existing.fusionCount, shiny: false },
      caught,
    );
    if (outcome.kind === 'new') {
      player.creatures.push({
        id: `${player.id}/${caught.species.line}`,
        line: caught.species.line,
        speciesId: caught.species.id,
        level: 1,
        fusionCount: 0,
      });
      player.stats.species_found += 1;
    } else if (outcome.kind === 'fused') {
      if (existing !== undefined) existing.fusionCount = outcome.newFusionCount;
    } else {
      const bait = expeditionConvertBait(outcome.bait);
      player.bait += bait;
      player.week.baitConverted += bait;
    }
    if (caught.shiny) player.stats.shinies_found += 1;
  }

  // Loot (parts, a blueprint, found supplies) and what the goal gives, with the gear rng.
  if (ctx.gear !== undefined) {
    const loot = rollTripLoot(
      ctx.gear.rng,
      {
        length: trip.length,
        shardElement: dest.element ?? species.element,
        role: species.role,
        kit,
        stars: starsBefore,
        milestonePartsBp: bonuses.partsBp,
        twist,
        rank,
      },
      { completed: true, caught: results.length, rolls: trip.rolls },
    );
    addParts(player, loot.parts, ctx);
    if (loot.blueprint !== null) learnBlueprint(player, loot.blueprint);
    for (const id of loot.supplies) addSupply(player, id);
    if (reward !== null) {
      addParts(player, partsOfSpec(reward.parts), ctx);
      if (reward.supply === true) addSupply(player, foundSupplyId(ctx.gear.rng, rank));
      if (reward.blueprint === true) learnBlueprint(player, rollBlueprint(ctx.gear.rng));
      if (reward.gear !== undefined) grantItem(player, rollGearDrop(ctx.gear.rng, reward.gear));
    }
  }

  // Explorer XP, familiarity and the journal.
  const xpBp = bonuses.xpBp + (twist?.kind === 'xp' ? twist.bp : 0) + (reward?.xpBp ?? 0);
  player.explorerXp[explorer.id] =
    (player.explorerXp[explorer.id] ?? 0) + tripXp(trip.length, xpBp);
  // The one-time gift of every rank this trip reached (Bait, and parts and supplies with the gear sim).
  for (const { gift } of rankGiftsBetween(rank, rankOfCreature(player, explorer.id))) {
    player.bait += gift.bait;
    if (ctx.gear !== undefined) {
      addParts(player, gift.parts, ctx);
      for (const id of gift.supplies) {
        if (supplyDef(id) !== undefined) player.supplies[id] = (player.supplies[id] ?? 0) + 1;
      }
    }
  }
  const found = new Set(famBefore.found);
  for (const c of results) if (allSpecies(dest).includes(c.species.id)) found.add(c.species.id);
  player.familiarity[famKey(explorer.id, dest.id)] = {
    trips: famBefore.trips + 1,
    found: [...found],
    shiny: famBefore.shiny || results.some((c) => c.shiny),
  };
  rollPages(player, dest, trip, twist, reward?.journal === true, ctx);

  player.stats.trips_finished += 1;
  recordSlotDays(player, ctx.day);
  player.stats.trip_hours += Math.round(lengthRules(trip.length).ms / HOUR_MS);
  player.tripsByLength[trip.length] += 1;
  if (!player.visited.includes(dest.id)) {
    player.visited.push(dest.id);
    player.stats.places_visited += 1;
  }
}

function addSupply(player: SimPlayer, id: string): void {
  if (supplyDef(id) === undefined) return;
  player.supplies[id] = (player.supplies[id] ?? 0) + 1;
  player.stats.supplies_found += 1;
}

function rollPages(
  player: SimPlayer,
  dest: DestinationDef,
  trip: PendingExpedition,
  twist: TwistEffect | null,
  sure: boolean,
  ctx: TripContext,
): void {
  const entries = expeditionContent.journal.entries;
  const found = new Set(player.journal);
  const attempts = [chance(ctx.trip, journalChanceBp(trip.length, twist), 10_000)];
  if (sure) attempts.push(true);
  for (const wanted of attempts) {
    if (!wanted) continue;
    const id = rollJournal(ctx.trip, entries, dest.id, found);
    if (id === null) continue;
    found.add(id);
    player.journal.push(id);
    player.stats.journal_pages += 1;
    const set = journalEntry(id)?.set;
    if (set !== undefined && entries.filter((e) => e.set === set).every((e) => found.has(e.id))) {
      player.stats.journal_sets += 1;
    }
  }
}

/** Every catchable species the player does not own is worth sending a trip for (used by the reports). */
export function unownedCatchable(player: SimPlayer): number {
  const owned = ownedLines(player);
  return CATCHABLE.filter((s) => !owned.has(s.line)).length;
}
