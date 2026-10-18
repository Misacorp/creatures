import { describe, expect, it } from 'vitest';
import { holdTalent } from '../src/talent-store';
import { runCore, type CoreContext } from './helpers';
import { count, nextGuild, rows, scriptedThenSeeded, seedPlayer } from './raid-helpers';

/**
 * Keep, live for the two branching lines (docs/design/gear-and-creatures-v2.md section 8.2 and 8.4): a
 * duplicate catch of Sproutle or Zipmouse is offered Keep while the line has a form the player does not
 * own and fewer than two creatures; a Kept duplicate is a second creature of the line, which can grow into
 * the other form. Everything goes through the real routes and the shipped content (no injected branches).
 */

let keyCounter = 0;
const newKey = (): string => `keep-${String(++keyCounter).padStart(8, '0')}-test`;

interface Json {
  status: number;
  body: Record<string, unknown>;
}

interface Card {
  id: string;
  species: string;
  offered: { teach: string[]; fuse: string[]; release: boolean; keep: boolean };
  recommended: { choice: string; creatureId?: string };
}

interface Api {
  id: string;
  creatureIds: string[];
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
  pending: () => Promise<Card[]>;
  addCard: (species: string, shiny?: boolean) => { id: string; talentId: string };
  evolve: (creatureId: string, species?: string) => Promise<Json>;
  keep: (cardId: string) => Promise<Json>;
}

async function player(ctx: CoreContext, species: string[], level = 15): Promise<Api> {
  const seeded = seedPlayer(ctx, 1, { level, species, creatures: species.length });
  const user = { id: seeded.id, displayName: seeded.name };
  let secret = await ctx.core.createSession(ctx.guildId, user);
  let signedAt = ctx.clock.t;
  const call = async (method: string, path: string, body?: unknown): Promise<Json> => {
    // The clock jumps with a trip: sign in again when the session is old.
    if (ctx.clock.t - signedAt >= 30 * 60_000) {
      secret = await ctx.core.createSession(ctx.guildId, user);
      signedAt = ctx.clock.t;
    }
    const res = await ctx.request(secret, path, method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  };
  // Every creature starts with a talent in slot 1, as a real one does.
  for (const id of seeded.creatureIds) {
    const row = rows<{ line: string }>(ctx.sql, 'SELECT line FROM creatures WHERE id = ?', id)[0];
    const talentId = row?.line === 'sproutle' ? 'stands-close' : 'quick-to-spark';
    holdTalent(ctx.sql, id, { talentId, golden: false }, 1, ctx.clock.t);
  }
  ctx.core.credit({
    userId: seeded.id,
    currency: 'essence',
    amount: 500,
    source: 'raid',
    idempotencyKey: 'keep-essence',
  });
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
      return { id: added.id, talentId: added.talent.talentId };
    },
    evolve: (creatureId, speciesId) =>
      call('POST', `/api/creatures/${creatureId}/evolve`, {
        ...(speciesId === undefined ? {} : { species: speciesId }),
        idempotencyKey: newKey(),
      }),
    keep: (cardId) =>
      call('POST', `/api/catches/${cardId}/choose`, { choice: 'keep', idempotencyKey: newKey() }),
  };
}

const speciesOfLine = (ctx: CoreContext, line: string): string[] =>
  rows<{ species: string }>(
    ctx.sql,
    'SELECT species FROM creatures WHERE line = ? ORDER BY line_slot',
    line,
  ).map((r) => r.species);

const cardOf = async (p: Api, id: string): Promise<Card> => {
  const card = (await p.pending()).find((c) => c.id === id);
  if (card === undefined) throw new Error('the card is not waiting');
  return card;
};

