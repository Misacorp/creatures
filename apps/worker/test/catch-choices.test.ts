import { RULES, fuseOnce, releaseParts, slotsOpen, talentPool } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { bookOf, holdTalent } from '../src/talent-store';
import { runCore, type CoreContext } from './helpers';
import { count, nextGuild, rows, scriptedThenSeeded, seedPlayer } from './raid-helpers';

/**
 * The duplicate choice and the Talent Book (src/catch-choices.ts), through the real routes: Teach, Fuse,
 * Release, Keep, Recommended, "apply Recommended to all", the full queue, retries and the errors.
 */

let keyCounter = 0;
const newKey = (): string => `choices-${String(++keyCounter).padStart(8, '0')}-test`;

interface Json {
  status: number;
  body: Record<string, unknown>;
}

interface Card {
  id: string;
  species: string;
  talent: { id: string; golden: boolean };
  offered: { teach: string[]; fuse: string[]; release: boolean; keep: boolean };
  recommended: { choice: string; creatureId?: string; slot?: number };
}

interface Api {
  id: string;
  creatureIds: string[];
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
  pending: () => Promise<Card[]>;
  /** A duplicate card with a known talent: index into the line's pool, then the golden draw. */
  addCard: (species: string, shiny?: boolean) => { id: string; talentId: string; golden: boolean };
}

/** Talent draws for the cards: [pool index, golden draw (0 is golden, 5 is not)]. */
const draws = (...pairs: [number, number][]) => scriptedThenSeeded(pairs.flat(), 'choices-talents');

async function player(
  ctx: CoreContext,
  n: number,
  species: string[],
  level = 8,
  extra: { fusion?: number } = {},
): Promise<Api> {
  const seeded = seedPlayer(ctx, n, { level, species, creatures: species.length, ...extra });
  const user = { id: seeded.id, displayName: seeded.name };
  let secret = await ctx.core.createSession(ctx.guildId, user);
  let signedAt = ctx.clock.t;
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    if (ctx.clock.t - signedAt >= 30 * 60_000) {
      secret = await ctx.core.createSession(ctx.guildId, user);
      signedAt = ctx.clock.t;
    }
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  // Every creature starts with one talent in slot 1, as a real creature does.
  for (const id of seeded.creatureIds) {
    const row = rows<{ line: string }>(ctx.sql, 'SELECT line FROM creatures WHERE id = ?', id)[0];
    const line = row?.line ?? '';
    const first = line === 'splashet' ? 'playful' : (talentPool(line)[0]?.id ?? 'playful');
    holdTalent(ctx.sql, id, { talentId: first, golden: false }, 1, ctx.clock.t);
  }
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    call,
    pending: async () =>
      ((await call('GET', '/api/state')).body['pending'] ?? []) as unknown as Card[],
    addCard: (speciesId, shiny = false) => {
      ctx.clock.t += 1;
      const added = ctx.storage.transactionSync(() =>
        ctx.core.collection.choices.addPending(
          seeded.id,
          { species: speciesId, shiny },
          { kind: 'expedition', id: `trip-${String(keyCounter)}` },
        ),
      );
      return { id: added.id, talentId: added.talent.talentId, golden: added.talent.golden };
    },
  };
}

const choose = (p: Api, cardId: string, body: Record<string, unknown>, key = newKey()) =>
  p.call('POST', `/api/catches/${cardId}/choose`, { ...body, idempotencyKey: key });

const bait = (ctx: CoreContext, userId: string): number =>
  rows<{ amount: number }>(
    ctx.sql,
    "SELECT amount FROM balances WHERE user_id = ? AND currency = 'bait'",
    userId,
  )[0]?.amount ?? 0;

const parts = (ctx: CoreContext, userId: string): Record<string, number> =>
  Object.fromEntries(
    rows<{ kind: string; amount: number }>(
      ctx.sql,
      'SELECT kind, amount FROM parts WHERE user_id = ?',
      userId,
    ).map((r) => [r.kind, r.amount]),
  );

