/**
 * The Forge loop's part of the lazy pass (phase 5 step 3, docs/design/valley/systems/forge.md V-FORGE-1 to 9, gear.md V-GEAR-4, 6):
 * what the pure pass (`settle` with anvils, `@creatures/game` `forge.ts`) needs read, what it leaves to write back, and bringing the
 * floors home. Everything runs inside the pass's transaction, for the calling player only.
 *
 * - `load` reads the player's anvils (seats with `place = 'forge'`), their orders, the shelf the inputs come from (scrap and shards in
 *   the parts, Essence in the ledger), the blueprints' marks, and for "for my team" orders the weak slots of the player's creatures.
 *   It reads nothing when the player has no anvil.
 * - `save` writes what the pass did: each anvil's piece, floor count and wait, the orders' progress (a finished order leaves the
 *   queue), the shelf's change (scrap and shards through the parts, Essence through the ledger), and the pieces that reached a floor.
 *   Randomness: the rarity of a piece is drawn inside the pass when the piece starts (`gearRng`, `crypto` in production).
 * - `collect` brings the floors home: the pieces come best first (rarity, then item level), each is rolled now with live randomness
 *   (the base from its blueprint, the lines from its rarity and item level) and goes into the bag until the bag holds its 200; the rest
 *   stays on the floor (the lead's call: a full bag holds pieces on the floor, a full floor pauses the anvil, F-1). A piece "for my team"
 *   is worn at once by the creature of its element whose slot is empty or weakest, and goes to the bag when there is none.
 */
import {
  GEAR_SLOTS,
  RULES,
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  chance,
  dropBase,
  eligibleBases,
  gearBase,
  int,
  isAnvilKit,
  marksStepUp,
  orderNeeds,
  rollItem,
  shardOf,
  tagElement,
  weakLimit,
  wearBlock,
  type AnvilWait,
  type Element,
  type GearBase,
  type GearItem,
  type GearRarity,
  type GearSlot,
  type MadePiece,
  type ReachId,
  type Rng,
  type SettleAnvil,
  type SettleForge,
  type SettleOrder,
  type SettlePiece,
  type SettleState,
} from '@creatures/game';
import {
  addMark,
  bagItems,
  creditParts,
  debitParts,
  equippedByCreature,
  getParts,
  insertItem,
  knownBlueprints,
  setEquipped,
} from './gear-store';
import { debit, getBalance, type LedgerStorage } from './ledger';
import { speciesOf } from './species';
import type { SeatRow } from './valley-settle';

/** The Forge's level until the commons (step 6) can raise it: it bounds the anvils (V-FORGE-6, V-COM-10). */
export const FORGE_LEVEL = 1;
/** The fire's level until the commons (step 6): the item level of every piece the Forge makes (V-FORGE-7). */
export const FIRE_LEVEL = 1;

const RARITIES: readonly GearRarity[] = ['common', 'rare', 'epic'];
const ELEMENT_COUNT = VALLEY_ELEMENTS.length;

/** The columns an anvil adds to a seat row (migration 58); a scout's seat holds their defaults. */
export type AnvilColumns = {
  place: string;
  floor_count: number;
  piece_active: number;
  piece_order: string | null;
  piece_blueprint: string | null;
  piece_team: number;
  piece_element: number;
  piece_rarity: number;
  piece_reach: string;
  piece_need: number;
  piece_progress: number;
  wait_reason: string | null;
  wait_element: number;
  wait_since: number | null;
};

/** The anvil columns the pass and the routes read, after the scouts' (`SEAT_COLUMNS`). */
export const ANVIL_COLUMNS = `place, floor_count, piece_active, piece_order, piece_blueprint, piece_team, piece_element,
  piece_rarity, piece_reach, piece_need, piece_progress, wait_reason, wait_element, wait_since`;

