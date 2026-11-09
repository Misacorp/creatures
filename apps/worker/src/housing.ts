/**
 * Player housing (`docs/design/housing.md` section 3): a house that grows, fills itself and is visited. The server is authoritative: the
 * client sends intents (build, make, place, visit) and the identity is always the session's user. Every spend is a keyed action in one
 * transaction (`runKeyed`, `spend` and `debitParts`, as `valley-gifts.ts` does), and a refused spend throws a `GameError` that rolls the
 * whole transaction back. The house gives no power, ever: nothing here changes a fight, a trip, a job, a price or an experience rate.
 *
 * Reads are small and only on open: nothing here runs on `/api/state`, an alarm tick or the object's start. A house loads when it is
 * opened; a visit reads one house.
 */
import {
  HOUSING_RULES,
  RULES,
  ELEMENTS,
  applyPayment,
  buildable,
  canPlace,
  completeSets,
  housing as shippedHousing,
  houseGrid,
  knownBlueprints,
  partPaidLines,
  partRemaining,
  piecePrice,
  skinPrice,
  type CatalogueView,
  type DisplayView,
  type Element,
  type FormDef,
  type HouseDrop,
  type HouseListView,
  type HousePay,
  type HouseView,
  type HousemateView,
  type HousingContent,
  type OwnHouseView,
  type PaidLines,
  type PartDef,
  type PartProgressView,
  type PartKind,
  type PartsBundle,
  type PriceLine,
  type RoomKindDef,
  type RoomView,
} from '@creatures/game';
import { busyReason } from './gear-access';
import { debitParts, getParts } from './gear-store';
import { DISPLAY_PROVIDERS } from './housing-displays';
import { awardFeats, houseReads, type HouseReads } from './housing-feats';
import type { BuildBody, CraftBody, HousemateBody, PlaceBody, SkinBody } from './housing-schemas';
import {
  addGift,
  addItem,
  addStamp,
  claimMail,
  clearFresh,
  getHouse,
  getItem,
  getPart,
  giftGivenToday,
  giftsReceivedToday,
  grantOnce,
  guestbookOf,
  insertHouse,
  insertRoom,
  listItems,
  listItemsOf,
  listParts,
  listRooms,
  openMail,
  parsePaid,
  parseSpots,
  playerNames,
  recentDrops,
  recentHouses,
  setExterior,
  setRoomSkins,
  setRoomSpots,
  stampedHousesToday,
  stampedToday,
  takeItem,
  touchHouse,
  upsertPart,
  type HouseRow,
  type ItemRow,
  type RoomRow,
  type Spots,
} from './housing-store';
import { runKeyed, settleSpend } from './keyed-action';
import { credit, getBalance, spend, type LedgerStorage } from './ledger';
import { GameError, atomically, type Outcome } from './outcome';
import { gameDay } from './time';

export interface HousingDeps {
  readonly storage: LedgerStorage;
  readonly now: () => number;
  readonly timezone: () => string;
  /** The week's raid boss id, or null (the mantel's empty plaque). */
  readonly currentBoss: () => string | null;
  /** Test seam: the housing content (default: the shipped content). */
  readonly content?: HousingContent;
}

/** The ledger purposes and source of the house's Acorns (at most 32 characters). */
export const HOUSE_BUILD_PURPOSE = 'house_build';
export const HOUSE_CRAFT_PURPOSE = 'house_craft';
export const HOUSE_GIFT_SOURCE = 'house_gift';

/** A house as loaded for a view: its rows, parsed. */
interface Loaded {
  house: HouseRow;
  built: Set<string>;
  parts: ReturnType<typeof listParts>;
  /** Built rooms by id, with their placed pieces. */
  rooms: Map<string, { row: RoomRow; spots: Spots }>;
  items: ItemRow[];
  /** Copies owned per piece. */
  owned: Map<string, number>;
}

type AnswerOf<T> = Outcome<T>;

const sum = (values: Record<string, number>): number =>
  Object.values(values).reduce((a, b) => a + b, 0);

/** The shard part kind of an element (`tide-shard`). */
const shardKind = (element: Element): PartKind => `${element}-shard` as PartKind;

function emptyShards(): Record<Element, number> {
  return Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
}

