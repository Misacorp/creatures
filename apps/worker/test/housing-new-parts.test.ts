import { BuildAnswerSchema, HouseAnswerSchema, houseGrid, type PriceLine } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { content, householder, parsed, runHouse, stock } from './housing-helpers';
import { newKey } from './kit';

/** The tower, the balcony, the orchard and the pond (`housing-next.md` C1): parts are content, built through the real endpoint. */

const NEW = ['tower', 'balcony', 'orchard', 'pond'] as const;

/** What a part needs built first (its requirements, and theirs), in build-list order. */
function needs(id: string): string[] {
  const out = new Set<string>();
  const visit = (part: string): void => {
    for (const r of content.parts.find((p) => p.id === part)?.requires ?? []) {
      visit(r);
      out.add(r);
    }
  };
  visit(id);
  return [...out].filter((p) => p !== 'hut');
}

/** A payment that covers every line of a price, naming the material of each family line. */
function holdings(lines: readonly PriceLine[]) {
  const common = { wood: 'driftwood', stone: 'sea-glass', metal: 'cinder-iron', cloth: 'sea-silk' };
  const out = {
    bait: 0,
    scrap: 0,
    shards: {} as Record<string, number>,
    materials: {} as Record<string, number>,
  };
  for (const line of lines) {
    if (line.kind === 'bait') out.bait += line.amount;
    else if (line.kind === 'scrap') out.scrap += line.amount;
    else if (line.kind === 'shard') out.shards[line.element] = line.amount;
    else if (line.kind === 'material')
      out.materials[line.id] = (out.materials[line.id] ?? 0) + line.amount;
    else
      out.materials[common[line.family]] = (out.materials[common[line.family]] ?? 0) + line.amount;
  }
  return out;
}

describe('the new parts', () => {
  it.each(NEW)(
    'the %s is built through the endpoint with a keyed payment, and its rooms appear',
    async (id) => {
      const part = content.parts.find((p) => p.id === id);
      if (part === undefined) throw new Error(`no part ${id}`);
      await runHouse(
        async (ctx) => {
          const p = await householder(ctx);
          // Locked until what it needs is built.
          const early = await p.call('POST', '/api/house/build', {
            partId: id,
            pay: { bait: 5 },
            idempotencyKey: newKey(),
          });
          expect(early.status).toBe(409);
          await p.tool('housing-build', { parts: needs(id) });
          const pay = holdings(part.price);
          for (const [element, n] of Object.entries(pay.shards)) {
            ctx.sql.exec(
              `INSERT INTO parts (user_id, kind, amount) VALUES (?, '${element}-shard', ?) ON CONFLICT(user_id, kind) DO UPDATE SET amount = ?`,
              p.id,
              n,
              n,
            );
          }
          stock(ctx, p.id, { bait: pay.bait, scrap: pay.scrap, materials: pay.materials });
          const key = newKey();
          const body = { partId: id, pay, idempotencyKey: key };
          const done = parsed(BuildAnswerSchema, await p.call('POST', '/api/house/build', body));
          expect(done.built).toBe(true);
          expect(done.part.remaining).toEqual([]);
          const rooms = done.grown?.rooms.map((r) => r.id).sort();
          expect(rooms).toEqual(part.rooms.map((r) => `${id}:${r.key}`).sort());
          // A retry with the same key returns the stored result and takes nothing more.
          const again = parsed(BuildAnswerSchema, await p.call('POST', '/api/house/build', body));
          expect(again).toEqual(done);
          // The house reads back with the rooms in their kind's default look, and the grid has them.
          const house = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
          expect(house.house.built).toContain(id);
          const grid = houseGrid(content, new Set(house.house.built));
          for (const r of part.rooms) {
            const view = house.house.rooms.find((x) => x.id === `${id}:${r.key}`);
            const kind = content.rooms.find((k) => k.id === r.kind);
            expect(view, r.key).toMatchObject({
              kind: r.kind,
              wall: kind?.wall,
              floor: kind?.floor,
            });
            expect(grid.some((g) => g.roomId === `${id}:${r.key}`)).toBe(true);
          }
        },
        { dev: true },
      );
    },
  );

  it("puts furniture on the new rooms' spots and refuses a piece that does not fit", async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        await p.tool('housing-build', {
          parts: ['cottage', 'house', 'garden', 'orchard', 'tower'],
        });
        stock(ctx, p.id, { pieces: { beehive: 1, scarecrow: 1, 'cosy-lamp': 1 } });
        const place = (roomId: string, spotId: string, pieceId: string | null) =>
          p.call('PUT', '/api/house/place', {
            roomId,
            spotId,
            pieceId,
          });
        expect((await place('orchard:orchard', 'yard-small-a', 'beehive')).status).toBe(200);
        expect((await place('orchard:orchard', 'yard-large-a', 'scarecrow')).status).toBe(200);
        // a lamp hangs from a ceiling, not in an orchard; a scarecrow is too big for a small yard place
        expect((await place('orchard:orchard', 'yard-small-b', 'cosy-lamp')).status).toBe(409);
        expect((await place('orchard:orchard', 'yard-small-b', 'scarecrow')).status).toBe(409);
        expect((await place('tower:observatory', 'floor-small-a', 'cosy-lamp')).status).toBe(409);
      },
      { dev: true },
    );
  });

  it('builds all fifteen parts with the dev tool and shows the estate', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx);
        await p.tool('housing-build', { parts: 'all' });
        const house = parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));
        expect(house.house.built).toHaveLength(15);
        for (const id of NEW) expect(house.house.built).toContain(id);
        expect(house.house.rooms.some((r) => r.kind === 'observatory')).toBe(true);
        // the observatory's display answers like the hall's journal
        expect(house.house.displays.some((d) => d.roomId === 'tower:observatory')).toBe(true);
      },
      { dev: true },
    );
  });
});
