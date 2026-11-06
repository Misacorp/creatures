/**
 * Seats and kit (phase 5 step 2, docs/design/valley/systems/posts.md V-POST-1, 2, 11 and scouts.md V-SCOUT-1, 5): buying a seat,
 * posting or moving a creature, buying and setting kit. Each runs in one transaction and settles the player's valley first, so what the
 * old arrangement earned up to this moment is booked before the new one starts.
 *
 * Spends are keyed (`docs/security.md`): a seat or a kit is bought with Acorns (the `bait` ledger currency) through `runKeyed`, the
 * balance check, the debit and the grant in one transaction; a retry with the same key returns the stored result and charges nothing.
 * Moving a creature and setting kit are free and need no key. The identity is always the session's user.
 */
import {
  KIT_NAMES,
  VALLEY_RULES,
  isAnvilKit,
  isScoutKit,
  placeOpen,
  placeProfile,
  seatPrice,
  type KitName,
} from '@creatures/game';
import { runKeyed, settleSpend } from './keyed-action';
import { spend, type LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';
import type { ValleyCommons } from './valley-commons';
import { SEAT_COLUMNS, type SeatRow, type ValleySettle } from './valley-settle';
import { hasDeepArea, type ValleyFinds } from './valley-finds';
import type { ValleyGazette } from './valley-gazette';
import { worldAt } from './valley-world';

export interface ValleySeatsDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly timezone: () => string;
  readonly settle: ValleySettle;
  readonly finds: ValleyFinds;
  /** The Gazette's paper: a way deeper is taken from its decision (V-RET-3, V-SCOUT-6). */
  readonly gazette: ValleyGazette;
  /** The Signpost's level bounds the seats (V-COM-10); the communal seats belong to a place of the commons (V-POST-13). */
  readonly commons: ValleyCommons;
}

/** What a bought seat or kit answers (stored for a retry). */
export interface SeatBought {
  seatId: string;
  price: number;
}
export interface KitBought {
  kit: KitName;
  price: number;
}

/** The ledger purposes (at most 32 characters). */
export const SEAT_PURPOSE = 'valley_seat';
export const KIT_PURPOSE = 'valley_kit';

