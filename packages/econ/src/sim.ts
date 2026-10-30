import { ELEMENTS, RULES, type Rules } from './rules';
import { awayShare, hearthMultiplier } from './curves';
import {
  checkKeystones,
  creditCommunal,
  dailyServer,
  giveGifts,
  placeLevel,
  refreshFire,
} from './commons';
import {
  collectFloor,
  dismantleBag,
  equipOrBag,
  recomputeWeak,
  rollRarity,
  stepAnvils,
} from './forge';
import {
  accrueIdleXp,
  atTopLevel,
  fightXp,
  levelsDesc,
  setCatchUp,
  waitsForRibbon,
} from './growth';
import {
  buyEvolutions,
  buyRibbons,
  buySeatsAndKit,
  countOptions,
  newAnvil,
  newSeat,
  nextPrice,
  retilt,
} from './policy';
import { setCollectionFind } from './collections';
import { accrueSeats, activeCounts, collectSeat } from './scouts';
import { playerProfile, type ServerConfig } from './servers';
import {
  HOURS_PER_WEEK,
  N_RES,
  R,
  type Player,
  type Server,
  type ServerWeek,
  type WeekRecord,
} from './types';
import { poisson, sum, uniform } from './util';
import {
  addCreature,
  blankWeek,
  createPlayer,
  createServer,
  credit,
  speciesAvailable,
  wasteOf,
} from './world';

/** What one player's run leaves behind: the weekly records and the facts the targets and journeys read. */
export interface PlayerRun {
  profile: string;
  policy: string;
  joinWeek: number;
  weeks: WeekRecord[];
  sources: Record<string, number>;
  day30: (number | null)[];
  catchUpDays: number | null;
  firsts: Record<string, number>;
  /** The visits' hours, for the cost estimate. */
  stockEnd: number[];
}

export interface ServerRun {
  config: ServerConfig;
  seed: number;
  players: PlayerRun[];
  log: ServerWeek[];
  levelUps: Server['levelUps'];
  projectDurations: number[];
  thresholds: (number | null)[];
  gifts: number[];
  communal: number;
  keystones: number;
  collections: number;
  firstCollectionHour: number | null;
  fire: number;
  warmth: Record<string, number>;
}

/** The dungeon (V-POST-7; inputs, combat is not simulated): one run per pass, the best three creatures fight. */
function runDungeon(p: Player, server: Server, hour: number): void {
  const d = p.rules.fights.dungeon;
  while (p.passes > 0) {
    p.passes -= 1;
    fightXp(p, d.xp, 'xpDungeon', hour);
    credit(p, R.acorns, d.acorns, 'dungeon');
    credit(p, R.scrap, d.scrap, 'dungeon');
    credit(p, R.essence, d.essence, 'dungeon');
    // One of the dungeon's landmark embers (V-COM-12), now and then.
    if (uniform(p.rng) < p.rules.collections.landmarkPerRun) {
      const ember = `landmark:${1 + Math.floor(uniform(p.rng) * 4)}`;
      if (!setCollectionFind(server, ember, p.rules, hour))
        credit(p, R.essence, p.rules.collections.meltEssence, 'melted finds');
    }
    const glimmer = poisson(p.rng, d.glimmer);
    if (glimmer > 0) credit(p, R.glimmer, glimmer, 'dungeon');
    for (let n = poisson(p.rng, d.gearPieces); n > 0; n--) {
      equipOrBag(
        p,
        {
          ilvl: Math.min(server.fire, d.itemLevel),
          rarity: rollRarity(p, p.rules.forge.foundGearOdds),
          element: Math.floor(uniform(p.rng) * ELEMENTS.length),
        },
        server.fire,
      );
    }
  }
}

export function join(p: Player, server: Server, hour: number): void {
  const rules = p.rules;
  p.wk = blankWeek(Math.floor(hour / HOURS_PER_WEEK) + 1);
  const total = rules.scouts.species.start;
  while (p.creatures.length < rules.acorns.starterCreatures) {
    const species = Math.floor(uniform(p.rng) * total);
    if ((p.speciesCount[species] ?? 0) === 0) addCreature(p, species);
  }
  newSeat(p);
  newAnvil(p);
  credit(p, R.acorns, rules.acorns.start, 'welcome');
  credit(p, R.scrap, rules.acorns.welcomeScrap, 'welcome');
  p.giftBudget.fill(0);
  p.lastVisit = hour;
  recomputeWeak(p, server.fire);
}

