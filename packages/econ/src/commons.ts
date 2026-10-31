import type { Rules } from './rules';
import { ELEMENTS } from './rules';
import { serverMiddle } from './growth';
import { setCollectionFind } from './collections';
import type { Place, Player, Server } from './types';
import { HOURS_PER_WEEK, R } from './types';
import { credit, debit, debitShard } from './world';
import { clamp, uniform, weighted } from './util';

/** The level of a place by id. */
export const placeLevel = (server: Server, id: string): number =>
  server.places.find((p) => p.id === id)?.level ?? 1;

/** V-COM-5: a player's weight in sizing projects, by visit days a week (a weekly player about 0.4). */
export function activeWeight(rules: Rules, p: Player, hour: number): number {
  const observed = Math.min(7, Math.floor((hour - p.joinHour) / 24));
  if (observed <= 0) return 1;
  const perWeek = (p.visitDays.reduce((a, b) => a + b, 0) * 7) / observed;
  if (perWeek <= 0) return 0;
  const { oneDay, fullAtDays } = rules.commons.weight;
  return oneDay + (1 - oneDay) * clamp((perWeek - 1) / (fullAtDays - 1), 0, 1);
}

/** V-COM-13: the Forge's fire is the higher of what the valley has built and the time floor; it never falls. */
export function refreshFire(server: Server, hour: number, rules: Rules): void {
  const warmth = Object.values(server.warmth).reduce((a, b) => a + b, 0);
  const floor = rules.fire.start + rules.fire.floorPerWeek * Math.floor(hour / HOURS_PER_WEEK);
  server.fire = Math.max(server.fire, rules.fire.start + warmth, floor);
  const week = Math.floor(hour / HOURS_PER_WEEK) + 1;
  rules.fire.thresholds.forEach((t, i) => {
    if (server.fire >= t && server.thresholds[i] === null) server.thresholds[i] = week;
  });
}

/**
 * The Market (V-FORGE-11, "the broker as a project"): a communal project like the others that gives every player the broker's seat when it is
 * built. It is added to the valley when the server's anvils first spend this much of a week waiting for a shard (ASSUMPTION: 15%), and it is
 * sized like a level-2 place's project (the base size times the second level's factor, scaled with the server's weight).
 */
export const MARKET_OPENS_AT = 0.15;

export function openMarket(server: Server, hour: number): void {
  if (server.places.some((p) => p.id === 'market')) return;
  server.places.push({
    id: 'market',
    level: 2,
    open: false,
    opensAt: hour,
    progress: 0,
    size: 0,
    need: [0, 0, 0],
    have: [0, 0, 0],
    cosmetic: 0,
    openedAt: hour,
  });
  server.marketOpenedHour = hour;
}

/** V-COM-15: the guided start. The hearth opens first, the Forge when the hearth has levelled, the rest when both have. */
function mayOpen(server: Server, index: number): boolean {
  if (server.places[index]?.id === 'market') return true;
  const bonfire = server.places[0]?.level ?? 1;
  const forge = server.places[1]?.level ?? 1;
  if (index === 0) return true;
  if (index === 1) return bonfire >= 2;
  return bonfire >= 2 && forge >= 2;
}

const projectSize = (server: Server, index: number, rules: Rules): number => {
  const place = server.places[index]!;
  const c = rules.commons;
  const factor =
    place.level >= c.maxLevel
      ? c.cosmeticFactor
      : (c.levelFactor[place.level - 1] ?? c.levelFactor.at(-1) ?? 1);
  return (
    c.baseSize * factor * Math.pow(Math.max(server.weight, 1) / c.referenceWeight, c.sizeExponent)
  );
};

/** The value of one unit of each part of a project (Acorns, scrap, shards), in Acorns' worth. */
const partValues = (rules: Rules): number[] => [
  rules.commons.giftValue.acorns,
  rules.commons.giftValue.scrap,
  rules.commons.giftValue.shards,
];
const partSplit = (rules: Rules): number[] => [
  rules.commons.costSplit.acorns,
  rules.commons.costSplit.scrap,
  rules.commons.costSplit.shards,
];

/** Opens each place's next project when its build days have passed (V-COM-5: a hoard raises one level per place at most). */
export function refreshProjects(server: Server, hour: number, rules: Rules): void {
  const values = partValues(rules);
  const split = partSplit(rules);
  server.places.forEach((place, i) => {
    if (place.open || hour < place.opensAt || !mayOpen(server, i)) return;
    place.open = true;
    place.progress = 0;
    place.size = projectSize(server, i, rules);
    // Q33: a project's cost has an Acorn part, a scrap part and a shard part (shards of an element tied to the place).
    // The Market of the shard-free variant is paid in Acorns and scrap only (shards are what is short, so they cannot also build it).
    const shares =
      place.id === 'market' && server.config.broker === 'market' ? [0.5, 0.5, 0] : split;
    place.need = shares.map((s, k) => (place.size * s) / (values[k] as number));
    place.have = [0, 0, 0];
    place.openedAt = hour;
  });
}

