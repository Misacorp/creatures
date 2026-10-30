import { masteryBonus } from './curves';
import { equipOrBag, hasMasterSmith, rollRarity } from './forge';
import { levelsDesc } from './growth';
import type { Destination, KitName, Rules } from './rules';
import { ELEMENTS } from './rules';
import type { Player, Server } from './types';
import { R } from './types';
import { addCreature, credit, creditShard, speciesElements, wasteOf } from './world';
import { poisson, uniform, weighted } from './util';

/** How many seats and anvils have a creature to stand on: three starters cover the first scout and anvil. */
export function activeCounts(p: Player): { scouts: number; anvils: number } {
  const scouts = Math.min(p.seats.length, p.creatures.length);
  const anvils = Math.min(p.anvils.length, Math.max(0, p.creatures.length - scouts));
  return { scouts, anvils };
}

/** V-POST-4: the average output multiplier from fit (an optimiser matches more posts than a set-and-forget player). */
export const fitMultiplier = (p: Player): number =>
  1 + p.rules.posts.fitBonus * p.rules.posts.fitShare[p.policy];

/** V-POST-11, V-SCOUT-5: what the kit on a scout seat multiplies. */
export function kitTilt(
  rules: Rules,
  kit: KitName | null,
): Record<'scrap' | 'shards' | 'creatures' | 'rare', number> {
  const t = { scrap: 1, shards: 1, creatures: 1, rare: 1 };
  if (kit === 'lure') t.creatures = rules.kit.lure.creatures;
  if (kit === 'lantern') t.rare = rules.kit.lantern.rare;
  if (kit === 'satchel') {
    t.scrap = rules.kit.satchel.scrap;
    t.shards = rules.kit.satchel.shards;
  }
  return t;
}

/** One hour of a scout seat's work: effective hours go into the store until it is full, then they are wasted (V-POST-5). */
export function accrueSeats(p: Player, share: number, scouts: number): void {
  const cap = p.rules.posts.storeHours;
  for (let i = 0; i < scouts; i++) {
    const seat = p.seats[i]!;
    const room = cap - seat.store;
    const add = room > share ? share : room > 0 ? room : 0;
    seat.store += add;
    seat.wasted += share - add;
    seat.mastery += share;
  }
}

const thirdBestLevel = (p: Player): number => {
  const lv = levelsDesc(p);
  return lv[Math.min(2, lv.length - 1)] ?? 1;
};

/** Which of the 34 forms arrives: places lean toward their element, a lure toward species the player lacks (V-SCOUT-3, V-SCOUT-5). */
function pickSpecies(p: Player, dest: Destination, lure: boolean): number {
  const rules = p.rules;
  const elements = speciesElements(rules);
  const weights = elements.map((element, species) => {
    let w =
      dest.element !== null && ELEMENTS[element] === dest.element ? rules.scouts.placeAffinity : 1;
    if (lure && (p.speciesCount[species] ?? 0) > 0) w *= rules.scouts.lureOwnedWeight;
    return w;
  });
  return weighted(p.rng, weights);
}

