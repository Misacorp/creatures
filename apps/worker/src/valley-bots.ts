/**
 * The staging bots and the simulated month (phase 5 step 10, `docs/design/valley/phase5-plan.md`). Dev tools only: `valley-bots` makes the
 * guild's bots, `valley-sim-day` plays one game day of them, `valley-report` answers the lab-shaped metrics (see `dev-tools-valley.ts`).
 *
 * A bot is a guest player (`dev-guest-<n>`) with one of the lab's profiles (`MIXED8_BOTS`: the mixed server of 8 minus the human). It starts
 * as a fresh valley player does: the starter choice, two more common creatures (the lab's three), the lab's welcome Acorns and scrap, then
 * its first free scout seat and anvil. At each visit its profile says is due, the dev clock is moved to that hour and the bot plays the
 * lab's policy (`@creatures/game` `valley/policy.ts`, one module with the lab) through the SAME server code the routes call: the settle
 * (`ValleySettle.settle`), the seats, orders, gifts, School and visitor modules and `Collection.evolve`, every spend keyed. Nothing here
 * writes a balance except the stand-in fights below.
 *
 * Where the bots differ from the lab (and why):
 * - **Fights are stand-ins.** The server has no dungeon passes yet (Q63, before phase 6), so a fighting bot pays the lab's inputs: a daily
 *   pass (up to the lab's maximum) pays Acorns, scrap, Essence and XP to its best three creatures; Sunday's raid pays its XP, scrap and
 *   Essence and, at the server dial's half, warms the fire. No gear drops, no honours' boxes and no landmark embers.
 * - **No tempering, idol, equipping, dismantling or visitor rerolls** (the lab models them, the server's bots do not drive them); the
 *   bot buys the visitor's blueprint when it can.
 * - **Orders are "for my team" orders**; the lab's anvil works pieces for the player's best creatures the same way.
 * - **Rotating Masters** is not done (the lab's optimiser moves a Master on).
 * - The metrics are read at the end of a day on the server (a snapshot settle at 23:59 of days 7, 14, 21 and 28), where the lab reads at
 *   the end of a week. That settle counts as a visit for the away-share clock, a small distortion.
 */
import {
  MIXED8_BOTS,
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  anvilKitFor,
  choosePurchase,
  content,
  defaultDestination,
  evolutionOrder,
  giftAmount,
  giftBudgetAfterIncome,
  isDumping,
  isHoarding,
  needsOf,
  nextKit,
  patchworkBlueprints,
  pickFreeCreature,
  profileById,
  retiltPlan,
  speciesAvailableAt,
  visitHours,
  type ForgeHours,
  type KitName,
  type ValleyElement,
  type ValleyView,
} from '@creatures/game';
import type { Collection } from './collection';
import type { ToolCtx } from './dev-context';
import { creatureRngsOf, DevError } from './dev-context';
import { awardExperience } from './creature-exp';
import { creditParts, getParts } from './gear-store';
import { credit, getBalances, type LedgerStorage } from './ledger';
import { speciesOf } from './species';
import { insertCreature } from './talent-store';
import { addDays, isoWeekday, zonedDate, zonedTimeToEpoch } from './time';
import type { ValleyCommons } from './valley-commons';
import type { ValleyGifts } from './valley-gifts';
import type { ValleyOrders } from './valley-orders';
import type { ValleySchool } from './valley-school';
import type { ValleySeats } from './valley-seats';
import type { ValleySettle } from './valley-settle';
import type { ValleyVisitor } from './valley-visitor';

/** What the bots drive: the valley's real modules, the server's own daily work and the row meter. Built by the guild core. */
export interface ValleyWorld {
  readonly storage: LedgerStorage;
  readonly settle: ValleySettle;
  readonly seats: ValleySeats;
  readonly orders: ValleyOrders;
  readonly gifts: ValleyGifts;
  readonly visitor: ValleyVisitor;
  readonly school: ValleySchool;
  readonly commons: ValleyCommons;
  readonly collection: Collection;
  /** What the server runs by itself in a game day (the weather, due raid and Games events, the visitor and the teacher, `maintain`). */
  daily(): void;
  /** The rows read and written so far in this request (the read meter's peek). */
  rows(): { read: number; written: number };
}

const R = VALLEY_RULES;
const HOUR_MS = 3_600_000;
const BOT_PREFIX = 'dev-guest-';
const SIM_KEY = 'g:valley_sim';
const botKey = (userId: string): string => `u:${userId}:valley_bot`;
const MAX_DAYS = 28;
/** Days whose end snapshots the bots' metrics (the lab records whole weeks). */
const isSnapshotDay = (day: number): boolean => (day + 1) % 7 === 0;

interface BotInfo {
  id: string;
  profile: string;
  /** The lab's player number on the server (staggers the every-other-day player). */
  n: number;
  joined: boolean;
}

interface SimState {
  /** The scenario the bots mirror (an id of the lab's servers). */
  scenario: string;
  /** Guild-local midnight of day 0 (a Monday), UTC epoch ms. */
  startMs: number;
  /** The next game day to play (0-based) and how many of its steps are done. */
  day: number;
  cursor: number;
  bots: BotInfo[];
  /** Per day: the rows the whole call read and wrote, and the bots' visits. */
  rowsLog: { day: number; read: number; written: number; visits: number }[];
  /** The day (0-based) of the server's first place level-up, once it came. */
  firstLevelUpDay: number | null;
  /** The valley's own numbers at the end of each snapshot day (keyed by the count of days played). */
  serverSnaps: Record<string, Record<string, number>>;
  /** Declined intents by kind (a keyed spend the server refused, a seat that would not take a creature, ...). */
  declined: Record<string, number>;
}

interface BotState {
  /** The share of income set aside for gifts, by currency, and the totals seen when it was last topped up. */
  budget: { acorns: number; scrap: number; shards: number };
  seen: { acorns: number; scrap: number; shards: number };
  /** Dungeon passes waiting (the lab's) and whether the player fought this week. */
  passes: number;
  /** The game day of the last leet stand-in payout (-1: none). */
  leetDay: number;
  raidThisWeek: boolean;
  essenceCarry: number;
  visits: number;
  rows: { read: number; written: number };
  /** Metrics at the end of each snapshot day, keyed by the day number (1-based count of days played). */
  snaps: Record<string, Metrics>;
}

