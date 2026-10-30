import { createSeededRng } from '@creatures/game';
import { LEVEL_XP, MAX_LEVEL, ribbonGate } from './curves';
import { ELEMENTS, type Rules } from './rules';
import type { PlayerProfile } from './schema';
import type { BossDial } from './servers';
import {
  FORGE_BUCKETS,
  HOURS_PER_WEEK,
  N_RES,
  R,
  type Creature,
  type Player,
  type Server,
  type WeekRecord,
} from './types';
import { sum, uniform } from './util';

/** The element index of each of the species the arrivals draw from (grouped by element, as the docs' 34 forms). */
const SPECIES_CACHE = new WeakMap<Rules, number[]>();
export function speciesElements(rules: Rules): number[] {
  let cached = SPECIES_CACHE.get(rules);
  if (!cached) {
    cached = rules.scouts.speciesPerElement.flatMap((n, element) =>
      Array.from({ length: n }, () => element),
    );
    SPECIES_CACHE.set(rules, cached);
  }
  return cached;
}

export const blankWeek = (week: number): WeekRecord => ({
  week,
  inn: new Array<number>(N_RES).fill(0),
  out: new Array<number>(N_RES).fill(0),
  waste: new Array<number>(N_RES).fill(0),
  stock: new Array<number>(N_RES).fill(0),
  xpIdle: 0,
  xpCatch: 0,
  xpDungeon: 0,
  xpRaid: 0,
  xpLost: 0,
  effHours: 0,
  storeHours: 0,
  storeLost: 0,
  levels: [],
  size: 0,
  species: 0,
  arrivals: 0,
  duplicates: 0,
  scoutSeats: 0,
  anvils: 0,
  kit: 0,
  ribbons: 0,
  waitingRibbon: 0,
  waitingEvolve: 0,
  forge: new Array<number>(FORGE_BUCKETS.length).fill(0),
  piecesMade: 0,
  piecesWorn: 0,
  piecesDismantled: 0,
  bag: 0,
  bagNever: 0,
  avgGear: 0,
  gifts: 0,
  visits: 0,
  visitDays: 0,
  choices: new Array<number>(N_RES).fill(0),
  choiceVisits: 0,
  choicesTotal: 0,
  nextDaysSum: new Array<number>(N_RES).fill(0),
  nextDaysCount: new Array<number>(N_RES).fill(0),
  zeroDays: new Array<number>(N_RES).fill(0),
  daysSampled: 0,
  masters: 0,
  rowsRead: 0,
  rowsWritten: 0,
  blueprints: 0,
  pages: 0,
});

// ---------- the ledger: the only way a stock changes ----------

const noteSource = (p: Player, key: string, amount: number): void => {
  p.sources.set(key, (p.sources.get(key) ?? 0) + amount);
};

/** Adds `amount` of a resource (not shards: see `creditShard`). */
export function credit(p: Player, r: number, amount: number, source: string): void {
  if (amount <= 0) return;
  p.stock[r] = (p.stock[r] ?? 0) + amount;
  p.wk.inn[r] = (p.wk.inn[r] ?? 0) + amount;
  // A share of everything earned is set aside for gifts (V-COM-5: "about a third of income").
  p.giftBudget[r] = (p.giftBudget[r] ?? 0) + amount * p.profile.giveShare;
  const day = p.income[p.incomeDay % 7];
  if (day) day[r] = (day[r] ?? 0) + amount;
  noteSource(p, `in:${r}:${source}`, amount);
}

export function creditShard(p: Player, element: number, amount: number, source: string): void {
  if (amount <= 0) return;
  p.shards[element] = (p.shards[element] ?? 0) + amount;
  credit(p, R.shards, amount, source);
}

/** Takes `amount`; the caller has checked the stock (a negative balance is a bug, so it throws). */
export function debit(p: Player, r: number, amount: number, sink: string): void {
  if (amount <= 0) return;
  if ((p.stock[r] ?? 0) < amount - 1e-9)
    throw new Error(`negative balance: resource ${r}, sink ${sink}`);
  p.stock[r] = Math.max(0, (p.stock[r] ?? 0) - amount);
  p.wk.out[r] = (p.wk.out[r] ?? 0) + amount;
  noteSource(p, `out:${r}:${sink}`, amount);
}

export function debitShard(p: Player, element: number, amount: number, sink: string): void {
  if (amount <= 0) return;
  if ((p.shards[element] ?? 0) < amount - 1e-9)
    throw new Error(`negative shards: element ${element}`);
  p.shards[element] = Math.max(0, (p.shards[element] ?? 0) - amount);
  debit(p, R.shards, amount, sink);
}

/** Finds that were not picked up (a full store): counted, never in the stock. */
export function wasteOf(p: Player, r: number, amount: number): void {
  if (amount > 0) p.wk.waste[r] = (p.wk.waste[r] ?? 0) + amount;
}

// ---------- creating things ----------

