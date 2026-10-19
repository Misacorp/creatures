import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { apiPlayer as player, giveItem, giveParts, skipWelcome } from './gear-helpers';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, rows } from './raid-helpers';
import { HOUR, newKey } from './kit';

const give = (ctx: CoreContext, userId: string, baseId: string, o = {}): string =>
  giveItem(ctx.sql, userId, baseId, { now: ctx.clock.t, ...o });

const equipPath = (id: string) => `/api/gear/${id}/equip`;

const wearerOf = (ctx: CoreContext, id: string): string | null =>
  rows<{ equipped_on: string | null }>(
    ctx.sql,
    'SELECT equipped_on FROM gear_items WHERE id = ?',
    id,
  )[0]?.equipped_on ?? null;

/** A player whose first creature is on a trip and whose second is on a craft. */
async function busyPlayer(ctx: CoreContext) {
  const p = await player(ctx, 1, { species: ['cindle', 'splashet', 'sproutle'], level: 8 });
  skipWelcome(ctx, p.id);
  ctx.sql.exec(
    "INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, 'trail-cap', 'common', ?)",
    p.id,
    ctx.clock.t,
  );
  giveParts(ctx, p.id, { scrap: 100 });
  const [away, working, idle] = p.creatureIds as [string, string, string];
  const wornAway = give(ctx, p.id, 'trail-cap', { seed: 'away' });
  const wornWorking = give(ctx, p.id, 'coal-warm-cap', { seed: 'working' });
  const spare = give(ctx, p.id, 'kelp-cap', { seed: 'spare' });
  for (const [item, creatureId] of [
    [wornAway, away],
    [wornWorking, working],
  ] as const) {
    expect((await p.call('POST', equipPath(item), { creatureId })).status).toBe(200);
  }
  const sent = await p.call('POST', '/api/expeditions', {
    creatureId: away,
    destination: 'tidepools',
    duration: 'short',
    supplies: [],
    idempotencyKey: newKey(),
  });
  expect(sent.status).toBe(200);
  const started = await p.call('POST', '/api/workshop/jobs', {
    kind: 'craft',
    creatureId: working,
    blueprintId: 'trail-cap',
    idempotencyKey: newKey(),
  });
  expect(started.status).toBe(200);
  return { p, away, working, idle, wornAway, wornWorking, spare };
}

const opts = () => ({ gearRng: createSeededRng('gear-busy') });

describe('gear stays put while a creature is away or on a job', () => {
  it('refuses to equip onto, or take an item off, a creature that is away or on a job', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { p, away, working, idle, wornAway, wornWorking, spare } = await busyPlayer(ctx);
        expect(await p.call('POST', equipPath(spare), { creatureId: away })).toMatchObject({
          status: 409,
          body: { error: 'creature_away' },
        });
        expect(await p.call('POST', equipPath(spare), { creatureId: working })).toMatchObject({
          status: 409,
          body: { error: 'creature_on_job' },
        });
        // Taking an item off a busy creature, or onto another one (it would leave its wearer).
        expect(await p.call('POST', equipPath(wornAway), { creatureId: null })).toMatchObject({
          status: 409,
          body: { error: 'creature_away' },
        });
        expect(await p.call('POST', equipPath(wornWorking), { creatureId: idle })).toMatchObject({
          status: 409,
          body: { error: 'creature_on_job' },
        });
        expect(wearerOf(ctx, wornAway)).toBe(away);
        expect(wearerOf(ctx, wornWorking)).toBe(working);
        expect(wearerOf(ctx, spare)).toBeNull();
        // An idle creature can still wear the spare, and "wearing" what it already wears is fine.
        expect((await p.call('POST', equipPath(spare), { creatureId: idle })).status).toBe(200);
        expect((await p.call('POST', equipPath(wornAway), { creatureId: away })).status).toBe(200);
      },
      opts(),
    );
  });

  it('lets a creature change its gear again once its job is claimed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { p, working, spare, wornWorking } = await busyPlayer(ctx);
        ctx.clock.t += 4 * HOUR;
        const jobs = (await p.call('GET', '/api/gear')).body['jobs'] as {
          id: string;
          status: string;
        }[];
        const ready = jobs.find((j) => j.status === 'ready');
        expect(ready).toBeDefined();
        const claim = await p.call('POST', `/api/workshop/jobs/${ready?.id ?? ''}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(claim.status).toBe(200);
        expect((await p.call('POST', equipPath(spare), { creatureId: working })).status).toBe(200);
        expect(wearerOf(ctx, spare)).toBe(working);
        expect(wearerOf(ctx, wornWorking)).toBeNull();
      },
      opts(),
    );
  });

  it('Equip best skips busy creatures, leaves their gear alone and says so', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { p, away, working, idle, wornAway, wornWorking } = await busyPlayer(ctx);
        const better = give(ctx, p.id, 'coal-warm-cap', {
          rarity: 'epic',
          level: 8,
          lines: [
            ['attack', 2],
            ['crit-damage', 2],
            ['ember-reaction', 2],
          ],
        });
        const res = await p.call('POST', '/api/gear/equip-best', {
          creatureIds: [away, working, idle],
        });
        expect(res.status).toBe(200);
        const result = res.body['result'] as {
          changes: { creatureId: string }[];
          skipped: { creatureId: string; reason: string }[];
        };
        expect(result.skipped).toEqual([
          { creatureId: away, reason: 'away' },
          { creatureId: working, reason: 'job' },
        ]);
        expect(result.changes.every((c) => c.creatureId === idle)).toBe(true);
        expect(wearerOf(ctx, wornAway)).toBe(away);
        expect(wearerOf(ctx, wornWorking)).toBe(working);
        expect(wearerOf(ctx, better)).toBe(idle);
        // Only busy creatures: nothing changes, both are listed.
        const none = await p.call('POST', '/api/gear/equip-best', { creatureIds: [away, working] });
        expect(none.body['result']).toEqual({
          changes: [],
          skipped: [
            { creatureId: away, reason: 'away' },
            { creatureId: working, reason: 'job' },
          ],
        });
      },
      opts(),
    );
  });
});
