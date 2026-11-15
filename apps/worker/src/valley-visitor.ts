/**
 * The weekly visitor (phase 5 step 8, docs/design/valley/systems/visitor.md V-VIS-1 to 5), behind `VALLEY_SYSTEMS`. Two parts:
 *
 * - `VisitorWeeks`: his weeks. The week's row (`visitor_weeks`) is made the first time the server sees him here, with the week's blueprint
 *   drawn then from live randomness, and his arrival is posted once through `discord_posts` (key `visitor:<week>`). Whatever sees him first
 *   makes it: the alarm (armed for Thursday 00:00 in the guild's timezone), a read of him, a spend at his stall, or a returning player's
 *   paper. The Gazette's once-a-week mention of him is told here too.
 * - `ValleyVisitor`: what players do with him. The read (stock hidden before he arrives), the reroll of a piece and the week's blueprint.
 *   Both spends are keyed (`docs/security.md`): the balance check, the debit and the grant happen in one transaction through `runKeyed`, and
 *   a retry with the same key returns the stored result and takes nothing. The identity is always the session's user.
 *
 * Price scale: a piece is priced on its stored item level (`gear_items.item_level`), the number the Forge's fire sets on a made piece
 * (1 to 20 on the shipped scale; the lab's valley runs to about 100 and the remap, OPEN 10, is not made yet), against `baseLevel`.
 *
 * Reads: a request that asks about him reads the week's row and the player's row (two primary-key rows); the alarm reads one row, only
 * while he is here. Writes: one `visitor_weeks` row a week, one `visitor_rerolls` row per player per week.
 */
import {
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  anyShardPayment,
  gearBase,
  rerollOdds,
  rerollPrice,
  rollBlueprint,
  rollLines,
  shardOf,
  visitorHere,
  visitorWeekOf,
  RULES,
  type RerollOdds,
  type Rng,
} from '@creatures/game';
import { formatVisitorPost } from './discord-format';
import { enqueuePost } from './discord-posts';
import {
  addMark,
  creditParts,
  debitParts,
  findItem,
  getParts,
  learnBlueprint,
  parseLines,
  setItemLines,
} from './gear-store';
import { runKeyed, settleSpend } from './keyed-action';
import { spend, type LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';
import { addDays, zonedTimeToEpoch } from './time';
import type { ValleySettle } from './valley-settle';

/** The ledger purposes of the two spends (at most 32 characters). */
export const VISITOR_REROLL_PURPOSE = 'valley_visitor_reroll';
export const VISITOR_BLUEPRINT_PURPOSE = 'valley_visitor_blueprint';

export type VisitorWeekRow = {
  week_key: string;
  blueprint_id: string;
  arrived_at: number;
  posted_at: number | null;
  forced: number;
};

/** Where he stands at an instant: the week, and his row when he is here. */
export interface VisitorNow {
  /** The guild-local Monday of the week (`YYYY-MM-DD`). */
  weekKey: string;
  /** Here now: in his days (or brought by the staging tool). Only then is `row` given. */
  here: boolean;
  row: VisitorWeekRow | null;
}

export interface VisitorWeeksDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly timezone: () => string;
  /** Live randomness for the week's blueprint. */
  readonly rng: Rng;
}

type PlayerRow = { rerolls: number; blueprint_bought: number; told: number };

