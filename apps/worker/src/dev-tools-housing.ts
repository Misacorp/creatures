/**
 * Dev tools for player housing. Staging only (see `dev-tools.ts`), and only with `HOUSING` on (404 otherwise). Each function runs inside
 * the tool's one transaction and acts on the caller's guild. They set a state for testing, they do not play the game: nothing is paid.
 *
 * - `housing-grant`: fills the caller's holdings: `materials` of every luxury material, Acorns, scrap, every blueprint, every stamp.
 * - `housing-build`: builds parts without paying (all, or the named ones; a part's prerequisites must be built or named too).
 * - `housing-guests`: gives the raid's dev guests (`dev-guest-<n>`) houses with random built parts, furniture, a housemate and a stamp in
 *   the caller's guestbook, so the visit list and the guestbook have something to show.
 * - `housing-fresh`: deletes the caller's housing rows (all eight tables) so the first-visit hut can be seen again.
 */
import {
  HOUSING_RULES,
  RULES,
  buildable,
  canPlace,
  housing as content,
  int,
  type HousingContent,
} from '@creatures/game';
import type * as v from 'valibot';
import { DevError, type ToolCtx } from './dev-context';
import type {
  HousingBuildBodySchema,
  HousingGrantBodySchema,
  HousingGuestsBodySchema,
} from './dev-schemas';
import { createGuest, guestId, referenceLevel } from './dev-tools-raid';
import { creditParts } from './gear-store';
import { HOUSING_TABLES } from './housing-migration';
import {
  addItem,
  addStamp,
  getHouse,
  grantOnce,
  listParts,
  listRooms,
  parseSpots,
  setRoomSpots,
  stampedToday,
  upsertPart,
  touchHouse,
  type Spots,
} from './housing-store';
import { credit } from './ledger';
import { gameDay } from './time';

type Body<S extends v.GenericSchema> = v.InferOutput<S>;

const DEFAULT_GUESTS = 5;

function housingOf(ctx: ToolCtx) {
  if (ctx.housing === null) throw new DevError(404, 'not_found');
  return ctx.housing;
}

export function housingGrant(ctx: ToolCtx, body: Body<typeof HousingGrantBodySchema>) {
  housingOf(ctx);
  const { sql, userId, now } = ctx;
  if (body.materials !== undefined) {
    for (const m of content.materials)
      addItem(sql, userId, 'material', m.id, body.materials, body.materials, now);
  }
  if (body.acorns !== undefined) {
    credit(
      ctx.storage,
      {
        userId,
        currency: 'bait',
        amount: body.acorns,
        source: 'dev',
        idempotencyKey: `dev:${crypto.randomUUID()}`,
      },
      now,
    );
  }
  if (body.scrap !== undefined) creditParts(sql, userId, { scrap: body.scrap });
  let blueprints = 0;
  if (body.blueprints === 'all') {
    for (const item of [...content.pieces, ...content.skins]) {
      if (item.unlock.kind !== 'starter' && grantOnce(sql, userId, 'blueprint', item.id, now)) {
        blueprints++;
      }
    }
  }
  let stamps = 0;
  if (body.stamps === 'all') {
    for (const s of content.stamps) if (grantOnce(sql, userId, 'stamp', s.id, now)) stamps++;
  }
  return { materials: body.materials ?? 0, blueprints, stamps };
}

export function housingBuild(ctx: ToolCtx, body: Body<typeof HousingBuildBodySchema>) {
  const housing = housingOf(ctx);
  const { sql, userId, now } = ctx;
  housing.ensure(userId);
  const built = new Set(
    listParts(sql, userId)
      .filter((p) => p.built_at !== null)
      .map((p) => p.part_id),
  );
  const wanted = body.parts === 'all' ? content.parts.map((p) => p.id) : body.parts;
  for (const id of wanted) {
    if (!content.parts.some((p) => p.id === id)) throw new DevError(400, 'invalid_body');
  }
  const todo = new Set(wanted);
  const done: string[] = [];
  // In build-list order, so a part comes after what it needs.
  for (const part of [...content.parts].sort((a, b) => a.order - b.order)) {
    if (!todo.has(part.id) || built.has(part.id)) continue;
    if (!part.requires.every((r) => built.has(r))) throw new DevError(409, 'part_locked');
    upsertPart(sql, userId, part.id, {}, now);
    housing.finishPart(userId, part, now);
    built.add(part.id);
    done.push(part.id);
  }
  touchHouse(sql, userId, now);
  return { built: done, parts: [...built] };
}

