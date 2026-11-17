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
 * - `collect` brings the floors home: the commons come best first (item level), each is rolled now with live randomness
 *   (the base from its blueprint, the lines from its rarity and item level) and goes into the bag until the bag holds its 200; the rest
 *   stays on the floor (the lead's call: a full bag holds pieces on the floor, a full floor pauses the anvil, F-1). A piece "for my team"
 *   is worn at once by the creature of its element whose slot is empty or weakest, and goes to the bag when there is none.
 *   Since the sealed crate (V-FORGE-5, 2026-11-15) only commons come home this way; rare and epic pieces move, unrolled, to
 *   `forge_crate` (at most `crateCap`; past it the oldest come home on their own) and `openCrate` rolls them when the player opens it.
 */
import {
  GEAR_SLOTS,
  MAX_BACK_SMITHS,
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
  patchworkBase,
  patchworkBlueprint,
  patchworkRolledLines,
  rollItem,
  shardOf,
  tagElement,
  weakLimit,
  wearBlock,
  type AnvilWait,
  type ValleyBackSmith,
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
  made_at: number;
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

/** The most seats the background smiths' read takes (two to an owner, four smiths shown). */
const BACK_SEAT_READ = 12;

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

  /**
   * Other players' smiths at their anvils, for the workshop's background: through the `(place, kind, user_id)` index, at most
   * `BACK_SEAT_READ` seats read, two to an owner and `MAX_BACK_SMITHS` in all. Each one's creature and owner's name by key. Never the
   * caller's.
   */
  backSmiths(userId: string): ValleyBackSmith[] {
    const seats = this.sql
      .exec<{
        user_id: string;
        creature_id: string;
        piece_active: number;
        wait_reason: string | null;
      }>(
        `SELECT user_id, creature_id, piece_active, wait_reason FROM valley_seats
         WHERE place = 'forge' AND kind = 'anvil' AND user_id != ? AND creature_id IS NOT NULL
         ORDER BY user_id LIMIT ?`,
        userId,
        BACK_SEAT_READ,
      )
      .toArray();
    const perOwner = new Map<string, number>();
    const out: ValleyBackSmith[] = [];
    for (const seat of seats) {
      if (out.length >= MAX_BACK_SMITHS) break;
      const n = perOwner.get(seat.user_id) ?? 0;
      if (n >= 2) continue;
      const creature = this.sql
        .exec<{
          id: string;
          species: string;
          level: number;
          shiny: number;
          nickname: string | null;
        }>(
          'SELECT id, species, level, shiny, nickname FROM creatures WHERE id = ?',
          seat.creature_id,
        )
        .toArray()[0];
      const owner = this.sql
        .exec<{ display_name: string }>(
          'SELECT display_name FROM players WHERE user_id = ?',
          seat.user_id,
        )
        .toArray()[0];
      if (creature === undefined || owner === undefined || owner.display_name === '') continue;
      perOwner.set(seat.user_id, n + 1);
      out.push({
        owner: owner.display_name.slice(0, 40),
        creature: {
          id: creature.id,
          species: creature.species,
          shiny: creature.shiny === 1,
          level: creature.level,
          name:
            creature.nickname === null || creature.nickname === ''
              ? null
              : creature.nickname.slice(0, 40),
        },
        working: seat.piece_active === 1 && seat.wait_reason === null,
      });
    }
    return out;
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
  weakByElement(userId: string, team: readonly TeamMember[], fireLevel: number): number[] {
    const weak = new Array<number>(ELEMENT_COUNT).fill(0);
    const worn = equippedByCreature(this.sql, userId);
    const limit = weakLimit(VALLEY_RULES, fireLevel);
    for (const c of team) {
      const e = VALLEY_ELEMENTS.indexOf(speciesOf(c.species).element);
      if (e < 0) continue;
      for (const slot of GEAR_SLOTS) {
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
    /** The fire's level: the item level of every piece the anvils finish (V-FORGE-7, V-COM-13). */
    fireLevel: number,
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
      weak = this.weakByElement(userId, team, fireLevel);
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
        fireLevel,
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
        `SELECT piece_id, seat_id, blueprint_id, for_team, element, rarity, item_level, made_at FROM forge_floor
         WHERE user_id = ? ORDER BY rarity DESC, item_level DESC, made_at, piece_id`,
        userId,
      )
      .toArray();
  }

  /** The sealed pieces in the player's crate, oldest first. */
  crateRows(userId: string): FloorRow[] {
    return this.sql
      .exec<FloorRow>(
        `SELECT piece_id, seat_id, blueprint_id, for_team, element, rarity, item_level, made_at FROM forge_crate
         WHERE user_id = ? ORDER BY made_at, piece_id`,
        userId,
      )
      .toArray();
  }

  /** The crate's count and best rarity as the player's row holds them (nothing is read from the crate itself). */
  crateOf(userId: string): CrateState {
    const row = this.sql
      .exec<{ crate_count: number; crate_best: number }>(
        'SELECT crate_count, crate_best FROM valley_players WHERE user_id = ?',
        userId,
      )
      .toArray()[0];
    return { count: row?.crate_count ?? 0, best: asRarity(row?.crate_best ?? 0) };
  }

  /** Writes the crate's count and best rarity to the player's row (one read of at most `crateCap` rows, only when the crate changed). */
  private syncCrate(userId: string): CrateState {
    const row = this.sql
      .exec<{ n: number; best: number | null }>(
        'SELECT COUNT(*) AS n, MAX(rarity) AS best FROM forge_crate WHERE user_id = ?',
        userId,
      )
      .one();
    const best = row.n === 0 ? 0 : asRarity(row.best ?? 0);
    this.sql.exec(
      'UPDATE valley_players SET crate_count = ?, crate_best = ? WHERE user_id = ?',
      row.n,
      best,
      userId,
    );
    return { count: row.n, best };
  }

  /**
   * Rolls one piece now with the live dice (the base from its blueprint, a patchwork base, or a base for the team; the lines from its
   * rarity and item level), puts it in the bag and, for a "for my team" piece with a creature to dress, on that creature. The caller
   * has checked the bag has room and deletes the piece's row. `displaced` says an item came off the creature (it went to the bag).
   */
  private rollHome(
    userId: string,
    to: number,
    row: FloorRow,
    target: TeamTargets,
  ): { id: string; item: GearItem; rarity: GearRarity; wornBy: string | null; displaced: boolean } {
    const rarity = RARITIES[row.rarity] ?? 'common';
    let item: GearItem;
    let wearer: { id: string; slot: GearSlot } | null = null;
    const patch = row.blueprint_id === null ? undefined : patchworkBlueprint(row.blueprint_id);
    if (patch !== undefined) {
      // V-FORGE-12: a patchwork piece is the plainest base of its slot in the shard's element, with fewer rolled lines. No mark: it
      // has no quality (it is no blueprint the player found).
      const base = patchworkBase(patch.slot, VALLEY_ELEMENTS[row.element] ?? null);
      item = rollItem(this.deps.rng, {
        baseId: base.id,
        rarity,
        itemLevel: row.item_level,
        lines: patchworkRolledLines(rarity),
      });
    } else if (row.blueprint_id !== null && gearBase(row.blueprint_id) !== undefined) {
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
      if (pick !== undefined && wearBlock(item, pick.wearer, true) === null) {
        wearer = { id: pick.wearer.id, slot: pick.slot };
      }
    }
    const id = insertItem(this.sql, userId, item, {
      source: 'craft',
      now: to,
      origin: { kind: 'craft' },
    });
    let displaced = false;
    if (wearer !== null) {
      const off = target.take(wearer.id, wearer.slot, row.item_level);
      if (off !== null) {
        setEquipped(this.sql, off, null);
        displaced = true;
      }
      setEquipped(this.sql, id, wearer.id);
    }
    return { id, item, rarity, wornBy: wearer?.id ?? null, displaced };
  }

  /**
   * Brings the floors home (V-FORGE-5). Commons, best first, are rolled and go into the bag until the bag is full; the rest stays on the
   * floor. Rare and epic pieces (`crateMinRarity`) do not come home: they move, unrolled, to the sealed crate, which holds at most
   * `crateCap`. When it is full the oldest sealed piece comes home on its own to make room (if the bag has room; otherwise the newer
   * piece stays on the floor, so the crate never grows past its cap). Returns the seats' new floor counts (by seat id), how many pieces
   * came home and how many were worn at once, and the crate as it now stands.
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
    /** The pieces that came home, in the order they did (for the Gazette; a sealed piece pushed out of a full crate is among them). */
    items: { id: string; baseId: string; rarity: GearRarity; itemLevel: number }[];
    /** The seat of the first piece (the smith the Gazette names). */
    firstSeat: string | null;
    /** Pieces that moved to the crate, and the crate afterwards. */
    sealed: number;
    crate: CrateState;
  } {
    const counts = new Map<string, number>();
    const items: { id: string; baseId: string; rarity: GearRarity; itemLevel: number }[] = [];
    const rows = this.floorRows(userId);
    if (rows.length === 0) {
      return {
        counts,
        brought: 0,
        worn: 0,
        items,
        firstSeat: null,
        sealed: 0,
        crate: this.crateOf(userId),
      };
    }
    let bag = bagItems(this.sql, userId);
    const target = new TeamTargets(this.sql, userId, team, this.deps.rng);
    let brought = 0;
    let worn = 0;
    let firstSeat: string | null = null;
    let crateChanged = false;
    const home = (row: FloorRow, from: 'forge_floor' | 'forge_crate'): void => {
      const rolled = this.rollHome(userId, to, row, target);
      brought += 1;
      // In the bag unless worn at once (a piece it displaced goes there instead).
      bag += rolled.wornBy === null || rolled.displaced ? 1 : 0;
      if (rolled.wornBy !== null) worn += 1;
      items.push({
        id: rolled.id,
        baseId: rolled.item.baseId,
        rarity: rolled.rarity,
        itemLevel: row.item_level,
      });
      firstSeat ??= row.seat_id;
      this.sql.exec(`DELETE FROM ${from} WHERE piece_id = ?`, row.piece_id);
    };
    const minRarity = VALLEY_RULES.forge.crateMinRarity;
    const waiting = this.crateRows(userId);
    let sealed = 0;
    // The sealed ones go to the crate oldest first, so the oldest is the first to be pushed out.
    const toSeal = rows
      .filter((r) => r.rarity >= minRarity)
      .sort((a, b) => a.made_at - b.made_at || a.piece_id.localeCompare(b.piece_id, 'en'));
    for (const row of toSeal) {
      if (waiting.length >= VALLEY_RULES.forge.crateCap) {
        const oldest = waiting[0];
        // Nowhere to put it: the bag is full, so the piece stays on the floor.
        if (oldest === undefined || bag >= cap) continue;
        waiting.shift();
        home(oldest, 'forge_crate');
      }
      this.sql.exec(
        `INSERT INTO forge_crate (piece_id, user_id, seat_id, blueprint_id, for_team, element, rarity, item_level, made_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.piece_id,
        userId,
        row.seat_id,
        row.blueprint_id,
        row.for_team,
        row.element,
        row.rarity,
        row.item_level,
        row.made_at,
      );
      this.sql.exec('DELETE FROM forge_floor WHERE piece_id = ?', row.piece_id);
      waiting.push(row);
      sealed += 1;
      crateChanged = true;
      counts.set(row.seat_id, (counts.get(row.seat_id) ?? 0) + 1);
    }
    crateChanged ||= items.length > 0;
    for (const row of rows) {
      if (row.rarity >= minRarity) continue;
      if (bag >= cap) break;
      home(row, 'forge_floor');
      counts.set(row.seat_id, (counts.get(row.seat_id) ?? 0) + 1);
    }
    return {
      counts,
      brought,
      worn,
      items,
      firstSeat,
      sealed,
      crate: crateChanged ? this.syncCrate(userId) : this.crateOf(userId),
    };
  }

  /**
   * Opens the crate (V-FORGE-5): each sealed piece, best first (rarity, then item level), is rolled now with the live dice and goes to
   * the bag, or is worn at once ("for my team": the creature of its element with the empty or weakest slot). A full bag keeps the rest
   * sealed. Returns the pieces in reveal order (worst first, best last) with who wore each, and how many stay sealed.
   */
  openCrate(
    userId: string,
    to: number,
    team: readonly TeamMember[],
    cap: number,
  ): { opened: OpenedPiece[]; sealed: number; bagFull: boolean; crate: CrateState } {
    const rows = this.crateRows(userId).sort(
      (a, b) =>
        b.rarity - a.rarity ||
        b.item_level - a.item_level ||
        a.made_at - b.made_at ||
        a.piece_id.localeCompare(b.piece_id, 'en'),
    );
    if (rows.length === 0) {
      return { opened: [], sealed: 0, bagFull: false, crate: { count: 0, best: 0 } };
    }
    let bag = bagItems(this.sql, userId);
    const target = new TeamTargets(this.sql, userId, team, this.deps.rng);
    const makers = new Map<string, string | null>();
    const opened: OpenedPiece[] = [];
    for (const row of rows) {
      if (bag >= cap) break;
      const rolled = this.rollHome(userId, to, row, target);
      bag += rolled.wornBy === null || rolled.displaced ? 1 : 0;
      this.sql.exec('DELETE FROM forge_crate WHERE piece_id = ?', row.piece_id);
      if (!makers.has(row.seat_id)) {
        makers.set(
          row.seat_id,
          this.sql
            .exec<{ creature_id: string | null }>(
              'SELECT creature_id FROM valley_seats WHERE seat_id = ?',
              row.seat_id,
            )
            .toArray()[0]?.creature_id ?? null,
        );
      }
      opened.push({
        itemId: rolled.id,
        rarity: rolled.rarity,
        itemLevel: row.item_level,
        wornBy: rolled.wornBy,
        madeBy: makers.get(row.seat_id) ?? null,
      });
    }
    const crate = this.syncCrate(userId);
    // Worst first, best last: the reveal builds up.
    opened.reverse();
    return { opened, sealed: crate.count, bagFull: crate.count > 0, crate };
  }
}

/** What the player's row holds about the sealed crate: how many pieces and the best rarity (0 common/none, 1 rare, 2 epic). */
export interface CrateState {
  count: number;
  best: 0 | 1 | 2;
}

/** A piece the crate gave up, for the answer: its item (by id), who wore it at once, and the creature that made it. */
export interface OpenedPiece {
  itemId: string;
  rarity: GearRarity;
  itemLevel: number;
  wornBy: string | null;
  madeBy: string | null;
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
