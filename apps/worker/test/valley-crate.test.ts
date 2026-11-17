/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * The Forge's sealed crate (migration 68, V-FORGE-5, Misa 2026-11-15, option C): common pieces come home on their own; rare and epic ones
 * wait, unrolled, in a sealed crate until the player opens it (`/api/valley/forge/crate/open`, keyed), which reveals them worst first and
 * best last. The crate holds `crateCap` pieces; past that the oldest come home on their own. The Gazette teases it once per arrival.
 */
import { VALLEY_ELEMENTS, VALLEY_RULES, ValleyViewSchema, type ValleyView } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, newKey, sessionCaller, type SessionCaller } from './kit';
import { count, nextGuild, seedPlayer } from './raid-helpers';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
const R = VALLEY_RULES;
const TIDE = 'splashet';
const HAT = 'kelp-cap';
const TIDE_INDEX = VALLEY_ELEMENTS.indexOf('tide');

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
  seatId: string;
}

/** A player with the first anvil bought and a smith posted (so the pass runs the Forge). */
async function smithing(
  ctx: CoreContext,
  n: number,
  species = [TIDE, 'mistnewt', 'coralynx'],
  level = 3,
): Promise<P> {
  const seeded = seedPlayer(ctx, n, { creatures: species.length, level, species });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  const state = () => api.call('GET', '/api/state');
  await state();
  const bought = await api.call('POST', '/api/valley/anvil/buy', {
    idempotencyKey: newKey('anvil'),
  });
  expect(bought.status).toBe(200);
  const seatId = bought.body.seatId as string;
  const posted = await api.call('POST', '/api/valley/seat', {
    seatId,
    creatureId: seeded.creatureIds[species.length - 1],
  });
  expect(posted.status).toBe(200);
  return { id: seeded.id, creatureIds: seeded.creatureIds, api, state, seatId };
}

interface Seed {
  rarity: 0 | 1 | 2;
  level?: number;
  team?: boolean;
  madeAt?: number;
}

let serial = 0;
const SEQ = (): string => `piece-${(serial++).toString(36)}`;

/** Puts finished pieces on the anvil's floor, as the pass would have, with the seat's counter in step. */
function seedFloor(ctx: CoreContext, p: P, pieces: readonly Seed[]): void {
  for (const piece of pieces) {
    ctx.sql.exec(
      `INSERT INTO forge_floor (piece_id, user_id, seat_id, blueprint_id, for_team, element, rarity, item_level, made_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      SEQ(),
      p.id,
      p.seatId,
      piece.team === true ? null : HAT,
      piece.team === true ? 1 : 0,
      piece.team === true ? TIDE_INDEX : -1,
      piece.rarity,
      piece.level ?? 5,
      piece.madeAt ?? ctx.clock.t,
    );
  }
  ctx.sql.exec(
    'UPDATE valley_seats SET floor_count = floor_count + ? WHERE seat_id = ?',
    pieces.length,
    p.seatId,
  );
}

function seedCrate(ctx: CoreContext, p: P, pieces: readonly Seed[]): void {
  for (const [i, piece] of pieces.entries()) {
    ctx.sql.exec(
      `INSERT INTO forge_crate (piece_id, user_id, seat_id, blueprint_id, for_team, element, rarity, item_level, made_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      SEQ(),
      p.id,
      p.seatId,
      piece.team === true ? null : HAT,
      piece.team === true ? 1 : 0,
      piece.team === true ? TIDE_INDEX : -1,
      piece.rarity,
      piece.level ?? 5,
      piece.madeAt ?? i,
    );
  }
  const best = Math.max(0, ...pieces.map((x) => x.rarity));
  ctx.sql.exec(
    'UPDATE valley_players SET crate_count = ?, crate_best = ? WHERE user_id = ?',
    pieces.length,
    best,
    p.id,
  );
}

const view = (res: Json): ValleyView => v.parse(ValleyViewSchema, res.body.valley);
const openCrate = (p: P, key = newKey('crate')) =>
  p.api.call('POST', '/api/valley/forge/crate/open', { idempotencyKey: key });
const items = (ctx: CoreContext, p: P): { rarity: string; equipped_on: string | null }[] =>
  ctx.sql
    .exec<{
      rarity: string;
      equipped_on: string | null;
    }>('SELECT rarity, equipped_on FROM gear_items WHERE user_id = ?', p.id)
    .toArray();
const arrive = async (ctx: CoreContext, p: P): Promise<ValleyView> => {
  ctx.clock.t += 24 * HOUR;
  return view(await p.state());
};

describe('migration 68: the sealed crate', () => {
  it('creates the table, its index and the player columns, and valley-fresh clears the crate', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const columns = (table: string): string[] =>
          ctx.sql
            .exec<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)
            .toArray()
            .map((r) => r.name);
        expect(columns('forge_crate')).toEqual([
          'piece_id',
          'user_id',
          'seat_id',
          'blueprint_id',
          'for_team',
          'element',
          'rarity',
          'item_level',
          'made_at',
        ]);
        expect(columns('valley_players')).toEqual(
          expect.arrayContaining(['crate_count', 'crate_best']),
        );
        const p = await smithing(ctx, 1);
        seedCrate(ctx, p, [{ rarity: 1 }]);
        expect(count(ctx.sql, 'forge_crate')).toBe(1);
        expect((await p.api.call('POST', '/api/dev/valley-fresh', {})).status).toBe(200);
        expect(count(ctx.sql, 'forge_crate')).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('answers 404 on the open route with the flag off, before reading the body', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const seeded = seedPlayer(ctx, 1, { creatures: 1, level: 3 });
        const api = await sessionCaller<Json['body']>(ctx, {
          id: seeded.id,
          displayName: seeded.name,
        });
        const res = await api.call('POST', '/api/valley/forge/crate/open', { nonsense: true });
        expect(res.status).toBe(404);
      },
      FLAG_OFF,
    );
  });
});

