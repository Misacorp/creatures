import type { Rules } from './rules';
import { ELEMENTS } from './rules';
import { serverMiddle } from './growth';
import { setCollectionFind } from './collections';
import type { Player, Server } from './types';
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

/** V-COM-15: the guided start. The hearth opens first, the Forge when the hearth has levelled, the rest when both have. */
function mayOpen(server: Server, index: number): boolean {
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

/** Opens each place's next project when its build days have passed (V-COM-5: a hoard raises one level per place at most). */
export function refreshProjects(server: Server, hour: number, rules: Rules): void {
  server.places.forEach((place, i) => {
    if (place.open || hour < place.opensAt || !mayOpen(server, i)) return;
    place.open = true;
    place.progress = 0;
    place.size = projectSize(server, i, rules);
    place.openedAt = hour;
  });
}

/** Adds `value` (Acorns' worth) to a place's project; a full project raises the level, warms the fire and starts the build days. */
export function contribute(
  server: Server,
  index: number,
  value: number,
  hour: number,
  rules: Rules,
): void {
  const place = server.places[index]!;
  if (!place.open || value <= 0) return;
  place.progress += value;
  if (place.progress < place.size) return;
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
  refreshFire(server, hour, rules);
}

/** Gifts go to the open projects the server favours (V-COM-5: "the server chooses together"); what no project can take stays with the giver. */
function offer(
  p: Player,
  server: Server,
  hour: number,
  unitValue: number,
  available: number,
  take: (amount: number) => void,
  only?: readonly string[],
): number {
  const rules = p.rules;
  let left = available;
  let given = 0;
  for (let tries = 0; tries < 6 && left > 1e-9; tries++) {
    const open = server.places
      .map((pl, i) => ({ pl, i }))
      .filter(({ pl }) => pl.open && pl.progress < pl.size && (!only || only.includes(pl.id)));
    if (open.length === 0) break;
    const pick =
      open[
        weighted(
          server.rng,
          open.map(({ pl }) => rules.commons.placeWeights[pl.id] ?? 1),
        )
      ]!;
    const room = (pick.pl.size - pick.pl.progress) / unitValue;
    const amount = Math.min(left, Math.max(room, 0.001));
    take(amount);
    contribute(server, pick.i, amount * unitValue, hour, rules);
    left -= amount;
    given += amount * unitValue;
  }
  return given;
}

/**
 * A visit's gifts. By default Acorns only (commons.md's example); in the "everything counts" variant scrap and shards too, from
 * what is above a reserve for the Forge and the ribbons; in the "Essence to projects" variant spare Essence goes to the Paddock
 * and School. A player gives their share of what came in since the last gift; a hoarder saves, then gives all.
 */
export function giveGifts(p: Player, server: Server, hour: number): void {
  const rules = p.rules;
  const week = Math.floor(hour / HOURS_PER_WEEK) + 1;
  const hoard = p.profile.hoardWeeks;
  if (hoard > 0 && week <= hoard) return;
  const dumping = hoard > 0 && week <= hoard + 2;
  const value = rules.commons.giftValue;
  const budget = (r: number, spare: number): number =>
    Math.floor(dumping ? spare : Math.min(p.giftBudget[r] ?? 0, spare));
  let total = 0;
  const acorns = budget(R.acorns, p.stock[R.acorns] ?? 0);
  if (acorns >= 1) {
    const given = offer(p, server, hour, value.acorns, acorns, (a) => {
      debit(p, R.acorns, a, 'gifts');
    });
    p.giftBudget[R.acorns] = Math.max(0, (p.giftBudget[R.acorns] ?? 0) - given / value.acorns);
    total += given;
  }
  const everything = server.config.gifts === 'everything';
  const scrap = budget(
    R.scrap,
    everything ? Math.max(0, (p.stock[R.scrap] ?? 0) - rules.forge.giveReserveScrap) : 0,
  );
  if (scrap >= 1) {
    const given = offer(p, server, hour, value.scrap, scrap, (a) => {
      debit(p, R.scrap, a, 'gifts');
    });
    p.giftBudget[R.scrap] = Math.max(0, (p.giftBudget[R.scrap] ?? 0) - given / value.scrap);
    total += given;
  }
  for (let e = 0; e < ELEMENTS.length; e++) {
    const shards = budget(
      R.shards,
      everything ? Math.max(0, (p.shards[e] ?? 0) - rules.forge.giveReserveShards) : 0,
    );
    if (shards < 1) continue;
    const given = offer(p, server, hour, value.shards, shards, (a) => {
      debitShard(p, e, a, 'gifts');
    });
    p.giftBudget[R.shards] = Math.max(0, (p.giftBudget[R.shards] ?? 0) - given / value.shards);
    total += given;
  }
  if (server.config.essenceToProjects) {
    const essence = budget(
      R.essence,
      Math.max(0, (p.stock[R.essence] ?? 0) - rules.forge.reachReserveEssence),
    );
    if (essence >= 1) {
      const given = offer(
        p,
        server,
        hour,
        value.essence,
        essence,
        (a) => {
          debit(p, R.essence, a, 'gifts');
        },
        rules.commons.essencePlaces,
      );
      p.giftBudget[R.essence] = Math.max(0, (p.giftBudget[R.essence] ?? 0) - given / value.essence);
      total += given;
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
  for (let i = 0; i < seats; i++) {
    const place = server.places[i]!;
    if (!place.open) continue;
    const value = Math.min(hours * rules.commons.communalPerHour, place.size - place.progress);
    server.communal += value;
    contribute(server, i, value, hour, rules);
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