export type OrderRow = {
  order_id: string;
  seat_id: string;
  position: number;
  blueprint_id: string | null;
  element: number;
  count: number;
  made: number;
  reach: string;
  for_team: number;
};
export const ORDER_COLUMNS =
  'order_id, seat_id, position, blueprint_id, element, count, made, reach, for_team';

type FloorRow = {
  piece_id: string;
  seat_id: string;
  blueprint_id: string | null;
  for_team: number;
  element: number;
  rarity: number;
  item_level: number;
};

/** Everything `save` needs to know about what the pass started from. */
export interface ForgeLoad {
  readonly forge: SettleForge;
  readonly orders: readonly OrderRow[];
  readonly anvils: readonly SeatRow[];
}

const asReach = (reach: string): ReachId => (reach === 'rare' || reach === 'epic' ? reach : 'none');
const asRarity = (rarity: number): 0 | 1 | 2 => (rarity === 1 ? 1 : rarity === 2 ? 2 : 0);
const WAITS: readonly string[] = ['idle', 'scrap', 'shard', 'essence', 'floor'];
const asWait = (reason: string | null): AnvilWait | null =>
  reason !== null && WAITS.includes(reason) ? (reason as AnvilWait) : null;

/**
 * Combat v2 seam (V-GEAR-3, plan risk 5): today a gear slot opens at a creature level (`RULES.gear.slotUnlockLevel`); V-GEAR-3 opens all
 * three at level 1 once combat v2's gear ships. "For my team" counts and dresses only the slots a creature may wear now, so no piece
 * is made for a slot that cannot take it. When the rule changes, this is the one place that follows.
 */
export const slotOpenFor = (level: number, slot: GearSlot): boolean =>
  level >= RULES.gear.slotUnlockLevel[slot];

/** The element index (in `VALLEY_ELEMENTS`) of a base: its tag's element, or -1 for a neutral base (any pile pays). */
export function baseElementIndex(base: Pick<GearBase, 'tag'>): number {
  const element = tagElement(base.tag);
  return element === null ? -1 : VALLEY_ELEMENTS.indexOf(element);
}

export interface ValleyForgeDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  /** Live randomness for the rarity of a piece and for rolling a piece when it comes home. */
  readonly rng: Rng;
}

/** A creature as the weak-slot count and the team's wearing need it. */
export interface TeamMember {
  readonly id: string;
  readonly species: string;
  readonly level: number;
}

