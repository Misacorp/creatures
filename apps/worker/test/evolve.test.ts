import { describe, expect, it } from 'vitest';
import { count, rows, runRaid, seedPlayer } from './raid-helpers';
import type { CoreContext } from './helpers';

let keyCounter = 0;
const newKey = () => `evolve-${String(++keyCounter).padStart(8, '0')}-key`;

interface EvolveBody {
  error?: string;
  species: string;
  firstOnServer: boolean;
  state: {
    balances: { essence: number };
    creatures: { id: string; species: string; evolution?: unknown }[];
    serverFirsts: unknown[];
  };
}

async function evolve(ctx: CoreContext, secret: string, creatureId: string, key = newKey()) {
  const res = await ctx.request(secret, `/api/creatures/${creatureId}/evolve`, 'POST', {
    idempotencyKey: key,
  });
  return { status: res.status, body: await res.json<EvolveBody>() };
}

const giveEssence = (ctx: CoreContext, userId: string, amount: number, key = 'seed:essence') =>
  ctx.core.credit({
    userId,
    currency: 'essence',
    amount,
    source: 'raid',
    idempotencyKey: key,
  });

async function setup(ctx: CoreContext, level = 15) {
  const p = seedPlayer(ctx, 1, { creatures: 2, level, species: ['splashet', 'stormray'] });
  const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
  ctx.sql.exec(
    "UPDATE creatures SET fusion_count = 2, shiny = 1, nickname = 'Bubbles' WHERE id = ?",
    p.creatureIds[0],
  );
  return { p, secret, splashet: p.creatureIds[0] as string, stormray: p.creatureIds[1] as string };
}

describe('POST /api/creatures/:id/evolve', () => {
  it('evolves for Essence, keeping level, fusion, shininess and nickname, and records the first', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, splashet } = await setup(ctx);
      giveEssence(ctx, p.id, 50);
      const before = ctx.core.collection.state(p.id).creatures.find((c) => c.id === splashet);
      expect(before?.evolution).toMatchObject({
        toSpecies: 'tidewing',
        level: 15,
        essence: 20,
        available: true,
      });

      const res = await evolve(ctx, secret, splashet);
      expect(res.status).toBe(200);
      expect(res.body.species).toBe('tidewing');
      expect(res.body.firstOnServer).toBe(true);
      const after = res.body.state.creatures.find((c) => c.id === splashet);
      expect(after).toMatchObject({
        species: 'tidewing',
        line: 'splashet',
        level: 15,
        fusionCount: 2,
        shiny: true,
        nickname: 'Bubbles',
        levelCap: 30,
      });
      expect(after?.evolution).toBeUndefined(); // stage 2 evolves no further
      expect(res.body.state.balances.essence).toBe(30);
      expect(
        rows(ctx.sql, "SELECT amount, source FROM ledger WHERE currency = 'essence' ORDER BY id"),
      ).toEqual([
        { amount: 50, source: 'raid' },
        { amount: -20, source: 'evolution' },
      ]);
      expect(res.body.state.serverFirsts).toContainEqual(
        expect.objectContaining({ kind: 'evolve', species: 'tidewing', mine: true }),
      );
    });
  });

  it('refuses below the evolution level and charges nothing', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, splashet } = await setup(ctx, 14);
      giveEssence(ctx, p.id, 50);
      const state = ctx.core.collection.state(p.id);
      expect(state.creatures.find((c) => c.id === splashet)?.evolution?.available).toBe(false);
      const res = await evolve(ctx, secret, splashet);
      expect(res).toMatchObject({ status: 409, body: { error: 'level_too_low' } });
      expect(ctx.core.balances(p.id).essence).toBe(50);
      expect(count(ctx.sql, 'server_firsts', "kind = 'evolve'")).toBe(0);
    });
  });

  it('refuses without enough Essence and changes nothing', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, splashet } = await setup(ctx);
      giveEssence(ctx, p.id, 19);
      expect(
        ctx.core.collection.state(p.id).creatures.find((c) => c.id === splashet)?.evolution
          ?.available,
      ).toBe(false);
      const res = await evolve(ctx, secret, splashet);
      expect(res).toMatchObject({ status: 409, body: { error: 'insufficient_funds' } });
      expect(ctx.core.balances(p.id).essence).toBe(19);
      expect(rows(ctx.sql, 'SELECT species FROM creatures WHERE id = ?', splashet)).toEqual([
        { species: 'splashet' },
      ]);
    });
  });

  it('returns the stored result for a replayed key and charges once', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, splashet } = await setup(ctx);
      giveEssence(ctx, p.id, 100);
      const key = newKey();
      const first = await evolve(ctx, secret, splashet, key);
      const second = await evolve(ctx, secret, splashet, key);
      expect(second.status).toBe(200);
      expect(second.body.species).toBe(first.body.species);
      expect(second.body.firstOnServer).toBe(true);
      expect(ctx.core.balances(p.id).essence).toBe(80);
      expect(count(ctx.sql, 'ledger', "source = 'evolution'")).toBe(1);
      // The same key for another creature is a conflict and charges nothing.
      const stormray = p.creatureIds[1] as string;
      const clash = await evolve(ctx, secret, stormray, key);
      expect(clash).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
      expect(ctx.core.balances(p.id).essence).toBe(80);
    });
  });

  it('refuses a creature that already evolved, other players’ creatures and bad input', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, splashet } = await setup(ctx);
      giveEssence(ctx, p.id, 100);
      expect((await evolve(ctx, secret, splashet)).status).toBe(200);
      expect(await evolve(ctx, secret, splashet)).toMatchObject({
        status: 409,
        body: { error: 'not_evolvable' },
      });
      const other = seedPlayer(ctx, 2, { creatures: 1, level: 15 });
      expect(await evolve(ctx, secret, other.creatureIds[0] as string)).toMatchObject({
        status: 404,
        body: { error: 'not_found' },
      });
      const stormray = p.creatureIds[1] as string;
      for (const body of [
        {},
        { idempotencyKey: 'short' },
        { idempotencyKey: newKey(), extra: 1 },
      ]) {
        const res = await ctx.request(secret, `/api/creatures/${stormray}/evolve`, 'POST', body);
        expect(res.status).toBe(400);
      }
      expect(
        (
          await ctx.request(secret, '/api/creatures/not-an-id/evolve', 'POST', {
            idempotencyKey: newKey(),
          })
        ).status,
      ).toBe(400);
      expect(ctx.core.balances(p.id).essence).toBe(80);
    });
  });

  it('records first on server only for the first evolution of a line', async () => {
    await runRaid(async (ctx) => {
      const a = await setup(ctx);
      giveEssence(ctx, a.p.id, 100);
      expect((await evolve(ctx, a.secret, a.splashet)).body.firstOnServer).toBe(true);
      const b = seedPlayer(ctx, 2, { creatures: 1, level: 15, species: ['splashet'] });
      const sb = await ctx.core.createSession(ctx.guildId, { id: b.id, displayName: b.name });
      giveEssence(ctx, b.id, 100, 'seed:b');
      const res = await evolve(ctx, sb, b.creatureIds[0] as string);
      expect(res.body.species).toBe('tidewing');
      expect(res.body.firstOnServer).toBe(false); // a different evolve action is a different drop
    });
  });
});