/** How much of a project is filled, in Acorns' worth (each part counts up to what it needs). */
const filledValue = (place: Place, rules: Rules): number => {
  const values = partValues(rules);
  return place.need.reduce(
    (sum, need, k) => sum + Math.min(place.have[k] ?? 0, need) * (values[k] as number),
    0,
  );
};

/**
 * Adds `units` of one part (0 Acorns, 1 scrap, 2 shards) to a place's project, never past what the part needs. When every part
 * is full the level is raised, the fire warms and the build days start. Returns the units taken.
 */
export function contributePart(
  server: Server,
  index: number,
  part: number,
  units: number,
  hour: number,
  rules: Rules,
): number {
  const place = server.places[index]!;
  if (!place.open || units <= 0) return 0;
  const room = Math.max(0, (place.need[part] ?? 0) - (place.have[part] ?? 0));
  const taken = Math.min(units, room);
  place.have[part] = (place.have[part] ?? 0) + taken;
  place.progress = filledValue(place, rules);
  if (place.need.some((need, k) => (place.have[k] ?? 0) < need - 1e-9)) return taken;
  const warmth = rules.fire.warmth;
  if (place.level < rules.commons.maxLevel) {
    place.level += 1;
    server.levelUps.push({ hour, place: place.id, level: place.level });
    const key = place.id === 'forge' ? 'forge' : 'places';
    server.warmth[key] =
      (server.warmth[key] ?? 0) + (place.id === 'forge' ? warmth.forgeLevel : warmth.placeLevel);
  } else {
    place.cosmetic += 1;
    server.warmth.cosmetic = (server.warmth.cosmetic ?? 0) + warmth.cosmetic;
  }
  server.projectDurations.push(hour - place.openedAt);
  place.open = false;
  place.progress = 0;
  place.opensAt = hour + rules.commons.buildHours;
  // The Market is built once: the broker's seat exists from now on, and it never opens another project.
  if (place.id === 'market') {
    server.marketDoneHour = hour;
    place.opensAt = Infinity;
  }
  refreshFire(server, hour, rules);
  return taken;
}

/** The open projects that still need some of a part. */
const openFor = (server: Server, part: number): { pl: Place; i: number }[] =>
  server.places
    .map((pl, i) => ({ pl, i }))
    .filter(({ pl }) => pl.open && (pl.have[part] ?? 0) < (pl.need[part] ?? 0) - 1e-9);

/**
 * Gifts of Acorns or scrap go to the open projects the server favours (V-COM-5: "the server chooses together"); what no project can
 * take stays with the giver. Returns the units given.
 */
function offerPart(
  p: Player,
  server: Server,
  hour: number,
  part: number,
  available: number,
  take: (amount: number) => void,
): number {
  const rules = p.rules;
  let left = available;
  let given = 0;
  for (let tries = 0; tries < 6 && left > 1e-9; tries++) {
    const open = openFor(server, part);
    if (open.length === 0) break;
    const pick =
      open[
        weighted(
          server.rng,
          open.map(({ pl }) => rules.commons.placeWeights[pl.id] ?? 1),
        )
      ]!;
    const amount = Math.min(left, (pick.pl.need[part] ?? 0) - (pick.pl.have[part] ?? 0));
    take(amount);
    contributePart(server, pick.i, part, amount, hour, rules);
    left -= amount;
    given += amount;
  }
  return given;
}

/**
 * A visit's gifts (Q33): a project's cost is Acorns, scrap and shards, and a player gives their share of what came in since the last
 * gift of each, from what is above a reserve for their own Forge. Shards go to a project only as shards of the element
 * tied to its place. A hoarder saves, then gives all. Essence never goes to projects (it is for creatures).
 */