/** Brings one seat's store home (the owner's visit): the expected finds, then the rare ones as seeded draws (V-SCOUT-2). */
export function collectSeat(p: Player, index: number, server: Server): void {
  const rules = p.rules;
  const seat = p.seats[index]!;
  const hours = seat.store;
  const lost = seat.wasted;
  seat.store = 0;
  seat.wasted = 0;
  if (hours <= 0 && lost <= 0) return;
  p.wk.storeHours += hours;
  p.wk.storeLost += lost;
  const rate = rules.scouts.perHour;
  const dest = rules.scouts.destinations[seat.dest]!;
  const rich = (family: Destination['rich']): number =>
    dest.rich === family ? rules.scouts.richMultiplier : 1;
  const richRare = rich('rare');
  const tilt = kitTilt(rules, p.scoutKit);
  const second = p.seats.slice(0, index).some((s) => s.dest === seat.dest);
  const mult = fitMultiplier(p) * (1 + masteryBonus(rules, seat.mastery));
  const perk = hasMasterSmith(p) ? 1 + rules.posts.masterSmithScrapPerk : 1;

  const scrapPer = rate.scrap * rich('scrap') * mult * tilt.scrap * perk;
  const shardPer = rate.shards * rich('shards') * mult * tilt.shards;
  credit(p, R.scrap, hours * scrapPer, 'scouts');
  wasteOf(p, R.scrap, lost * scrapPer);
  const shardElement = dest.element === null ? -1 : ELEMENTS.indexOf(dest.element);
  const shardTotal = hours * shardPer;
  if (shardElement >= 0) creditShard(p, shardElement, shardTotal, 'scouts');
  else for (let e = 0; e < 4; e++) creditShard(p, e, shardTotal / 4, 'scouts');
  wasteOf(p, R.shards, lost * shardPer);

  const creaturesPer =
    rate.creatures *
    rich('creatures') *
    mult *
    tilt.creatures *
    (second ? rules.scouts.secondScoutCreatures : 1);
  const rarePer = richRare * mult * tilt.rare;
  const glimmerPer = rate.glimmer * rarePer;
  wasteOf(p, R.glimmer, lost * glimmerPer);

  // New creatures at the Paddock gate; a duplicate takes the Recommended answer (scrap).
  for (let n = poisson(p.rng, hours * creaturesPer); n > 0; n--) {
    const species = pickSpecies(p, dest, p.scoutKit === 'lure');
    p.wk.arrivals += 1;
    if ((p.speciesCount[species] ?? 0) === 0) {
      addCreature(p, species);
      p.firsts.creature ??= p.wk.week;
    } else {
      p.speciesCount[species] = (p.speciesCount[species] ?? 0) + 1;
      p.wk.duplicates += 1;
      credit(p, R.scrap, rules.scouts.duplicateCreatureScrap, 'duplicates');
    }
  }
  // Gear at the place's element (V-SCOUT: a scout's found gear starts at its owner's level, never above the fire).
  for (let n = poisson(p.rng, hours * rate.gear * rarePer); n > 0; n--) {
    const element = shardElement >= 0 ? shardElement : Math.floor(uniform(p.rng) * 4);
    const level = Math.min(server.fire, thirdBestLevel(p));
    equipOrBag(
      p,
      { ilvl: level, rarity: rollRarity(p, rules.forge.foundGearOdds), element },
      server.fire,
    );
  }
  // Blueprints: a known one found again is scrap.
  for (let n = poisson(p.rng, hours * rate.blueprints * rarePer); n > 0; n--) {
    if (uniform(p.rng) < 1 - p.blueprints / rules.scouts.blueprintPool) {
      p.blueprints += 1;
      p.wk.blueprints += 1;
    } else credit(p, R.scrap, rules.scouts.duplicateBlueprintScrap, 'duplicates');
  }
  const glimmerFound = poisson(p.rng, hours * glimmerPer);
  if (glimmerFound > 0) credit(p, R.glimmer, glimmerFound, 'scouts');
  const pages = poisson(p.rng, hours * rate.pages * rarePer);
  p.pages += pages;
  p.wk.pages += pages;
  // Everyday rare finds set themselves into a collection socket (V-COM-12); a spare one melts into Essence.
  for (let n = poisson(p.rng, hours * rate.rareFinds * rarePer); n > 0; n--) {
    if (!setCollectionFind(server, 'everyday', rules))
      credit(p, R.essence, rules.collections.meltEssence, 'melted finds');
  }
}

/** V-COM-12: a find sets itself into the first collection that wants one of its kind; false if every socket of that kind is full. */
export function setCollectionFind(
  server: Server,
  kind: 'everyday' | 'keystone',
  rules: Rules,
): boolean {
  const everyday = rules.collections.everydaySockets;
  const keystoneSockets = rules.collections.sockets - everyday;
  for (let i = 0; i < server.sockets.length; i++) {
    const c = server.sockets[i]!;
    const full = c.everyday >= everyday && c.keystones >= keystoneSockets;
    if (full) continue;
    if (kind === 'everyday' ? c.everyday < everyday : c.keystones < keystoneSockets) {
      if (kind === 'everyday') c.everyday += 1;
      else c.keystones += 1;
      if (c.everyday >= everyday && c.keystones >= keystoneSockets) {
        server.collectionsDone += 1;
        server.warmth.collections = (server.warmth.collections ?? 0) + rules.fire.warmth.collection;
      }
      return true;
    }
  }
  return false;
}