describe('a floor coming home: commons home, rare and epic sealed', () => {
  it('rolls the commons into the bag and moves the rest, unrolled, to the crate; the view shows count and best only', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        seedFloor(ctx, p, [{ rarity: 0 }, { rarity: 0 }, { rarity: 1 }, { rarity: 2 }]);
        const arrived = await arrive(ctx, p);
        expect(items(ctx, p).map((i) => i.rarity)).toEqual(['common', 'common']);
        expect(count(ctx.sql, 'forge_floor')).toBe(0);
        expect(count(ctx.sql, 'forge_crate')).toBe(2);
        // The sealed pieces never counted toward the floor: the anvil's counter is back to 0.
        expect(arrived.anvils[0]?.floor.count).toBe(0);
        expect(arrived.forge.crate).toEqual({ count: 2, cap: R.forge.crateCap, best: 'epic' });
        expect(JSON.stringify(arrived.forge)).not.toContain('piece-');
      },
      SYSTEMS,
    );
  });

  it('keeps the crate at its cap: the oldest sealed piece comes home on its own, and with a full bag the new one stays on the floor', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        seedCrate(
          ctx,
          p,
          Array.from({ length: R.forge.crateCap }, (_, i) => ({ rarity: 1 as const, madeAt: i })),
        );
        seedFloor(ctx, p, [{ rarity: 2 }]);
        const arrived = await arrive(ctx, p);
        // One came home (the oldest, rolled), the epic took its place.
        expect(items(ctx, p)).toEqual([{ rarity: 'rare', equipped_on: null }]);
        expect(count(ctx.sql, 'forge_crate')).toBe(R.forge.crateCap);
        expect(arrived.forge.crate).toEqual({
          count: R.forge.crateCap,
          cap: R.forge.crateCap,
          best: 'epic',
        });
        expect(count(ctx.sql, 'forge_floor')).toBe(0);

        // A full bag: nothing can come home to make room, so the new piece waits on the floor and the crate stays at its cap.
        ctx.sql.exec('UPDATE valley_bag SET items = ? WHERE user_id = ?', R.forge.bag, p.id);
        seedFloor(ctx, p, [{ rarity: 2 }]);
        const later = await arrive(ctx, p);
        expect(count(ctx.sql, 'forge_crate')).toBe(R.forge.crateCap);
        expect(count(ctx.sql, 'forge_floor')).toBe(1);
        expect(later.anvils[0]?.floor.count).toBe(1);
      },
      SYSTEMS,
    );
  });
});