export interface Metrics {
  levelBest: number;
  levelThird: number;
  kindsOwned: number;
  acornsIn: number;
  acornsOut: number;
  scrapIn: number;
  scrapOut: number;
  shardsIn: number;
  shardsOut: number;
  piecesMade: number;
  tinkerShare: number;
  rowsRead: number;
  rowsWritten: number;
}

const blankBot = (): BotState => ({
  budget: { acorns: 0, scrap: 0, shards: 0 },
  seen: { acorns: 0, scrap: 0, shards: 0 },
  passes: 1,
  leetDay: -1,
  raidThisWeek: false,
  essenceCarry: 0,
  visits: 0,
  rows: { read: 0, written: 0 },
  snaps: {},
});

// --- stored state -------------------------------------------------------------------------------------------------------------

function readSim(ctx: ToolCtx): SimState | null {
  const raw = ctx.state.get(SIM_KEY);
  return raw === null ? null : (JSON.parse(raw) as SimState);
}
const writeSim = (ctx: ToolCtx, sim: SimState): void => {
  ctx.state.set(SIM_KEY, JSON.stringify(sim));
};
function readBot(ctx: ToolCtx, userId: string): BotState {
  const raw = ctx.state.get(botKey(userId));
  return raw === null ? blankBot() : (JSON.parse(raw) as BotState);
}
const writeBot = (ctx: ToolCtx, userId: string, bot: BotState): void => {
  ctx.state.set(botKey(userId), JSON.stringify(bot));
};

/** Removes the month's own state (the next `valley-fresh` starts clean). The per-player keys go with `clearUser`. */
export function clearSim(ctx: ToolCtx): void {
  ctx.state.delete(SIM_KEY);
}

function needWorld(ctx: ToolCtx): ValleyWorld {
  if (!ctx.valleySystems || ctx.world === null) throw new DevError(404, 'not_found');
  return ctx.world;
}

// --- flows: what came in and went out of the player's stocks (a dev table fed by triggers, so no game code is touched) -----------