/** A visit (V-POST-14 one lazy pass): everything comes home, the player chooses, the catch-up multiplier is fixed for 24 hours. */
export function visit(p: Player, server: Server, hour: number): void {
  const rules = p.rules;
  const day = Math.floor(hour / 24);
  const first = !p.visitedToday;
  p.visitedToday = true;
  p.visitDays[day % 7] = 1;
  p.wk.visits += 1;
  if (first) p.wk.visitDays += 1;
  const arrivalsBefore = p.wk.arrivals;

  // Everything that built up comes home.
  const allowanceRate = rules.acorns.allowancePerDay / 24;
  credit(p, R.acorns, p.allowance * allowanceRate, 'allowance');
  wasteOf(p, R.acorns, p.allowanceWasted * allowanceRate);
  p.allowance = 0;
  p.allowanceWasted = 0;
  for (let i = 0; i < p.seats.length; i++) collectSeat(p, i, server, hour);
  creditCommunal(p, server, hour);
  collectFloor(p, server);
  dismantleBag(p);
  if (first) {
    credit(p, R.acorns, rules.acorns.leetPerVisitDay, 'leets');
    credit(p, R.acorns, rules.acorns.smallMomentPerVisitDay, 'small moments');
  }
  if (p.profile.fights) {
    runDungeon(p, server, hour);
    if (day % 7 >= 4) p.raidThisWeek = true;
  }

  // What the player could do now, then what they do.
  const options = countOptions(p, server);
  options.forEach((n, r) => (p.wk.choices[r] = (p.wk.choices[r] ?? 0) + n));
  p.wk.choiceVisits += 1;
  p.wk.choicesTotal +=
    sum(options) + (p.wk.arrivals - arrivalsBefore) + (p.policy === 'optimiser' ? 1 : 0);
  const giftsBefore = p.wk.gifts;
  // Growth first (evolutions, ribbons), then the gifts from what is left, then seats and kit.
  buyEvolutions(p);
  buyRibbons(p);
  giveGifts(p, server, hour);
  buySeatsAndKit(p, server);
  retilt(p);
  recomputeWeak(p, server.fire);
  setCatchUp(p, hour, server.middle);
  p.lastVisit = hour;

  // The rows this visit touches (the lazy pass reads the player, the creatures, the seats and the valley's rows and writes them back).
  const n = p.creatures.length;
  p.wk.rowsRead += 1 + n + p.seats.length + p.anvils.length + 2 * server.places.length + 2;
  p.wk.rowsWritten += 1 + n + p.seats.length + p.anvils.length + (p.wk.gifts > giftsBefore ? 4 : 0);
}

/** One hour of everything that runs without the player (stores, stocks, anvils, XP). */
function accrue(
  p: Player,
  server: Server,
  hour: number,
  rules: Rules,
  curve: ServerConfig['curve'],
  hearth: number,
): void {
  const share = awayShare(rules, curve, hour - p.lastVisit);
  const { scouts, anvils } = activeCounts(p);
  p.wk.effHours += share;
  accrueIdleXp(p, hour, share, hearth);
  accrueSeats(p, share, scouts);
  const cap = rules.posts.storeHours;
  const room = cap - p.allowance;
  const add = Math.min(share, Math.max(0, room));
  p.allowance += add;
  p.allowanceWasted += share - add;
  if (server.config.communalSeats && p.creatures.length >= rules.commons.communalCreaturesPerSeat) {
    p.communalStore += Math.min(share, Math.max(0, cap - p.communalStore));
  }
  stepAnvils(p, share, anvils, server);
}

function dayStart(p: Player, day: number): void {
  p.available = speciesAvailable(p.rules, day * 24);
  p.incomeDay = day;
  const slot = p.income[day % 7];
  if (slot) slot.fill(0);
  p.visitDays[day % 7] = 0;
  p.visitedToday = false;
  p.passes = Math.min(p.rules.fights.dungeon.maxPasses, p.passes + 1);
}