describe('Keep for a branching line, through a real trip', () => {
  it('offers Keep for a caught Sproutle duplicate, keeps it, and it evolves the other way', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, ['cindle', 'sproutle']);
        const [explorer, sproutle] = p.creatureIds as [string, string];
        ctx.sql.exec(
          'INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1)',
          p.id,
        );
        // A short trip to Verdant Hollow with a catch that is certain: the first common species there.
        const sent = await p.call('POST', '/api/expeditions', {
          creatureId: explorer,
          destination: 'verdant-hollow',
          duration: 'short',
          supplies: [],
          idempotencyKey: newKey(),
        });
        expect(sent.status).toBe(200);
        const trip = sent.body['expedition'] as { id: string; endsAt: number };
        ctx.clock.t = trip.endsAt;
        const claim = await p.call('POST', `/api/expeditions/${trip.id}/claim`, {});
        expect(claim.status).toBe(200);
        const result = claim.body['result'] as { catches: { species: string; outcome: string }[] };
        expect(result.catches).toEqual([
          expect.objectContaining({ species: 'sproutle', outcome: 'duplicate' }),
        ]);

        // The duplicate waits as a card that offers Keep, and the player owns one Sproutle.
        const [card] = await p.pending();
        expect(card?.species).toBe('sproutle');
        expect(card?.offered.keep).toBe(true);
        expect(speciesOfLine(ctx, 'sproutle')).toEqual(['sproutle']);

        const kept = await p.keep(card?.id as string);
        expect(kept.status).toBe(200);
        const made = (kept.body['result'] as { creatureId: string }).creatureId;
        expect(speciesOfLine(ctx, 'sproutle')).toEqual(['sproutle', 'sproutle']);
        expect(
          rows<{ line_slot: number; level: number }>(
            ctx.sql,
            'SELECT line_slot, level FROM creatures WHERE id = ?',
            made,
          ),
        ).toEqual([{ line_slot: 2, level: 1 }]);
        expect(await p.pending()).toEqual([]);

        // The first grows into Thornbuck; the Kept one, once it is level 15, into Sunfawn.
        expect((await p.evolve(sproutle, 'thornbuck')).status).toBe(200);
        ctx.sql.exec('UPDATE creatures SET level = 15 WHERE id = ?', made);
        const sun = await p.evolve(made, 'sunfawn');
        expect(sun.status).toBe(200);
        expect(sun.body['species']).toBe('sunfawn');
        expect(speciesOfLine(ctx, 'sproutle')).toEqual(['thornbuck', 'sunfawn']);
      },
      { rng: scriptedThenSeeded([0, 0, 0, 1], 'keep-catch') },
    );
  });
});