const give = (ctx: CoreContext, userId: string, amount: number): void => {
  ctx.core.credit({
    userId,
    currency: 'bait',
    amount,
    source: 'test',
    idempotencyKey: `choices-bait:${userId}:${String(++keyCounter)}`,
  });
};

const fusionOf = (ctx: CoreContext, id: string): number =>
  rows<{ fusion_count: number }>(ctx.sql, 'SELECT fusion_count FROM creatures WHERE id = ?', id)[0]
    ?.fusion_count ?? -1;

describe('a duplicate card', () => {
  it('shows the talent it rolled, what is offered and what Recommended is', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const card = p.addCard('splashet');
        const [view] = await p.pending();
        expect(view?.id).toBe(card.id);
        expect(view?.species).toBe('splashet');
        expect(view?.talent.id).toBe(card.talentId);
        expect(view?.offered.release).toBe(true);
        // No shipped line has two branches yet, so Keep is not offered.
        expect(view?.offered.keep).toBe(false);
        expect(view?.offered.fuse).toEqual([p.creatureIds[0]]);
        expect(['teach', 'fuse', 'release']).toContain(view?.recommended.choice);
      },
      { talentRng: draws([1, 5]) },
    );
  });

  it('rolls its talent from the line pool with live randomness, once, when it arrives', async () => {
    const rng = draws([2, 0], [3, 5]);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const first = p.addCard('splashet');
        expect(first).toMatchObject({ talentId: 'bigger-splash', golden: true });
        expect(rng.drawn()).toBe(2);
        // Looking at the cards or answering draws nothing.
        await p.pending();
        await choose(p, first.id, { choice: 'release' });
        expect(rng.drawn()).toBe(2);
        const second = p.addCard('splashet');
        expect(second).toMatchObject({ talentId: 'puddle-hopper', golden: false });
      },
      { talentRng: rng },
    );
  });

  it('keeps a shiny catch shiny on its card', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      p.addCard('splashet', true);
      const [view] = (await p.pending()) as unknown as { shiny: boolean }[];
      expect(view?.shiny).toBe(true);
    });
  });
});

