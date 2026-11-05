/**
 * The Forge's actions (phase 5 step 3, docs/design/valley/systems/forge.md V-FORGE-1, 6, 10): buying an anvil, the queue of orders on
 * an anvil, and the shard exchange. Each runs in one transaction and settles the player's valley first, so what the old queue made up
 * to this moment is booked before the new one starts.
 *
 * Spends are keyed (`docs/security.md`): an anvil costs Acorns (the `bait` ledger currency) and scrap, the balance check, the debit and
 * the grant in one transaction through `runKeyed`; a retry with the same key returns the stored result and charges nothing. The
 * exchange is keyed too (its crits are live draws). Orders are free and need no key. The identity is always the session's user.
 */
import {
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  anvilPrice,
  craftable,
  exchangeShards,
  gearBase,
  shardOf,
  type AnvilPrice,
  type Element,
  type ExchangeTrade,
  type ReachId,
} from '@creatures/game';
import { runKeyed, settleSpend } from './keyed-action';
import { blueprintMarks, creditParts, debitParts, getParts } from './gear-store';
import { spend, type LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';
import {
  baseElementIndex,
  FORGE_LEVEL,
  ORDER_COLUMNS,
  type OrderRow,
  type ValleyForgePass,
} from './valley-forge';
import type { ValleySettle } from './valley-settle';

export interface ValleyOrdersDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly settle: ValleySettle;
  readonly forge: ValleyForgePass;
}

export interface AnvilBought {
  seatId: string;
  price: AnvilPrice;
}

/** The ledger purpose of an anvil (at most 32 characters). */
export const ANVIL_PURPOSE = 'valley_anvil';

/** What an add asks for: a blueprint and a count, or "for my team" (no blueprint, no count). */
export type OrderInput =
  | { forTeam: false; blueprintId: string; count: number; reach: ReachId }
  | { forTeam: true; reach: ReachId };

export interface ExchangeResult {
  trades: ExchangeTrade[];
  /** Shards of the wanted element gained in all. */
  gained: number;
}

