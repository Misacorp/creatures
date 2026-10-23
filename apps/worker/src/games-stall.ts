/**
 * The Valley Games' Prize Stall (docs/design/valley-games.md): content offers (`games-stall.json`),
 * open for the Wednesday game day (guild time), priced in medal points, with a per-week limit per player
 * and offer. A purchase is one transaction through `runKeyed` (the client's idempotency key: a retry
 * returns the stored result and pays nothing twice): it checks the stall is open, the limit and the
 * pocket, takes the points and grants through the existing grant helpers (`payOnce`; key
 * `games:<week>:<offer>:<n>`, so each purchase is its own grant). What it rolls (the gear piece, the
 * supply's kind, the shards' element) comes from the live gear RNG at the purchase.
 */
import {
  ELEMENTS,
  gamesStall,
  gamesStallOffer,
  int,
  rollDungeonItem,
  type Element,
  type GamesStallOffer,
  type PartsBundle,
} from '@creatures/game';
import { progressOf } from './dungeon-rows';
import { STALL_WEEKDAY, gamesLockAt, lockedDayAt } from './games-calendar';
import type { GamesDeps } from './games-lock';
import { payOnce, type Draft, type GrantView } from './gear-grants';
import { runKeyed } from './keyed-action';
import { GameError } from './outcome';
import { readMedals } from './games-store';
import { addDays, isoWeekday } from './time';

/** The supply kinds the stall can give: every kind but the lure (made from Bait only, as in the dungeon). */
const STALL_SUPPLY_KINDS = ['map-scrap', 'lantern', 'satchel'] as const;

export interface StallOfferView {
  id: string;
  kind: GamesStallOffer['kind'];
  name: string;
  price: number;
  weeklyLimit: number;
  /** Purchases left this stall week (the coming one while the stall is closed). */
  left: number;
  params: GamesStallOffer['params'];
}

export interface StallView {
  open: boolean;
  /** The stall week's Wednesday (guild time): the current one while open, else the next one. */
  week: string;
  opensAt: number;
  closesAt: number;
  offers: StallOfferView[];
}

/** The stall week at `now`: its Wednesday, whether it is that day now, and when it opens and closes. */
export function stallWeek(now: number, tz: string) {
  const today = lockedDayAt(now, tz);
  const open = isoWeekday(today) === STALL_WEEKDAY;
  const week = open ? today : addDays(today, (STALL_WEEKDAY - isoWeekday(today) + 7) % 7);
  return {
    open,
    week,
    opensAt: gamesLockAt(week, tz),
    closesAt: gamesLockAt(addDays(week, 1), tz),
  };
}

function bought(sql: SqlStorage, userId: string, week: string, offerId: string): number {
  return (
    sql
      .exec<{ bought: number }>(
        'SELECT bought FROM games_stall_buys WHERE user_id = ? AND week = ? AND offer_id = ?',
        userId,
        week,
        offerId,
      )
      .toArray()[0]?.bought ?? 0
  );
}

export function stallView(sql: SqlStorage, userId: string, now: number, tz: string): StallView {
  const w = stallWeek(now, tz);
  return {
    ...w,
    offers: gamesStall.map((o) => ({
      id: o.id,
      kind: o.kind,
      name: o.name,
      price: o.price,
      weeklyLimit: o.weeklyLimit,
      left: Math.max(0, o.weeklyLimit - bought(sql, userId, w.week, o.id)),
      params: o.params,
    })),
  };
}

export interface StallPurchase {
  offerId: string;
  price: number;
  /** What the grant gave (gear, parts, supplies), as every grant shows it. */
  grant: GrantView;
  /** Bait the purchase credited (the Bait offer). */
  bait?: number;
}

/** The grant of one offer, drawn at the purchase with the gear RNG. */
function drawOffer(offer: GamesStallOffer, rng: GamesDeps['gearRng'], depth: number): Draft {
  const empty: Draft = { gear: [], parts: {}, blueprints: [] };
  const element = (): Element => ELEMENTS[int(rng, ELEMENTS.length)] as Element;
  switch (offer.kind) {
    case 'gear': {
      const item = rollDungeonItem(rng, offer.params.rarity, depth, false, element());
      return { ...empty, gear: [{ item, origin: { kind: 'games' } }] };
    }
    case 'supply': {
      const kind = STALL_SUPPLY_KINDS[int(rng, STALL_SUPPLY_KINDS.length)] as string;
      return { ...empty, supplies: [`${kind}-${offer.params.tier}`] };
    }
    case 'shards': {
      const shard: `${Element}-shard` = `${element()}-shard`;
      const parts: PartsBundle = {};
      parts[shard] = offer.params.amount;
      return { ...empty, parts };
    }
    case 'glimmer':
      return { ...empty, parts: { glimmer: offer.params.amount } };
    case 'bait':
      // The Bait goes through the ledger (`payOnce`'s credits), not the grant.
      return empty;
  }
}

/**
 * Buys an offer for the player. Runs inside the caller's transaction; throws a `GameError`:
 * 404 `offer_not_found`, 409 `stall_closed`, `limit_reached`, `insufficient_medals` or `key_conflict`.
 */
export function buyOffer(
  deps: GamesDeps,
  userId: string,
  offerId: string,
  key: string,
): StallPurchase {
  const sql = deps.storage.sql;
  return runKeyed(sql, deps.now, { userId, key, kind: 'games_stall', fingerprint: offerId }, () => {
    const offer = gamesStallOffer(offerId);
    if (offer === undefined) throw new GameError(404, 'offer_not_found');
    const now = deps.now();
    const w = stallWeek(now, deps.timezone());
    if (!w.open) throw new GameError(409, 'stall_closed');
    const n = bought(sql, userId, w.week, offer.id);
    if (n >= offer.weeklyLimit) throw new GameError(409, 'limit_reached');
    if (readMedals(sql, userId).pocket < offer.price) {
      throw new GameError(409, 'insufficient_medals');
    }
    sql.exec(
      'UPDATE games_medals SET pocket = pocket - ? WHERE user_id = ? AND pocket >= ?',
      offer.price,
      userId,
      offer.price,
    );
    sql.exec(
      `INSERT INTO games_stall_buys (user_id, week, offer_id, bought) VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, week, offer_id) DO UPDATE SET bought = bought + 1`,
      userId,
      w.week,
      offer.id,
    );
    const depth = Math.max(1, progressOf(sql, userId).depth);
    const bait = offer.kind === 'bait' ? offer.params.amount : 0;
    const grant = payOnce(
      { storage: deps.storage, now: deps.now, rng: deps.gearRng, analytics: deps.analytics },
      userId,
      `games:${w.week}:${offer.id}:${String(n + 1)}`,
      {
        source: 'games',
        draw: () => drawOffer(offer, deps.gearRng, depth),
        ...(bait > 0 ? { credits: { bait, meta: { offer: offer.id } } } : {}),
      },
    );
    deps.analytics?.record({ kind: 'games_buy', offer: offer.id, price: offer.price }, userId);
    return { offerId: offer.id, price: offer.price, grant, ...(bait > 0 ? { bait } : {}) };
  });
}