describe('Teach', () => {
  it('puts the talent in the slot, keeps the old one in the book and settles the card', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const [splashet] = p.creatureIds as [string];
        const card = p.addCard('splashet');
        const res = await choose(p, card.id, { choice: 'teach', creatureId: splashet, slot: 1 });
        expect(res.status).toBe(200);
        expect(res.body['result']).toMatchObject({
          choice: 'teach',
          auto: false,
          creatureId: splashet,
          slot: 1,
          talent: { talentId: card.talentId, golden: card.golden },
        });
        const book = bookOf(ctx.sql, splashet);
        expect(book.find((b) => b.slot === 1)?.talentId).toBe(card.talentId);
        expect(book.find((b) => b.talentId === 'playful')?.slot).toBeNull();
        expect(count(ctx.sql, 'pending_catches')).toBe(0);
        expect(await p.pending()).toEqual([]);
        // It cost nothing and paid nothing.
        expect(parts(ctx, p.id)).toEqual({});
      },
      { talentRng: draws([1, 5]) },
    );
  });

  it('is not offered for a talent the creature already has (that quality), but the golden one is', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const [splashet] = p.creatureIds as [string];
        holdTalent(
          ctx.sql,
          splashet,
          { talentId: 'wet-footprints', golden: false },
          null,
          ctx.clock.t,
        );
        const plain = p.addCard('splashet');
        const golden = p.addCard('splashet');
        const cards = await p.pending();
        expect(cards.find((c) => c.id === plain.id)?.offered.teach).toEqual([]);
        expect(cards.find((c) => c.id === golden.id)?.offered.teach).toEqual([splashet]);
        const refused = await choose(p, plain.id, {
          choice: 'teach',
          creatureId: splashet,
          slot: 1,
        });
        expect(refused.status).toBe(409);
        expect(refused.body['error']).toBe('teach_not_offered');
        // The refusal changed nothing: the card still waits, the slot is as it was.
        expect((await p.pending()).map((c) => c.id)).toContain(plain.id);
        expect(bookOf(ctx.sql, splashet).find((b) => b.slot === 1)?.talentId).toBe('playful');
        const ok = await choose(p, golden.id, { choice: 'teach', creatureId: splashet, slot: 1 });
        expect(ok.status).toBe(200);
      },
      { talentRng: draws([1, 5], [1, 0]) },
    );
  });

  it('refuses a slot the level has not opened, and a slot that does not exist', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      const card = p.addCard('splashet');
      const early = await choose(p, card.id, { choice: 'teach', creatureId: splashet, slot: 2 });
      expect(early.status).toBe(409);
      expect(early.body).toMatchObject({ error: 'slot_closed', reason: 'needs_level_20' });
      // A common creature has two slots at most.
      const none = await choose(p, card.id, { choice: 'teach', creatureId: splashet, slot: 3 });
      expect(none.status).toBe(409);
      expect(none.body).toMatchObject({ error: 'slot_closed', reason: 'no_such_slot' });
      expect(count(ctx.sql, 'pending_catches')).toBe(1);
    });
  });

  it('opens the second slot at level 20 (the evolved form) and the third of a rare at 25', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['tidewing'], 20);
        const [tidewing] = p.creatureIds as [string];
        const card = p.addCard('splashet');
        const res = await choose(p, card.id, { choice: 'teach', creatureId: tidewing, slot: 2 });
        expect(res.status).toBe(200);
        expect(bookOf(ctx.sql, tidewing).find((b) => b.slot === 2)?.talentId).toBe(card.talentId);
        const none = await choose(p, p.addCard('splashet').id, {
          choice: 'teach',
          creatureId: tidewing,
          slot: 3,
        });
        expect(none.body).toMatchObject({ error: 'slot_closed', reason: 'no_such_slot' });

        const rare = await player(ctx, 2, ['coralynx'], 24);
        const [coralynx] = rare.creatureIds as [string];
        const first = rare.addCard('coralynx');
        const early = await choose(rare, first.id, {
          choice: 'teach',
          creatureId: coralynx,
          slot: 3,
        });
        expect(early.body).toMatchObject({ error: 'slot_closed', reason: 'needs_level_25' });
        ctx.sql.exec('UPDATE creatures SET level = 25 WHERE id = ?', coralynx);
        const late = await choose(rare, first.id, {
          choice: 'teach',
          creatureId: coralynx,
          slot: 3,
        });
        expect(late.status).toBe(200);
        expect(slotsOpen('common', 20)).toBe(2);
        expect(slotsOpen('rare', 25)).toBe(3);
      },
      { talentRng: draws([1, 5], [2, 5], [1, 5]) },
    );
  });

  it('answers not_found for a creature that is not yours or not of the line', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet', 'cindle']);
      const other = await player(ctx, 2, ['splashet']);
      const [splashet, cindle] = p.creatureIds as [string, string];
      const card = p.addCard('splashet');
      const wrongLine = await choose(p, card.id, { choice: 'teach', creatureId: cindle, slot: 1 });
      const notYours = await choose(p, card.id, {
        choice: 'teach',
        creatureId: other.creatureIds[0],
        slot: 1,
      });
      const unknown = await choose(p, card.id, {
        choice: 'teach',
        creatureId: crypto.randomUUID(),
        slot: 1,
      });
      for (const res of [wrongLine, notYours, unknown]) {
        expect(res.status).toBe(404);
        expect(res.body['error']).toBe('not_found');
      }
      expect(bookOf(ctx.sql, splashet)).toHaveLength(1);
    });
  });
});

