import { describe, expect, it } from 'vitest';
import { giveItem } from './gear-helpers';
import type { CoreContext } from './helpers';
import { count, rows, runRaid, seedPlayer } from './raid-helpers';

/**
 * Branch evolutions (docs/design/gear-and-creatures-v2.md section 8.4): every evolving line grows into one
 * of two forms (Sproutle: Thornbuck or Sunfawn; Zipmouse: Voltaro or Ohmouse; and the six other lines). The request names the form; the server checks it is one of
 * the creature's branches, the level and the Essence; the choice is permanent and idempotent per key.
 */

let keyCounter = 0;
const newKey = () => `branch-${String(++keyCounter).padStart(8, '0')}-key`;

interface EvolveBody {
  error?: string;
  species: string;
  firstOnServer: boolean;
  unequipped: number;
  state: {
    balances: { essence: number };
    creatures: {
      id: string;
      species: string;
      line: string;
      level: number;
      levelCap: number;
      evolution?: unknown;
    }[];
  };
}

async function evolve(
  ctx: CoreContext,
  secret: string,
  creatureId: string,
  key = newKey(),
  species?: unknown,
) {
  const res = await ctx.request(secret, `/api/creatures/${creatureId}/evolve`, 'POST', {
    ...(species === undefined ? {} : { species }),
    idempotencyKey: key,
  });
  return { status: res.status, body: await res.json<EvolveBody>() };
}

const giveEssence = (ctx: CoreContext, userId: string, amount: number) =>
  ctx.core.credit({
    userId,
    currency: 'essence',
    amount,
    source: 'raid',
    idempotencyKey: 'seed:essence',
  });

/** One player with a Sproutle, a Zipmouse and a second Sproutle (a Kept duplicate), 200 Essence. */
async function branching(ctx: CoreContext, level = 15) {
  const p = seedPlayer(ctx, 1, { creatures: 2, level, species: ['sproutle', 'zipmouse'] });
  const second = crypto.randomUUID();
  ctx.sql.exec(
    `INSERT INTO creatures (id, user_id, line, species, level, origin, caught_at, line_slot, ribbons)
     VALUES (?, ?, 'sproutle', 'sproutle', ?, 'test', ?, 2, 0)`,
    second,
    p.id,
    level,
    ctx.clock.t + 5,
  );
  p.creatureIds.push(second);
  const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
  giveEssence(ctx, p.id, 200);
  return {
    p,
    secret,
    sproutle: p.creatureIds[0] as string,
    zipmouse: p.creatureIds[1] as string,
    sproutle2: p.creatureIds[2] as string,
  };
}

const speciesOf = (ctx: CoreContext, id: string): string | undefined =>
  rows<{ species: string }>(ctx.sql, 'SELECT species FROM creatures WHERE id = ?', id)[0]?.species;

const wornOn = (ctx: CoreContext, itemId: string): string | null =>
  rows<{ equipped_on: string | null }>(
    ctx.sql,
    'SELECT equipped_on FROM gear_items WHERE id = ?',
    itemId,
  )[0]?.equipped_on ?? null;