export class VisitorWeeks {
  constructor(private readonly deps: VisitorWeeksDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private weekRow(key: string): VisitorWeekRow | null {
    return (
      this.sql
        .exec<VisitorWeekRow>(
          'SELECT week_key, blueprint_id, arrived_at, posted_at, forced FROM visitor_weeks WHERE week_key = ?',
          key,
        )
        .toArray()[0] ?? null
    );
  }

  /**
   * Whether he is here at `at`, making the week's row when this is the first time anyone sees him in it. Runs in the caller's
   * transaction when it has one; the row and its post are written together.
   */
  current(at: number = this.deps.now()): VisitorNow {
    const week = visitorWeekOf(at, this.deps.timezone());
    const inWindow = visitorHere(VALLEY_RULES, week.hoursIn);
    let row = this.weekRow(week.key);
    if (row === null && inWindow) row = this.arrive(week.key, at, false);
    return { weekKey: week.key, here: row !== null && (inWindow || row.forced === 1), row };
  }

  /** The alarm's and the routes' entry: make the week's row if he is here and none exists yet. Cheap outside his days (no read). */
  ensureArrival(at: number = this.deps.now()): void {
    const week = visitorWeekOf(at, this.deps.timezone());
    if (!visitorHere(VALLEY_RULES, week.hoursIn)) return;
    this.deps.storage.transactionSync(() => {
      this.current(at);
    });
  }

  /**
   * The staging tool: brings him now for the current week, whatever the weekday (the row is made if there is none; he counts as here until
   * the week ends). The arrival is posted as usual (once).
   */
  arriveNow(at: number = this.deps.now()): VisitorNow {
    return this.deps.storage.transactionSync(() => {
      const key = visitorWeekOf(at, this.deps.timezone()).key;
      const row = this.weekRow(key);
      if (row === null) this.arrive(key, at, true);
      else if (row.forced === 0) {
        this.sql.exec('UPDATE visitor_weeks SET forced = 1 WHERE week_key = ?', key);
      }
      return this.current(at);
    });
  }

  private arrive(key: string, at: number, forced: boolean): VisitorWeekRow {
    const row: VisitorWeekRow = {
      week_key: key,
      blueprint_id: rollBlueprint(this.deps.rng),
      arrived_at: at,
      posted_at: null,
      forced: forced ? 1 : 0,
    };
    this.sql.exec(
      'INSERT INTO visitor_weeks (week_key, blueprint_id, arrived_at, posted_at, forced) VALUES (?, ?, ?, NULL, ?)',
      row.week_key,
      row.blueprint_id,
      row.arrived_at,
      row.forced,
    );
    // One post a week: the key is the week's, so a second try (or a later dev arrival) queues nothing. A server with no channel known
    // posts nothing and `posted_at` stays empty.
    if (
      enqueuePost(
        this.sql,
        { key: `visitor:${key}`, content: JSON.stringify(formatVisitorPost()) },
        at,
      )
    ) {
      this.sql.exec('UPDATE visitor_weeks SET posted_at = ? WHERE week_key = ?', at, key);
      return { ...row, posted_at: at };
    }
    return row;
  }

  /** The next time, after `from`, that his days begin in the guild's timezone: when to wake the object if nothing else does. Pure, no read. */
  nextArrivalAt(from: number = this.deps.now()): number {
    const tz = this.deps.timezone();
    const week = visitorWeekOf(from, tz);
    const at = zonedTimeToEpoch(addDays(week.key, VALLEY_RULES.visitor.arriveDay), 0, 0, tz);
    return at > from
      ? at
      : zonedTimeToEpoch(addDays(week.key, 7 + VALLEY_RULES.visitor.arriveDay), 0, 0, tz);
  }

  playerRow(userId: string, key: string): PlayerRow {
    return (
      this.sql
        .exec<PlayerRow>(
          'SELECT rerolls, blueprint_bought, told FROM visitor_rerolls WHERE user_id = ? AND week_key = ?',
          userId,
          key,
        )
        .toArray()[0] ?? { rerolls: 0, blueprint_bought: 0, told: 0 }
    );
  }

  /**
   * The Gazette's line about him (V-VIS-1): true once per player per week, the first time a returning player's paper is written while he
   * is here. Returns false when he is away or the player was told already this week.
   */
  tellIfHere(userId: string, at: number): boolean {
    const now = this.current(at);
    if (!now.here) return false;
    return (
      this.sql
        .exec(
          `INSERT INTO visitor_rerolls (user_id, week_key, told) VALUES (?, ?, 1)
           ON CONFLICT(user_id, week_key) DO UPDATE SET told = 1 WHERE told = 0 RETURNING told`,
          userId,
          now.weekKey,
        )
        .toArray().length > 0
    );
  }
}

export interface ValleyVisitorDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly settle: ValleySettle;
  readonly weeks: VisitorWeeks;
  /** Live gear dice: the reroll draws the lines with them. */
  readonly rng: Rng;
}

export interface VisitorLine {
  id: string;
  tier: number;
}