export function refreshCeiling(rules: Rules, c: Creature): void {
  let ceiling = ribbonGate(rules, c.ribbons);
  if (c.canEvolve && !c.evolved) ceiling = Math.min(ceiling, rules.xp.evolveLevel);
  c.ceiling = Math.min(ceiling, MAX_LEVEL);
  c.capXp = c.ceiling >= MAX_LEVEL ? (LEVEL_XP[MAX_LEVEL] ?? 0) : (LEVEL_XP[c.ceiling + 1] ?? 0);
}

export function addCreature(p: Player, species: number): Creature {
  const rules = p.rules;
  const c: Creature = {
    species,
    element: speciesElements(rules)[species] ?? 0,
    xp: 0,
    level: 1,
    ribbons: 0,
    canEvolve: uniform(p.rng) < rules.xp.evolveShare,
    evolved: false,
    ceiling: 1,
    capXp: 0,
    catchMult: 1,
    catchUntil: 0,
    gear: new Array<number>(rules.forge.slotsPerCreature).fill(0),
  };
  refreshCeiling(rules, c);
  p.creatures.push(c);
  p.speciesCount[species] = (p.speciesCount[species] ?? 0) + 1;
  return c;
}

/** The visit schedule: one flag per hour of the horizon (the profile's days and hours, minus the away weeks). */
export function buildSchedule(profile: PlayerProfile, id: number, weeks: number): Uint8Array {
  const visitAt = new Uint8Array(weeks * HOURS_PER_WEEK);
  const joinDay = (profile.joinWeek - 1) * 7;
  for (let day = joinDay; day < weeks * 7; day++) {
    const week = Math.floor(day / 7) + 1;
    if (profile.away && week >= profile.away[0] && week <= profile.away[1]) continue;
    const goes =
      profile.everyNDays > 0
        ? (day - joinDay + id) % profile.everyNDays === 0
        : profile.weekdays.includes(day % 7);
    if (goes) for (const hour of profile.hours) visitAt[day * 24 + hour] = 1;
  }
  return visitAt;
}

export function createPlayer(
  rules: Rules,
  serverId: string,
  seed: number,
  id: number,
  profile: PlayerProfile,
  weeks: number,
): Player {
  const joinHour = (profile.joinWeek - 1) * HOURS_PER_WEEK;
  const p: Player = {
    id,
    profile,
    policy: profile.policy,
    rng: createSeededRng(`${serverId}|${seed}|player|${id}`),
    joinHour,
    visitAt: buildSchedule(profile, id, weeks),
    creatures: [],
    speciesCount: new Array<number>(sum(rules.scouts.speciesPerElement)).fill(0),
    seats: [],
    anvils: [],
    stock: new Array<number>(N_RES).fill(0),
    shards: new Array<number>(ELEMENTS.length).fill(0),
    kitOwned: { lure: false, lantern: false, satchel: false, tongs: false, loupe: false },
    scoutKit: null,
    anvilKit: null,
    allowance: 0,
    allowanceWasted: 0,
    communalStore: 0,
    lastVisit: joinHour,
    passes: 1,
    floor: [],
    bag: [0, 0, 0],
    bagNever: 0,
    weakByElement: new Array<number>(ELEMENTS.length).fill(0),
    pendingByElement: new Array<number>(ELEMENTS.length).fill(0),
    giftBudget: new Array<number>(N_RES).fill(0),
    hoardDone: false,
    forgeCursor: 0,
    raidThisWeek: false,
    blueprints: 1,
    pages: 0,
    masters: 0,
    visitDays: new Array<number>(7).fill(0),
    visitedToday: false,
    income: Array.from({ length: 7 }, () => new Array<number>(N_RES).fill(0)),
    incomeDay: 0,
    weeks: [],
    wk: blankWeek(1),
    sources: new Map(),
    day30: [null, null, null],
    backAt: null,
    catchUpDays: null,
    firsts: {},
    rules,
  };
  p.wk = blankWeek(profile.joinWeek);
  return p;
}

export function createServer(
  serverId: string,
  seed: number,
  bossKills: BossDial,
  communalSeats: boolean,
  rules: Rules,
): Server {
  const places = rules.commons.places.map((id) => ({
    id,
    level: 1,
    open: false,
    opensAt: 0,
    progress: 0,
    size: 0,
    cosmetic: 0,
    openedAt: 0,
  }));
  const rng = createSeededRng(`${serverId}|${seed}|server`);
  return {
    config: { id: serverId, bossKills, communalSeats },
    rng,
    places,
    warmth: {},
    fire: rules.fire.start,
    kills: 0,
    middle: 1,
    weight: 1,
    keystoneReady: rules.scouts.destinations.map(
      () => -Math.log(1 - uniform(rng)) * rules.scouts.keystoneMeanDays * 24,
    ),
    keystonesFound: 0,
    sockets: places.map(() => ({ everyday: 0, keystones: 0 })),
    collectionsDone: 0,
    thresholds: rules.fire.thresholds.map(() => null),
    gifts: [],
    log: [],
    levelUps: [],
    projectDurations: [],
    mastersTotal: 0,
    communal: 0,
  };
}