/** The canonical text of a payment, so a retried request with the same content has the same fingerprint. */
function payFingerprint(partId: string, pay: HousePay): string {
  const shards = Object.entries(pay.shards ?? {})
    .filter(([, n]) => n !== undefined && n > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const materials = Object.entries(pay.materials ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([partId, pay.bait ?? 0, pay.scrap ?? 0, shards, materials]);
}

export class Housing {
  private readonly content: HousingContent;
  private readonly partById: Map<string, PartDef>;
  private readonly kindById: Map<string, RoomKindDef>;
  private readonly formOfPiece: Map<string, FormDef>;
  private readonly skinById: Map<string, HousingContent['skins'][number]>;
  private readonly materialById: Map<string, HousingContent['materials'][number]>;
  private readonly stampIds: ReadonlySet<string>;

  constructor(private readonly deps: HousingDeps) {
    const content = deps.content ?? shippedHousing;
    this.content = content;
    this.partById = new Map(content.parts.map((p) => [p.id, p]));
    this.kindById = new Map(content.rooms.map((r) => [r.id, r]));
    const forms = new Map(content.forms.map((f) => [f.id, f]));
    this.formOfPiece = new Map(
      content.pieces.flatMap((p) => {
        const form = forms.get(p.form);
        return form === undefined ? [] : [[p.id, form] as const];
      }),
    );
    this.skinById = new Map(content.skins.map((s) => [s.id, s]));
    this.materialById = new Map(content.materials.map((m) => [m.id, m]));
    this.stampIds = new Set(content.stamps.map((s) => s.id));
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private day(): string {
    return gameDay(this.deps.now(), this.deps.timezone(), RULES.daily.reset);
  }

  // --- The house, made on first sight ---

  /**
   * Makes the caller's house if it does not exist: the hut (the core's first part, built), its Hearth with the starter layout, one of
   * each piece of a tier 0 set, the starter and ground skins and the starter stamp. One transaction (the caller's).
   */
  ensure(userId: string): HouseRow {
    const existing = getHouse(this.sql, userId);
    if (existing !== null) return existing;
    const { content, sql } = this;
    const now = this.deps.now();
    insertHouse(sql, userId, content.starter.roof, content.starter.walls, now);
    const hut = content.parts.find((p) => p.price.length === 0 && p.requires.length === 0);
    if (hut !== undefined) {
      upsertPart(sql, userId, hut.id, {}, now);
      for (const room of hut.rooms) {
        const kind = this.kindById.get(room.kind);
        if (kind === undefined) continue;
        // The starter layout belongs to the room that has all of its spots (the Hearth).
        const layout: Spots = {};
        const fits = Object.keys(content.starter.layout).every((spot) =>
          kind.spots.some((s) => s.id === spot),
        );
        if (fits) {
          for (const [spot, piece] of Object.entries(content.starter.layout)) {
            layout[spot] = { p: piece };
          }
        }
        insertRoom(sql, userId, `${hut.id}:${room.key}`, kind.wall, kind.floor, layout);
      }
    }
    const tier0 = new Set(content.sets.filter((s) => s.tier === 0).map((s) => s.id));
    for (const piece of content.pieces) {
      if (piece.set !== null && tier0.has(piece.set))
        addItem(sql, userId, 'piece', piece.id, 1, 0, now);
    }
    for (const skin of content.skins) {
      if (skin.unlock.kind === 'starter' || skin.kind === 'ground') {
        grantOnce(sql, userId, 'skin', skin.id, now);
      }
    }
    for (const stamp of content.stamps) {
      if (stamp.unlock.kind === 'starter') grantOnce(sql, userId, 'stamp', stamp.id, now);
    }
    const created = getHouse(sql, userId);
    if (created === null) throw new Error('house was not created');
    return created;
  }

  // --- Loading and views ---

  /** Loads a house: the caller's own with every item row, a visited one with its pieces only. */
  private load(userId: string, house: HouseRow, all: boolean): Loaded {
    const parts = listParts(this.sql, userId);
    const built = new Set(parts.filter((p) => p.built_at !== null).map((p) => p.part_id));
    const rooms = new Map<string, { row: RoomRow; spots: Spots }>();
    for (const row of listRooms(this.sql, userId)) {
      rooms.set(row.room_id, { row, spots: parseSpots(row.spots_json) });
    }
    const items = all ? listItems(this.sql, userId) : listItemsOf(this.sql, userId, 'piece');
    const owned = new Map(
      items.filter((i) => i.kind === 'piece' && i.count > 0).map((i) => [i.item_id, i.count]),
    );
    return { house, built, parts, rooms, items, owned };
  }

  private reload(userId: string): Loaded {
    return this.load(userId, this.ensure(userId), true);
  }

  /** The house with its rooms and pieces only (what a placement, a skin or a housemate needs), not every item row. */
  private loadLight(userId: string): Loaded {
    return this.load(userId, this.ensure(userId), false);
  }

  private placedCounts(rooms: Loaded['rooms']): Map<string, number> {
    const placed = new Map<string, number>();
    for (const { spots } of rooms.values()) {
      for (const { p } of Object.values(spots)) placed.set(p, (placed.get(p) ?? 0) + 1);
    }
    return placed;
  }

  private freeCounts(loaded: Loaded): Record<string, number> {
    const placed = this.placedCounts(loaded.rooms);
    const free: Record<string, number> = {};
    for (const [id, count] of loaded.owned) free[id] = Math.max(0, count - (placed.get(id) ?? 0));
    return free;
  }

  /** The ids of the parts a player has built, in build-list order (one read of the player's part rows). */
  private builtPartsOf(userId: string): string[] {
    const built = new Set(
      listParts(this.sql, userId)
        .filter((r) => r.built_at !== null)
        .map((r) => r.part_id),
    );
    return this.content.parts.filter((p) => built.has(p.id)).map((p) => p.id);
  }

  private roomKind(roomId: string): RoomKindDef | undefined {
    const [partId, key] = roomId.split(':');
    const part = partId === undefined ? undefined : this.partById.get(partId);
    const room = part?.rooms.find((r) => r.key === key);
    return room === undefined ? undefined : this.kindById.get(room.kind);
  }

  private roomView(roomId: string, entry: { row: RoomRow; spots: Spots }): RoomView | null {
    const kind = this.roomKind(roomId);
    if (kind === undefined) return null;
    const spots: Record<string, string | null> = {};
    for (const spot of kind.spots) spots[spot.id] = entry.spots[spot.id]?.p ?? null;
    return {
      id: roomId,
      kind: kind.id,
      wall: entry.row.wall,
      floor: entry.row.floor,
      spots,
    };
  }

  /** Whether a creature is away: on a trip or a job, at a valley seat, or in an open dungeon run of today. */
  private housemateViews(userId: string, loaded: Loaded, clean: boolean): HousemateView[] {
    const out: HousemateView[] = [];
    const today = this.day();
    let run: { day: string; active: boolean; state: string } | null | undefined;
    const inOpenRun = (creatureId: string): boolean => {
      if (run === undefined) {
        const row = this.sql
          .exec<{ day: string; status: string; state_json: string | null }>(
            'SELECT day, status, state_json FROM dungeon_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            userId,
          )
          .toArray()[0];
        run =
          row === undefined
            ? null
            : { day: row.day, active: row.status === 'active', state: row.state_json ?? '' };
      }
      return run !== null && run.active && run.day === today && run.state.includes(creatureId);
    };
    for (const [roomId, entry] of [...loaded.rooms].sort(([a], [b]) => a.localeCompare(b))) {
      for (const [spotId, spot] of Object.entries(entry.spots).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        if (spot.m === undefined) continue;
        const row = this.sql
          .exec<{
            id: string;
            species: string;
            shiny: number;
            nickname: string | null;
            level: number;
            away_expedition_id: string | null;
          }>(
            'SELECT id, species, shiny, nickname, level, away_expedition_id FROM creatures WHERE id = ? AND user_id = ?',
            spot.m,
            userId,
          )
          .toArray()[0];
        if (row === undefined) {
          // Released or fused away: the bed is just made, and the read cleans the spot.
          if (clean) {
            delete spot.m;
            setRoomSpots(this.sql, userId, roomId, entry.spots);
          }
          continue;
        }
        const seated =
          this.sql.exec('SELECT 1 FROM valley_seats WHERE creature_id = ?', row.id).toArray()
            .length > 0;
        const home = busyReason(this.sql, row) === null && !seated && !inOpenRun(row.id);
        out.push({
          roomId,
          spotId,
          home,
          creature: {
            id: row.id,
            species: row.species,
            shiny: row.shiny === 1,
            nickname: row.nickname,
            level: row.level,
          },
        });
      }
    }
    return out;
  }

  private guestbookView(ownerId: string): HouseView['guestbook'] {
    const rows = guestbookOf(this.sql, ownerId, HOUSING_RULES.guestbookKeep);
    const names = playerNames(
      this.sql,
      rows.map((r) => r.visitor_id),
    );
    return rows.map((r) => ({
      visitor: { userId: r.visitor_id, name: names.get(r.visitor_id) ?? 'Someone' },
      stampId: r.stamp_id,
      at: r.at,
    }));
  }

  private houseView(userId: string, loaded: Loaded, reads: HouseReads, clean: boolean): HouseView {
    const grid = houseGrid(this.content, loaded.built);
    const setsComplete = completeSets(this.content, loaded.owned);
    const ctx = {
      reads,
      currentBoss: this.deps.currentBoss,
      setsComplete,
    };
    const rooms: RoomView[] = [];
    const displays: DisplayView[] = [];
    for (const g of grid) {
      const entry = loaded.rooms.get(g.roomId);
      if (entry === undefined) continue;
      const view = this.roomView(g.roomId, entry);
      if (view === null) continue;
      rooms.push(view);
      const kind = this.kindById.get(g.kind);
      for (const spot of kind?.spots ?? []) {
        if (spot.type !== 'display' || spot.display === undefined) continue;
        displays.push({
          roomId: g.roomId,
          spotId: spot.id,
          ...DISPLAY_PROVIDERS[spot.display](ctx),
        });
      }
    }
    const names = playerNames(this.sql, [userId]);
    return {
      owner: { userId, name: names.get(userId) ?? 'Someone' },
      built: this.content.parts.filter((p) => loaded.built.has(p.id)).map((p) => p.id),
      exterior: { roof: loaded.house.roof, walls: loaded.house.walls },
      rooms,
      displays,
      housemates: this.housemateViews(userId, loaded, clean),
      guestbook: this.guestbookView(userId),
      setsComplete,
    };
  }

  private partProgress(part: PartDef, paid: PaidLines): PartProgressView {
    return {
      partId: part.id,
      paid: partPaidLines(part, paid),
      remaining: partRemaining(part, paid),
    };
  }

  private ownView(userId: string, loaded: Loaded): OwnHouseView {
    const { sql } = this;
    const progress: PartProgressView[] = [];
    for (const row of loaded.parts) {
      const part = this.partById.get(row.part_id);
      if (part === undefined || row.built_at !== null) continue;
      progress.push(this.partProgress(part, parsePaid(row.paid_json)));
    }
    progress.sort(
      (a, b) =>
        (this.partById.get(a.partId)?.order ?? 0) - (this.partById.get(b.partId)?.order ?? 0),
    );
    const pieces: Record<string, number> = {};
    const skins: string[] = [];
    const stamps: string[] = [];
    const blueprints: string[] = [];
    const materials: Record<string, { have: number; fresh: number }> = {};
    for (const item of loaded.items) {
      switch (item.kind) {
        case 'piece':
          if (item.count > 0) pieces[item.item_id] = item.count;
          break;
        case 'skin':
          if (item.count > 0) skins.push(item.item_id);
          break;
        case 'stamp':
          if (item.count > 0) stamps.push(item.item_id);
          break;
        case 'blueprint':
          blueprints.push(item.item_id);
          break;
        case 'material':
          if (item.count > 0 || item.fresh > 0) {
            materials[item.item_id] = { have: item.count, fresh: Math.min(item.fresh, item.count) };
          }
          break;
      }
    }
    const held = getParts(sql, userId);
    const shards = emptyShards();
    for (const element of ELEMENTS) shards[element] = held[shardKind(element)];
    const mail = openMail(sql, userId);
    const givers = playerNames(
      this.sql,
      mail.slice(0, 64).map((m) => m.from_id),
    );
    const from: { userId: string; name: string }[] = [];
    for (const m of mail) {
      if (from.length >= 32) break;
      if (from.some((f) => f.userId === m.from_id)) continue;
      from.push({ userId: m.from_id, name: givers.get(m.from_id) ?? 'Someone' });
    }
    const recent: OwnHouseView['recent'] = [];
    for (const row of recentDrops(sql, userId, HOUSING_RULES.recentShown * 2)) {
      if (recent.length >= HOUSING_RULES.recentShown) break;
      const drop = JSON.parse(row.json) as HouseDrop;
      if (sum(drop.materials) === 0 && drop.blueprint === null && drop.stamp === null) continue;
      recent.push({
        at: row.at,
        materials: drop.materials,
        blueprint: drop.blueprint,
        stamp: drop.stamp,
      });
    }
    return {
      progress,
      buildable: buildable(this.content, loaded.built),
      items: { pieces, skins, stamps, blueprints },
      free: this.freeCounts(loaded),
      materials,
      purse: { bait: getBalance(sql, userId, 'bait'), scrap: held.scrap, shards },
      mailbox: { gifts: mail.length, acorns: mail.reduce((n, m) => n + m.amount, 0), from },
      recent,
    };
  }

  // --- Reads ---

  /**
   * The caller's own house, made on first sight. Also grants the feat stamps the player has earned (and the blueprints they teach) in the
   * same transaction.
   */
  own(userId: string): AnswerOf<{ house: HouseView; own: OwnHouseView }> {
    return atomically(this.deps.storage, () => this.ownAnswer(userId));
  }

  private ownAnswer(userId: string): { house: HouseView; own: OwnHouseView } {
    const loaded = this.reload(userId);
    const reads = houseReads(this.sql, userId);
    // The starter set is whole from the first minute: only the sets beyond it count as finished.
    const starterSets = new Set(this.content.sets.filter((x) => x.tier === 0).map((x) => x.id));
    const setsComplete = completeSets(this.content, loaded.owned).filter(
      (id) => !starterSets.has(id),
    ).length;
    awardFeats(
      this.sql,
      userId,
      this.deps.now(),
      this.content,
      reads,
      loaded.built,
      setsComplete,
      loaded.items,
    );
    return {
      house: this.houseView(userId, loaded, reads, true),
      own: this.ownView(userId, loaded),
    };
  }

  /** Another player's house, read-only. The caller's own id answers as `own` does, without the `own` part. */
  visit(viewerId: string, ownerId: string): AnswerOf<{ house: HouseView }> {
    return atomically(this.deps.storage, () => {
      if (ownerId === viewerId) return { house: this.ownAnswer(viewerId).house };
      const house = getHouse(this.sql, ownerId);
      if (house === null) throw new GameError(404, 'no_house');
      const loaded = this.load(ownerId, house, false);
      return { house: this.houseView(ownerId, loaded, houseReads(this.sql, ownerId), false) };
    });
  }

  /** The server's houses (at most 15, the most recently changed), by name, the caller's own left out. */
  list(userId: string): AnswerOf<HouseListView> {
    return atomically(this.deps.storage, () => {
      const day = this.day();
      const rows = recentHouses(this.sql, HOUSING_RULES.visitListMax + 1)
        .filter((h) => h.user_id !== userId)
        .slice(0, HOUSING_RULES.visitListMax);
      const names = playerNames(
        this.sql,
        rows.map((h) => h.user_id),
      );
      const stamped = stampedHousesToday(this.sql, userId, day);
      const giftedTo = giftGivenToday(this.sql, userId, day);
      const houses = rows.map((h) => ({
        userId: h.user_id,
        name: names.get(h.user_id) ?? 'Someone',
        built: this.builtPartsOf(h.user_id),
        updatedAt: h.updated_at,
        today: { gifted: giftedTo === h.user_id, stamped: stamped.has(h.user_id) },
      }));
      houses.sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
      return { houses, me: { giftLeft: giftedTo === null } };
    });
  }

  /** Everything that exists with what the caller owns and has placed (names, hints and sources are the client's content). */
  catalogue(userId: string): AnswerOf<CatalogueView> {
    return atomically(this.deps.storage, () => {
      const items = listItems(this.sql, userId);
      const parts = listParts(this.sql, userId);
      const built = new Set(parts.filter((p) => p.built_at !== null).map((p) => p.part_id));
      const rooms = new Map<string, { row: RoomRow; spots: Spots }>();
      for (const row of listRooms(this.sql, userId)) {
        rooms.set(row.room_id, { row, spots: parseSpots(row.spots_json) });
      }
      const placed = this.placedCounts(rooms);
      const of = (kind: ItemRow['kind']): Map<string, ItemRow> =>
        new Map(items.filter((i) => i.kind === kind).map((i) => [i.item_id, i]));
      const pieceRows = of('piece');
      const skinRows = of('skin');
      const stampRows = of('stamp');
      const materialRows = of('material');
      const learned = new Set(of('blueprint').keys());
      const known = knownBlueprints(this.content, learned, built);
      const owned = new Map([...pieceRows].map(([id, r]) => [id, r.count]));
      const complete = new Set(completeSets(this.content, owned));
      return {
        pieces: this.content.pieces.map((p) => ({
          id: p.id,
          owned: pieceRows.get(p.id)?.count ?? 0,
          placed: placed.get(p.id) ?? 0,
          known: known.has(p.id),
        })),
        skins: this.content.skins.map((s) => ({
          id: s.id,
          owned: (skinRows.get(s.id)?.count ?? 0) > 0,
          known: known.has(s.id),
        })),
        stamps: this.content.stamps.map((s) => ({
          id: s.id,
          owned: (stampRows.get(s.id)?.count ?? 0) > 0,
        })),
        materials: this.content.materials.map((m) => ({
          id: m.id,
          have: materialRows.get(m.id)?.count ?? 0,
        })),
        parts: this.content.parts.map((p) => ({ id: p.id, built: built.has(p.id) })),
        sets: this.content.sets.map((s) => ({ id: s.id, complete: complete.has(s.id) })),
      };
    });
  }

  // --- Building ---

  /** Pays into a part; the part is built the moment it is fully paid. */
  build(
    userId: string,
    body: BuildBody,
  ): AnswerOf<{ part: PartProgressView; built: boolean; house?: HouseView; own?: OwnHouseView }> {
    return atomically(this.deps.storage, () => {
      this.ensure(userId);
      const stored = runKeyed(
        this.sql,
        this.deps.now,
        {
          userId,
          key: body.idempotencyKey,
          kind: 'house_build',
          fingerprint: payFingerprint(body.partId, body.pay),
        },
        () => this.pay(userId, body),
      );
      if (!stored.built) return stored;
      const loaded = this.reload(userId);
      return {
        ...stored,
        house: this.houseView(userId, loaded, houseReads(this.sql, userId), true),
        own: this.ownView(userId, loaded),
      };
    });
  }

  private pay(userId: string, body: BuildBody): { part: PartProgressView; built: boolean } {
    const { sql, content } = this;
    const now = this.deps.now();
    const part = this.partById.get(body.partId);
    if (part === undefined) throw new GameError(404, 'not_found');
    const pay = body.pay;
    for (const id of Object.keys(pay.materials ?? {})) {
      if (!this.materialById.has(id)) throw new GameError(404, 'not_found');
    }
    const rows = listParts(sql, userId);
    const row = rows.find((r) => r.part_id === part.id);
    if (row !== undefined && row.built_at !== null) throw new GameError(409, 'already_built');
    const built = new Set(rows.filter((r) => r.built_at !== null).map((r) => r.part_id));
    if (!buildable(content, built).includes(part.id)) throw new GameError(409, 'part_locked');
    const paid = parsePaid(row?.paid_json ?? '{}');
    const parts = getParts(sql, userId);
    const shards: Partial<Record<Element, number>> = {};
    for (const element of ELEMENTS) shards[element] = parts[shardKind(element)];
    const materials: Record<string, number> = {};
    for (const id of Object.keys(pay.materials ?? {})) {
      materials[id] = getItem(sql, userId, 'material', id)?.count ?? 0;
    }
    const held = { bait: getBalance(sql, userId, 'bait'), scrap: parts.scrap, shards, materials };
    const result = applyPayment(part, paid, pay, held, content);
    const { take } = result;
    if (take.bait + take.scrap + sum(take.materials) + sum(take.shards) === 0) {
      throw new GameError(409, this.refusal(part, paid, pay));
    }
    const debits = (): true => {
      const bundle: PartsBundle = {};
      if (take.scrap > 0) bundle.scrap = take.scrap;
      for (const element of ELEMENTS) {
        const n = take.shards[element] ?? 0;
        if (n > 0) bundle[shardKind(element)] = n;
      }
      if (!debitParts(sql, userId, bundle)) throw new GameError(409, 'insufficient_parts');
      for (const [id, n] of Object.entries(take.materials)) {
        if (!takeItem(sql, userId, 'material', id, n)) {
          throw new GameError(409, 'insufficient_materials');
        }
      }
      return true;
    };
    if (take.bait > 0) {
      settleSpend(
        spend(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: take.bait,
            purpose: HOUSE_BUILD_PURPOSE,
            idempotencyKey: `house:${body.idempotencyKey}`,
            apply: debits,
          },
          now,
        ),
      );
    } else {
      debits();
    }
    upsertPart(sql, userId, part.id, result.paid, result.complete ? now : null);
    if (result.complete) this.finishPart(userId, part, now);
    touchHouse(sql, userId, now);
    return { part: this.partProgress(part, result.paid), built: result.complete };
  }

  /** A part is built: its rooms exist (bare) and the blueprints it teaches are learned. The part's own row is the caller's to write. */
  finishPart(userId: string, part: PartDef, now: number): void {
    for (const room of part.rooms) {
      const kind = this.kindById.get(room.kind);
      if (kind !== undefined) {
        insertRoom(this.sql, userId, `${part.id}:${room.key}`, kind.wall, kind.floor, {});
      }
    }
    for (const id of part.unlocks) grantOnce(this.sql, userId, 'blueprint', id, now);
  }

  /** Why nothing could be paid: the first still-owed line the offer named and the player could not cover, else "nothing to pay". */
  private refusal(part: PartDef, paid: PaidLines, pay: HousePay): string {
    for (const line of partRemaining(part, paid)) {
      switch (line.kind) {
        case 'bait':
          if ((pay.bait ?? 0) > 0) return 'insufficient_funds';
          break;
        case 'scrap':
          if ((pay.scrap ?? 0) > 0) return 'insufficient_parts';
          break;
        case 'shard':
          if ((pay.shards?.[line.element] ?? 0) > 0) return 'insufficient_parts';
          break;
        case 'material':
          if ((pay.materials?.[line.id] ?? 0) > 0) return 'insufficient_materials';
          break;
        case 'family':
          for (const [id, n] of Object.entries(pay.materials ?? {})) {
            if (n > 0 && this.materialById.get(id)?.family === line.family) {
              return 'insufficient_materials';
            }
          }
          break;
      }
    }
    return 'nothing_to_pay';
  }

  // --- The workbench ---

  /** Makes a piece (one more copy) or a skin from a known blueprint, at once: the materials, Acorns and scrap are taken in one transaction. */
  craft(
    userId: string,
    body: CraftBody,
  ): AnswerOf<{ itemId: string; count: number; own: OwnHouseView }> {
    return atomically(this.deps.storage, () => {
      this.ensure(userId);
      const stored = runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: body.idempotencyKey, kind: 'house_craft', fingerprint: body.itemId },
        () => this.make(userId, body),
      );
      return { ...stored, own: this.ownView(userId, this.reload(userId)) };
    });
  }

  private make(userId: string, body: CraftBody): { itemId: string; count: number } {
    const { sql, content } = this;
    const now = this.deps.now();
    const id = body.itemId;
    const isPiece = this.formOfPiece.has(id);
    const isSkin = this.skinById.has(id);
    if (!isPiece && !isSkin) throw new GameError(404, 'not_found');
    if (!this.isKnown(userId, id)) throw new GameError(409, 'not_known');
    const price = isPiece ? piecePrice(content, id) : skinPrice(content, id);
    if (isSkin && (getItem(sql, userId, 'skin', id)?.count ?? 0) > 0) {
      throw new GameError(409, 'already_owned');
    }
    if (isSkin && price.length === 0) throw new GameError(409, 'already_owned');
    const held = new Map(
      listItemsOf(sql, userId, 'material').map((r) => [r.item_id, r.count] as const),
    );
    const need = this.resolveLines(price, held);
    if (need === null) throw new GameError(409, 'insufficient_materials');
    const debits = (): true => {
      const bundle: PartsBundle = {};
      if (need.scrap > 0) bundle.scrap = need.scrap;
      for (const element of ELEMENTS) {
        const n = need.shards[element] ?? 0;
        if (n > 0) bundle[shardKind(element)] = n;
      }
      if (!debitParts(sql, userId, bundle)) throw new GameError(409, 'insufficient_parts');
      for (const [material, n] of Object.entries(need.materials)) {
        if (!takeItem(sql, userId, 'material', material, n)) {
          throw new GameError(409, 'insufficient_materials');
        }
      }
      return true;
    };
    if (need.bait > 0) {
      settleSpend(
        spend(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: need.bait,
            purpose: HOUSE_CRAFT_PURPOSE,
            idempotencyKey: `house:${body.idempotencyKey}`,
            apply: debits,
          },
          now,
        ),
      );
    } else {
      debits();
    }
    let count: number;
    if (isPiece) {
      addItem(sql, userId, 'piece', id, 1, 0, now);
      count = getItem(sql, userId, 'piece', id)?.count ?? 1;
    } else {
      grantOnce(sql, userId, 'skin', id, now);
      count = 1;
    }
    touchHouse(sql, userId, now);
    return { itemId: id, count };
  }

  /**
   * Whether the player may make this piece or skin: a starter, a ground skin, a learned blueprint, or one a built part teaches. The same
   * rule as `knownBlueprints`, asked of one id (a few primary key reads instead of every learned blueprint).
   */
  private isKnown(userId: string, id: string): boolean {
    const item = this.content.pieces.find((p) => p.id === id) ?? this.skinById.get(id);
    if (item === undefined) return false;
    if (item.unlock.kind === 'starter') return true;
    if ('kind' in item && item.kind === 'ground') return true;
    const isBuilt = (partId: string): boolean =>
      getPart(this.sql, userId, partId)?.built_at != null;
    if (item.unlock.kind === 'part' && isBuilt(item.unlock.part)) return true;
    for (const part of this.content.parts) {
      if (part.unlocks.includes(id) && isBuilt(part.id)) return true;
    }
    return getItem(this.sql, userId, 'blueprint', id) !== null;
  }

  /**
   * Turns a price into what to take. A named material is taken as is; a family line takes from the family's materials the player holds,
   * common ones before rare, then the most plentiful, then by id. Null when the materials do not cover it.
   */
  private resolveLines(
    price: readonly PriceLine[],
    held: ReadonlyMap<string, number>,
  ): {
    bait: number;
    scrap: number;
    shards: Partial<Record<Element, number>>;
    materials: Record<string, number>;
  } | null {
    const left = new Map(held);
    const out = {
      bait: 0,
      scrap: 0,
      shards: {} as Partial<Record<Element, number>>,
      materials: {} as Record<string, number>,
    };
    const takeOf = (id: string, n: number): void => {
      left.set(id, (left.get(id) ?? 0) - n);
      out.materials[id] = (out.materials[id] ?? 0) + n;
    };
    for (const line of price) {
      switch (line.kind) {
        case 'bait':
          out.bait += line.amount;
          break;
        case 'scrap':
          out.scrap += line.amount;
          break;
        case 'shard':
          out.shards[line.element] = (out.shards[line.element] ?? 0) + line.amount;
          break;
        case 'material':
          if ((left.get(line.id) ?? 0) < line.amount) return null;
          takeOf(line.id, line.amount);
          break;
        case 'family':
          break;
      }
    }
    for (const line of price) {
      if (line.kind !== 'family') continue;
      let owed = line.amount;
      const candidates = this.content.materials
        .filter((m) => m.family === line.family && (left.get(m.id) ?? 0) > 0)
        .sort(
          (a, b) =>
            Number(a.rare) - Number(b.rare) ||
            (left.get(b.id) ?? 0) - (left.get(a.id) ?? 0) ||
            a.id.localeCompare(b.id),
        );
      for (const m of candidates) {
        if (owed <= 0) break;
        const n = Math.min(owed, left.get(m.id) ?? 0);
        takeOf(m.id, n);
        owed -= n;
      }
      if (owed > 0) return null;
    }
    return out;
  }

  // --- Decorating ---

  /** Puts a piece in a spot (or empties it). Replacing a piece frees its copy; a bed keeps its sleeper only for another bed. */
  place(
    userId: string,
    body: PlaceBody,
  ): AnswerOf<{ room: RoomView; own: { free: Record<string, number> } }> {
    return atomically(this.deps.storage, () => {
      const loaded = this.loadLight(userId);
      const entry = loaded.rooms.get(body.roomId);
      const kind = this.roomKind(body.roomId);
      if (entry === undefined || kind === undefined) throw new GameError(404, 'not_found');
      if (!kind.spots.some((s) => s.id === body.spotId)) throw new GameError(404, 'not_found');
      const spots = entry.spots;
      const current = spots[body.spotId];
      if (body.pieceId === null) {
        delete spots[body.spotId];
      } else {
        const form = this.formOfPiece.get(body.pieceId);
        if (form === undefined) throw new GameError(404, 'not_found');
        if (!canPlace(this.content, kind.id, body.spotId, body.pieceId)) {
          throw new GameError(409, 'spot_mismatch');
        }
        if (current?.p !== body.pieceId) {
          if (form.bed === true) {
            const other = Object.entries(spots).some(
              ([spotId, s]) => spotId !== body.spotId && this.formOfPiece.get(s.p)?.bed === true,
            );
            if (other) throw new GameError(409, 'spot_mismatch');
          }
          const placed = this.placedCounts(loaded.rooms).get(body.pieceId) ?? 0;
          if ((loaded.owned.get(body.pieceId) ?? 0) - placed <= 0) {
            throw new GameError(409, 'none_free');
          }
          const keep = form.bed === true && current?.m !== undefined;
          spots[body.spotId] = keep
            ? { p: body.pieceId, m: current.m as string }
            : { p: body.pieceId };
        }
      }
      setRoomSpots(this.sql, userId, body.roomId, spots);
      touchHouse(this.sql, userId, this.deps.now());
      const room = this.roomView(body.roomId, entry);
      if (room === null) throw new GameError(404, 'not_found');
      return { room, own: { free: this.freeCounts(loaded) } };
    });
  }

  /** Wallpaper and floor of a room, or the roof and walls of the house, from skins the caller owns. */
  skin(userId: string, body: SkinBody): AnswerOf<{ house: HouseView }> {
    return atomically(this.deps.storage, () => {
      const loaded = this.loadLight(userId);
      const owns = (skinId: string): boolean =>
        (getItem(this.sql, userId, 'skin', skinId)?.count ?? 0) > 0;
      const check = (skinId: string, kinds: readonly string[]): void => {
        const skin = this.skinById.get(skinId);
        if (skin === undefined) throw new GameError(404, 'not_found');
        if (!owns(skinId)) throw new GameError(409, 'not_owned');
        if (!kinds.includes(skin.kind)) throw new GameError(409, 'skin_mismatch');
      };
      const now = this.deps.now();
      if (body.target === 'room') {
        const entry = loaded.rooms.get(body.roomId);
        const kind = this.roomKind(body.roomId);
        if (entry === undefined || kind === undefined) throw new GameError(404, 'not_found');
        if (body.wall !== undefined) check(body.wall, kind.outdoor ? ['ground'] : ['wall']);
        if (body.floor !== undefined) check(body.floor, kind.outdoor ? ['ground'] : ['floor']);
        setRoomSkins(this.sql, userId, body.roomId, {
          ...(body.wall === undefined ? {} : { wall: body.wall }),
          ...(body.floor === undefined ? {} : { floor: body.floor }),
        });
      } else {
        if (body.roof !== undefined) check(body.roof, ['roof']);
        if (body.walls !== undefined) check(body.walls, ['walls']);
        setExterior(
          this.sql,
          userId,
          {
            ...(body.roof === undefined ? {} : { roof: body.roof }),
            ...(body.walls === undefined ? {} : { walls: body.walls }),
          },
          now,
        );
      }
      touchHouse(this.sql, userId, now);
      return {
        house: this.houseView(userId, this.loadLight(userId), houseReads(this.sql, userId), true),
      };
    });
  }

  /** Puts a creature of the caller's on a bed (or takes it off). A creature that sleeps elsewhere moves. */
  housemate(userId: string, body: HousemateBody): AnswerOf<{ housemates: HousemateView[] }> {
    return atomically(this.deps.storage, () => {
      const loaded = this.loadLight(userId);
      const entry = loaded.rooms.get(body.roomId);
      const kind = this.roomKind(body.roomId);
      if (entry === undefined || kind === undefined) throw new GameError(404, 'not_found');
      if (!kind.spots.some((s) => s.id === body.spotId)) throw new GameError(404, 'not_found');
      const bed = entry.spots[body.spotId];
      if (bed === undefined || this.formOfPiece.get(bed.p)?.bed !== true) {
        throw new GameError(409, 'not_a_bed');
      }
      const changed = new Set<string>();
      if (body.creatureId === null) {
        delete bed.m;
        changed.add(body.roomId);
      } else {
        const mine = this.sql
          .exec('SELECT 1 FROM creatures WHERE id = ? AND user_id = ?', body.creatureId, userId)
          .toArray();
        if (mine.length === 0) throw new GameError(404, 'creature_not_found');
        // It sleeps in one bed only: the old place is made up again.
        for (const [roomId, room] of loaded.rooms) {
          for (const [spotId, s] of Object.entries(room.spots)) {
            if (s.m === body.creatureId && !(roomId === body.roomId && spotId === body.spotId)) {
              delete s.m;
              changed.add(roomId);
            }
          }
        }
        let sleepers = 0;
        for (const [roomId, room] of loaded.rooms) {
          for (const [spotId, s] of Object.entries(room.spots)) {
            if (s.m !== undefined && !(roomId === body.roomId && spotId === body.spotId))
              sleepers++;
          }
        }
        if (sleepers >= HOUSING_RULES.housemates.max) throw new GameError(409, 'housemate_cap');
        bed.m = body.creatureId;
        changed.add(body.roomId);
      }
      for (const roomId of changed) {
        const room = loaded.rooms.get(roomId);
        if (room !== undefined) setRoomSpots(this.sql, userId, roomId, room.spots);
      }
      touchHouse(this.sql, userId, this.deps.now());
      return { housemates: this.housemateViews(userId, loaded, true) };
    });
  }

  // --- Visitors ---

  private visitToday(ownerId: string, visitorId: string): { gifted: boolean; stamped: boolean } {
    const day = this.day();
    return {
      gifted: giftGivenToday(this.sql, visitorId, day) === ownerId,
      stamped: stampedToday(this.sql, ownerId, visitorId, day),
    };
  }

  /**
   * A visitor's gift: Acorns the server creates (it costs the giver nothing), waiting in the owner's mailbox. One gift a day in all per
   * giver, a few a day per receiver, never to your own house.
   */
  gift(
    userId: string,
    ownerId: string,
    key: string,
  ): AnswerOf<{ gift: { amount: number }; today: { gifted: boolean; stamped: boolean } }> {
    return atomically(this.deps.storage, () => {
      if (ownerId === userId) throw new GameError(409, 'own_house');
      if (getHouse(this.sql, ownerId) === null) throw new GameError(404, 'no_house');
      const stored = runKeyed(
        this.sql,
        this.deps.now,
        { userId, key, kind: 'house_gift', fingerprint: ownerId },
        () => {
          const day = this.day();
          const rules = HOUSING_RULES.gift;
          if (giftGivenToday(this.sql, userId, day) !== null) {
            throw new GameError(409, 'gift_used_today');
          }
          if (giftsReceivedToday(this.sql, ownerId, day) >= rules.perReceiverPerDay) {
            throw new GameError(409, 'gift_cap_reached');
          }
          addGift(this.sql, ownerId, userId, rules.acorns, day, this.deps.now());
          return { amount: rules.acorns };
        },
      );
      return { gift: stored, today: this.visitToday(ownerId, userId) };
    });
  }

  /** A stamp in the guestbook: one per visitor per house a day, one the visitor holds. The owner's latest rows are kept. */
  stamp(
    userId: string,
    ownerId: string,
    stampId: string,
  ): AnswerOf<{ guestbook: HouseView['guestbook']; today: { gifted: boolean; stamped: boolean } }> {
    return atomically(this.deps.storage, () => {
      if (ownerId === userId) throw new GameError(409, 'own_house');
      if (getHouse(this.sql, ownerId) === null) throw new GameError(404, 'no_house');
      const holds =
        this.stampIds.has(stampId) && (getItem(this.sql, userId, 'stamp', stampId)?.count ?? 0) > 0;
      if (!holds) throw new GameError(409, 'stamp_not_owned');
      const day = this.day();
      if (stampedToday(this.sql, ownerId, userId, day))
        throw new GameError(409, 'stamp_used_today');
      addStamp(
        this.sql,
        ownerId,
        userId,
        stampId,
        day,
        this.deps.now(),
        HOUSING_RULES.guestbookKeep,
      );
      return { guestbook: this.guestbookView(ownerId), today: this.visitToday(ownerId, userId) };
    });
  }

  /** Collects every waiting gift in one tap: credits their sum to the ledger once (a repeat of the key answers the same). */
  collect(userId: string, key: string): AnswerOf<{ collected: number; balance: number }> {
    return atomically(this.deps.storage, () =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key, kind: 'house_collect', fingerprint: '' },
        () => {
          const mail = openMail(this.sql, userId);
          if (mail.length === 0) throw new GameError(409, 'nothing_to_collect');
          const total = mail.reduce((n, m) => n + m.amount, 0);
          credit(
            this.deps.storage,
            {
              userId,
              currency: 'bait',
              amount: total,
              source: HOUSE_GIFT_SOURCE,
              idempotencyKey: `house_gift:${key}`,
            },
            this.deps.now(),
          );
          claimMail(this.sql, userId, this.deps.now());
          return { collected: total, balance: getBalance(this.sql, userId, 'bait') };
        },
      ),
    );
  }

  /** The "+N" on the materials has been seen. */
  seen(userId: string): AnswerOf<{ ok: true }> {
    return atomically(this.deps.storage, () => {
      clearFresh(this.sql, userId);
      return { ok: true as const };
    });
  }
}