export interface VisitorPrice {
  acorns: number;
  scrap: number;
}

/** What `GET /api/valley/visitor` answers. Before he arrives (or after he leaves) only `here: false`: his stock stays hidden. */
export type VisitorView =
  | { here: false }
  | {
      here: true;
      blueprint: { baseId: string; acorns: number; shards: number; bought: boolean };
      rerolls: number;
      /** The piece the caller asked about: its next price and the odds of the reroll. */
      item?: {
        id: string;
        itemLevel: number;
        rarity: string;
        price: VisitorPrice;
        odds: RerollOdds;
      };
    };

export interface RerollResult {
  itemId: string;
  before: VisitorLine[];
  after: VisitorLine[];
  /** What this reroll cost. */
  paid: VisitorPrice;
  /** Rerolls the caller has made this week, this one included. */
  rerolls: number;
  /** What the next reroll of this piece costs. */
  next: VisitorPrice;
}

export interface BlueprintResult {
  baseId: string;
  /** The blueprint was already known: it gained a mark (a well-thumbed copy). */
  duplicate: boolean;
  /** The marks on it after (when it was a copy that counted). */
  marks?: number;
  /** A copy past the most marks turns into scrap. */
  scrapBack?: number;
  paid: { acorns: number; shards: number };
}

const priceOf = ([acorns, scrap]: [number, number]): VisitorPrice => ({ acorns, scrap });