describe('branch evolutions (Sproutle and Zipmouse)', () => {
  it('shows both forms on the creature, and one form for a line that does not branch', async () => {
    await runRaid(async (ctx) => {
      const { p, sproutle, zipmouse } = await branching(ctx);
      const creatures = ctx.core.collection.state(p.id).creatures;
      expect(creatures.find((c) => c.id === sproutle)?.evolution).toEqual({
        toSpecies: 'thornbuck',
        level: 15,
        essence: 20,
        available: true,
        alt: { toSpecies: 'sunfawn' },
      });
      expect(creatures.find((c) => c.id === zipmouse)?.evolution).toEqual({
        toSpecies: 'voltaro',
        level: 15,
        essence: 20,
        available: true,
        alt: { toSpecies: 'ohmouse' },
      });
      // Every evolving line now has two forms; a single-stage species has no evolution at all.
      const other = seedPlayer(ctx, 2, {
        creatures: 2,
        level: 15,
        species: ['splashet', 'coralynx'],
      });
      const [splashet, coralynx] = ctx.core.collection.state(other.id).creatures;
      expect(splashet?.evolution).toEqual({
        toSpecies: 'tidewing',
        level: 15,
        essence: 20,
        available: false,
        alt: { toSpecies: 'geyserpup' },
      });
      expect(coralynx?.evolution).toBeUndefined();
    });
  });

  it('evolves into the named branch: Sunfawn and Ohmouse', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, sproutle, zipmouse } = await branching(ctx);
      const a = await evolve(ctx, secret, sproutle, newKey(), 'sunfawn');
      expect(a.status).toBe(200);
      expect(a.body.species).toBe('sunfawn');
      expect(a.body.firstOnServer).toBe(true);
      const sunfawn = a.body.state.creatures.find((c) => c.id === sproutle);
      expect(sunfawn).toMatchObject({
        species: 'sunfawn',
        line: 'sproutle',
        level: 15,
        levelCap: 30,
      });
      expect(sunfawn?.evolution).toBeUndefined();
      const b = await evolve(ctx, secret, zipmouse, newKey(), 'ohmouse');
      expect(b.body.species).toBe('ohmouse');
      expect(speciesOf(ctx, zipmouse)).toBe('ohmouse');
      expect(ctx.core.balances(p.id).essence).toBe(160); // 20 each
      expect(count(ctx.sql, 'ledger', "source = 'evolution'")).toBe(2);
      expect(ctx.core.collection.state(p.id).serverFirsts).toContainEqual(
        expect.objectContaining({ kind: 'evolve', species: 'ohmouse', mine: true }),
      );
    });
  });

  it('naming the first branch, or naming none (an older client), gives the first branch', async () => {
    await runRaid(async (ctx) => {
      const { secret, sproutle, zipmouse } = await branching(ctx);
      expect((await evolve(ctx, secret, sproutle, newKey(), 'thornbuck')).body.species).toBe(
        'thornbuck',
      );
      expect((await evolve(ctx, secret, zipmouse)).body.species).toBe('voltaro');
    });
  });

  it('refuses a species that is not a branch of this creature, and charges nothing', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, sproutle } = await branching(ctx);
      for (const species of ['voltaro', 'ohmouse', 'sproutle', 'tidewing', 'gaiadrake']) {
        const res = await evolve(ctx, secret, sproutle, newKey(), species);
        expect(res, species).toMatchObject({ status: 409, body: { error: 'not_a_branch' } });
      }
      expect(speciesOf(ctx, sproutle)).toBe('sproutle');
      expect(ctx.core.balances(p.id).essence).toBe(200);
      expect(count(ctx.sql, 'server_firsts', "kind = 'evolve'")).toBe(0);
      // A species that does not exist, a non-string and unknown keys are bad input.
      for (const species of ['nobody', 7, null, '']) {
        const res = await evolve(ctx, secret, sproutle, newKey(), species);
        expect(res.status, String(species)).toBe(400);
      }
      const extra = await ctx.request(secret, `/api/creatures/${sproutle}/evolve`, 'POST', {
        species: 'sunfawn',
        target: 'sunfawn',
        idempotencyKey: newKey(),
      });
      expect(extra.status).toBe(400);
      expect(speciesOf(ctx, sproutle)).toBe('sproutle');
    });
  });

  it('checks the level and Essence for the branch, like any evolution', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, sproutle } = await branching(ctx, 14);
      expect(await evolve(ctx, secret, sproutle, newKey(), 'sunfawn')).toMatchObject({
        status: 409,
        body: { error: 'level_too_low' },
      });
      ctx.sql.exec('UPDATE creatures SET level = 15 WHERE id = ?', sproutle);
      ctx.sql.exec("DELETE FROM balances WHERE user_id = ? AND currency = 'essence'", p.id);
      expect(await evolve(ctx, secret, sproutle, newKey(), 'sunfawn')).toMatchObject({
        status: 409,
        body: { error: 'insufficient_funds' },
      });
      expect(speciesOf(ctx, sproutle)).toBe('sproutle');
    });
  });

  it('is permanent: no second evolution, no re-evolving into the other branch', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, sproutle } = await branching(ctx);
      expect((await evolve(ctx, secret, sproutle, newKey(), 'sunfawn')).status).toBe(200);
      for (const species of ['thornbuck', 'sunfawn', undefined]) {
        expect(await evolve(ctx, secret, sproutle, newKey(), species)).toMatchObject({
          status: 409,
          body: { error: 'not_evolvable' },
        });
      }
      expect(speciesOf(ctx, sproutle)).toBe('sunfawn');
      expect(ctx.core.balances(p.id).essence).toBe(180);
    });
  });

  it('is idempotent per key: a retry returns the stored form, another form is a conflict', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, sproutle } = await branching(ctx);
      const key = newKey();
      const first = await evolve(ctx, secret, sproutle, key, 'sunfawn');
      const again = await evolve(ctx, secret, sproutle, key, 'sunfawn');
      expect(again.status).toBe(200);
      expect(again.body.species).toBe('sunfawn');
      expect(again.body.firstOnServer).toBe(first.body.firstOnServer);
      // A retry that names nothing (an older client) is the same action.
      const bare = await evolve(ctx, secret, sproutle, key);
      expect(bare.body.species).toBe('sunfawn');
      expect(ctx.core.balances(p.id).essence).toBe(180);
      // The same key for the other branch is a conflict, and nothing changes.
      const clash = await evolve(ctx, secret, sproutle, key, 'thornbuck');
      expect(clash).toMatchObject({ status: 409, body: { error: 'key_conflict' } });
      expect(speciesOf(ctx, sproutle)).toBe('sunfawn');
      expect(count(ctx.sql, 'ledger', "source = 'evolution'")).toBe(1);
    });
  });

  it('lets the second creature of the line grow the other way', async () => {
    await runRaid(async (ctx) => {
      const { secret, sproutle, sproutle2 } = await branching(ctx);
      expect((await evolve(ctx, secret, sproutle, newKey(), 'thornbuck')).body.species).toBe(
        'thornbuck',
      );
      expect((await evolve(ctx, secret, sproutle2, newKey(), 'sunfawn')).body.species).toBe(
        'sunfawn',
      );
      expect(
        rows<{ species: string }>(
          ctx.sql,
          "SELECT species FROM creatures WHERE line = 'sproutle' ORDER BY line_slot",
        ).map((r) => r.species),
      ).toEqual(['thornbuck', 'sunfawn']);
    });
  });

  it('takes off a Charm locked to the old role when the new form is another role', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, sproutle, zipmouse, sproutle2 } = await branching(ctx);
      const bell = giveItem(ctx.sql, p.id, 'wardens-bell'); // a Guard Charm
      const print = giveItem(ctx.sql, p.id, 'footprint-charm'); // a Setter Charm
      const wear = (item: string, creature: string): void => {
        ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creature, item);
      };
      wear(bell, sproutle);
      wear(print, zipmouse);
      const second = giveItem(ctx.sql, p.id, 'wardens-bell', { seed: 'second' });
      wear(second, sproutle2);
      // Sproutle (Guard) grows into Sunfawn (Support): the Guard Charm comes off; the other Sproutle keeps its own.
      const sun = await evolve(ctx, secret, sproutle, newKey(), 'sunfawn');
      expect(sun.body.unequipped).toBe(1);
      expect(wornOn(ctx, bell)).toBeNull();
      expect(wornOn(ctx, second)).toBe(sproutle2);
      // Zipmouse (Setter) grows into Ohmouse (Guard): the Setter Charm comes off.
      const ohm = await evolve(ctx, secret, zipmouse, newKey(), 'ohmouse');
      expect(ohm.body.unequipped).toBe(1);
      expect(wornOn(ctx, print)).toBeNull();
    });
  });

  it('keeps a Charm that the new form can still wear', async () => {
    await runRaid(async (ctx) => {
      const { p, secret, sproutle } = await branching(ctx);
      const bell = giveItem(ctx.sql, p.id, 'wardens-bell');
      ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', sproutle, bell);
      const res = await evolve(ctx, secret, sproutle, newKey(), 'thornbuck');
      expect(res.body.unequipped).toBe(0);
      expect(wornOn(ctx, bell)).toBe(sproutle);
    });
  });
});