/** A random element of a list (the live RNG), or undefined for an empty one. */
function pick<T>(ctx: ToolCtx, list: readonly T[]): T | undefined {
  return list.length === 0 ? undefined : list[int(ctx.rng, list.length)];
}

/** One guest's house: some parts, furniture in about half of the spots, a sleeper on the bed and a stamp in the caller's book. */
function furnishGuest(ctx: ToolCtx, guest: string, c: HousingContent): void {
  const housing = housingOf(ctx);
  const { sql, now } = ctx;
  housing.ensure(guest);
  // Build parts, a few rounds, each buildable part with an even chance.
  for (let round = 0; round < 4; round++) {
    const built = new Set(
      listParts(sql, guest)
        .filter((p) => p.built_at !== null)
        .map((p) => p.part_id),
    );
    for (const id of buildable(c, built)) {
      const part = c.parts.find((p) => p.id === id);
      if (part === undefined || int(ctx.rng, 2) === 0) continue;
      upsertPart(sql, guest, part.id, {}, now);
      housing.finishPart(guest, part, now);
      break;
    }
  }
  // Furniture: a copy is granted for every piece that is placed.
  const beds = new Map<string, boolean>();
  let sleeper = false;
  const creature = sql
    .exec<{ id: string }>('SELECT id FROM creatures WHERE user_id = ? LIMIT 1', guest)
    .toArray()[0]?.id;
  for (const row of listRooms(sql, guest)) {
    const part = row.room_id.split(':')[0] ?? '';
    const key = row.room_id.split(':')[1] ?? '';
    const kindId = c.parts.find((p) => p.id === part)?.rooms.find((r) => r.key === key)?.kind;
    const kind = c.rooms.find((r) => r.id === kindId);
    if (kind === undefined) continue;
    const spots: Spots = parseSpots(row.spots_json);
    for (const spot of kind.spots) {
      if (spot.type === 'display' || spots[spot.id] !== undefined || int(ctx.rng, 2) === 0)
        continue;
      const fits = c.pieces.filter((p) => {
        if (!canPlace(c, kind.id, spot.id, p.id)) return false;
        const isBed = c.forms.find((f) => f.id === p.form)?.bed === true;
        return !isBed || beds.get(row.room_id) !== true;
      });
      const piece = pick(ctx, fits);
      if (piece === undefined) continue;
      addItem(sql, guest, 'piece', piece.id, 1, 0, now);
      const isBed = c.forms.find((f) => f.id === piece.form)?.bed === true;
      if (isBed) beds.set(row.room_id, true);
      spots[spot.id] =
        isBed && !sleeper && creature !== undefined
          ? { p: piece.id, m: creature }
          : { p: piece.id };
      if (isBed && creature !== undefined) sleeper = true;
    }
    setRoomSpots(sql, guest, row.room_id, spots);
  }
  // A stamp in the caller's guestbook (one a day per visitor).
  const day = gameDay(now, ctx.tz, RULES.daily.reset);
  const stamp = pick(
    ctx,
    c.stamps.filter((s) => s.unlock.kind === 'starter'),
  );
  if (stamp !== undefined && !stampedToday(sql, ctx.userId, guest, day)) {
    addStamp(sql, ctx.userId, guest, stamp.id, day, now, HOUSING_RULES.guestbookKeep);
  }
  touchHouse(sql, guest, now);
}

export function housingGuests(ctx: ToolCtx, body: Body<typeof HousingGuestsBodySchema>) {
  housingOf(ctx);
  const count = body.count ?? DEFAULT_GUESTS;
  const level = referenceLevel(ctx);
  const ids: string[] = [];
  for (let n = 1; n <= count; n++) {
    createGuest(ctx, n, level);
    const id = guestId(n);
    furnishGuest(ctx, id, content);
    ids.push(id);
  }
  // The caller's own house exists, so the guests have somewhere to have stamped.
  if (getHouse(ctx.sql, ctx.userId) === null) housingOf(ctx).ensure(ctx.userId);
  return { guests: ids };
}

export function housingFresh(ctx: ToolCtx) {
  housingOf(ctx);
  for (const table of HOUSING_TABLES) {
    const column = table === 'house_guestbook' || table === 'house_mail' ? 'owner_id' : 'user_id';
    ctx.sql.exec(`DELETE FROM ${table} WHERE ${column} = ?`, ctx.userId);
  }
  return { fresh: true };
}