export class ValleyOrders {
  constructor(private readonly deps: ValleyOrdersDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** V-POST-2, V-FORGE-6: buys the player's next anvil at its rung of the ladder (Acorns and scrap). Keyed spend; the first is free. */
  buyAnvil(userId: string, key: string): Outcome<AnvilBought> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      return runKeyed(
        this.sql,
        this.deps.now,
        { userId, key, kind: 'valley_anvil_buy', fingerprint: 'forge' },
        () => {
          const owned = this.sql
            .exec<{ n: number; last: number | null }>(
              `SELECT COUNT(*) AS n, MAX(position) AS last FROM valley_seats
               WHERE user_id = ? AND place = 'forge' AND kind = 'anvil'`,
              userId,
            )
            .one();
          const price = anvilPrice(VALLEY_RULES, owned.n, FORGE_LEVEL);
          if (price === null) throw new GameError(409, 'no_more_anvils');
          const grant = (): string => {
            if (price.scrap > 0 && !debitParts(this.sql, userId, { scrap: price.scrap })) {
              throw new GameError(409, 'insufficient_parts');
            }
            return this.insertAnvil(userId, (owned.last ?? 0) + 1);
          };
          const seatId =
            price.acorns === 0
              ? grant()
              : settleSpend(
                  spend(
                    this.deps.storage,
                    {
                      userId,
                      currency: 'bait',
                      amount: price.acorns,
                      purpose: ANVIL_PURPOSE,
                      idempotencyKey: `anvil:${key}`,
                      apply: grant,
                    },
                    this.deps.now(),
                  ),
                );
          return { seatId, price };
        },
      );
    });
  }

  private insertAnvil(userId: string, position: number): string {
    const seatId = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO valley_seats (seat_id, user_id, place, kind, position, destination_id, prev_destination_id, passed_at)
       VALUES (?, ?, 'forge', 'anvil', ?, 'forge', 'forge', ?)`,
      seatId,
      userId,
      position,
      this.deps.now(),
    );
    return seatId;
  }

  private anvilOf(userId: string, seatId: string): void {
    const row = this.sql
      .exec(
        `SELECT 1 FROM valley_seats WHERE seat_id = ? AND user_id = ? AND place = 'forge'`,
        seatId,
        userId,
      )
      .toArray();
    // The same answer for "does not exist", "is a scout's seat" and "belongs to someone else".
    if (row.length === 0) throw new GameError(404, 'not_found');
  }

  private orderOf(userId: string, orderId: string): OrderRow {
    const row = this.sql
      .exec<OrderRow>(
        `SELECT ${ORDER_COLUMNS} FROM forge_orders WHERE order_id = ? AND user_id = ?`,
        orderId,
        userId,
      )
      .toArray()[0];
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  /** V-FORGE-1: adds an order to the end of an anvil's queue (at most `queueMax`). */
  addOrder(userId: string, seatId: string, input: OrderInput): Outcome<{ orderId: string }> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      this.anvilOf(userId, seatId);
      const queue = this.sql
        .exec<{ n: number; last: number | null }>(
          'SELECT COUNT(*) AS n, MAX(position) AS last FROM forge_orders WHERE seat_id = ?',
          seatId,
        )
        .one();
      if (queue.n >= VALLEY_RULES.forge.queueMax) throw new GameError(409, 'queue_full');
      let blueprint: string | null = null;
      let element = -1;
      let count = 0;
      if (!input.forTeam) {
        const base = gearBase(input.blueprintId);
        if (base === undefined || !craftable(base)) throw new GameError(400, 'invalid_blueprint');
        if (blueprintMarks(this.sql, userId, base.id) === null) {
          throw new GameError(409, 'blueprint_unknown');
        }
        if (input.count < 1 || input.count > VALLEY_RULES.forge.orderCountMax) {
          throw new GameError(400, 'invalid_count');
        }
        blueprint = base.id;
        element = baseElementIndex(base);
        count = input.count;
      }
      const orderId = crypto.randomUUID();
      this.sql.exec(
        `INSERT INTO forge_orders (order_id, seat_id, user_id, position, blueprint_id, element, count, made, reach, for_team,
           created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        orderId,
        seatId,
        userId,
        (queue.last ?? 0) + 1,
        blueprint,
        element,
        count,
        input.reach,
        input.forTeam ? 1 : 0,
        this.deps.now(),
      );
      // A smith waiting for an order starts on it at once (the pass at this moment has no time to pay, only to start).
      this.deps.settle.settle(userId, 'now');
      return { orderId };
    });
  }

  /** V-FORGE-1: changes an order's count or Reach; it counts for the pieces not started yet. A count never goes below what is made. */
  editOrder(
    userId: string,
    orderId: string,
    change: { count?: number; reach?: ReachId },
  ): Outcome<{ orderId: string }> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      const order = this.orderOf(userId, orderId);
      if (change.count !== undefined) {
        if (order.for_team === 1) throw new GameError(400, 'invalid_count');
        if (
          change.count < Math.max(1, order.made) ||
          change.count > VALLEY_RULES.forge.orderCountMax
        ) {
          throw new GameError(400, 'invalid_count');
        }
        this.sql.exec(
          'UPDATE forge_orders SET count = ? WHERE order_id = ?',
          change.count,
          orderId,
        );
      }
      if (change.reach !== undefined) {
        this.sql.exec(
          'UPDATE forge_orders SET reach = ? WHERE order_id = ?',
          change.reach,
          orderId,
        );
      }
      this.deps.settle.settle(userId, 'now');
      return { orderId };
    });
  }

  /** V-FORGE-1: takes an order off the queue. A piece already started is finished and still comes home. */
  removeOrder(userId: string, orderId: string): Outcome<{ orderId: string }> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      this.orderOf(userId, orderId);
      this.sql.exec('DELETE FROM forge_orders WHERE order_id = ?', orderId);
      this.deps.settle.settle(userId, 'now');
      return { orderId };
    });
  }

  /**
   * V-FORGE-10: the shard exchange. Each trade takes `rate` shards of another element (the named one, or the biggest pile that can
   * pay) for 1 shard of `to`, with a small chance of a crit that gives more (a live draw). Up to `times` trades; keyed, so a retry
   * returns the stored result.
   */
  exchange(
    userId: string,
    input: { to: string; from: string | null; times: number; key: string },
  ): Outcome<ExchangeResult> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      return runKeyed(
        this.sql,
        this.deps.now,
        {
          userId,
          key: input.key,
          kind: 'valley_exchange',
          fingerprint: `${input.to}:${input.from ?? '*'}:${String(input.times)}`,
        },
        () => {
          const to = VALLEY_ELEMENTS.indexOf(input.to as never);
          const from = input.from === null ? null : VALLEY_ELEMENTS.indexOf(input.from as never);
          if (to < 0 || from === -1) throw new GameError(400, 'unknown_element');
          if (!Number.isInteger(VALLEY_RULES.forge.exchange.rate)) {
            throw new Error('the exchange rate must be a whole number of shards');
          }
          const held = getParts(this.sql, userId);
          const shards = VALLEY_ELEMENTS.map((e) => held[shardOf(e as Element)]);
          const trades = exchangeShards(
            VALLEY_RULES,
            this.deps.forge.rng,
            shards,
            to,
            from,
            input.times,
          );
          if (trades.length === 0) throw new GameError(409, 'nothing_to_exchange');
          const cost: Record<string, number> = {};
          const gain: Record<string, number> = {};
          let gained = 0;
          for (const t of trades) {
            const paid = shardOf(VALLEY_ELEMENTS[t.from] as Element);
            cost[paid] = (cost[paid] ?? 0) + t.paid;
            gained += t.got;
          }
          gain[shardOf(VALLEY_ELEMENTS[to] as Element)] = gained;
          if (!debitParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
          creditParts(this.sql, userId, gain);
          // A smith that waited on this shard goes on at once.
          this.deps.settle.settle(userId, 'now');
          return { trades, gained };
        },
      );
    });
  }
}