export function giveGifts(p: Player, server: Server, hour: number): void {
  const rules = p.rules;
  const week = Math.floor(hour / HOURS_PER_WEEK) + 1;
  const hoard = p.profile.hoardWeeks;
  if (hoard > 0 && week <= hoard) return;
  const dumping = hoard > 0 && week <= hoard + 2;
  const value = partValues(rules);
  const budget = (r: number, spare: number): number =>
    dumping ? spare : Math.min(p.giftBudget[r] ?? 0, spare);
  let total = 0;
  const acorns = Math.floor(budget(R.acorns, p.stock[R.acorns] ?? 0));
  if (acorns >= 1) {
    const given = offerPart(p, server, hour, 0, acorns, (a) => debit(p, R.acorns, a, 'gifts'));
    p.giftBudget[R.acorns] = Math.max(0, (p.giftBudget[R.acorns] ?? 0) - given);
    total += given * (value[0] as number);
  }
  const scrap = Math.floor(
    budget(R.scrap, Math.max(0, (p.stock[R.scrap] ?? 0) - rules.forge.giveReserveScrap)),
  );
  if (scrap >= 1) {
    const given = offerPart(p, server, hour, 1, scrap, (a) => debit(p, R.scrap, a, 'gifts'));
    p.giftBudget[R.scrap] = Math.max(0, (p.giftBudget[R.scrap] ?? 0) - given);
    total += given * (value[1] as number);
  }
  for (const { pl, i } of openFor(server, 2)) {
    const element = ELEMENTS.indexOf(
      (rules.commons.placeElement[pl.id] ?? 'ember') as (typeof ELEMENTS)[number],
    );
    const spareOf = (e: number): number =>
      Math.max(0, (p.shards[e] ?? 0) - rules.forge.giveReserveShards);
    let need = (pl.need[2] ?? 0) - (pl.have[2] ?? 0);
    const pay = (e: number, shards: number, units: number): void => {
      debitShard(p, e, shards, 'gifts');
      const taken = contributePart(server, i, 2, units, hour, rules);
      p.giftBudget[R.shards] = Math.max(0, (p.giftBudget[R.shards] ?? 0) - shards);
      total += taken * (value[2] as number);
      need -= taken;
    };
    // Shards of the place's own element count in full.
    const own = Math.min(Math.floor(budget(R.shards, spareOf(element))), need);
    if (own > 1e-9) pay(element, own, own);
    // Shards of any other element count at the exchange's rate (3 for 1), so one scarce element never holds a project back.
    const rate = rules.forge.exchange.rate;
    for (const e of ELEMENTS.map((_, k) => k)
      .filter((k) => k !== element)
      .sort((x, y) => spareOf(y) - spareOf(x))) {
      if (need < 1e-9) break;
      const units = Math.min(Math.floor(budget(R.shards, spareOf(e)) / rate), need);
      if (units > 1e-9) pay(e, units * rate, units);
    }
  }
  p.wk.gifts += total;
  server.gifts[p.id] = (server.gifts[p.id] ?? 0) + total;
}

/** V-COM-14: communal seats' output, credited at the owner's visit; one seat per place, each needing its own creature. */
export function creditCommunal(p: Player, server: Server, hour: number): void {
  const rules = p.rules;
  const hours = p.communalStore;
  p.communalStore = 0;
  if (!server.config.communalSeats || hours <= 0) return;
  const seats = Math.min(
    server.places.length,
    Math.floor(p.creatures.length / rules.commons.communalCreaturesPerSeat),
  );
  const values = partValues(rules);
  const split = partSplit(rules);
  for (let i = 0; i < seats; i++) {
    const place = server.places[i]!;
    if (!place.open) continue;
    // The haulers' work fills every part of the project in its own proportion.
    const value = Math.min(hours * rules.commons.communalPerHour, place.size - place.progress);
    server.communal += value;
    split.forEach((s, k) =>
      contributePart(server, i, k, (value * s) / (values[k] as number), hour, rules),
    );
  }
}

/** V-SCOUT-9: a ready keystone is found by the first scout posted at its place; the clock then restarts. */
export function checkKeystones(
  server: Server,
  players: readonly Player[],
  hour: number,
  rules: Rules,
): void {
  server.keystoneReady.forEach((ready, d) => {
    if (hour < ready) return;
    for (const p of players) {
      if (hour < p.joinHour) continue;
      const scouts = Math.min(p.seats.length, p.creatures.length);
      if (!p.seats.slice(0, scouts).some((s) => s.dest === d)) continue;
      server.keystonesFound += 1;
      const place = rules.scouts.destinations[d]?.id ?? '';
      if (!setCollectionFind(server, `keystone:${place}`, rules, hour))
        credit(p, R.essence, rules.collections.meltEssence, 'melted finds');
      server.keystoneReady[d] =
        hour - Math.log(1 - uniform(server.rng)) * rules.scouts.keystoneMeanDays * 24;
      p.firsts.keystone ??= Math.floor(hour / HOURS_PER_WEEK) + 1;
      return;
    }
  });
}

/** The start of each server day: active weights, the server's middle, project openings, Master titles, the fire's time floor. */
export function dailyServer(
  server: Server,
  players: readonly Player[],
  hour: number,
  rules: Rules,
): void {
  let weight = 0;
  const active: number[] = [];
  for (const p of players) {
    if (hour < p.joinHour) continue;
    const w = activeWeight(rules, p, hour);
    weight += w;
    if (w > 0) active.push(p.id);
  }
  server.weight = weight;
  if (active.length > 0) server.middle = serverMiddle(players, active);
  let masters = 0;
  const top = rules.posts.mastery[rules.posts.mastery.length - 1];
  for (const p of players) {
    if (hour < p.joinHour) continue;
    p.masters = top ? [...p.seats, ...p.anvils].filter((s) => s.mastery >= top.hours).length : 0;
    masters += p.masters;
  }
  server.mastersTotal = masters;
  const points = Math.floor(masters / rules.fire.warmth.masterTitlesPerPoint);
  if (points > 0) server.warmth.masters = points;
  refreshProjects(server, hour, rules);
  refreshFire(server, hour, rules);
}