/** The parts' flows: a trigger records every change of the `parts` table (scrap and shards) per player. Created once, staging only. */
function ensureFlows(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_sim_flows (
    user_id TEXT NOT NULL, kind TEXT NOT NULL, inn INTEGER NOT NULL DEFAULT 0, out INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, kind)
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS valley_sim_forge (
    user_id TEXT PRIMARY KEY, work REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0
  )`);
  forgeTableMade = true;
  sql.exec(`CREATE TRIGGER IF NOT EXISTS valley_sim_parts_insert AFTER INSERT ON parts BEGIN
    INSERT INTO valley_sim_flows (user_id, kind, inn, out) VALUES (NEW.user_id, NEW.kind, NEW.amount, 0)
    ON CONFLICT (user_id, kind) DO UPDATE SET inn = inn + NEW.amount;
  END`);
  sql.exec(`CREATE TRIGGER IF NOT EXISTS valley_sim_parts_update AFTER UPDATE OF amount ON parts BEGIN
    INSERT INTO valley_sim_flows (user_id, kind, inn, out)
    VALUES (NEW.user_id, NEW.kind, MAX(NEW.amount - OLD.amount, 0), MAX(OLD.amount - NEW.amount, 0))
    ON CONFLICT (user_id, kind) DO UPDATE SET inn = inn + excluded.inn, out = out + excluded.out;
  END`);
}

/** Whether `valley_sim_forge` is known to exist (set when `valley-bots` makes it or the first pass finds it). */
let forgeTableMade = false;

/**
 * Staging only: adds the hours of one pass of a player's anvils to a dev table (`valley_sim_forge`), once the month's bots exist (the
 * table is made by `valley-bots`; before that nothing is written). Never throws into a pass.
 */
export function recordForgeHours(sql: SqlStorage, userId: string, hours: ForgeHours): void {
  try {
    // Looked up once per object start (a master-table scan on every pass would be the month's own biggest read), then remembered.
    if (!forgeTableMade) {
      const made = sql
        .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'valley_sim_forge'")
        .toArray();
      if (made.length === 0) return;
      forgeTableMade = true;
    }
    const all = hours.work + hours.scrap + hours.shard + hours.essence + hours.floor + hours.idle;
    if (all <= 0) return;
    sql.exec(
      `INSERT INTO valley_sim_forge (user_id, work, total) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET work = work + excluded.work, total = total + excluded.total`,
      userId,
      hours.work,
      all,
    );
  } catch (err) {
    forgeTableMade = false;
    console.error('valley forge hours failed', err instanceof Error ? err.name : 'unknown');
  }
}

interface Flows {
  acornsIn: number;
  acornsOut: number;
  essenceIn: number;
  scrapIn: number;
  scrapOut: number;
  shardsIn: number;
  shardsOut: number;
}

function flowsOf(sql: SqlStorage, userId: string): Flows {
  const f: Flows = {
    acornsIn: 0,
    acornsOut: 0,
    essenceIn: 0,
    scrapIn: 0,
    scrapOut: 0,
    shardsIn: 0,
    shardsOut: 0,
  };
  for (const r of sql
    .exec<{ currency: string; inn: number; out: number }>(
      `SELECT currency, SUM(MAX(amount, 0)) AS inn, -SUM(MIN(amount, 0)) AS out FROM ledger
       WHERE user_id = ? GROUP BY currency`,
      userId,
    )
    .toArray()) {
    if (r.currency === 'bait') {
      f.acornsIn = r.inn;
      f.acornsOut = r.out;
    } else f.essenceIn = r.inn;
  }
  for (const r of sql
    .exec<{ kind: string; inn: number; out: number }>(
      'SELECT kind, inn, out FROM valley_sim_flows WHERE user_id = ?',
      userId,
    )
    .toArray()) {
    if (r.kind === 'scrap') {
      f.scrapIn += r.inn;
      f.scrapOut += r.out;
    } else if (r.kind.endsWith('-shard')) {
      f.shardsIn += r.inn;
      f.shardsOut += r.out;
    }
  }
  return f;
}

// --- reading a player ---------------------------------------------------------------------------------------------------------

type CreatureRow = {
  id: string;
  species: string;
  level: number;
  exp: number;
  work: number;
};

function creaturesOf(sql: SqlStorage, userId: string): CreatureRow[] {
  return sql
    .exec<CreatureRow>(
      `SELECT c.id, c.species, c.level, c.exp,
              COALESCE(v.scout_hours, 0) + COALESCE(v.smith_hours, 0) AS work
       FROM creatures c LEFT JOIN valley_creatures v ON v.creature_id = c.id
       WHERE c.user_id = ? ORDER BY c.caught_at, c.rowid`,
      userId,
    )
    .toArray();
}

type SeatLite = {
  seat_id: string;
  place: string;
  kind: string;
  creature_id: string | null;
  destination_id: string;
};

const seatsOf = (sql: SqlStorage, userId: string): SeatLite[] =>
  sql
    .exec<SeatLite>(
      'SELECT seat_id, place, kind, creature_id, destination_id FROM valley_seats WHERE user_id = ? ORDER BY position',
      userId,
    )
    .toArray();

const elementIndex = (species: string): number =>
  VALLEY_ELEMENTS.indexOf(speciesOf(species).element);

function shardsOf(sql: SqlStorage, userId: string): number[] {
  const parts = getParts(sql, userId);
  return VALLEY_ELEMENTS.map((e) => parts[`${e}-shard` as keyof typeof parts] ?? 0);
}

/** The next Monday 00:00 in the guild's timezone strictly after `now` (day 0 of the month). */
function nextMonday(now: number, tz: string): number {
  const today = zonedDate(now, tz);
  const wd = isoWeekday(today);
  const ahead = wd === 1 ? 7 : 8 - wd;
  return zonedTimeToEpoch(addDays(today, ahead), 0, 0, tz);
}

/** The guild-local midnight of game day `day`. */
const dayStart = (sim: SimState, day: number, tz: string): number =>
  zonedTimeToEpoch(addDays(zonedDate(sim.startMs + 12 * HOUR_MS, tz), day), 0, 0, tz);

/** Moves the dev clock so the game's now is `target` (never back past what the real clock plus the offset already reads). */
function moveClockTo(ctx: ToolCtx, target: number): void {
  const now = ctx.realNow + ctx.offset.get();
  ctx.offset.set(Math.max(0, Math.max(target, now + 1) - ctx.realNow));
}

let counter = 0;
/** A fresh idempotency key for a bot's intent (the server stores the result; a bot never retries). */
const keyOf = (what: string): string =>
  `sim${(counter++).toString(36)}-${what}-${crypto.randomUUID().slice(0, 8)}`;

function bump(sim: SimState, what: string): void {
  sim.declined[what] = (sim.declined[what] ?? 0) + 1;
}

// --- making the bots ----------------------------------------------------------------------------------------------------------

const pick = (ctx: ToolCtx, n: number): number =>
  Math.floor((ctx.rng.nextU32() / 0x1_0000_0000) * n);

/** The common first stage species a fresh player may start with (the lab draws from the same pool). */
const COMMONS = content.creatures.filter(
  (c) => c.stage === 1 && c.catchable && c.rarity === 'common' && c.festival !== true,
);
const STARTERS = content.creatures.filter((c) => c.starter);

function makeBot(ctx: ToolCtx, w: ValleyWorld, sim: SimState, info: BotInfo): void {
  const sql = ctx.sql;
  const id = info.id;
  sql.exec(
    `INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    id,
    `Bot ${String(info.n)}`,
    ctx.now,
    ctx.now,
  );
  // The starter choice, as a player makes it; then two more commons of other lines (the lab starts every player with three).
  const starter = STARTERS[pick(ctx, STARTERS.length)];
  if (starter === undefined) throw new DevError(409, 'no_starter');
  w.collection.chooseStarter(id, starter.id);
  const lines = new Set([starter.line]);
  const pool = [...COMMONS];
  while (lines.size < R.acorns.starterCreatures && pool.length > 0) {
    const [species] = pool.splice(pick(ctx, pool.length), 1);
    if (species === undefined || lines.has(species.line)) continue;
    lines.add(species.line);
    insertCreature(sql, creatureRngsOf(ctx), {
      userId: id,
      species: species.id,
      origin: 'dev',
      now: ctx.now,
    });
  }
  credit(
    ctx.storage,
    {
      userId: id,
      currency: 'bait',
      amount: R.acorns.start,
      source: 'dev',
      idempotencyKey: `simstart-${id}`,
    },
    ctx.now,
  );
  creditParts(sql, id, { scrap: R.acorns.welcomeScrap });
  // The first scout seat and the first anvil are free (rung 0 of their ladders); each takes the free creature the lab's policy picks.
  w.seats.buySeat(id, keyOf('seat'));
  w.orders.buyAnvil(id, keyOf('anvil'));
  const bot = blankBot();
  seatFree(w, sim, id, ctx);
  setDestinations(w, sim, id, true);
  addTeamOrders(w, sim, id);
  const flows = flowsOf(sql, id);
  bot.seen = { acorns: flows.acornsIn, scrap: flows.scrapIn, shards: flows.shardsIn };
  writeBot(ctx, id, bot);
  info.joined = true;
}

// --- one visit ----------------------------------------------------------------------------------------------------------------

/** Free seats (a scout seat, an anvil) take the creature the lab's rule picks. */
function seatFree(w: ValleyWorld, sim: SimState, userId: string, ctx: ToolCtx): void {
  const sql = ctx.sql;
  const creatures = creaturesOf(sql, userId);
  for (const seat of seatsOf(sql, userId)) {
    if (seat.creature_id !== null || (seat.place !== 'signpost' && seat.place !== 'forge'))
      continue;
    const taken = new Set(
      seatsOf(sql, userId)
        .map((s) => s.creature_id)
        .filter((c): c is string => c !== null),
    );
    const free = creatures.filter((c) => !taken.has(c.id));
    const best = pickFreeCreature(free.map((c) => ({ hours: c.work, level: c.level })));
    const chosen = free[best];
    if (chosen === undefined) return;
    const outcome = w.seats.post(userId, { seatId: seat.seat_id, creatureId: chosen.id });
    if (!outcome.ok) bump(sim, `post:${outcome.error}`);
  }
}