describe('Keep: when it is offered', () => {
  it('is offered for Sproutle and Zipmouse while a form is missing, and never for a line with one', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, ['sproutle', 'zipmouse', 'splashet']);
      const sproutle = p.addCard('sproutle');
      const zipmouse = p.addCard('zipmouse');
      const splashet = p.addCard('splashet');
      expect((await cardOf(p, sproutle.id)).offered.keep).toBe(true);
      expect((await cardOf(p, zipmouse.id)).offered.keep).toBe(true);
      expect((await cardOf(p, splashet.id)).offered.keep).toBe(false);
      const refused = await p.keep(splashet.id);
      expect(refused).toMatchObject({ status: 409, body: { error: 'keep_not_offered' } });
      expect(count(ctx.sql, 'creatures')).toBe(3);
    });
  });

  it('is offered after the only creature evolved (Thornbuck), and Recommended is Keep when nothing is better', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, ['sproutle']);
        const [sproutle] = p.creatureIds as [string];
        expect((await p.evolve(sproutle, 'thornbuck')).status).toBe(200);
        // The line's talent the creature already holds: nothing to teach, so Recommended falls to Keep.
        const card = p.addCard('sproutle');
        const view = await cardOf(p, card.id);
        expect(view.offered.keep).toBe(true);
        expect(view.recommended).toEqual({ choice: 'keep' });
        const kept = await p.keep(card.id);
        expect(kept.status).toBe(200);
        expect(speciesOfLine(ctx, 'sproutle')).toEqual(['thornbuck', 'sproutle']);
        // The Kept Sproutle evolves the other way once it is level 15.
        const made = (kept.body['result'] as { creatureId: string }).creatureId;
        ctx.sql.exec('UPDATE creatures SET level = 15 WHERE id = ?', made);
        expect((await p.evolve(made, 'sunfawn')).body['species']).toBe('sunfawn');
        expect(speciesOfLine(ctx, 'sproutle')).toEqual(['thornbuck', 'sunfawn']);
      },
      { talentRng: scriptedThenSeeded([0, 5], 'keep-talent') },
    );
  });

  it('is not offered once both forms are owned', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, ['zipmouse']);
      const [zip] = p.creatureIds as [string];
      const first = p.addCard('zipmouse');
      expect((await p.keep(first.id)).status).toBe(200);
      const second = rows<{ id: string }>(
        ctx.sql,
        "SELECT id FROM creatures WHERE line = 'zipmouse' AND line_slot = 2",
      )[0]?.id as string;
      ctx.sql.exec('UPDATE creatures SET level = 15 WHERE id = ?', second);
      expect((await p.evolve(zip, 'voltaro')).status).toBe(200);
      expect((await p.evolve(second, 'ohmouse')).status).toBe(200);
      expect(speciesOfLine(ctx, 'zipmouse')).toEqual(['voltaro', 'ohmouse']);
      const card = p.addCard('zipmouse');
      const view = await cardOf(p, card.id);
      expect(view.offered.keep).toBe(false);
      expect(view.offered.teach.length + view.offered.fuse.length).toBeGreaterThan(0);
      expect(await p.keep(card.id)).toMatchObject({
        status: 409,
        body: { error: 'keep_not_offered' },
      });
      expect(speciesOfLine(ctx, 'zipmouse')).toEqual(['voltaro', 'ohmouse']);
    });
  });

  it('is not offered with two creatures of the line, even if both grow the same way', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, ['sproutle']);
      const first = p.addCard('sproutle');
      expect((await p.keep(first.id)).status).toBe(200);
      // Two creatures: Keep is gone while a form is still unowned.
      const next = p.addCard('sproutle');
      expect((await cardOf(p, next.id)).offered.keep).toBe(false);
      expect(await p.keep(next.id)).toMatchObject({ status: 409 });
      expect(count(ctx.sql, 'creatures', "line = 'sproutle'")).toBe(2);
      // The player may grow both into the same form; a third card still offers no Keep.
      const [a, b] = rows<{ id: string }>(
        ctx.sql,
        "SELECT id FROM creatures WHERE line = 'sproutle' ORDER BY line_slot",
      );
      ctx.sql.exec('UPDATE creatures SET level = 15 WHERE line = ?', 'sproutle');
      expect((await p.evolve(a?.id as string, 'thornbuck')).status).toBe(200);
      expect((await p.evolve(b?.id as string, 'thornbuck')).status).toBe(200);
      const third = p.addCard('sproutle');
      expect((await cardOf(p, third.id)).offered.keep).toBe(false);
    });
  });

  it('keeps the card, its talent and its shininess in the second creature', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx, ['zipmouse']);
      const card = p.addCard('zipmouse', true);
      const kept = await p.keep(card.id);
      const made = (kept.body['result'] as { creatureId: string }).creatureId;
      expect(
        rows<{ shiny: number; species: string }>(
          ctx.sql,
          'SELECT shiny, species FROM creatures WHERE id = ?',
          made,
        ),
      ).toEqual([{ shiny: 1, species: 'zipmouse' }]);
      expect(
        rows<{ talent_id: string; slot: number | null }>(
          ctx.sql,
          'SELECT talent_id, slot FROM creature_talents WHERE creature_id = ?',
          made,
        ),
      ).toEqual([{ talent_id: card.talentId, slot: 1 }]);
    });
  });
});