export class ValleySeats {
  constructor(private readonly deps: ValleySeatsDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private seatOf(userId: string, seatId: string): SeatRow {
    const row = this.sql
      .exec<SeatRow>(
        `SELECT ${SEAT_COLUMNS} FROM valley_seats WHERE seat_id = ? AND user_id = ?`,
        seatId,
        userId,
      )
      .toArray()[0];
    // The same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  private ownsCreature(userId: string, creatureId: string): { level: number } {
    const row = this.sql
      .exec<{ level: number }>(
        'SELECT level FROM creatures WHERE id = ? AND user_id = ?',
        creatureId,
        userId,
      )
      .toArray()[0];
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  /** V-POST-2: buys the player's next scout seat at its rung of the ladder. Keyed spend; the first seat is free. */
  buySeat(userId: string, key: string): Outcome<SeatBought> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      return runKeyed(
        this.sql,
        this.deps.now,
        { userId, key, kind: 'valley_seat_buy', fingerprint: 'signpost' },
        () => {
          const owned = this.sql
            .exec<{ n: number; last: number | null }>(
              `SELECT COUNT(*) AS n, MAX(position) AS last FROM valley_seats
               WHERE user_id = ? AND place = 'signpost' AND kind = 'scout'`,
              userId,
            )
            .one();
          const price = seatPrice(VALLEY_RULES, owned.n, this.deps.commons.levelOf('signpost'));
          if (price === null) throw new GameError(409, 'no_more_seats');
          const grant = (): string => this.insertSeat(userId, (owned.last ?? 0) + 1);
          const seatId =
            price === 0
              ? grant()
              : settleSpend(
                  spend(
                    this.deps.storage,
                    {
                      userId,
                      currency: 'bait',
                      amount: price,
                      purpose: SEAT_PURPOSE,
                      idempotencyKey: `seat:${key}`,
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

  private insertSeat(userId: string, position: number): string {
    const rules = VALLEY_RULES;
    const used = new Set(
      this.sql
        .exec<{ destination_id: string }>(
          'SELECT destination_id FROM valley_seats WHERE user_id = ?',
          userId,
        )
        .toArray()
        .map((r) => r.destination_id),
    );
    const destination =
      rules.scouts.destinations.find((d) => !used.has(d.id))?.id ??
      rules.scouts.destinations[0]?.id ??
      'tidepools';
    const seatId = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO valley_seats (seat_id, user_id, place, kind, position, destination_id, prev_destination_id, passed_at)
       VALUES (?, ?, 'signpost', 'scout', ?, ?, ?, ?)`,
      seatId,
      userId,
      position,
      destination,
      destination,
      this.deps.now(),
    );
    return seatId;
  }

  /**
   * V-POST-1: posts a creature to a seat, or empties it (`creatureId` null), and may point the seat at another destination
   * (V-SCOUT-1; an anvil has no destination). Moving is free and loses nothing: the creature's scouting hours stay with it, and a creature already at another seat
   * leaves it (that seat takes this seat's creature when it had one, so a drag onto an occupied seat is a swap). A seat that changes
   * destination brings its store home first, so nothing is turned into another place's finds.
   */
  post(
    userId: string,
    input: { seatId: string; creatureId?: string | null; destination?: string },
  ): Outcome<{ seatId: string }> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      const seat = this.seatOf(userId, input.seatId);
      const now = this.deps.now();
      if (input.destination !== undefined && seat.place !== 'signpost') {
        throw new GameError(400, 'not_a_scout_seat');
      }
      if (input.destination !== undefined && input.destination !== seat.destination_id) {
        const place = placeProfile(VALLEY_RULES, input.destination);
        if (place === undefined) throw new GameError(400, 'unknown_destination');
        if (!placeOpen(place, worldAt(this.deps.timezone(), now))) {
          throw new GameError(409, 'destination_closed', 'festival');
        }
        this.bringHome(userId, seat, now);
        this.sql.exec(
          `UPDATE valley_seats SET destination_id = ?, prev_destination_id = ?, deep = 0 WHERE seat_id = ?`,
          input.destination,
          place.festival ? seat.destination_id : input.destination,
          seat.seat_id,
        );
      }
      if (input.creatureId !== undefined && input.creatureId !== seat.creature_id) {
        if (input.creatureId !== null) {
          this.ownsCreature(userId, input.creatureId);
          const other = this.sql
            .exec<{ seat_id: string }>(
              'SELECT seat_id FROM valley_seats WHERE creature_id = ? AND user_id = ?',
              input.creatureId,
              userId,
            )
            .toArray()[0];
          if (other !== undefined) {
            this.sql.exec(
              'UPDATE valley_seats SET creature_id = ? WHERE seat_id = ?',
              seat.creature_id,
              other.seat_id,
            );
          }
        }
        this.sql.exec(
          'UPDATE valley_seats SET creature_id = ? WHERE seat_id = ?',
          input.creatureId,
          seat.seat_id,
        );
      }
      // A smith posted to an anvil with an order starts on it at once.
      if (seat.place === 'forge') this.deps.settle.settle(userId, 'now');
      return { seatId: seat.seat_id };
    });
  }

  /**
   * V-POST-13, V-COM-14: posts a creature to the caller's communal seat at a place of the commons (it opens the seat the first time:
   * one per player per place), or empties it with `null`. It is an extra seat, never one of the player's own: the creature leaves any
   * seat it stood at (that seat takes this one's creature, so a drag is a swap, as at any seat). Free.
   */
  postCommunal(
    userId: string,
    place: string,
    creatureId: string | null,
  ): Outcome<{ seatId: string }> {
    return atomically(this.deps.storage, () => {
      if (!VALLEY_RULES.commons.places.includes(place)) throw new GameError(404, 'not_found');
      this.deps.settle.settle(userId, 'now');
      const now = this.deps.now();
      let seat = this.sql
        .exec<{ seat_id: string; creature_id: string | null }>(
          `SELECT seat_id, creature_id FROM valley_seats WHERE user_id = ? AND place = 'commons' AND destination_id = ?`,
          userId,
          place,
        )
        .toArray()[0];
      if (seat === undefined) {
        const seatId = crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO valley_seats (seat_id, user_id, place, kind, position, destination_id, prev_destination_id, communal, passed_at)
           VALUES (?, ?, 'commons', 'communal', 0, ?, ?, 1, ?)`,
          seatId,
          userId,
          place,
          place,
          now,
        );
        seat = { seat_id: seatId, creature_id: null };
      }
      if (creatureId !== seat.creature_id) {
        if (creatureId !== null) {
          this.ownsCreature(userId, creatureId);
          const other = this.sql
            .exec<{ seat_id: string }>(
              'SELECT seat_id FROM valley_seats WHERE creature_id = ? AND user_id = ?',
              creatureId,
              userId,
            )
            .toArray()[0];
          if (other !== undefined) {
            this.sql.exec(
              'UPDATE valley_seats SET creature_id = ? WHERE seat_id = ?',
              seat.creature_id,
              other.seat_id,
            );
          }
        }
        this.sql.exec(
          'UPDATE valley_seats SET creature_id = ? WHERE seat_id = ?',
          creatureId,
          seat.seat_id,
        );
      }
      // A creature moved from or to an anvil changes what the Forge does at once.
      this.deps.settle.settle(userId, 'now');
      return { seatId: seat.seat_id };
    });
  }

  /**
   * V-SCOUT-6: takes a scout into its destination's deeper area, or back up. Going deeper is only offered by the unread Gazette paper's one
   * decision for this seat and this scout (a way found while away; the pass drew it); the pack comes home first, so nothing found
   * at the old depth is counted at the new. Coming back up is free at any time. Asking for the state a seat is already in changes nothing.
   */
  setDeep(userId: string, seatId: string, deep: boolean): Outcome<{ seatId: string }> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      const seat = this.seatOf(userId, seatId);
      if (seat.place !== 'signpost') throw new GameError(400, 'not_a_scout_seat');
      if ((seat.deep === 1) === deep) return { seatId };
      if (deep) {
        const offer = this.deps.gazette.pendingDecision(userId);
        if (
          offer === null ||
          offer.seatId !== seat.seat_id ||
          offer.creatureId !== seat.creature_id ||
          offer.destination !== seat.destination_id ||
          !hasDeepArea(seat.destination_id)
        ) {
          throw new GameError(409, 'no_way_deeper');
        }
        this.deps.gazette.clearDecision(userId);
      }
      this.bringHome(userId, seat, this.deps.now());
      this.sql.exec(
        'UPDATE valley_seats SET deep = ? WHERE seat_id = ?',
        deep ? 1 : 0,
        seat.seat_id,
      );
      return { seatId };
    });
  }