/** New scout seats start at the place the lab's rule picks (`firstOnly`: only seats still at their first destination). */
function setDestinations(w: ValleyWorld, sim: SimState, userId: string, fresh: boolean): void {
  const sql = w.storage.sql;
  const ranked = [...creaturesOf(sql, userId)].sort((a, b) => b.level - a.level || b.exp - a.exp);
  const scouts = seatsOf(sql, userId).filter((s) => s.place === 'signpost');
  scouts.forEach((seat, i) => {
    if (!fresh && i < scouts.length - 1) return;
    const index = defaultDestination(
      R,
      ranked.map((c) => elementIndex(c.species)),
      i,
    );
    const dest = R.scouts.destinations[index]?.id;
    if (dest === undefined || dest === seat.destination_id) return;
    const outcome = w.seats.post(userId, { seatId: seat.seat_id, destination: dest });
    if (!outcome.ok) bump(sim, `destination:${outcome.error}`);
  });
}

/** Every anvil without an order gets a "for my team" order (the lab's anvil dresses the player's best creatures). */
function addTeamOrders(w: ValleyWorld, sim: SimState, userId: string): void {
  const view = w.settle.settle(userId, 'now');
  for (const anvil of view?.anvils ?? []) {
    if (anvil.orders.length > 0) continue;
    const outcome = w.orders.addOrder(userId, anvil.id, { forTeam: true, reach: 'none' });
    if (!outcome.ok) bump(sim, `order:${outcome.error}`);
  }
}

/** The lab's dungeon and raid, as inputs (the server has neither for the bots; see the file's head). */
function standInFights(ctx: ToolCtx, userId: string, bot: BotState, day: number): void {
  const d = R.fights.dungeon;
  const team = [...creaturesOf(ctx.sql, userId)]
    .sort((a, b) => b.level - a.level || b.exp - a.exp)
    .slice(0, R.fights.team);
  for (; bot.passes > 0; bot.passes -= 1) {
    const salt = `${String(day)}-${String(bot.passes)}-${String(bot.visits)}`;
    credit(
      ctx.storage,
      {
        userId,
        currency: 'bait',
        amount: d.acorns,
        source: 'dev',
        idempotencyKey: `simdun-${salt}-a`,
      },
      ctx.now,
    );
    creditParts(ctx.sql, userId, { scrap: d.scrap });
    bot.essenceCarry += d.essence;
    const essence = Math.floor(bot.essenceCarry + 1e-9);
    bot.essenceCarry -= essence;
    if (essence > 0) {
      credit(
        ctx.storage,
        {
          userId,
          currency: 'essence',
          amount: essence,
          source: 'dev',
          idempotencyKey: `simdun-${salt}-e`,
        },
        ctx.now,
      );
    }
    for (const c of team) awardExperience(ctx.sql, undefined, userId, c.id, d.xp, 'dungeon', false);
  }
}

/** Sunday night: the raid pays the fighters who took part (a week's XP, scrap, Essence); the boss falls at the server dial's half. */
function standInRaid(ctx: ToolCtx, w: ValleyWorld, userIds: string[], week: number): void {
  const raid = R.fights.raid;
  const kill = ctx.rng.nextU32() / 0x1_0000_0000 < raid.bossKillChance.half;
  if (kill) w.commons.bossFell(ctx.now);
  for (const userId of userIds) {
    const bot = readBot(ctx, userId);
    if (!bot.raidThisWeek) continue;
    bot.raidThisWeek = false;
    const team = [...creaturesOf(ctx.sql, userId)]
      .sort((a, b) => b.level - a.level || b.exp - a.exp)
      .slice(0, R.fights.team);
    for (const c of team)
      awardExperience(ctx.sql, undefined, userId, c.id, raid.xpPerWeek, 'raid', false);
    creditParts(ctx.sql, userId, { scrap: raid.scrap });
    const essence = Math.round(kill ? raid.essenceKill : raid.essencePhases);
    credit(
      ctx.storage,
      {
        userId,
        currency: 'essence',
        amount: essence,
        source: 'dev',
        idempotencyKey: `simraid-${String(week)}`,
      },
      ctx.now,
    );
    writeBot(ctx, userId, bot);
  }
}

function giveGifts(
  ctx: ToolCtx,
  w: ValleyWorld,
  sim: SimState,
  userId: string,
  bot: BotState,
  week: number,
  view: ValleyView,
): void {
  const info = sim.bots.find((b) => b.id === userId);
  const profile = profileById(info?.profile ?? 'daily');
  if (isHoarding(profile.hoardWeeks, week)) return;
  const dumping = isDumping(profile.hoardWeeks, week);
  const sql = ctx.sql;
  const flows = flowsOf(sql, userId);
  const income = {
    acorns: flows.acornsIn - bot.seen.acorns,
    scrap: flows.scrapIn - bot.seen.scrap,
    shards: flows.shardsIn - bot.seen.shards,
  };
  bot.seen = { acorns: flows.acornsIn, scrap: flows.scrapIn, shards: flows.shardsIn };
  for (const c of ['acorns', 'scrap', 'shards'] as const) {
    bot.budget[c] = giftBudgetAfterIncome(bot.budget[c], income[c], profile.giveShare);
  }
  const give = (
    place: string,
    currency: 'acorns' | 'scrap' | 'shards',
    amount: number,
    element?: ValleyElement,
  ): number => {
    if (amount < 1) return 0;
    const outcome = w.gifts.give(userId, {
      place,
      currency,
      ...(element === undefined ? {} : { element }),
      amount,
      key: keyOf('gift'),
    });
    if (!outcome.ok) {
      bump(sim, `gift:${outcome.error}`);
      return 0;
    }
    return amount;
  };
  const balances = getBalances(sql, userId);
  let acorns = balances.bait;
  const parts = getParts(sql, userId);
  let scrap = Math.max(0, parts.scrap - R.forge.giveReserveScrap);
  const open = (view.commons?.places ?? []).filter((p) => p.state === 'open' && p.project !== null);
  for (const place of open) {
    const need = place.project?.needs;
    if (need === undefined) continue;
    const a = Math.min(
      Math.floor(giftAmount(bot.budget.acorns, acorns, dumping)),
      Math.ceil(need.acorns),
    );
    const given = give(place.id, 'acorns', a);
    bot.budget.acorns = Math.max(0, bot.budget.acorns - given);
    acorns -= given;
    const s = Math.min(
      Math.floor(giftAmount(bot.budget.scrap, scrap, dumping)),
      Math.ceil(need.scrap),
    );
    const sGiven = give(place.id, 'scrap', s);
    bot.budget.scrap = Math.max(0, bot.budget.scrap - sGiven);
    scrap -= sGiven;
    // Shards: the place's own element counts in full, any other at the exchange's rate; the Market takes any, each in full.
    let room = Math.ceil(need.shards);
    const shards = shardsOf(sql, userId);
    const spareOf = (e: number): number =>
      Math.max(0, (shards[e] ?? 0) - R.forge.giveReserveShards);
    const rate = R.forge.exchange.rate;
    const anyElement = place.project?.anyShard !== null && place.project?.anyShard !== undefined;
    const own = VALLEY_ELEMENTS.indexOf((place.project?.shardElement ?? '') as never);
    const order = VALLEY_ELEMENTS.map((_, e) => e).sort((x, y) => spareOf(y) - spareOf(x));
    for (const e of order) {
      if (room < 1) break;
      const inFull = anyElement || e === own;
      const spare = Math.floor(giftAmount(bot.budget.shards, spareOf(e), dumping));
      const amount = inFull ? Math.min(spare, room) : Math.min(spare, room * rate);
      if (amount < (inFull ? 1 : rate)) continue;
      const element = VALLEY_ELEMENTS[e];
      const sGiven2 = give(place.id, 'shards', amount, element);
      bot.budget.shards = Math.max(0, bot.budget.shards - sGiven2);
      room -= inFull ? sGiven2 : Math.floor(sGiven2 / rate);
    }
  }
}