/** The evening sample (for "days to the next thing", "starved", and T-6): where the player stands after the day's visits. */
function sampleDay(p: Player, server: Server, hour: number): void {
  const rules = p.rules;
  const day = Math.floor(hour / 24);
  const wk = p.wk;
  wk.daysSampled += 1;
  const observed = Math.min(7, Math.floor((hour - p.joinHour) / 24) + 1);
  for (let r = 0; r < N_RES; r++) {
    const stock = p.stock[r] ?? 0;
    if (stock < 1) wk.zeroDays[r] = (wk.zeroDays[r] ?? 0) + 1;
    const price = nextPrice(p, r, server);
    if (price === null) continue;
    const rate = sum(p.income.map((d) => d[r] ?? 0)) / observed;
    const days = stock >= price ? 0 : rate > 1e-9 ? Math.min(99, (price - stock) / rate) : 99;
    wk.nextDaysSum[r] = (wk.nextDaysSum[r] ?? 0) + days;
    wk.nextDaysCount[r] = (wk.nextDaysCount[r] ?? 0) + 1;
  }
  const since = Math.floor((hour - p.joinHour) / 24);
  const top = atTopLevel(p);
  [1, 3, 10].forEach((k, i) => {
    if (p.day30[i] === null && top >= k) p.day30[i] = since;
  });
  if (p.profile.away && p.catchUpDays === null) {
    const back = p.profile.away[1] * 7;
    if (day >= back && p.visitedToday) {
      p.backAt ??= day;
      // As V-BON-2 does: the player's 3rd-best creature against the server's middle.
      const lv = levelsDesc(p);
      const third = lv[Math.min(2, lv.length - 1)] ?? 1;
      if (third >= server.middle - rules.flags.agreeWithin) p.catchUpDays = day - p.backAt;
    }
  }
}

function endWeek(p: Player, server: Server): void {
  const wk = p.wk;
  wk.levels = levelsDesc(p);
  wk.size = p.creatures.length;
  wk.species = p.speciesCount.filter((c) => c > 0).length;
  wk.available = p.available;
  wk.scoutSeats = p.seats.length;
  wk.anvils = p.anvils.length;
  wk.kit = Object.values(p.kitOwned).filter(Boolean).length;
  wk.ribbons = sum(p.creatures.map((c) => c.ribbons));
  wk.waitingRibbon = p.creatures.filter((c) => waitsForRibbon(p.rules, c)).length;
  wk.waitingEvolve = p.creatures.filter(
    (c) => c.canEvolve && !c.evolved && c.level >= p.rules.xp.evolveLevel,
  ).length;
  wk.bag = sum(p.bag);
  wk.bagNever = p.bagNever;
  const worn = p.creatures.flatMap((c) => c.gear).filter((g) => g > 0);
  wk.avgGear = worn.length ? sum(worn) / worn.length : 0;
  wk.masters = p.masters;
  wk.stock = p.stock.map((s) => s);
  void server;
  p.weeks.push(wk);
  p.wk = blankWeek(wk.week + 1);
}

/** Sunday 23:00: the weekly boss (a server dial) and what the raid pays the players who took part (inputs: combat is not simulated). */
function resolveRaid(server: Server, players: readonly Player[], hour: number, rules: Rules): void {
  const chance = rules.fights.raid.bossKillChance[server.config.bossKills];
  const kill = uniform(server.rng) < chance;
  if (kill) {
    server.kills += 1;
    server.warmth.bosses = (server.warmth.bosses ?? 0) + rules.fire.warmth.bossKill;
    refreshFire(server, hour, rules);
  }
  const raid = rules.fights.raid;
  for (const p of players) {
    if (hour < p.joinHour || !p.raidThisWeek) continue;
    p.raidThisWeek = false;
    fightXp(p, raid.xpPerWeek, 'xpRaid', hour);
    credit(p, R.scrap, raid.scrap, 'raid');
    credit(p, R.essence, kill ? raid.essenceKill : raid.essencePhases, 'raid');
    if (kill) {
      for (let n = poisson(p.rng, raid.gearOnKill); n > 0; n--) {
        equipOrBag(
          p,
          {
            ilvl: server.fire,
            rarity: rollRarity(p, rules.forge.foundGearOdds),
            element: Math.floor(uniform(p.rng) * ELEMENTS.length),
          },
          server.fire,
        );
      }
    }
  }
}

