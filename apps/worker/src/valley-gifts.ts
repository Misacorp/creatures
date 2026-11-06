/**
 * Gifts to the commons (phase 5 step 6, docs/design/valley/systems/commons.md V-COM-1, 5): Acorns, scrap or shards on a place's open
 * project. Every gift is a keyed spend (`docs/security.md`: gifts are spends): the balance check, the debit and the project's
 * progress happen in one transaction through `runKeyed`, and a retry with the same key returns the stored result and takes nothing.
 * The gift settles the caller's valley first and then reads the places as of now. The identity is always the session's user.
 *
 * Gifts always count in full (round 2, Q4): one unit of a part is one unit of the project's bar, whoever gives it and however much
 * they have given. A part that is full takes nothing more (what no part can take stays with the giver); a gift that fills the last
 * part raises the level (the plaque, the fire and the three build days follow, `valley-commons.ts`).
 */
import {
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  partRoom,
  shardOf,
  shardUnits,
  type Element,
  type ProjectPart,
} from '@creatures/game';
import { debitParts } from './gear-store';
import { runKeyed, settleSpend } from './keyed-action';
import { spend, type LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';
import type { ValleyCommons } from './valley-commons';
import type { ValleySettle } from './valley-settle';

export interface ValleyGiftsDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly settle: ValleySettle;
  readonly commons: ValleyCommons;
}

export interface GiftInput {
  place: string;
  currency: ProjectPart;
  /** The shards' element (required for shards, absent otherwise). */
  element?: (typeof VALLEY_ELEMENTS)[number];
  amount: number;
  key: string;
}

export interface GiftResult {
  place: string;
  currency: ProjectPart;
  /** What left the giver's purse (for shards of another element, the exchange's rate is in it). */
  spent: number;
  /** What the project took, in Acorns' worth. */
  value: number;
  /** The gift raised the place's level. */
  levelUp: boolean;
  /** The place's level after the gift. */
  level: number;
}

/** The ledger purpose of a gift of Acorns (at most 32 characters). */
export const GIFT_PURPOSE = 'valley_gift';

export class ValleyGifts {
  constructor(private readonly deps: ValleyGiftsDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** Gives to a place's open project. 409 `no_open_project` (nothing is open there), `part_full`, `insufficient_funds` or `insufficient_parts`. */
  give(userId: string, input: GiftInput): Outcome<GiftResult> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      const fingerprint = `${input.place}:${input.currency}:${input.element ?? ''}:${String(input.amount)}`;
      return runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: input.key, kind: 'valley_gift', fingerprint },
        () => {
          const now = this.deps.now();
          const snap = this.deps.commons.load(now);
          const row = snap.places.get(input.place);
          if (row === undefined) throw new GameError(404, 'not_found');
          if (row.size <= 0) throw new GameError(409, 'no_open_project');
          const rules = VALLEY_RULES;
          const room = partRoom(
            rules,
            row.size,
            { acorns: row.have_acorns, scrap: row.have_scrap, shards: row.have_shards },
            input.currency,
          );
          if (room <= 1e-9) throw new GameError(409, 'part_full');
          // Units the project takes, at most the room (a fraction of room rounds up so the last gift can finish a part).
          const roomUnits = Math.ceil(room - 1e-9);
          let units: number;
          let spent: number;
          if (input.currency === 'shards') {
            const element = input.element;
            if (element === undefined) throw new GameError(400, 'invalid_body');
            const own = rules.commons.placeElement[input.place] === element;
            const rate = rules.forge.exchange.rate;
            units = Math.min(shardUnits(input.amount, own, rate), roomUnits);
            if (units <= 0) throw new GameError(400, 'too_few_shards');
            spent = own ? units : units * rate;
          } else {
            units = Math.min(input.amount, roomUnits);
            spent = units;
          }
          const apply = (): GiftResult => {
            const added = this.deps.commons.addToProject(
              snap,
              input.place,
              { [input.currency]: units },
              userId,
              now,
            );
            return {
              place: input.place,
              currency: input.currency,
              spent,
              value: added.value,
              levelUp: added.levelUp,
              level: snap.places.get(input.place)?.level ?? row.level,
            };
          };
          if (input.currency === 'acorns') {
            return settleSpend(
              spend(
                this.deps.storage,
                {
                  userId,
                  currency: 'bait',
                  amount: spent,
                  purpose: GIFT_PURPOSE,
                  idempotencyKey: `gift:${input.key}`,
                  apply,
                },
                now,
              ),
            );
          }
          const parts =
            input.currency === 'scrap'
              ? { scrap: spent }
              : { [shardOf(input.element as Element)]: spent };
          if (!debitParts(this.sql, userId, parts)) throw new GameError(409, 'insufficient_parts');
          return apply();
        },
      );
    });
  }
}