describe('opening the crate', () => {
  it('rolls every piece, reveals them worst first and best last, and a retry returns the stored answer', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        seedCrate(ctx, p, [
          { rarity: 2, level: 4, madeAt: 1 },
          { rarity: 1, level: 9, madeAt: 2 },
          { rarity: 1, level: 3, madeAt: 3 },
        ]);
        const key = newKey('crate');
        const opened = await openCrate(p, key);
        expect(opened.status).toBe(200);
        const pieces = opened.body.pieces as {
          item: { rarity: string; itemLevel: number; baseId: string; id: string };
          wornBy: string | null;
          madeBy: string | null;
        }[];
        expect(pieces.map((x) => [x.item.rarity, x.item.itemLevel])).toEqual([
          ['rare', 3],
          ['rare', 9],
          ['epic', 4],
        ]);
        expect(pieces.every((x) => x.item.baseId === HAT && x.wornBy === null)).toBe(true);
        expect(pieces.every((x) => x.madeBy === p.creatureIds[2])).toBe(true);
        expect(opened.body.sealed).toBe(0);
        expect(opened.body.bagFull).toBe(false);
        expect(items(ctx, p)).toHaveLength(3);
        expect(count(ctx.sql, 'forge_crate')).toBe(0);
        expect(v.parse(ValleyViewSchema, opened.body.valley).forge.crate).toEqual({
          count: 0,
          cap: R.forge.crateCap,
          best: null,
        });
        // A retry with the key answers the same pieces and rolls nothing more.
        const again = await openCrate(p, key);
        expect(again.status).toBe(200);
        expect((again.body.pieces as { item: { id: string } }[]).map((x) => x.item.id)).toEqual(
          pieces.map((x) => x.item.id),
        );
        expect(items(ctx, p)).toHaveLength(3);
        // A new key on the empty crate opens nothing.
        const empty = await openCrate(p);
        expect(empty.body.pieces).toEqual([]);
      },
      SYSTEMS,
    );
  });

  it('wears "for my team" pieces at once on the creature of their element', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // Level 13: the gear slots a creature may wear open at 1, 7 and 13 until combat v2's gear lands (V-GEAR-3).
        const p = await smithing(ctx, 1, [TIDE, 'cindle'], 13);
        seedCrate(ctx, p, [
          { rarity: 1, team: true, level: 6 },
          { rarity: 1, level: 6 },
        ]);
        const opened = await openCrate(p);
        expect(opened.status).toBe(200);
        const pieces = opened.body.pieces as {
          wornBy: string | null;
          item: { equippedOn: string | null };
        }[];
        const worn = pieces.filter((x) => x.wornBy !== null);
        expect(worn).toHaveLength(1);
        expect(worn[0]?.wornBy).toBe(p.creatureIds[0]);
        expect(worn[0]?.item.equippedOn).toBe(p.creatureIds[0]);
        expect(items(ctx, p).filter((i) => i.equipped_on !== null)).toHaveLength(1);
        // The worn piece is not in the bag.
        expect(
          ctx.sql
            .exec<{ items: number }>('SELECT items FROM valley_bag WHERE user_id = ?', p.id)
            .one().items,
        ).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('keeps the rest sealed when the bag is full, the best pieces first, and says so', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        seedCrate(ctx, p, [
          { rarity: 1, level: 2, madeAt: 1 },
          { rarity: 2, level: 2, madeAt: 2 },
          { rarity: 1, level: 8, madeAt: 3 },
        ]);
        ctx.sql.exec(
          'INSERT OR REPLACE INTO valley_bag (user_id, items) VALUES (?, ?)',
          p.id,
          R.forge.bag - 1,
        );
        const opened = await openCrate(p);
        expect(opened.status).toBe(200);
        const pieces = opened.body.pieces as { item: { rarity: string } }[];
        expect(pieces.map((x) => x.item.rarity)).toEqual(['epic']);
        expect(opened.body.sealed).toBe(2);
        expect(opened.body.bagFull).toBe(true);
        expect(count(ctx.sql, 'forge_crate')).toBe(2);
        const left = view(await p.state());
        expect(left.forge.crate).toEqual({ count: 2, cap: R.forge.crateCap, best: 'rare' });
      },
      SYSTEMS,
    );
  });
});

describe('the Gazette tease', () => {
  it('teases the crate once per arrival while it holds anything, never lists a sealed piece as come home, and stops once it is open', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await smithing(ctx, 1);
        seedFloor(ctx, p, [{ rarity: 1 }]);
        const first = await arrive(ctx, p);
        const kinds = first.paper?.headlines.map((h) => h.kind) ?? [];
        expect(kinds).toContain('crate-waits');
        expect(kinds).not.toContain('forge-pieces');
        expect(first.paper?.headlines.find((h) => h.kind === 'crate-waits')?.rarity).toBe('rare');
        // A reload in the same visit says the same, once.
        const again = view(await p.state());
        expect(again.paper?.headlines.filter((h) => h.kind === 'crate-waits')).toHaveLength(1);
        // The next arrival teases it again (an epic now waits), the crate not yet opened.
        await p.api.call('POST', '/api/valley/gazette/close', { paperId: first.paper?.id });
        seedFloor(ctx, p, [{ rarity: 2 }]);
        const second = await arrive(ctx, p);
        const tease = second.paper?.headlines.filter((h) => h.kind === 'crate-waits') ?? [];
        expect(tease).toHaveLength(1);
        expect(tease[0]?.rarity).toBe('epic');
        // Once opened, the next arrival says nothing of it.
        expect((await openCrate(p)).status).toBe(200);
        await p.api.call('POST', '/api/valley/gazette/close', { paperId: second.paper?.id });
        const third = await arrive(ctx, p);
        expect(third.paper?.headlines.map((h) => h.kind) ?? []).not.toContain('crate-waits');
      },
      SYSTEMS,
    );
  });
});
