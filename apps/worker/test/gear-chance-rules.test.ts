import {
  craftCost,
  createSeededRng,
  dismantleRange,
  effectiveStats,
  rollTalentSecondLook,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { apiPlayer as player, giveItem, newKey, skipWelcome, type Api } from './gear-helpers';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, rows, scriptedThenSeeded } from './raid-helpers';
import { speciesOf } from '../src/species';

/**
 * The two chance lines that work outside the fight (gear-and-creatures-v2.md 6.3), through the real
 * routes: Tinker's luck (a dismantle the wearer runs can refund the full craft cost) and Second look (a
 * duplicate its trip brings rolls its talent twice and keeps the better). Both are rolled at the claim,
 * with the server's live randomness (a seeded or scripted source here), and are stored with the result,
 * so a retry changes nothing.
 */

interface JobBody {
  id: string;
  endsAt: number;
}
interface GearBody {
  jobs: JobBody[];
}

/** Every roll lands on its lowest number: each chance succeeds, each range gives its minimum. */
const lowest: Rng = { nextU32: () => 0 };
/** Every roll lands high: a chance of under 99.98% fails. */
const highest: Rng = { nextU32: () => 4_294_959_998 };

const equip = (p: Api, itemId: string, creatureId: string) =>
  p.call('POST', `/api/gear/${itemId}/equip`, { creatureId });
const startDismantle = (p: Api, creatureId: string, itemIds: string[]) =>
  p.call('POST', '/api/workshop/jobs', {
    kind: 'dismantle',
    creatureId,
    itemIds,
    idempotencyKey: newKey(),
  });
const claim = (p: Api, jobId: string, key = newKey()) =>
  p.call('POST', `/api/workshop/jobs/${jobId}/claim`, { idempotencyKey: key });
const partsOf = (ctx: CoreContext, userId: string): Record<string, number> =>
  Object.fromEntries(
    rows<{ kind: string; amount: number }>(
      ctx.sql,
      'SELECT kind, amount FROM parts WHERE user_id = ?',
      userId,
    ).map((r) => [r.kind, r.amount]),
  );

/** A player with a worker that wears a Tinker's luck charm (item level 1, an Epic: 4% + 2 points at tier I). */
async function tinker(ctx: CoreContext) {
  const p = await player(ctx, 1, { level: 15, species: ['cindle', 'splashet'] });
  skipWelcome(ctx, p.id);
  const [worker, plain] = p.creatureIds as [string, string];
  const charm = giveItem(ctx.sql, p.id, 'trail-charm', {
    rarity: 'epic',
    level: 1,
    lines: [['tinkers-luck', 0]],
    now: ctx.clock.t,
  });
  expect((await equip(p, charm, worker)).status).toBe(200);
  return { p, worker, plain };
}