/** Every evolving line: its stage-1 species, its first and second form, and the Essence the choice costs. */
const LINES = [
  ['splashet', 'tidewing', 'geyserpup', 20],
  ['cindle', 'pyrelynx', 'wickat', 20],
  ['sproutle', 'thornbuck', 'sunfawn', 20],
  ['zipmouse', 'voltaro', 'ohmouse', 20],
  ['mistnewt', 'fogwyrm', 'drizzlewt', 20],
  ['ashmole', 'magmole', 'kilnmole', 20],
  ['stormray', 'tempestray', 'halcyray', 40],
  ['mossback', 'ancientshell', 'bloomback', 40],
] as const;

/** One player with one creature of the line at level 15 and 200 Essence. */
async function oneOf(ctx: CoreContext, line: string) {
  const p = seedPlayer(ctx, 1, { creatures: 1, level: 15, species: [line] });
  const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
  giveEssence(ctx, p.id, 200);
  return { p, secret, creature: p.creatureIds[0] as string };
}

describe('branch evolutions of every evolving line', () => {
  it.each(LINES)(
    '%s shows its two forms at one price, level 15',
    async (line, first, second, essence) => {
      await runRaid(async (ctx) => {
        const { p, creature } = await oneOf(ctx, line);
        const view = ctx.core.collection.state(p.id).creatures.find((c) => c.id === creature);
        expect(view?.evolution).toEqual({
          toSpecies: first,
          level: 15,
          essence,
          available: true,
          alt: { toSpecies: second },
        });
      });
    },
  );

  it.each(
    LINES.flatMap(([line, first, second, essence]) => [
      [line, first, essence, second] as const,
      [line, second, essence, first] as const,
    ]),
  )(
    '%s grows into %s for %i Essence, for good (the other form is refused afterwards)',
    async (line, form, essence, other) => {
      await runRaid(async (ctx) => {
        const { p, secret, creature } = await oneOf(ctx, line);
        const res = await evolve(ctx, secret, creature, newKey(), form);
        expect(res.status).toBe(200);
        expect(res.body.species).toBe(form);
        expect(res.body.state.creatures.find((c) => c.id === creature)).toMatchObject({
          species: form,
          line,
          level: 15,
          levelCap: 30,
        });
        expect(speciesOf(ctx, creature)).toBe(form);
        expect(ctx.core.balances(p.id).essence).toBe(200 - essence);
        // The choice cannot be undone, and nothing more is charged.
        for (const species of [other, form]) {
          expect(await evolve(ctx, secret, creature, newKey(), species)).toMatchObject({
            status: 409,
            body: { error: 'not_evolvable' },
          });
        }
        expect(speciesOf(ctx, creature)).toBe(form);
        expect(ctx.core.balances(p.id).essence).toBe(200 - essence);
      });
    },
  );

  it.each(LINES)(
    '%s refuses a form of another line, and naming none gives the first',
    async (line, first, second) => {
      await runRaid(async (ctx) => {
        const { p, secret, creature } = await oneOf(ctx, line);
        const foreign = LINES.flatMap(([l, a, b]) => (l === line ? [] : [a, b]));
        for (const species of foreign) {
          expect(await evolve(ctx, secret, creature, newKey(), species), species).toMatchObject({
            status: 409,
            body: { error: 'not_a_branch' },
          });
        }
        expect(ctx.core.balances(p.id).essence).toBe(200);
        expect((await evolve(ctx, secret, creature)).body.species).toBe(first);
        expect(first).not.toBe(second);
      });
    },
  );
});