export class ValleyForgePass {
  constructor(private readonly deps: ValleyForgeDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  get rng(): Rng {
    return this.deps.rng;
  }

  /** The stockpile as the pass sees it: whole scrap, a pile of shards for each element, Essence. */
  shelf(userId: string): { scrap: number; shards: number[]; essence: number } {
    const held = getParts(this.sql, userId);
    return {
      scrap: held.scrap,
      shards: VALLEY_ELEMENTS.map((e) => held[shardOf(e)]),
      essence: getBalance(this.sql, userId, 'essence'),
    };
  }

  /** The player's orders, in queue order. */
  orders(userId: string): OrderRow[] {
    return this.sql
      .exec<OrderRow>(
        `SELECT ${ORDER_COLUMNS} FROM forge_orders WHERE user_id = ? ORDER BY seat_id, position`,
        userId,
      )
      .toArray();
  }

  /**
   * "For my team": the weak slots by element (empty, or below the weak limit of the fire), counted over the player's creatures.
   */
  weakByElement(userId: string, team: readonly TeamMember[]): number[] {
    const weak = new Array<number>(ELEMENT_COUNT).fill(0);
    const worn = equippedByCreature(this.sql, userId);
    const limit = weakLimit(VALLEY_RULES, FIRE_LEVEL);
    for (const c of team) {
      const e = VALLEY_ELEMENTS.indexOf(speciesOf(c.species).element);
      if (e < 0) continue;
      for (const slot of GEAR_SLOTS) {
        if (!slotOpenFor(c.level, slot)) continue;
        if ((worn.get(c.id)?.[slot]?.item_level ?? 0) < limit) weak[e] = (weak[e] ?? 0) + 1;
      }
    }
    return weak;
  }

  /** Reads what the pass needs for the player's anvils (nothing, and null, when there is none). */
  load(
    userId: string,
    anvils: readonly SeatRow[],
    team: readonly TeamMember[],
    indexOf: ReadonlyMap<string, number>,
  ): ForgeLoad | null {
    if (anvils.length === 0) return null;
    const orders = this.orders(userId);
    const shelf = this.shelf(userId);
    const marks = orders.some((o) => o.blueprint_id !== null)
      ? new Map(knownBlueprints(this.sql, userId).map((b) => [b.baseId, b.marks]))
      : new Map<string, number>();
    const wantsTeam =
      orders.some((o) => o.for_team === 1) ||
      anvils.some((a) => a.piece_active === 1 && a.piece_team === 1);
    const pending = new Array<number>(ELEMENT_COUNT).fill(0);
    let weak = new Array<number>(ELEMENT_COUNT).fill(0);
    if (wantsTeam) {
      weak = this.weakByElement(userId, team);
      for (const a of anvils) {
        if (a.piece_active === 1 && a.piece_team === 1 && a.piece_element >= 0) {
          pending[a.piece_element] = (pending[a.piece_element] ?? 0) + 1;
        }
      }
      if (anvils.some((a) => a.floor_count > 0)) {
        for (const r of this.sql
          .exec<{ element: number; n: number }>(
            'SELECT element, COUNT(*) AS n FROM forge_floor WHERE user_id = ? AND for_team = 1 GROUP BY element',
            userId,
          )
          .toArray()) {
          if (r.element >= 0) pending[r.element] = (pending[r.element] ?? 0) + r.n;
        }
      }
    }
    const settleAnvils: SettleAnvil[] = anvils.map((a) => {
      const mine: SettleOrder[] = orders
        .filter((o) => o.seat_id === a.seat_id)
        .map((o) => ({
          id: o.order_id,
          blueprint: o.blueprint_id,
          element: o.element,
          count: o.count,
          made: o.made,
          reach: asReach(o.reach),
          forTeam: o.for_team === 1,
          stepUp: marksStepUp(o.blueprint_id === null ? 0 : (marks.get(o.blueprint_id) ?? 0)),
        }));
      const piece: SettlePiece | null =
        a.piece_active === 1
          ? {
              order: a.piece_order,
              blueprint: a.piece_blueprint,
              forTeam: a.piece_team === 1,
              element: a.piece_element,
              rarity: asRarity(a.piece_rarity),
              reach: asReach(a.piece_reach),
              need: a.piece_need,
              progress: a.piece_progress,
            }
          : null;
      return {
        id: a.seat_id,
        creature: a.creature_id === null ? -1 : (indexOf.get(a.creature_id) ?? -1),
        kit: a.kit_id !== null && isAnvilKit(a.kit_id) ? a.kit_id : null,
        orders: mine,
        piece,
        floor: a.floor_count,
        wait: asWait(a.wait_reason),
        waitElement: a.wait_element,
        waitSince: a.wait_since,
      };
    });
    return {
      forge: {
        anvils: settleAnvils,
        shelf,
        scrapCarry: 0,
        weak,
        pending,
        fireLevel: FIRE_LEVEL,
      },
      orders,
      anvils,
    };
  }

  /**
   * Writes what the pass did and returns the anvils' rows as they now stand. `carry` (the tinkering scrap not yet whole) is written by
   * the caller with the player's row.
   */
  save(userId: string, to: number, load: ForgeLoad, after: SettleState): SeatRow[] {
    const forge = after.forge;
    if (forge === undefined) return [...load.anvils];
    const out: SeatRow[] = [];
    for (const [i, row] of load.anvils.entries()) {
      const a = forge.anvils[i];
      if (a === undefined) {
        out.push(row);
        continue;
      }
      const wait = a.creature < 0 ? null : (a.wait ?? null);
      const next: SeatRow = {
        ...row,
        floor_count: a.floor,
        piece_active: a.piece === null ? 0 : 1,
        piece_order: a.piece?.order ?? null,
        piece_blueprint: a.piece?.blueprint ?? null,
        piece_team: a.piece?.forTeam === true ? 1 : 0,
        piece_element: a.piece?.element ?? -1,
        piece_rarity: a.piece?.rarity ?? 0,
        piece_reach: a.piece?.reach ?? 'none',
        piece_need: a.piece?.need ?? 0,
        piece_progress: a.piece?.progress ?? 0,
        wait_reason: wait,
        wait_element: wait === null ? -1 : (a.waitElement ?? -1),
        wait_since: wait === null ? null : (a.waitSince ?? to),
      };
      out.push(next);
      if (JSON.stringify(next) === JSON.stringify(row)) continue;
      this.sql.exec(
        `UPDATE valley_seats SET floor_count = ?, piece_active = ?, piece_order = ?, piece_blueprint = ?, piece_team = ?,
           piece_element = ?, piece_rarity = ?, piece_reach = ?, piece_need = ?, piece_progress = ?, wait_reason = ?,
           wait_element = ?, wait_since = ?, passed_at = ? WHERE seat_id = ?`,
        next.floor_count,
        next.piece_active,
        next.piece_order,
        next.piece_blueprint,
        next.piece_team,
        next.piece_element,
        next.piece_rarity,
        next.piece_reach,
        next.piece_need,
        next.piece_progress,
        next.wait_reason,
        next.wait_element,
        next.wait_since,
        to,
        row.seat_id,
      );
    }
    // The orders: progress, and the finished ones leave the queue.
    const before = new Map(load.orders.map((o) => [o.order_id, o]));
    for (const a of forge.anvils) {
      for (const o of a.orders) {
        if (before.get(o.id)?.made !== o.made) {
          this.sql.exec('UPDATE forge_orders SET made = ? WHERE order_id = ?', o.made, o.id);
        }
      }
    }
    for (const id of after.finishedOrders ?? []) {
      this.sql.exec('DELETE FROM forge_orders WHERE order_id = ?', id);
    }
    this.payShelf(userId, to, load.forge.shelf, forge.shelf);
    for (const piece of after.made ?? []) this.addToFloor(userId, piece);
    return out;
  }

  /** Books the shelf's change: scrap and shards through the parts (a tinkering anvil can add scrap), Essence through the ledger. */
  private payShelf(
    userId: string,
    to: number,
    was: SettleForge['shelf'],
    now: SettleForge['shelf'],
  ): void {
    const gain: Partial<Record<string, number>> = {};
    const cost: Partial<Record<string, number>> = {};
    const move = (kind: string, from: number, into: number): void => {
      if (into > from) gain[kind] = into - from;
      else if (into < from) cost[kind] = from - into;
    };
    move('scrap', was.scrap, now.scrap);
    for (const [e, element] of VALLEY_ELEMENTS.entries()) {
      move(shardOf(element), was.shards[e] ?? 0, now.shards[e] ?? 0);
    }
    if (Object.keys(cost).length > 0 && !debitParts(this.sql, userId, cost)) {
      throw new Error('the Forge pass spent more than the shelf held');
    }
    creditParts(this.sql, userId, gain);
    if (now.essence < was.essence) {
      debit(
        this.deps.storage,
        {
          userId,
          currency: 'essence',
          amount: was.essence - now.essence,
          source: 'valley_forge',
          idempotencyKey: `valley-forge:${crypto.randomUUID()}`,
          meta: { at: to },
        },
        this.deps.now(),
      );
    }
  }

  private addToFloor(userId: string, piece: MadePiece): void {
    this.sql.exec(
      `INSERT INTO forge_floor (piece_id, user_id, seat_id, blueprint_id, for_team, element, rarity, item_level, made_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      userId,
      piece.anvil,
      piece.blueprint,
      piece.forTeam ? 1 : 0,
      piece.element,
      piece.rarity,
      piece.itemLevel,
      piece.at,
    );
  }

  /** The pieces on the player's floors, best first (V-GEAR-4: rarity, then item level; the oldest first among equals). */
  floorRows(userId: string): FloorRow[] {
    return this.sql
      .exec<FloorRow>(
        `SELECT piece_id, seat_id, blueprint_id, for_team, element, rarity, item_level FROM forge_floor
         WHERE user_id = ? ORDER BY rarity DESC, item_level DESC, made_at, piece_id`,
        userId,
      )
      .toArray();
  }

  /**
   * Brings the floors home: each piece, best first, is rolled and goes into the bag until the bag is full; the rest stays on the
   * floor. Returns the seats' new floor counts (by seat id) and how many pieces came home and how many were worn at once.
   */
  collect(
    userId: string,
    to: number,
    team: readonly TeamMember[],
    cap: number,
  ): {
    counts: Map<string, number>;
    brought: number;
    worn: number;
    /** The pieces that came home, best first (for the Gazette). */
    items: { id: string; baseId: string; rarity: GearRarity; itemLevel: number }[];
    /** The seat of the first piece (the smith the Gazette names). */
    firstSeat: string | null;
  } {
    const counts = new Map<string, number>();
    const rows = this.floorRows(userId);
    const items: { id: string; baseId: string; rarity: GearRarity; itemLevel: number }[] = [];
    if (rows.length === 0) return { counts, brought: 0, worn: 0, items, firstSeat: null };
    let bag = bagItems(this.sql, userId);
    const target = new TeamTargets(this.sql, userId, team, this.deps.rng);
    let brought = 0;
    let worn = 0;
    for (const row of rows) {
      if (bag >= cap) break;
      const rarity = RARITIES[row.rarity] ?? 'common';
      let item: GearItem;
      let wearer: { id: string; slot: GearSlot } | null = null;
      if (row.blueprint_id !== null && gearBase(row.blueprint_id) !== undefined) {
        item = rollItem(this.deps.rng, {
          baseId: row.blueprint_id,
          rarity,
          itemLevel: row.item_level,
        });
        // V-FORGE-9: every piece of a blueprint may add a well-thumbed mark (quality raises the chance of better rarity).
        if (chance(this.deps.rng, Math.round(VALLEY_RULES.forge.markChance * 10_000), 10_000)) {
          addMark(this.sql, userId, row.blueprint_id);
        }
      } else {
        const pick = target.pick(row.element, row.item_level);
        const base = pick?.base ?? teamBase(this.deps.rng, row.element, row.item_level);
        item = rollItem(this.deps.rng, { baseId: base.id, rarity, itemLevel: row.item_level });
        if (pick !== undefined && wearBlock(item, pick.wearer) === null) {
          wearer = { id: pick.wearer.id, slot: pick.slot };
        }
      }
      const id = insertItem(this.sql, userId, item, {
        source: 'craft',
        now: to,
        origin: { kind: 'craft' },
      });
      bag += 1;
      brought += 1;
      items.push({ id, baseId: item.baseId, rarity, itemLevel: row.item_level });
      if (wearer !== null) {
        const displaced = target.take(wearer.id, wearer.slot, row.item_level);
        if (displaced !== null) setEquipped(this.sql, displaced, null);
        setEquipped(this.sql, id, wearer.id);
        bag -= displaced === null ? 1 : 0;
        worn += 1;
      }
      this.sql.exec('DELETE FROM forge_floor WHERE piece_id = ?', row.piece_id);
      counts.set(row.seat_id, (counts.get(row.seat_id) ?? 0) + 1);
    }
    return {
      counts,
      brought,
      worn,
      items,
      firstSeat: items.length === 0 ? null : (rows[0]?.seat_id ?? null),
    };
  }
}

/** A base for a team piece with nobody to wear it: any base of its element the item level allows. */
function teamBase(rng: Rng, element: number, itemLevel: number): GearBase {
  const el = VALLEY_ELEMENTS[element] ?? null;
  return dropBase(rng, el, itemLevel);
}

/** The slots of a team that a piece of an element may dress, weakest first (empty counts as level 0). */
class TeamTargets {
  private readonly levels = new Map<
    string,
    Map<GearSlot, { level: number; itemId: string | null }>
  >();

  constructor(
    sql: SqlStorage,
    userId: string,
    private readonly team: readonly TeamMember[],
    private readonly rng: Rng,
  ) {
    const worn = equippedByCreature(sql, userId);
    for (const c of team) {
      const slots = new Map<GearSlot, { level: number; itemId: string | null }>();
      for (const slot of GEAR_SLOTS) {
        const row = worn.get(c.id)?.[slot];
        slots.set(slot, { level: row?.item_level ?? 0, itemId: row?.id ?? null });
      }
      this.levels.set(c.id, slots);
    }
  }

  /** The weakest slot below the fire's limit among the creatures of the element, and a base of that slot for it. */
  pick(
    element: number,
    itemLevel: number,
  ):
    | {
        wearer: { id: string; level: number; role: ReturnType<typeof speciesOf>['role'] };
        slot: GearSlot;
        base: GearBase;
      }
    | undefined {
    const limit = weakLimit(VALLEY_RULES, itemLevel);
    let best: { member: TeamMember; slot: GearSlot; level: number } | undefined;
    for (const member of this.team) {
      if (VALLEY_ELEMENTS.indexOf(speciesOf(member.species).element) !== element) continue;
      for (const slot of GEAR_SLOTS) {
        if (!slotOpenFor(member.level, slot)) continue;
        const level = this.levels.get(member.id)?.get(slot)?.level ?? 0;
        if (level < limit && level < itemLevel && (best === undefined || level < best.level)) {
          best = { member, slot, level };
        }
      }
    }
    if (best === undefined) return undefined;
    const el = VALLEY_ELEMENTS[element] as Element;
    const options = eligibleBases(best.slot, el, itemLevel, false, true);
    const base = options[options.length > 1 ? int(this.rng, options.length) : 0];
    if (base === undefined) return undefined;
    return {
      wearer: {
        id: best.member.id,
        level: best.member.level,
        role: speciesOf(best.member.species).role,
      },
      slot: best.slot,
      base,
    };
  }

  /** Marks the slot as dressed with an item of `itemLevel`; returns the id of the item it held (to come off). */
  take(creatureId: string, slot: GearSlot, itemLevel: number): string | null {
    const slots = this.levels.get(creatureId);
    const held = slots?.get(slot);
    slots?.set(slot, { level: itemLevel, itemId: null });
    return held?.itemId ?? null;
  }
}

/** What an order needs of the shelf and what it waits on now (for the view). */
export function orderView(
  order: OrderRow,
  shelf: { scrap: number; shards: readonly number[]; essence: number },
  teamElement: number,
): {
  needs: ReturnType<typeof orderNeeds>;
  waiting: 'scrap' | 'shard' | 'essence' | null;
} {
  const rules = VALLEY_RULES;
  const needs = orderNeeds(
    rules,
    {
      id: order.order_id,
      blueprint: order.blueprint_id,
      element: order.element,
      count: order.count,
      made: order.made,
      reach: asReach(order.reach),
      forTeam: order.for_team === 1,
      stepUp: 0,
    },
    teamElement,
  );
  const pile = needs.element >= 0 ? (shelf.shards[needs.element] ?? 0) : Math.max(...shelf.shards);
  const waiting =
    shelf.scrap < needs.scrap
      ? ('scrap' as const)
      : pile < needs.shard
        ? ('shard' as const)
        : shelf.essence < needs.essence
          ? ('essence' as const)
          : null;
  return { needs, waiting };
}