describe("Tinker's luck through the Workshop", () => {
  it('refunds the full craft cost of an item when the chance hits, and says how many', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { p, worker, plain } = await tinker(ctx);
        const itemId = giveItem(ctx.sql, p.id, 'kelp-cap', {
          rarity: 'rare',
          level: 8,
          now: ctx.clock.t,
        });
        const other = giveItem(ctx.sql, p.id, 'kelp-cap', {
          rarity: 'rare',
          level: 8,
          now: ctx.clock.t,
        });
        const cost = craftCost('kelp-cap', 8);
        const range = dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 8 }]);
        // The creature without the line: the bottom of the ranges.
        const a = await startDismantle(p, plain, [other]);
        const jobA = (a.body['gear'] as GearBody).jobs[0] as JobBody;
        ctx.clock.t = jobA.endsAt;
        const before = partsOf(ctx, p.id);
        const resA = (await claim(p, jobA.id)).body['result'] as Record<string, unknown>;
        expect(resA).not.toHaveProperty('tinkered');
        expect((resA['parts'] as Record<string, number>)['scrap']).toBe(range.scrap.min);
        expect(range.scrap.min).toBeLessThan(cost.scrap ?? 0);
        expect(partsOf(ctx, p.id)['scrap']).toBe((before['scrap'] ?? 0) + range.scrap.min);
        // The worker with Tinker's luck (the rng makes every chance hit): the full cost.
        const b = await startDismantle(p, worker, [itemId]);
        const jobB = (b.body['gear'] as GearBody).jobs.find((j) => j.id !== jobA.id) as JobBody;
        ctx.clock.t = jobB.endsAt;
        const mid = partsOf(ctx, p.id);
        const resB = (await claim(p, jobB.id)).body['result'] as Record<string, unknown>;
        expect(resB['tinkered']).toBe(1);
        const parts = resB['parts'] as Record<string, number>;
        expect(parts['scrap']).toBeGreaterThanOrEqual(cost.scrap ?? 0);
        expect(parts['tide-shard']).toBeGreaterThanOrEqual(cost['tide-shard'] ?? 0);
        expect(partsOf(ctx, p.id)['scrap']).toBe((mid['scrap'] ?? 0) + (parts['scrap'] ?? 0));
      },
      { gearRng: lowest },
    );
  });

  it('refunds nothing extra when the chance misses, and the result has no tinkered count', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { p, worker } = await tinker(ctx);
        const itemId = giveItem(ctx.sql, p.id, 'kelp-cap', {
          rarity: 'rare',
          level: 8,
          now: ctx.clock.t,
        });
        const range = dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 8 }]);
        const started = await startDismantle(p, worker, [itemId]);
        const job = (started.body['gear'] as GearBody).jobs[0] as JobBody;
        ctx.clock.t = job.endsAt;
        const res = (await claim(p, job.id)).body['result'] as Record<string, unknown>;
        expect(res).not.toHaveProperty('tinkered');
        const scrap = (res['parts'] as Record<string, number>)['scrap'] ?? 0;
        expect(scrap).toBeGreaterThanOrEqual(range.scrap.min);
        expect(scrap).toBeLessThanOrEqual(range.scrap.max);
        expect(scrap).toBeLessThan(craftCost('kelp-cap', 8).scrap ?? 0);
      },
      { gearRng: highest },
    );
  });

  it('counts each item of a bundle of Commons, and the retry or a race pays once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { p, worker } = await tinker(ctx);
        const ids = [1, 2, 3].map(() =>
          giveItem(ctx.sql, p.id, 'trail-cap', { rarity: 'common', level: 4, now: ctx.clock.t }),
        );
        const started = await startDismantle(p, worker, ids);
        const job = (started.body['gear'] as GearBody).jobs[0] as JobBody;
        ctx.clock.t = job.endsAt;
        const before = partsOf(ctx, p.id)['scrap'] ?? 0;
        const key = newKey();
        const results = await Promise.all([
          claim(p, job.id, key),
          claim(p, job.id, key),
          claim(p, job.id),
          claim(p, job.id),
        ]);
        for (const r of results) expect(r.status).toBe(200);
        const first = results[0]?.body['result'] as Record<string, unknown>;
        expect(first['tinkered']).toBe(3);
        for (const r of results) expect(r.body['result']).toEqual(first);
        // The parts were credited once.
        const scrap = (first['parts'] as Record<string, number>)['scrap'] ?? 0;
        expect(partsOf(ctx, p.id)['scrap']).toBe(before + scrap);
        expect(scrap).toBeGreaterThanOrEqual(3 * (craftCost('trail-cap', 4).scrap ?? 0));
      },
      { gearRng: lowest },
    );
  });

  it('a worker that does not wear the line is unaffected, and the dice drawn are the same as before', async () => {
    const draws: number[] = [];
    for (const wearIt of [false, true]) {
      const rng = scriptedThenSeeded([], 'tinker-draws');
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await player(ctx, 1, { level: 15, species: ['cindle'] });
          skipWelcome(ctx, p.id);
          const [worker] = p.creatureIds as [string];
          if (wearIt) {
            const charm = giveItem(ctx.sql, p.id, 'trail-charm', {
              rarity: 'rare',
              level: 1,
              lines: [['echo', 0]],
              now: ctx.clock.t,
            });
            expect((await equip(p, charm, worker)).status).toBe(200);
          }
          const itemId = giveItem(ctx.sql, p.id, 'kelp-cap', {
            rarity: 'epic',
            level: 8,
            now: ctx.clock.t,
          });
          const started = await startDismantle(p, worker, [itemId]);
          const job = (started.body['gear'] as GearBody).jobs[0] as JobBody;
          ctx.clock.t = job.endsAt;
          const base = rng.drawn();
          await claim(p, job.id);
          draws.push(rng.drawn() - base);
        },
        { gearRng: rng },
      );
    }
    // A charm with another line (Echo) draws exactly what no charm does.
    expect(draws[1]).toBe(draws[0]);
  });
});

