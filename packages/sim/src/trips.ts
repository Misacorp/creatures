import {
  EXPEDITION_LENGTHS,
  RULES,
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
  tripExperience,
  tripMs,
  tripTicks,
  catchChanceBp,
  mapTicksBp,
  rollMapTicks,
  tickWorth,
  tripWeather,
  tripXp,
  weatherTimeMs,
  weeklySpecial,
  allSpecies,
  creatureXpParts,
  dayParts,
  dayXpEffects,
  gearPart,
  NO_TRIP_WEATHER,
  type XpBoostPart,
  type DestinationDef,
  type ExpeditionLength,
  type FamiliarityRecord,
  type PartsBundle,
  type PushOnGoalDef,
  type Rarity,
  type Rng,
  type SupplyDef,
  type TripWeather,
  type TwistEffect,
  type WeatherDay,
} from '@creatures/game';
import { foldedCreature, speciesOf, type OwnedCreature } from './data';
import { creditParts, grantItem, learnBlueprint, onJob, type GearContext } from './gear';
import { collect } from './talents';
import { giveExperience, packTreat, ribbonShardsWanted } from './training';
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
 *    check-in, and the supplies in stock that help (supplies cannot be bought).
 */
export const TRIP_POLICY = {
  /** A goal is taken when its worth ratio is at least this (basis points of 1). */
  minGoalRatioBp: 9_700,
  /** What a goal that gives gear is worth extra when goals are compared, as a ratio (basis points of 1). */
  gearLikingBp: 800,
  /** While the second slot is closed, a player who checks in often takes the longest trip claimed within this many hours. */
  quickGapHours: 13,
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
  /** The talents of every creature that arrives (a new species's first, a duplicate's). */
  talents: Rng;
  /** Parts, supplies and gear: absent in a sim without gear (trips then only bring catches). */
  gear?: GearContext;
  /** The weather of the day: a trip is sent under it and keeps what it did. Absent or null: none. */
  weather?: WeatherDay | null;
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

/** The first check-in at or after `hour` of a player who checks in daily, at `hours` of the day. */
function nextCheckIn(hour: number, hours: readonly number[]): number {
  const day = Math.floor(hour / 24);
  for (let d = day; d <= day + 2; d++) {
    for (const h of hours) {
      if (d * 24 + h >= hour) return d * 24 + h;
    }
  }
  return hour;
}

/**
 * The length that pays the most per hour of the slot being busy: a trip ties its slot up until the
 * check-in at which it is claimed. Players who do not open the game every day (casuals, drop-ins) have
 * their next check-in 168 / loginDays hours away (84 for a casual), so they take the longest trip they
 * may; the others compare the worth of each length with the time until the check-in that claims it.
 */
export function chooseLength(player: SimPlayer, rank: number, hour: number): ExpeditionLength {
  const open = EXPEDITION_LENGTHS.filter((l) => lengthOpen(l, rank));
  const { loginDays, checkInHours } = player.profile;
  // A player who opens the game every day knows when the next check-in is (its hours); the others
  // (casuals, drop-ins) only know that logins come about every 168 / loginDays hours.
  const daily = loginDays >= 7;
  const loginGapHours = 168 / Math.max(0.5, loginDays);
  // A new player who checks in often does short trips to finish the 3 that open the second slot.
  if (daily && slotsOfPlayer(player) < 2) {
    const quick = open.filter(
      (l) =>
        nextCheckIn(hour + tripMs(l, rank) / HOUR_MS, checkInHours) - hour <=
        TRIP_POLICY.quickGapHours,
    );
    const longest = quick.at(-1);
    if (longest !== undefined) return longest;
  }
  let best: ExpeditionLength = open[0] ?? 'short';
  let bestRate = -1;
  for (const length of open) {
    const ready = hour + tripMs(length, rank) / HOUR_MS;
    const gap = daily
      ? nextCheckIn(ready, checkInHours) - hour
      : Math.max(loginGapHours, ready - hour);
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
  // A creature near a ribbon gate needs shards of its element: the place of that element has them.
  if (dest.element !== null && ribbonShardsWanted(player).has(dest.element)) score += 1.5;
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
  ctx: Pick<TripContext, 'hour' | 'weekIndex' | 'trip' | 'weather'>,
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
      nightOpen: tripWeather(ctx.weather ?? null, { destination: dest.id, length: 'short' })
        .reefOpen,
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
  const t = RULES.expeditions.tick;
  const ticks = lengthRules(trip.length).ticks;
  const odds = RULES.expeditions.defaultOddsBp;
  const offer = (def.offerBp / 10_000) * 12;
  // What a creature a tick brings is worth: its rarity and, when it is new, the species.
  const fresh =
    (odds.common * discovery('common') +
      odds.rare * discovery('rare') +
      odds.epic * discovery('epic')) /
    10_000;
  const anyNew = (['common', 'rare', 'epic'] as const).some((r) => discovery(r) > 0) ? 1 : 0;
  const creature = rollWorth(odds) + fresh * TRIP_POLICY.newSpeciesWorth;
  switch (def.kind) {
    case 'lure': {
      // The fixed bonus creature, and the lure's share of every tick's chance, and the extra new species
      // the lure's draw finds among all the creatures of the trip.
      const own = catchChanceBp([]) / 10_000;
      const lured = Math.min(1, own + def.catchBp / 10_000);
      const creatures = ticks * lured + def.bonusBp / 10_000;
      const extraCreatures = ticks * (lured - own) + def.bonusBp / 10_000;
      const extraNew =
        creatures * (def.newBp / 10_000) * (anyNew - fresh) * TRIP_POLICY.newSpeciesWorth;
      return extraCreatures * creature + extraNew + offer;
    }
    case 'map-scrap': {
      // More ticks: each is worth a tick's loot, and a creature's discovery value on top.
      const extra = mapTicksBp(trip.length, [def]) / 10_000;
      const tickLoot =
        tickWorth(trip.length) + (t.creatureBp / 10_000) * fresh * TRIP_POLICY.newSpeciesWorth;
      return extra * tickLoot + offer;
    }
    case 'lantern': {
      // The deeper area is worth more per creature (the rarest species live there); the fixed part is the
      // first creature, which a trip brings almost surely over a few ticks.
      const hasDeep = trip.dest.deep.species.length > 0;
      const per = hasDeep ? 9 : 3;
      const creatures = ticks * (t.creatureBp / 10_000);
      const first = 1 - (1 - t.creatureBp / 10_000) ** ticks;
      return ((def.deepBp / 10_000) * creatures + (def.firstDeepBp / 10_000) * first) * per + offer;
    }
    case 'satchel': {
      const perTick = (t.scrapBp * w.scrap + t.shardBp * w.shard) / 10_000;
      const fixed = def.scrap * w.scrap + (def.shardBp / 10_000) * w.shard;
      const finds = (def.supplyBp / 10_000) * ticks * (t.supplyBp / 10_000) * averageWorth();
      return fixed + (def.partsBp / 10_000) * ticks * perTick + finds + offer;
    }
  }
}

let cachedAverage: number | null = null;
function averageWorth(): number {
  cachedAverage ??=
    expeditionContent.supplies.filter((s) => s.tier === 'basic').reduce((n, s) => n + s.worth, 0) /
    expeditionContent.supplies.filter((s) => s.tier === 'basic').length;
  return cachedAverage;
}

/**
 * The supplies a trip carries: those in stock that help, best first, never two of a kind and at most
 * `maxSupplies`. Supplies cannot be bought, so only the stock counts. Takes nothing from the player.
 */
export function chooseKit(
  player: SimPlayer,
  trip: { length: ExpeditionLength; dest: DestinationDef; stars: number },
): string[] {
  const options = expeditionContent.supplies
    .filter((def) => (player.supplies[def.id] ?? 0) > 0)
    .map((def) => ({ def, gain: supplyGain(player, def, trip) }))
    .filter((o) => o.gain > 0)
    .sort((a, b) => b.gain - a.gain || (a.def.id < b.def.id ? -1 : 1));
  const kit: string[] = [];
  const kinds = new Set<string>();
  for (const o of options) {
    if (kit.length >= RULES.expeditions.maxSupplies) break;
    if (kinds.has(o.def.kind)) continue;
    kinds.add(o.def.kind);
    kit.push(o.def.id);
  }
  return kit;
}

// --- Sending ---

function twistEffect(id: string | null): TwistEffect | null {
  if (id === null) return null;
  return expeditionContent.specials.twists.find((t) => t.id === id)?.effect ?? null;
}

/**
 * Sends trips into the free slots, each with the supplies in stock that help. The explorer is the idle
 * creature of the highest rank (ties by element gap, then id).
 */
export function sendTrips(
  player: SimPlayer,
  ctx: TripContext,
  explorerOrder: (idle: OwnedCreature[]) => OwnedCreature[],
): void {
  const away = new Set(player.expeditions.map((e) => e.explorerId));
  const idle = explorerOrder(
    player.creatures.filter((c) => !away.has(c.id) && !onJob(player, c.id)),
  );
  const free = slotsOfPlayer(player) - player.expeditions.length;
  const special = weeklySpecial(ctx.weekIndex);
  const senders = idle.slice(0, Math.max(0, free));
  for (const creature of senders) {
    const rank = rankOfCreature(player, creature.id);
    const dest = chooseDestination(player, creature, ctx);
    const length = chooseLength(player, rank, ctx.hour);
    const stars = familiarityStars(dest, famOf(player, creature.id, dest.id));
    // A treat for the explorer (Bait, paid now): the policy and the Bait decide.
    const treat = packTreat(player, creature, {
      kind: 'trip',
      hours: lengthRules(length).ms / HOUR_MS,
    });
    const picked = chooseKit(player, { length, dest, stars });
    for (const id of picked) player.supplies[id] = (player.supplies[id] ?? 0) - 1;
    player.stats.supplies_used += picked.length;
    player.stats.lures_used += picked.filter((id) => supplyDef(id)?.kind === 'lure').length;
    const twist = special.destination === dest.id ? special.twist : null;
    // The day's weather, as the worker stores it with the trip when it is sent.
    const fx = tripWeather(ctx.weather ?? null, { destination: dest.id, length });
    const changes = (Object.keys(NO_TRIP_WEATHER) as (keyof TripWeather)[]).some(
      (k) => fx[k] !== NO_TRIP_WEATHER[k],
    );
    player.expeditions.push({
      explorerId: creature.id,
      length,
      destination: dest.id,
      ...(treat ? { treat: true } : {}),
      kit: picked,
      rolls:
        tripTicks(length, twist === null ? null : twist.effect) +
        fx.extraRolls +
        (length === 'day' ? foldedCreature(creature).rules.dayTripRolls : 0),
      twist: twist === null ? null : twist.id,
      startHour: ctx.hour,
      // Quick feet lines on the explorer's gear and the day's weather change the time (fixed when it is sent).
      endsAtHour:
        ctx.hour +
        weatherTimeMs(
          Math.floor(
            (tripMs(length, rank) * (10_000 - foldedCreature(creature).rules.quickFeetBp)) / 10_000,
          ),
          fx.timeBp,
        ) /
          HOUR_MS,
      ...(changes ? { weather: fx, xpEffects: dayXpEffects(ctx.weather ?? null) } : {}),
    });
  }
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
  // Lines on the explorer's gear (Trail XP, Lucky find, Keen nose, Packer), as the worker reads them.
  const gearRules = foldedCreature(explorer).rules;
  // What the day did to this trip when it was sent: the claim reads this, never the weather.
  const wx = trip.weather ?? NO_TRIP_WEATHER;
  const famBefore = famOf(player, explorer.id, dest.id);
  const starsBefore = familiarityStars(dest, famBefore);

  // The ticks of the trip: the length's (and the twist's, the day's and the gear's, stored when it was
  // sent), the map's rolled now, and an hour for every hour a worked goal added. A goal's own catch
  // rolls are extra creature rolls.
  const ticks =
    Math.max(trip.rolls, lengthRules(trip.length).ticks) +
    rollMapTicks(ctx.trip, trip.length, kit) +
    (worked && goal !== undefined ? goal.extraHours : 0);
  const { results, dupeStreak, empty } = rollTripCatches(
    ctx.catches,
    ticks + (reward?.catchRolls ?? 0),
    {
      content,
      destination: dest,
      length: trip.length,
      explorer: { element: species.element, role: species.role },
      kit,
      stars: starsBefore,
      milestoneRarityBp: bonuses.rarityBp + gearRules.luckyFindBp + wx.rarityBp,
      twist,
      ownedLines: ownedLines(player),
      dupeStreak: player.dupeStreak,
      firstExpedition: !player.firstExpeditionDone,
    },
    true,
  );
  player.dupeStreak = dupeStreak;
  player.firstExpeditionDone = true;
  player.stats.catch_rolls += results.length + empty;
  player.stats.empty_rolls += empty;
  for (const caught of results) {
    // A new species becomes a creature with its first talent; a duplicate is answered with Recommended
    // (Teach, Fuse or Release), straight away. Nothing turns into Bait any more.
    if (collect(player, caught.species, ctx.talents, ctx.gear !== undefined) === 'new') {
      player.stats.species_found += 1;
    }
    if (caught.shiny) player.stats.shinies_found += 1;
  }

  // Loot (parts, a blueprint, found supplies) and what the goal gives, with the gear rng.
  if (ctx.gear !== undefined) {
    const place = {
      element: dest.element ?? null,
      crossroads: dest.id === RULES.gear.compassPlace,
    };
    const loot = rollTripLoot(ctx.gear.rng, {
      ticks,
      fixedParts: true,
      place,
      role: species.role,
      kit,
      stars: starsBefore,
      milestonePartsBp: bonuses.partsBp,
      twist,
      rank,
      gearPartsBp: gearRules.keenNoseBp,
      gearSupplyBp: gearRules.packerBp,
      gearGlimmerBp: gearRules.glimmerFindBp,
      weatherPartsBp: wx.partsBp,
      weatherShardsBp: wx.shardsBp,
      weatherSupplyBp: wx.supplyBp,
    });
    addParts(player, loot.parts, ctx);
    for (const id of loot.blueprints) learnBlueprint(player, id);
    for (const id of loot.supplies) addSupply(player, id);
    for (const item of loot.gear) grantItem(player, item);
    if (reward !== null) {
      addParts(player, partsOfSpec(reward.parts), ctx);
      if (reward.supply === true) addSupply(player, foundSupplyId(ctx.gear.rng, rank));
      if (reward.blueprint === true) learnBlueprint(player, rollBlueprint(ctx.gear.rng));
      if (reward.gear !== undefined) {
        grantItem(player, rollGearDrop(ctx.gear.rng, reward.gear, place, rank));
      }
    }
  }

  // Explorer XP, familiarity and the journal.
  // The same shares the worker names (milestones, twist, goal, gear); they multiply.
  const xpParts: XpBoostPart[] = [
    { source: 'trip', name: 'Milestones', bp: bonuses.xpBp },
    { source: 'trip', name: 'Twist', bp: twist?.kind === 'xp' ? twist.bp : 0 },
    { source: 'trip', name: 'Push on', bp: reward?.xpBp ?? 0 },
    gearPart('trail-xp', gearRules.trailXpBp),
  ];
  player.explorerXp[explorer.id] = (player.explorerXp[explorer.id] ?? 0) + tripXp(ticks, xpParts);
  // Creature experience: a finished trip pays its explorer by the length, doubled by a treat.
  giveExperience(
    player,
    explorer,
    tripExperience(
      trip.length,
      creatureXpParts(trip.treat === true, wx.treatMultiplier, dayParts(trip.xpEffects ?? [])),
    ),
    'trip',
  );
  // The one-time gift of every rank this trip reached (Bait, and parts and supplies with the gear sim).
  for (const { gift } of rankGiftsBetween(rank, rankOfCreature(player, explorer.id))) {
    player.bait += gift.bait;
    if (ctx.gear !== undefined) {
      addParts(player, gift.parts, ctx);
      for (const id of gift.supplies) {
        if (supplyDef(id) === undefined) continue;
        player.supplies[id] = (player.supplies[id] ?? 0) + 1;
        player.stats.supplies_gift += 1;
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
  rollPages(player, dest, ticks, twist, reward?.journal === true, ctx, wx.journalBp);

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
  ticks: number,
  twist: TwistEffect | null,
  sure: boolean,
  ctx: TripContext,
  weatherBp: number,
): void {
  const entries = expeditionContent.journal.entries;
  const found = new Set(player.journal);
  const attempts: boolean[] = [];
  for (let i = 0; i < ticks; i++) {
    attempts.push(chance(ctx.trip, journalChanceBp(twist, weatherBp), 10_000));
  }
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