describe('Fuse', () => {
  it('raises the fusion count by one step, and a retry does it once', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      const card = p.addCard('splashet');
      const key = newKey();
      const first = await choose(p, card.id, { choice: 'fuse', creatureId: splashet }, key);
      const again = await choose(p, card.id, { choice: 'fuse', creatureId: splashet }, key);
      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect(again.body['result']).toEqual(first.body['result']);
      expect(fusionOf(ctx, splashet)).toBe(fuseOnce(0));
    });
  });

  it('is not possible past the last fusion, and Release or Recommended stay possible', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      ctx.sql.exec('UPDATE creatures SET fusion_count = 5 WHERE id = ?', splashet);
      expect(fuseOnce(5)).toBeNull();
      const card = p.addCard('splashet');
      const [view] = await p.pending();
      expect(view?.offered.fuse).toEqual([]);
      const refused = await choose(p, card.id, { choice: 'fuse', creatureId: splashet });
      expect(refused.status).toBe(409);
      expect(refused.body['error']).toBe('max_fusions');
      expect(fusionOf(ctx, splashet)).toBe(5);
      const rec = await choose(p, card.id, { choice: 'recommended' });
      expect(rec.status).toBe(200);
      expect(['teach', 'release']).toContain((rec.body['result'] as { choice: string }).choice);
    });
  });
});

describe('Release', () => {
  it('pays parts by rarity and element, and never Bait', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      give(ctx, p.id, 50);
      const card = p.addCard('splashet');
      const res = await choose(p, card.id, { choice: 'release' });
      expect(res.status).toBe(200);
      const expected = releaseParts('common', 'tide');
      expect(res.body['result']).toMatchObject({ choice: 'release', parts: expected });
      expect(parts(ctx, p.id)).toEqual(expected);
      expect(bait(ctx, p.id)).toBe(50);
      expect(Object.keys(expected)).not.toContain('bait');
    });
  });

  it('pays once for a retried answer, and nothing for the same card with another key', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const card = p.addCard('splashet');
      const key = newKey();
      const a = await choose(p, card.id, { choice: 'release' }, key);
      const b = await choose(p, card.id, { choice: 'release' }, key);
      const c = await choose(p, card.id, { choice: 'release' }, newKey());
      expect(a.status).toBe(200);
      expect(b.body['result']).toEqual(a.body['result']);
      expect(c.status).toBe(404);
      expect(parts(ctx, p.id)).toEqual(releaseParts('common', 'tide'));
    });
  });

  it('pays more for a rarer duplicate (parts per section 8.2)', () => {
    const common = releaseParts('common', 'tide');
    const rare = releaseParts('rare', 'tide');
    const epic = releaseParts('epic', 'tide');
    expect(common.scrap).toBe(RULES.talents.release.common.scrap);
    expect((rare.scrap ?? 0) > (common.scrap ?? 0)).toBe(true);
    expect((epic.scrap ?? 0) > (rare.scrap ?? 0)).toBe(true);
  });
});