describe('Second look on a trip that brings a duplicate', () => {
  /** A cindle explorer (Second look charm or not) and a sproutle at home, the trip to Verdant Hollow of the Keep tests. */
  async function trip(ctx: CoreContext, wear: boolean) {
    const p = await player(ctx, 1, { level: 15, species: ['cindle', 'sproutle'] });
    skipWelcome(ctx, p.id);
    const [explorer] = p.creatureIds as [string, string];
    ctx.sql.exec('INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1)', p.id);
    if (wear) {
      const charm = giveItem(ctx.sql, p.id, 'trail-charm', {
        rarity: 'epic',
        level: 1,
        lines: [['second-look', 4]],
        now: ctx.clock.t,
      });
      expect((await equip(p, charm, explorer)).status).toBe(200);
    }
    const sent = await p.call('POST', '/api/expeditions', {
      creatureId: explorer,
      destination: 'verdant-hollow',
      duration: 'short',
      supplies: [],
      idempotencyKey: newKey(),
    });
    expect(sent.status).toBe(200);
    const exp = sent.body['expedition'] as { id: string; endsAt: number };
    ctx.clock.t = exp.endsAt;
    const claimed = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
    expect(claimed.status).toBe(200);
    const catches = (
      claimed.body['result'] as {
        catches: { species: string; outcome: string; secondLook?: true; talent?: { id: string } }[];
      }
    ).catches;
    const pending = (await p.call('GET', '/api/state')).body['pending'] as {
      id: string;
      talent: { id: string; golden: boolean };
    }[];
    return { p, catches, pending };
  }

  const catchRng = () => scriptedThenSeeded([0, 0, 0, 1], 'second-look-catch');

  it('rolls twice with the line and keeps the better; the trip result and the card say so', async () => {
    // The talent dice are a seeded stream, so what Second look must keep is known in advance: the
    // creature that would learn it is the player's Sproutle (level 15, no fusions).
    const sproutle = speciesOf('sproutle');
    const wearer = {
      role: sproutle.role,
      element: sproutle.element,
      stats: effectiveStats(sproutle, 15, 0),
    };
    // A seed whose first draws hit the 14% chance (an Epic's tier V is 12% + 2 points).
    let seed = '';
    for (let i = 0; seed === '' && i < 200; i++) {
      if (
        rollTalentSecondLook(createSeededRng(`sl-${String(i)}`), 'sproutle', 1_400, wearer).looked
      )
        seed = `sl-${String(i)}`;
    }
    expect(seed).not.toBe('');
    const want = rollTalentSecondLook(createSeededRng(seed), 'sproutle', 1_400, wearer);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { catches, pending } = await trip(ctx, true);
        expect(catches).toHaveLength(1);
        expect(catches[0]).toMatchObject({
          species: 'sproutle',
          outcome: 'duplicate',
          secondLook: true,
        });
        expect(pending).toHaveLength(1);
        expect(pending[0]?.talent).toEqual(
          expect.objectContaining({ id: want.roll.talentId, golden: want.roll.golden }),
        );
        expect(catches[0]?.talent?.id).toBe(want.roll.talentId);
      },
      { rng: catchRng(), talentRng: createSeededRng(seed) },
    );
  });

  it('with a talent source that always hits the chance, the card says it rolled twice', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const { catches, pending } = await trip(ctx, true);
        expect(catches[0]?.secondLook).toBe(true);
        expect(pending).toHaveLength(1);
      },
      { rng: catchRng(), talentRng: lowest },
    );
  });

  it('without the line there is no secondLook flag and the talent is the plain first roll', async () => {
    const seen: string[] = [];
    for (const wear of [false, true]) {
      const talentRng = scriptedThenSeeded([], 'sl-draws');
      await runCore(
        nextGuild(),
        async (ctx) => {
          const { catches, pending } = await trip(ctx, wear);
          expect(catches[0]?.outcome).toBe('duplicate');
          if (!wear) {
            expect(catches[0]).not.toHaveProperty('secondLook');
            // Exactly one talent roll: its two dice (the pick and the golden check).
            expect(talentRng.drawn()).toBe(2);
          } else {
            expect(talentRng.drawn()).toBeGreaterThanOrEqual(3);
          }
          seen.push(pending[0]?.talent.id ?? '');
        },
        { rng: catchRng(), talentRng },
      );
    }
    expect(seen).toHaveLength(2);
  });

  it('a retry of the claim returns the stored result and rolls nothing more', async () => {
    const talentRng = scriptedThenSeeded([], 'sl-retry');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 15, species: ['cindle', 'sproutle'] });
        skipWelcome(ctx, p.id);
        const [explorer] = p.creatureIds as [string, string];
        ctx.sql.exec(
          'INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1)',
          p.id,
        );
        const charm = giveItem(ctx.sql, p.id, 'trail-charm', {
          rarity: 'epic',
          level: 1,
          lines: [['second-look', 4]],
          now: ctx.clock.t,
        });
        expect((await equip(p, charm, explorer)).status).toBe(200);
        const sent = await p.call('POST', '/api/expeditions', {
          creatureId: explorer,
          destination: 'verdant-hollow',
          duration: 'short',
          supplies: [],
          idempotencyKey: newKey(),
        });
        const exp = sent.body['expedition'] as { id: string; endsAt: number };
        ctx.clock.t = exp.endsAt;
        const results = await Promise.all(
          [1, 2, 3].map(() => p.call('POST', `/api/expeditions/${exp.id}/claim`, {})),
        );
        for (const r of results) expect(r.status).toBe(200);
        const first = results[0]?.body['result'];
        for (const r of results) expect(r.body['result']).toEqual(first);
        const drawn = talentRng.drawn();
        expect(
          rows(ctx.sql, 'SELECT id FROM pending_catches WHERE user_id = ?', p.id),
        ).toHaveLength(1);
        const again = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
        expect(again.body['result']).toEqual(first);
        expect(talentRng.drawn()).toBe(drawn);
      },
      { rng: scriptedThenSeeded([0, 0, 0, 1], 'sl-retry-catch'), talentRng },
    );
  });
});