/** Runs one server for the horizon with one seed: hour by hour. */
export function runServer(config: ServerConfig, seed: number, base: Rules = RULES): ServerRun {
  const rules: Rules = {
    ...base,
    scouts: {
      ...base.scouts,
      perHour: {
        ...base.scouts.perHour,
        creatures: config.creatureRate ?? base.scouts.perHour.creatures,
      },
    },
    bonfire: {
      ...base.bonfire,
      catchUp: {
        ...base.bonfire.catchUp,
        appliesToFights: config.catchUpFights ?? base.bonfire.catchUp.appliesToFights,
      },
    },
  };
  const hours = config.weeks * HOURS_PER_WEEK;
  const players = config.players.map((entry, i) =>
    createPlayer(rules, config.id, seed, i, playerProfile(entry, config.giveShare), config.weeks),
  );
  const server = createServer(
    config.id,
    seed,
    {
      bossKills: config.bossKills,
      communalSeats: config.communalSeats,
      gifts: config.gifts,
      essenceToProjects: config.essenceToProjects,
    },
    rules,
  );
  let visitsThisWeek = 0;
  let giftsMark = 0;
  for (let h = 0; h < hours; h++) {
    const hourOfDay = h % 24;
    const day = Math.floor(h / 24);
    if (hourOfDay === 0) {
      dailyServer(server, players, h, rules);
      for (const p of players) if (h >= p.joinHour) dayStart(p, day);
    }
    checkKeystones(server, players, h, rules);
    const hearth = hearthMultiplier(rules, placeLevel(server, 'bonfire'));
    for (const p of players) {
      if (h < p.joinHour) continue;
      if (h === p.joinHour) join(p, server, h);
      if (p.visitAt[h] === 1) {
        visit(p, server, h);
        visitsThisWeek += 1;
      }
      accrue(p, server, h, rules, config.curve, hearth);
    }
    if (hourOfDay === 22) for (const p of players) if (h >= p.joinHour) sampleDay(p, server, h);
    if (day % 7 === 6 && hourOfDay === 23) resolveRaid(server, players, h, rules);
    if ((h + 1) % HOURS_PER_WEEK === 0) {
      const gifts = sum(server.gifts) - giftsMark;
      giftsMark = sum(server.gifts);
      server.log.push({
        week: Math.floor(h / HOURS_PER_WEEK) + 1,
        levels: server.places.map((pl) => pl.level),
        progress: server.places.map((pl) => (pl.open && pl.size > 0 ? pl.progress / pl.size : 0)),
        fire: server.fire,
        warmth: { ...server.warmth },
        kills: server.kills,
        middle: server.middle,
        weight: server.weight,
        gifts,
        communal: server.communal,
        keystones: server.keystonesFound,
        collections: server.collectionsDone,
        visits: visitsThisWeek,
      });
      visitsThisWeek = 0;
      for (const p of players) if (h >= p.joinHour) endWeek(p, server);
    }
  }
  return {
    config,
    seed,
    players: players.map((p) => ({
      profile: p.profile.id,
      policy: p.policy,
      joinWeek: p.profile.joinWeek,
      weeks: p.weeks,
      sources: Object.fromEntries(p.sources),
      day30: p.day30,
      catchUpDays: p.catchUpDays,
      firsts: p.firsts,
      stockEnd: p.stock,
    })),
    log: server.log,
    levelUps: server.levelUps,
    projectDurations: server.projectDurations,
    thresholds: server.thresholds,
    gifts: server.gifts,
    communal: server.communal,
    keystones: server.keystonesFound,
    collections: server.collectionsDone,
    firstCollectionHour: server.firstCollectionHour,
    fire: server.fire,
    warmth: server.warmth,
  };
}