export class ValleyVisitor {
  constructor(private readonly deps: ValleyVisitorDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** The visitor as the caller may see him; with `itemId` also that piece's next price and the odds (404 when it is not theirs). */
  view(userId: string, itemId?: string): Outcome<VisitorView> {
    return atomically(this.deps.storage, () => {
      const now = this.deps.weeks.current();
      if (!now.here || now.row === null) return { here: false } as const;
      const mine = this.deps.weeks.playerRow(userId, now.weekKey);
      const v = VALLEY_RULES.visitor;
      const out: Extract<VisitorView, { here: true }> = {
        here: true,
        blueprint: {
          baseId: now.row.blueprint_id,
          acorns: v.blueprintAcorns,
          shards: v.blueprintShards,
          bought: mine.blueprint_bought === 1,
        },
        rerolls: mine.rerolls,
      };
      if (itemId === undefined) return out;
      const item = findItem(this.sql, userId, itemId);
      const base = item === undefined ? undefined : gearBase(item.base_id);
      if (item === undefined || base === undefined) throw new GameError(404, 'not_found');
      return {
        ...out,
        item: {
          id: item.id,
          itemLevel: item.item_level,
          rarity: item.rarity,
          price: priceOf(rerollPrice(VALLEY_RULES, item.item_level, mine.rerolls)),
          odds: rerollOdds(base, item.rarity, item.item_level),
        },
      };
    });
  }

  /**
   * Rerolls every modifier line of one of the caller's pieces (V-VIS-2): rarity and item level stay, the old lines are gone. 409
   * `visitor_away` (before any spend), `insufficient_funds` (Acorns) or `insufficient_parts` (scrap).
   */
  reroll(userId: string, input: { itemId: string; key: string }): Outcome<RerollResult> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      return runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: input.key, kind: 'valley_visitor_reroll', fingerprint: input.itemId },
        () => {
          const now = this.deps.weeks.current();
          if (!now.here) throw new GameError(409, 'visitor_away');
          const item = findItem(this.sql, userId, input.itemId);
          const base = item === undefined ? undefined : gearBase(item.base_id);
          if (item === undefined || base === undefined) throw new GameError(404, 'not_found');
          const mine = this.deps.weeks.playerRow(userId, now.weekKey);
          const price = priceOf(rerollPrice(VALLEY_RULES, item.item_level, mine.rerolls));
          const grant = (): RerollResult => {
            if (price.scrap > 0 && !debitParts(this.sql, userId, { scrap: price.scrap })) {
              throw new GameError(409, 'insufficient_parts');
            }
            const before = parseLines(item.lines_json);
            const after = rollLines(this.deps.rng, base, item.rarity, item.item_level).map((l) => ({
              id: l.id,
              tier: l.tier,
            }));
            setItemLines(this.sql, item.id, after);
            this.sql.exec(
              `INSERT INTO visitor_rerolls (user_id, week_key, rerolls) VALUES (?, ?, 1)
               ON CONFLICT(user_id, week_key) DO UPDATE SET rerolls = rerolls + 1`,
              userId,
              now.weekKey,
            );
            return {
              itemId: item.id,
              before,
              after,
              paid: price,
              rerolls: mine.rerolls + 1,
              next: priceOf(rerollPrice(VALLEY_RULES, item.item_level, mine.rerolls + 1)),
            };
          };
          if (price.acorns <= 0) return grant();
          return settleSpend(
            spend(
              this.deps.storage,
              {
                userId,
                currency: 'bait',
                amount: price.acorns,
                purpose: VISITOR_REROLL_PURPOSE,
                idempotencyKey: `vreroll:${input.key}`,
                apply: grant,
              },
              this.deps.now(),
            ),
          );
        },
      );
    });
  }

  /**
   * Buys the week's blueprint (V-VIS-5): once a week per player, for `blueprintAcorns` Acorns and `blueprintShards` shards of any element
   * (the most-held first). A blueprint already known gains a mark, as every other source does. 409 `visitor_away` (before any spend),
   * `already_bought`, `insufficient_funds` or `insufficient_parts`.
   */
  buyBlueprint(userId: string, key: string): Outcome<BlueprintResult> {
    return atomically(this.deps.storage, () => {
      this.deps.settle.settle(userId, 'now');
      return runKeyed(
        this.sql,
        this.deps.now,
        { userId, key, kind: 'valley_visitor_blueprint', fingerprint: 'visitor' },
        () => {
          const now = this.deps.weeks.current();
          if (!now.here || now.row === null) throw new GameError(409, 'visitor_away');
          if (this.deps.weeks.playerRow(userId, now.weekKey).blueprint_bought === 1) {
            throw new GameError(409, 'already_bought');
          }
          const baseId = now.row.blueprint_id;
          if (gearBase(baseId) === undefined) throw new GameError(404, 'not_found');
          const v = VALLEY_RULES.visitor;
          const grant = (): BlueprintResult => {
            const held = getParts(this.sql, userId);
            const take = anyShardPayment(
              VALLEY_ELEMENTS.map((e) => held[shardOf(e)]),
              v.blueprintShards,
            );
            if (take === null) throw new GameError(409, 'insufficient_parts');
            const bundle: Partial<Record<ReturnType<typeof shardOf>, number>> = {};
            VALLEY_ELEMENTS.forEach((e, i) => {
              if ((take[i] ?? 0) > 0) bundle[shardOf(e)] = take[i] ?? 0;
            });
            if (!debitParts(this.sql, userId, bundle))
              throw new GameError(409, 'insufficient_parts');
            const learned = learnBlueprint(this.sql, userId, baseId, this.deps.now());
            let marks: number | null = null;
            let scrapBack = 0;
            if (!learned) {
              marks = addMark(this.sql, userId, baseId);
              if (marks === null) {
                scrapBack = RULES.gear.drops.duplicateBlueprintScrap;
                creditParts(this.sql, userId, { scrap: scrapBack });
              }
            }
            this.sql.exec(
              `INSERT INTO visitor_rerolls (user_id, week_key, blueprint_bought) VALUES (?, ?, 1)
               ON CONFLICT(user_id, week_key) DO UPDATE SET blueprint_bought = 1`,
              userId,
              now.weekKey,
            );
            return {
              baseId,
              duplicate: !learned,
              ...(marks === null ? {} : { marks }),
              ...(scrapBack > 0 ? { scrapBack } : {}),
              paid: { acorns: v.blueprintAcorns, shards: v.blueprintShards },
            };
          };
          return settleSpend(
            spend(
              this.deps.storage,
              {
                userId,
                currency: 'bait',
                amount: v.blueprintAcorns,
                purpose: VISITOR_BLUEPRINT_PURPOSE,
                idempotencyKey: `vblueprint:${key}`,
                apply: grant,
              },
              this.deps.now(),
            ),
          );
        },
      );
    });
  }
}