/**
 * Communal seats (V-POST-13, V-COM-14): one seat for every three creatures, at the first places in turn, each with a creature that stands
 * nowhere else (the lab counts the seats the same way and credits their work at the visit).
 */
function communalSeats(
  ctx: ToolCtx,
  w: ValleyWorld,
  sim: SimState,
  userId: string,
  view: ValleyView,
): void {
  const creatures = creaturesOf(ctx.sql, userId);
  const seats = Math.min(
    R.commons.places.length,
    Math.floor(creatures.length / R.commons.communalCreaturesPerSeat),
  );
  for (const place of R.commons.places.slice(0, seats)) {
    const seat = view.commons?.communal.find((c) => c.place === place);
    if (seat?.creatureId != null) continue;
    const taken = new Set(
      [
        ...seatsOf(ctx.sql, userId).map((s) => s.creature_id),
        ...(view.commons?.communal.map((c) => c.creatureId) ?? []),
      ].filter((c): c is string => c !== null),
    );
    const free = creatures.filter((c) => !taken.has(c.id));
    const best = pickFreeCreature(free.map((c) => ({ hours: c.work, level: c.level })));
    const chosen = free[best];
    if (chosen === undefined) return;
    const outcome = w.seats.postCommunal(userId, place, chosen.id);
    if (!outcome.ok) bump(sim, `communal:${outcome.error}`);
  }
}

/**
 * An anvil whose team order has waited a day for a shard it does not hold takes a patchwork order (V-FORGE-12: any shard, a plain piece)
 * ahead of it, so the piles the player does hold are used; the team order goes back behind it.
 */
function unstickAnvils(w: ValleyWorld, sim: SimState, userId: string, view: ValleyView): void {
  const patch = patchworkBlueprints()[0];
  if (patch === undefined) return;
  for (const anvil of view.anvils) {
    const t = anvil.tinkering;
    if (t?.reason !== 'shard' || (t.sinceHours ?? 0) < 24) continue;
    const head = anvil.orders[0];
    if (head === undefined || !head.forTeam || anvil.orders.length >= view.forge.queueMax) continue;
    const added = w.orders.addOrder(userId, anvil.id, {
      forTeam: false,
      blueprintId: patch.id,
      count: 3,
      reach: 'none',
    });
    if (!added.ok) {
      bump(sim, `patchwork:${added.error}`);
      continue;
    }
    // The waiting team order steps back: removed, then put again behind the patchwork order.
    w.orders.removeOrder(userId, head.id);
    w.orders.addOrder(userId, anvil.id, { forTeam: true, reach: 'none' });
  }
}

function setKitEverywhere(
  w: ValleyWorld,
  sim: SimState,
  userId: string,
  kit: KitName | null,
  anvil: boolean,
): void {
  for (const seat of seatsOf(w.storage.sql, userId)) {
    if (anvil ? seat.place !== 'forge' : seat.place !== 'signpost') continue;
    const outcome = w.seats.setKit(userId, seat.seat_id, kit);
    if (!outcome.ok) bump(sim, `kit-set:${outcome.error}`);
  }
}

function buyThings(
  ctx: ToolCtx,
  w: ValleyWorld,
  sim: SimState,
  userId: string,
  policy: 'setAndForget' | 'optimiser',
): void {
  const sql = ctx.sql;
  for (let guard = 0; guard < 16; guard++) {
    const view = w.settle.settle(userId, 'now');
    if (view === null) return;
    const balances = getBalances(sql, userId);
    const offers = [
      ...(view.seatPrices.next === null
        ? []
        : [{ kind: 'scout' as const, acorns: view.seatPrices.next, scrap: 0 }]),
      ...(view.anvilPrices.next === null
        ? []
        : [
            {
              kind: 'anvil' as const,
              acorns: view.anvilPrices.next.acorns,
              scrap: view.anvilPrices.next.scrap,
            },
          ]),
    ];
    const buy = choosePurchase({
      acorns: balances.bait,
      scrap: getParts(sql, userId).scrap,
      offers,
      kit: nextKit(R, view.kit.owned, policy),
      kitPrice: view.kit.price,
    });
    if (buy === null) return;
    if (buy.kind === 'seat') {
      const outcome =
        buy.offer.kind === 'scout'
          ? w.seats.buySeat(userId, keyOf('seat'))
          : w.orders.buyAnvil(userId, keyOf('anvil'));
      if (!outcome.ok) {
        bump(sim, `buy-seat:${outcome.error}`);
        return;
      }
      seatFree(w, sim, userId, ctx);
      if (buy.offer.kind === 'scout') setDestinations(w, sim, userId, false);
      else addTeamOrders(w, sim, userId);
      continue;
    }
    const outcome = w.seats.buyKit(userId, buy.kit, keyOf('kit'));
    if (!outcome.ok) {
      bump(sim, `buy-kit:${outcome.error}`);
      return;
    }
    // The first kit of its kind goes on every seat of its kind (the lab's one scout kit and one anvil kit).
    const anvil = buy.kit === 'tongs' || buy.kit === 'loupe';
    const had = view.kit.owned.some((k) => (k === 'tongs' || k === 'loupe') === anvil);
    if (!had) setKitEverywhere(w, sim, userId, buy.kit, anvil);
  }
}