  /** Brings a seat's store home now (the seat is about to change what it explores). */
  private bringHome(userId: string, seat: SeatRow, now: number): void {
    const place = placeProfile(VALLEY_RULES, seat.destination_id);
    const waiting =
      seat.scrap > 0 ||
      seat.shards > 0 ||
      seat.gear_finds > 0 ||
      seat.blueprint_finds > 0 ||
      seat.page_finds > 0;
    if (place !== undefined && waiting) {
      const level =
        seat.creature_id === null
          ? 1
          : (this.sql
              .exec<{ level: number }>('SELECT level FROM creatures WHERE id = ?', seat.creature_id)
              .toArray()[0]?.level ?? 1);
      this.deps.finds.collect(
        userId,
        seat.seat_id,
        place,
        {
          scrap: seat.scrap,
          shards: seat.shards,
          gear: seat.gear_finds,
          blueprints: seat.blueprint_finds,
          pages: seat.page_finds,
        },
        level,
        now,
      );
    }
    this.sql.exec(
      `UPDATE valley_seats SET store_hours = 0, scrap = 0, shards = 0, gear_finds = 0, blueprint_finds = 0,
         page_finds = 0, passed_at = ? WHERE seat_id = ?`,
      now,
      seat.seat_id,
    );
  }

  /** V-POST-11, V-SCOUT-5: buys a kit once with Acorns (keyed spend); it can then be set on any seat for free. */
  buyKit(userId: string, kit: KitName, key: string): Outcome<KitBought> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      return runKeyed(
        this.sql,
        this.deps.now,
        { userId, key, kind: 'valley_kit_buy', fingerprint: kit },
        () => {
          const have = this.sql
            .exec('SELECT 1 FROM valley_kit WHERE user_id = ? AND kit_id = ?', userId, kit)
            .toArray();
          if (have.length > 0) throw new GameError(409, 'kit_owned');
          const price = VALLEY_RULES.kit.price;
          settleSpend(
            spend(
              this.deps.storage,
              {
                userId,
                currency: 'bait',
                amount: price,
                purpose: KIT_PURPOSE,
                idempotencyKey: `kit:${key}`,
                apply: () => {
                  this.sql.exec(
                    'INSERT INTO valley_kit (user_id, kit_id, bought_at) VALUES (?, ?, ?)',
                    userId,
                    kit,
                    this.deps.now(),
                  );
                  return { kit, price };
                },
              },
              this.deps.now(),
            ),
          );
          return { kit, price };
        },
      );
    });
  }

  /**
   * V-SCOUT-5, V-FORGE-8: sets (or clears) the kit on a seat; one at a time, switching between owned kit is free. A scout's seat takes
   * the lure, lantern and satchel, an anvil the tongs and the loupe.
   */
  setKit(userId: string, seatId: string, kit: KitName | null): Outcome<{ seatId: string }> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      const seat = this.seatOf(userId, seatId);
      if (seat.place === 'commons') throw new GameError(400, 'kit_does_not_fit');
      if (kit !== null) {
        if (!(KIT_NAMES as readonly string[]).includes(kit))
          throw new GameError(400, 'unknown_kit');
        if (seat.place === 'forge' ? !isAnvilKit(kit) : !isScoutKit(kit)) {
          throw new GameError(400, 'kit_does_not_fit');
        }
        const have = this.sql
          .exec('SELECT 1 FROM valley_kit WHERE user_id = ? AND kit_id = ?', userId, kit)
          .toArray();
        if (have.length === 0) throw new GameError(409, 'kit_not_owned');
      }
      this.sql.exec('UPDATE valley_seats SET kit_id = ? WHERE seat_id = ?', kit, seat.seat_id);
      return { seatId: seat.seat_id };
    });
  }
}