describe('Keep', () => {
  const branching = {
    branchesOf: (line: string) => (line === 'splashet' ? ['tidewing', 'tidecrest'] : []),
  };

  it('is not offered, and refused, for a line without a second branch', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const card = p.addCard('splashet');
      const res = await choose(p, card.id, { choice: 'keep' });
      expect(res.status).toBe(409);
      expect(res.body['error']).toBe('keep_not_offered');
      expect(count(ctx.sql, 'creatures')).toBe(1);
      expect(count(ctx.sql, 'pending_catches')).toBe(1);
    });
  });

  it('makes a second creature of the line, with the talent the card rolled and its shininess', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const card = p.addCard('splashet', true);
        const [view] = await p.pending();
        expect(view?.offered.keep).toBe(true);
        const res = await choose(p, card.id, { choice: 'keep' });
        expect(res.status).toBe(200);
        const made = (res.body['result'] as { creatureId: string }).creatureId;
        const row = rows<{ line_slot: number; shiny: number; level: number; species: string }>(
          ctx.sql,
          'SELECT line_slot, shiny, level, species FROM creatures WHERE id = ?',
          made,
        )[0];
        expect(row).toEqual({ line_slot: 2, shiny: 1, level: 1, species: 'splashet' });
        expect(bookOf(ctx.sql, made)).toEqual([
          { talentId: card.talentId, golden: card.golden, slot: 1 },
        ]);
        // Two creatures of the line now: the limit is two, so Keep goes away.
        const next = p.addCard('splashet');
        const [again] = (await p.pending()).filter((c) => c.id === next.id);
        expect(again?.offered.keep).toBe(false);
        expect(again?.offered.teach.length).toBeGreaterThan(0);
        const refused = await choose(p, next.id, { choice: 'keep' });
        expect(refused.status).toBe(409);
        expect(count(ctx.sql, 'creatures')).toBe(2);
      },
      { ...branching, talentRng: draws([1, 5], [2, 5]) },
    );
  });

  it('never makes a third creature of a line, and a retry makes one', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const card = p.addCard('splashet');
        const key = newKey();
        const a = await choose(p, card.id, { choice: 'keep' }, key);
        const b = await choose(p, card.id, { choice: 'keep' }, key);
        expect(b.body['result']).toEqual(a.body['result']);
        expect(count(ctx.sql, 'creatures')).toBe(2);
        // The database itself refuses a third in the same slot.
        expect(() =>
          ctx.sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at, line_slot)
             VALUES ('x', ?, 'splashet', 'splashet', 1, 'test', 1, 2)`,
            p.id,
          ),
        ).toThrow();
        expect(() =>
          ctx.sql.exec(
            `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at, line_slot)
             VALUES ('y', ?, 'splashet', 'splashet', 1, 'test', 1, 3)`,
            p.id,
          ),
        ).toThrow();
      },
      { ...branching },
    );
  });
});

describe('Recommended', () => {
  it('does what the card says it recommends, marked as chosen by the player', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const card = p.addCard('splashet');
      const [view] = await p.pending();
      const res = await choose(p, card.id, { choice: 'recommended' });
      expect(res.status).toBe(200);
      const result = res.body['result'] as { choice: string; auto: boolean };
      expect(result.choice).toBe(view?.recommended.choice);
      expect(result.auto).toBe(false);
    });
  });

  it('fuses a talent the book already holds (nothing to teach)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const [splashet] = p.creatureIds as [string];
        holdTalent(
          ctx.sql,
          splashet,
          { talentId: 'wet-footprints', golden: false },
          null,
          ctx.clock.t,
        );
        const card = p.addCard('splashet');
        const [view] = await p.pending();
        expect(view?.recommended.choice).toBe('fuse');
        const res = await choose(p, card.id, { choice: 'recommended' });
        expect(res.body['result']).toMatchObject({ choice: 'fuse', creatureId: splashet });
      },
      { talentRng: draws([1, 5]) },
    );
  });
});

describe('apply Recommended to all', () => {
  it('settles every card oldest first, marks them auto, and a retry changes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const [splashet] = p.creatureIds as [string];
        holdTalent(
          ctx.sql,
          splashet,
          { talentId: 'wet-footprints', golden: false },
          null,
          ctx.clock.t,
        );
        const ids = [p.addCard('splashet').id, p.addCard('splashet').id, p.addCard('splashet').id];
        const key = newKey();
        const a = await p.call('POST', '/api/catches/recommended', { idempotencyKey: key });
        expect(a.status).toBe(200);
        const results = a.body['results'] as { pendingId: string; auto: boolean }[];
        expect(results.map((r) => r.pendingId)).toEqual(ids);
        expect(results.every((r) => r.auto)).toBe(true);
        expect(await p.pending()).toEqual([]);
        const fused = fusionOf(ctx, splashet);
        const b = await p.call('POST', '/api/catches/recommended', { idempotencyKey: key });
        expect(b.body['results']).toEqual(a.body['results']);
        expect(fusionOf(ctx, splashet)).toBe(fused);
        // Nothing waiting: a new key answers with no results.
        const c = await p.call('POST', '/api/catches/recommended', { idempotencyKey: newKey() });
        expect(c.body['results']).toEqual([]);
      },
      { talentRng: draws([1, 5], [1, 5], [1, 5]) },
    );
  });

  it('only touches the cards of the player who asked', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const q = await player(ctx, 2, ['splashet']);
      p.addCard('splashet');
      q.addCard('splashet');
      await p.call('POST', '/api/catches/recommended', { idempotencyKey: newKey() });
      expect(await p.pending()).toEqual([]);
      expect(await q.pending()).toHaveLength(1);
    });
  });
});

describe('the waiting queue', () => {
  it('holds ten cards; the eleventh settles the oldest with Recommended', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const ids: string[] = [];
      for (let i = 0; i < RULES.talents.maxPending; i++) ids.push(p.addCard('splashet').id);
      expect(await p.pending()).toHaveLength(RULES.talents.maxPending);
      ctx.clock.t += 1;
      const added = ctx.storage.transactionSync(() =>
        ctx.core.collection.choices.addPending(
          p.id,
          { species: 'splashet', shiny: false },
          { kind: 'expedition', id: 'trip-overflow' },
        ),
      );
      expect(added.settled?.auto).toBe(true);
      expect(added.settled?.pendingId).toBe(ids[0]);
      const left = (await p.pending()).map((c) => c.id);
      expect(left).toHaveLength(RULES.talents.maxPending);
      expect(left).not.toContain(ids[0]);
      expect(left).toContain(added.id);
    });
  });
});

describe('answering is checked', () => {
  it('answers 404 for a card that does not exist or belongs to someone else, the same way', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const q = await player(ctx, 2, ['splashet']);
      const card = p.addCard('splashet');
      const theirs = await choose(q, card.id, { choice: 'release' });
      const none = await choose(q, crypto.randomUUID(), { choice: 'release' });
      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(none.body);
      expect(await p.pending()).toHaveLength(1);
      expect(parts(ctx, q.id)).toEqual({});
    });
  });

  it('refuses a body with an unknown key, a missing key or a bad shape', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      const card = p.addCard('splashet');
      const path = `/api/catches/${card.id}/choose`;
      const bad: unknown[] = [
        { choice: 'release', idempotencyKey: newKey(), extra: 1 },
        { choice: 'release' },
        { choice: 'release', idempotencyKey: 'bad key!' },
        { choice: 'nonsense', idempotencyKey: newKey() },
        { choice: 'fuse', idempotencyKey: newKey() },
        { choice: 'teach', creatureId: splashet, idempotencyKey: newKey() },
        { choice: 'teach', creatureId: splashet, slot: 0, idempotencyKey: newKey() },
        { choice: 'teach', creatureId: splashet, slot: 4, idempotencyKey: newKey() },
        { choice: 'teach', creatureId: 'not-an-id', slot: 1, idempotencyKey: newKey() },
        { choice: 'release', creatureId: splashet, idempotencyKey: newKey() },
        [],
        null,
      ];
      for (const body of bad) {
        const res = await p.call('POST', path, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      expect(await p.pending()).toHaveLength(1);
      expect(
        (
          await p.call('POST', '/api/catches/not-an-id/choose', {
            choice: 'release',
            idempotencyKey: newKey(),
          })
        ).status,
      ).toBe(400);
      expect(
        (await p.call('POST', '/api/catches/recommended', { idempotencyKey: newKey(), x: 1 }))
          .status,
      ).toBe(400);
    });
  });

  it('refuses one key for two different answers', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const a = p.addCard('splashet');
      const b = p.addCard('splashet');
      const key = newKey();
      expect((await choose(p, a.id, { choice: 'release' }, key)).status).toBe(200);
      const reused = await choose(p, b.id, { choice: 'release' }, key);
      expect(reused.status).toBe(409);
      expect(reused.body['error']).toBe('key_conflict');
      expect(await p.pending()).toHaveLength(1);
    });
  });

  it('settles a card once when two answers arrive for it', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      const card = p.addCard('splashet');
      const answers = await Promise.all([
        choose(p, card.id, { choice: 'fuse', creatureId: splashet }),
        choose(p, card.id, { choice: 'release' }),
      ]);
      expect(answers.map((a) => a.status).sort()).toEqual([200, 404]);
      expect(count(ctx.sql, 'pending_catches')).toBe(0);
    });
  });
});

describe('the Talent Book: slotting a talent for Bait', () => {
  const heldGolden = (ctx: CoreContext, creature: string) =>
    holdTalent(ctx.sql, creature, { talentId: 'wet-footprints', golden: true }, null, ctx.clock.t);
  const slot = (p: Api, creature: string, body: Record<string, unknown>, key = newKey()) =>
    p.call('POST', `/api/creatures/${creature}/talents/slot`, { ...body, idempotencyKey: key });

  it('costs the Bait the rules say, is instant, and the old talent stays in the book', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      give(ctx, p.id, 40);
      heldGolden(ctx, splashet);
      const res = await slot(p, splashet, { talentId: 'wet-footprints', golden: true, slot: 1 });
      expect(res.status).toBe(200);
      expect(res.body['result']).toEqual({
        creatureId: splashet,
        talentId: 'wet-footprints',
        golden: true,
        slot: 1,
      });
      expect(bait(ctx, p.id)).toBe(40 - RULES.talents.bookSlotBait);
      const book = bookOf(ctx.sql, splashet);
      expect(book.find((b) => b.slot === 1)).toMatchObject({
        talentId: 'wet-footprints',
        golden: true,
      });
      expect(book.find((b) => b.talentId === 'playful')?.slot).toBeNull();
    });
  });

  it('charges once for a retried request, and refuses the key for another slotting', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      give(ctx, p.id, 40);
      heldGolden(ctx, splashet);
      holdTalent(
        ctx.sql,
        splashet,
        { talentId: 'bigger-splash', golden: false },
        null,
        ctx.clock.t,
      );
      const key = newKey();
      const body = { talentId: 'wet-footprints', golden: true, slot: 1 };
      const a = await slot(p, splashet, body, key);
      const b = await slot(p, splashet, body, key);
      expect(b.status).toBe(200);
      expect(b.body['result']).toEqual(a.body['result']);
      expect(bait(ctx, p.id)).toBe(30);
      const other = await slot(
        p,
        splashet,
        { talentId: 'bigger-splash', golden: false, slot: 1 },
        key,
      );
      expect(other.status).toBe(409);
      expect(other.body['error']).toBe('key_conflict');
      expect(bait(ctx, p.id)).toBe(30);
    });
  });

  it('refuses without enough Bait and changes nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      give(ctx, p.id, RULES.talents.bookSlotBait - 1);
      heldGolden(ctx, splashet);
      const res = await slot(p, splashet, { talentId: 'wet-footprints', golden: true, slot: 1 });
      expect(res.status).toBe(409);
      expect(res.body['error']).toBe('insufficient_funds');
      expect(bait(ctx, p.id)).toBe(RULES.talents.bookSlotBait - 1);
      expect(bookOf(ctx.sql, splashet).find((b) => b.slot === 1)?.talentId).toBe('playful');
    });
  });

  it('refuses a talent that is not in the book, at the other quality, or already in that slot', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      give(ctx, p.id, 100);
      heldGolden(ctx, splashet);
      const never = await slot(p, splashet, { talentId: 'puddle-hopper', golden: false, slot: 1 });
      const quality = await slot(p, splashet, {
        talentId: 'wet-footprints',
        golden: false,
        slot: 1,
      });
      const already = await slot(p, splashet, { talentId: 'playful', golden: false, slot: 1 });
      expect([never.status, quality.status, already.status]).toEqual([404, 404, 409]);
      expect([never.body['error'], quality.body['error'], already.body['error']]).toEqual([
        'not_in_book',
        'not_in_book',
        'already_slotted',
      ]);
      expect(bait(ctx, p.id)).toBe(100);
    });
  });

  it('refuses slots that are closed or do not exist, then works once the level opens it', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['tidewing']);
      const [splashet] = p.creatureIds as [string];
      give(ctx, p.id, 100);
      heldGolden(ctx, splashet);
      const closed = await slot(p, splashet, { talentId: 'wet-footprints', golden: true, slot: 2 });
      expect(closed.status).toBe(409);
      expect(closed.body).toMatchObject({ error: 'slot_closed', reason: 'needs_level_20' });
      const third = await slot(p, splashet, { talentId: 'wet-footprints', golden: true, slot: 3 });
      expect(third.body).toMatchObject({ error: 'slot_closed', reason: 'no_such_slot' });
      expect(
        (await slot(p, splashet, { talentId: 'wet-footprints', golden: true, slot: 4 })).status,
      ).toBe(400);
      ctx.sql.exec('UPDATE creatures SET level = 20 WHERE id = ?', splashet);
      const open = await slot(p, splashet, { talentId: 'wet-footprints', golden: true, slot: 2 });
      expect(open.status).toBe(200);
      expect(bait(ctx, p.id)).toBe(90);
    });
  });

  it('moving a talent to another slot leaves its old slot empty', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['tidewing'], 20);
      const [splashet] = p.creatureIds as [string];
      give(ctx, p.id, 100);
      const res = await slot(p, splashet, { talentId: 'playful', golden: false, slot: 2 });
      expect(res.status).toBe(200);
      const book = bookOf(ctx.sql, splashet);
      expect(book.filter((b) => b.slot !== null)).toEqual([
        { talentId: 'playful', golden: false, slot: 2 },
      ]);
    });
  });

  it('answers not_found the same way for a creature that is not yours', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const q = await player(ctx, 2, ['splashet']);
      give(ctx, p.id, 100);
      const theirs = await slot(p, q.creatureIds[0] as string, {
        talentId: 'playful',
        golden: false,
        slot: 1,
      });
      const none = await slot(p, crypto.randomUUID(), {
        talentId: 'playful',
        golden: false,
        slot: 1,
      });
      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(none.body);
      expect(bait(ctx, p.id)).toBe(100);
    });
  });

  it('refuses a body with an unknown key, an unknown talent id shape or a missing field', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, 1, ['splashet']);
      const [splashet] = p.creatureIds as [string];
      const path = `/api/creatures/${splashet}/talents/slot`;
      const bad: unknown[] = [
        { talentId: 'playful', golden: false, slot: 1, idempotencyKey: newKey(), extra: 1 },
        { talentId: 'playful', golden: false, slot: 1 },
        { talentId: 'playful', slot: 1, idempotencyKey: newKey() },
        { talentId: 'Bad Id!', golden: false, slot: 1, idempotencyKey: newKey() },
        { talentId: 'playful', golden: 'no', slot: 1, idempotencyKey: newKey() },
        { talentId: 'playful', golden: false, slot: 1.5, idempotencyKey: newKey() },
      ];
      for (const body of bad) {
        expect((await p.call('POST', path, body)).status, JSON.stringify(body)).toBe(400);
      }
    });
  });
});

describe('analytics of the duplicate choice and the Talent Book', () => {
  const events = (ctx: CoreContext, kind: string) =>
    rows<{ props_json: string }>(
      ctx.sql,
      'SELECT props_json FROM analytics_events WHERE kind = ? ORDER BY id',
      kind,
    ).map((r) => JSON.parse(r.props_json) as Record<string, unknown>);

  it('logs one event for each settled card (auto or not) and one for each slotting, never twice on a retry', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, ['splashet']);
        const [splashet] = p.creatureIds as [string];
        give(ctx, p.id, 30);
        const a = p.addCard('splashet');
        const key = newKey();
        await choose(p, a.id, { choice: 'teach', creatureId: splashet, slot: 1 }, key);
        await choose(p, a.id, { choice: 'teach', creatureId: splashet, slot: 1 }, key);
        const b = p.addCard('splashet');
        await choose(p, b.id, { choice: 'release' });
        p.addCard('splashet');
        await p.call('POST', '/api/catches/recommended', { idempotencyKey: newKey() });
        expect(events(ctx, 'duplicate_choice').map((e) => [e['choice'], e['auto']])).toEqual([
          ['teach', false],
          ['release', false],
          [expect.stringMatching(/teach|fuse|release/), true],
        ]);
        // Three cards rolled a talent each.
        expect(events(ctx, 'talent_roll')).toHaveLength(3);
        const body = { talentId: 'playful', golden: false, slot: 1, idempotencyKey: newKey() };
        await p.call('POST', `/api/creatures/${splashet}/talents/slot`, body);
        await p.call('POST', `/api/creatures/${splashet}/talents/slot`, body);
        expect(events(ctx, 'talent_slot')).toEqual([
          { species: 'splashet', talent: 'playful', golden: false, slot: 1 },
        ]);
      },
      { talentRng: draws([1, 5], [2, 5], [3, 5]) },
    );
  });
});