function evolveAll(ctx: ToolCtx, w: ValleyWorld, sim: SimState, userId: string): void {
  const sql = ctx.sql;
  const waiting = creaturesOf(sql, userId).filter((c) => {
    const evo = speciesOf(c.species).evolvesTo;
    return evo !== undefined && c.level >= evo.level;
  });
  for (const c of evolutionOrder(waiting)) {
    const evo = speciesOf(c.species).evolvesTo;
    if (evo === undefined || getBalances(sql, userId).essence < evo.essence) continue;
    const outcome = w.collection.evolve(userId, c.id, keyOf('evolve'));
    if (!outcome.ok) bump(sim, `evolve:${outcome.error}`);
  }
}

function schoolSeats(w: ValleyWorld, sim: SimState, userId: string): void {
  const view = w.school.view(userId);
  if (!view.ok || view.value.phase === 'away' || view.value.talent === null) return;
  const seated = new Set(
    view.value.seats.map((s) => s.creatureId).filter((c): c is string => c !== null),
  );
  const levels = new Map(creaturesOf(w.storage.sql, userId).map((c) => [c.id, c.level]));
  const students = view.value.wouldLearn
    .filter((id) => !seated.has(id))
    .sort((a, b) => (levels.get(b) ?? 0) - (levels.get(a) ?? 0));
  for (const seat of view.value.seats) {
    if (seat.creatureId !== null) continue;
    for (const id of students.splice(0, students.length)) {
      const outcome = w.school.seat(userId, { index: seat.index, creatureId: id });
      if (outcome.ok) break;
      bump(sim, `school:${outcome.error}`);
    }
  }
}

/** The optimiser's re-tilt: every scout seat to the place that serves its needs, the kit that suits (V-POST-11). */
function retilt(
  ctx: ToolCtx,
  w: ValleyWorld,
  sim: SimState,
  userId: string,
  view: ValleyView,
): void {
  const sql = ctx.sql;
  const creatures = creaturesOf(sql, userId);
  const seats = seatsOf(sql, userId).filter((s) => s.place === 'signpost');
  const lines = new Set(creatures.map((c) => speciesOf(c.species).line));
  const needs = needsOf({
    scrap: getParts(sql, userId).scrap,
    shards: shardsOf(sql, userId),
    elementCounts: VALLEY_ELEMENTS.map(
      (_, e) => creatures.filter((c) => elementIndex(c.species) === e).length,
    ),
    creatures: creatures.length,
    kindsOwned: lines.size,
    kindsAvailable: speciesAvailableAt(R, (ctx.now - sim.startMs) / HOUR_MS),
  });
  const plan = retiltPlan(R, needs, seats.length, view.kit.owned);
  if (plan !== null) {
    plan.dests.forEach((di, i) => {
      const seat = seats[i];
      const dest = R.scouts.destinations[di]?.id;
      if (seat === undefined || dest === undefined || dest === seat.destination_id) return;
      const outcome = w.seats.post(userId, { seatId: seat.seat_id, destination: dest });
      if (!outcome.ok) bump(sim, `retilt:${outcome.error}`);
    });
    setKitEverywhere(w, sim, userId, plan.kit, false);
  }
  const owned = {
    loupe: view.kit.owned.includes('loupe'),
    tongs: view.kit.owned.includes('tongs'),
  };
  const anvilKit = anvilKitFor(owned, getBalances(sql, userId).essence);
  setKitEverywhere(w, sim, userId, anvilKit, true);
}

/** What the shard-short anvils of a visit want exchanged: a set-and-forget player's one-tap fix, an optimiser's every visit. */
function exchangeShards(w: ValleyWorld, sim: SimState, userId: string, view: ValleyView): void {
  if (view.market?.open !== true) return;
  const wanted = new Set<string>();
  for (const anvil of view.anvils) {
    const t = anvil.tinkering;
    if (t?.reason === 'shard' && t.shardElement !== null) wanted.add(t.shardElement);
  }
  const times = Math.min(20, Math.max(1, view.anvils.length) * R.forge.shard);
  for (const to of wanted) {
    if (!(VALLEY_ELEMENTS as readonly string[]).includes(to)) continue;
    const outcome = w.orders.exchange(userId, { to, from: null, times, key: keyOf('exch') });
    if (!outcome.ok) bump(sim, `exchange:${outcome.error}`);
  }
}

function visit(ctx: ToolCtx, w: ValleyWorld, sim: SimState, info: BotInfo, day: number): void {
  const userId = info.id;
  const profile = profileById(info.profile);
  const bot = readBot(ctx, userId);
  const week = Math.floor(day / 7) + 1;
  const before = w.rows();
  // The leet bot's payout (outside the game): a stand-in for the first visit of each game day, the lab's number.
  if (bot.leetDay !== day) {
    bot.leetDay = day;
    credit(
      ctx.storage,
      {
        userId,
        currency: 'bait',
        amount: R.acorns.leetPerVisitDay,
        source: 'dev',
        idempotencyKey: `simleet-${String(day)}`,
      },
      ctx.now,
    );
  }
  // Everything that built up comes home: the real settle.
  let view = w.settle.settle(userId, 'now');
  if (view === null) return;
  exchangeShards(w, sim, userId, view);
  if (profile.fights) {
    standInFights(ctx, userId, bot, day);
    if (day % 7 >= 4) bot.raidThisWeek = true;
  }
  seatFree(w, sim, userId, ctx);
  evolveAll(ctx, w, sim, userId);
  view = w.settle.settle(userId, 'now') ?? view;
  giveGifts(ctx, w, sim, userId, bot, week, view);
  buyThings(ctx, w, sim, userId, profile.policy);
  view = w.settle.settle(userId, 'now') ?? view;
  communalSeats(ctx, w, sim, userId, view);
  unstickAnvils(w, sim, userId, view);
  schoolSeats(w, sim, userId);
  const visitor = w.visitor.buyBlueprint(userId, keyOf('visitor'));
  if (!visitor.ok && visitor.error !== 'visitor_away' && visitor.error !== 'already_bought') {
    bump(sim, `visitor:${visitor.error}`);
  }
  view = w.settle.settle(userId, 'now') ?? view;
  if (profile.policy === 'optimiser') retilt(ctx, w, sim, userId, view);
  bot.visits += 1;
  const after = w.rows();
  bot.rows.read += after.read - before.read;
  bot.rows.written += after.written - before.written;
  writeBot(ctx, userId, bot);
}

// --- the tools ----------------------------------------------------------------------------------------------------------------

export interface BotsResult {
  scenario: string;
  /** Guild-local Monday 00:00 of day 0 (UTC epoch ms): the dev clock was moved here. */
  startMs: number;
  bots: { id: string; profile: string; joined: boolean }[];
}

/** Makes (or reports) the month's bots; the dev clock goes to the next Monday 00:00 and the bots that join in week 1 start there. */
export function valleyBots(ctx: ToolCtx): BotsResult {
  const w = needWorld(ctx);
  ensureFlows(ctx.sql);
  const existing = readSim(ctx);
  const sim: SimState = existing ?? {
    scenario: 'mixed8-market-shards',
    startMs: nextMonday(ctx.now, ctx.tz),
    day: 0,
    cursor: 0,
    bots: MIXED8_BOTS.map((b) => ({
      id: `${BOT_PREFIX}${String(b.id)}`,
      profile: b.profile,
      n: b.id,
      joined: false,
    })),
    rowsLog: [],
    firstLevelUpDay: null,
    serverSnaps: {},
    declined: {},
  };
  if (existing === null) moveClockTo(ctx, sim.startMs);
  const nowCtx: ToolCtx = { ...ctx, now: Math.max(ctx.now, ctx.realNow + ctx.offset.get()) };
  for (const info of sim.bots) {
    if (info.joined || profileById(info.profile).joinWeek > 1) continue;
    makeBot(nowCtx, w, sim, info);
  }
  writeSim(ctx, sim);
  return {
    scenario: sim.scenario,
    startMs: sim.startMs,
    bots: sim.bots.map((b) => ({ id: b.id, profile: b.profile, joined: b.joined })),
  };
}

export interface SimDayResult {
  /** The game day played (0-based) and whether it is complete. */
  day: number;
  done: boolean;
  /** Visits played in this call. */
  visits: number;
  rows: { read: number; written: number };
  finished: boolean;
}

interface Step {
  at: number;
  info: BotInfo;
}

/** The day's visits in time order (hour, then the bot's number). */
function stepsOf(sim: SimState, day: number, tz: string): Step[] {
  const midnight = dayStart(sim, day, tz);
  return sim.bots
    .flatMap((info) =>
      visitHours(profileById(info.profile), day, info.n).map((hour) => ({
        at: midnight + hour * HOUR_MS,
        info,
      })),
    )
    .sort((a, b) => a.at - b.at || a.info.n - b.info.n);
}

/**
 * Plays up to `maxVisits` visits of the next game day (all of them by default): the day starts with what the server runs by itself, then
 * each due bot visits at its hour (the dev clock moves there) and plays its policy. When the day's last visit is done the day ends (the
 * raid on Sunday night, the snapshot on days 7, 14, 21 and 28) and the next call plays the next day.
 */
export function valleySimDay(ctx: ToolCtx, body: { maxVisits?: number | undefined }): SimDayResult {
  const w = needWorld(ctx);
  const sim = readSim(ctx);
  if (sim === null) throw new DevError(409, 'no_bots');
  if (sim.day >= MAX_DAYS)
    return { day: sim.day, done: true, visits: 0, rows: { read: 0, written: 0 }, finished: true };
  const day = sim.day;
  const start = w.rows();
  const steps = stepsOf(sim, day, ctx.tz);
  const limit = body.maxVisits ?? Number.MAX_SAFE_INTEGER;
  let played = 0;
  if (sim.cursor === 0) {
    moveClockTo(ctx, dayStart(sim, day, ctx.tz));
    w.daily();
    // The dungeon's passes: one more a day, up to the lab's maximum; new players of the week join at their first day.
    for (const info of sim.bots) {
      if (day < (profileById(info.profile).joinWeek - 1) * 7) continue;
      const bot = readBot(ctx, info.id);
      bot.passes = Math.min(R.fights.dungeon.maxPasses, bot.passes + 1);
      writeBot(ctx, info.id, bot);
    }
  }
  while (sim.cursor < steps.length && played < limit) {
    const step = steps[sim.cursor];
    if (step === undefined) break;
    moveClockTo(ctx, step.at);
    const now = ctx.realNow + ctx.offset.get();
    const at: ToolCtx = { ...ctx, now };
    if (!step.info.joined) makeBot(at, w, sim, step.info);
    visit(at, w, sim, step.info, day);
    sim.cursor += 1;
    played += 1;
  }
  const done = sim.cursor >= steps.length;
  if (done) endDay(ctx, w, sim, day);
  const end = w.rows();
  const rows = { read: end.read - start.read, written: end.written - start.written };
  const log = sim.rowsLog.find((r) => r.day === day);
  if (log === undefined) sim.rowsLog.push({ day, ...rows, visits: played });
  else {
    log.read += rows.read;
    log.written += rows.written;
    log.visits += played;
  }
  if (done) {
    sim.day = day + 1;
    sim.cursor = 0;
  }
  writeSim(ctx, sim);
  return { day, done, visits: played, rows, finished: sim.day >= MAX_DAYS };
}

/** The end of a game day: Sunday night's raid, the first level-up, and the snapshot on the lab's week ends. */
function endDay(ctx: ToolCtx, w: ValleyWorld, sim: SimState, day: number): void {
  const tz = ctx.tz;
  moveClockTo(ctx, dayStart(sim, day, tz) + 23 * HOUR_MS);
  const now = ctx.realNow + ctx.offset.get();
  const at: ToolCtx = { ...ctx, now };
  const ids = sim.bots.filter((b) => b.joined).map((b) => b.id);
  if (day % 7 === 6) standInRaid(at, w, ids, Math.floor(day / 7));
  const levels = R.commons.places.map((place) => w.commons.levelOf(place));
  if (sim.firstLevelUpDay === null && levels.some((l) => l > 1)) sim.firstLevelUpDay = day;
  if (!isSnapshotDay(day)) return;
  moveClockTo(ctx, dayStart(sim, day, tz) + 23 * HOUR_MS + 59 * 60_000);
  const key = String(day + 1);
  let first: ValleyView | null = null;
  for (const id of ids) {
    // A snapshot settle brings the player's creatures and stores up to the end of the week (the lab reads its weeks' ends).
    first ??= w.settle.settle(id, 'now');
    if (first !== null && id !== ids[0]) w.settle.settle(id, 'now');
    const bot = readBot(ctx, id);
    bot.snaps[key] = metricsOf(ctx.sql, id, bot);
    writeBot(ctx, id, bot);
  }
  if (first === null) return;
  const commons = first.commons;
  const school = ctx.sql
    .exec<{ players: number | null; benefits: number | null }>(
      'SELECT SUM(players) AS players, SUM(benefits) AS benefits FROM school_weeks WHERE talent_id IS NOT NULL',
    )
    .one();
  sim.serverSnaps[key] = {
    fire: commons?.fire.level ?? 0,
    placeLevels: (commons?.places ?? []).reduce((n, p) => n + p.level, 0),
    keystones: commons?.keystones.found ?? 0,
    collections: (commons?.collections ?? []).filter((c) => c.done).length,
    ...(sim.firstLevelUpDay === null ? {} : { firstLevelUpDay: sim.firstLevelUpDay }),
    ...((school.players ?? 0) > 0
      ? { teacherReach: (school.benefits ?? 0) / (school.players ?? 1) }
      : {}),
  };
}

/** The share of the anvils' effective hours not spent working on a piece, since the player joined (0 before any hours). */
function tinkerShareOf(sql: SqlStorage, userId: string): number {
  const row = sql
    .exec<{ work: number; total: number }>(
      'SELECT work, total FROM valley_sim_forge WHERE user_id = ?',
      userId,
    )
    .toArray()[0];
  return row !== undefined && row.total > 0 ? 1 - row.work / row.total : 0;
}

function metricsOf(sql: SqlStorage, userId: string, bot: BotState): Metrics {
  const creatures = creaturesOf(sql, userId);
  const levels = creatures.map((c) => c.level).sort((a, b) => b - a);
  const levelOf = (k: number): number => levels[k - 1] ?? levels[levels.length - 1] ?? 1;
  const flows = flowsOf(sql, userId);
  const pieces = sql
    .exec<{ n: number }>(
      `SELECT COUNT(*) AS n FROM gear_items WHERE user_id = ? AND source LIKE '%craft%'`,
      userId,
    )
    .one().n;
  return {
    levelBest: levelOf(1),
    levelThird: levelOf(3),
    kindsOwned: new Set(creatures.map((c) => speciesOf(c.species).line)).size,
    acornsIn: flows.acornsIn,
    acornsOut: flows.acornsOut,
    scrapIn: flows.scrapIn,
    scrapOut: flows.scrapOut,
    shardsIn: flows.shardsIn,
    shardsOut: flows.shardsOut,
    piecesMade: pieces,
    tinkerShare: tinkerShareOf(sql, userId),
    rowsRead: bot.rows.read,
    rowsWritten: bot.rows.written,
  };
}

// --- the report ---------------------------------------------------------------------------------------------------------------

export interface ReportResult {
  /** The lab's `LiveReportSchema` (`packages/econ/src/compare.ts`): `pnpm --filter @creatures/econ compare <file>` reads it. */
  report: {
    version: 1;
    scenario: string;
    profiles: Record<string, { days: { day: number; metrics: Partial<Metrics> }[] }>;
    server?: { days: { day: number; metrics: Record<string, number> }[] };
  };
  /** Beyond the lab's schema: the month's own numbers. */
  month: {
    daysPlayed: number;
    rowsLog: SimState['rowsLog'];
    rowsTotal: { read: number; written: number };
    declined: Record<string, number>;
    firstLevelUpDay: number | null;
    players: { id: string; kind: string; metricsNow: Metrics }[];
  };
}

/**
 * The lab-shaped report: the bots' snapshots by profile, the valley's own numbers on the days snapshotted (the first level-up, the fire,
 * the places, the keystones and collections, the teacher's reach) and, for the real players (every player that is not a bot), their numbers
 * as stored now (no settle, so looking never changes their valley). Nothing in it names a player but the bots' guest ids.
 */
export function valleyReport(ctx: ToolCtx): ReportResult {
  needWorld(ctx);
  const sim = readSim(ctx);
  if (sim === null) throw new DevError(409, 'no_bots');
  const profiles: ReportResult['report']['profiles'] = {};
  const days = new Set<number>();
  for (const info of sim.bots) {
    const bot = readBot(ctx, info.id);
    const entry = (profiles[info.profile] ??= { days: [] });
    for (const [key, metrics] of Object.entries(bot.snaps)) {
      entry.days.push({ day: Number(key), metrics });
      days.add(Number(key));
    }
  }
  for (const entry of Object.values(profiles)) entry.days.sort((a, b) => a.day - b.day);
  const sql = ctx.sql;
  const humans = sql
    .exec<{ user_id: string }>(
      "SELECT user_id FROM players WHERE user_id NOT LIKE 'dev-guest-%' ORDER BY user_id",
    )
    .toArray();
  return {
    report: {
      version: 1,
      scenario: sim.scenario,
      profiles,
      server: {
        days: Object.entries(sim.serverSnaps)
          .map(([day, metrics]) => ({ day: Number(day), metrics }))
          .sort((x, y) => x.day - y.day),
      },
    },
    month: {
      daysPlayed: sim.day,
      rowsLog: sim.rowsLog,
      rowsTotal: {
        read: sim.rowsLog.reduce((n, r) => n + r.read, 0),
        written: sim.rowsLog.reduce((n, r) => n + r.written, 0),
      },
      declined: sim.declined,
      firstLevelUpDay: sim.firstLevelUpDay,
      players: humans.map((h, i) => ({
        id: `player-${String(i + 1)}`,
        kind: 'human',
        metricsNow: metricsOf(sql, h.user_id, blankBot()),
      })),
    },
  };
}
