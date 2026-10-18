import { SCHEMA_VERSION } from '../src/migrations';
import { RULES, createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { dungeonPlayer, newKey } from './dungeon-helpers';
import { runCore, undoDungeonDraftMigration, type CoreContext } from './helpers';
import { count, nextGuild, rows } from './raid-helpers';

/** Wednesday 14:00 in Helsinki, after the daily reset. */
const AFTER_RESET = Date.parse('2027-01-13T12:00:00Z');
const opts = () => ({
  dungeonRng: createSeededRng('dungeon-drafts'),
  gearRng: createSeededRng('dungeon-drafts:gear'),
});
const STRONG = { level: 30, species: ['tidewing', 'pyrelynx', 'thornbuck'] };
const PATH = '/api/dungeon/team';
const draftRows = (ctx: CoreContext) =>
  rows<{ user_id: string; team_json: string; updated_at: number }>(
    ctx.sql,
    'SELECT user_id, team_json, updated_at FROM dungeon_drafts',
  );

describe('migration 26', () => {
  it('creates the drafts table, and an older database gets it', async () => {
    await runCore(nextGuild(), async (ctx) => {
      expect(count(ctx.sql, 'dungeon_drafts')).toBe(0);
      const p = await dungeonPlayer(ctx, 1);
      undoDungeonDraftMigration(ctx.sql);
      expect(
        rows<{ name: string }>(
          ctx.sql,
          "SELECT name FROM sqlite_master WHERE name = 'dungeon_drafts'",
        ),
      ).toEqual([]);
      ctx.core.migrate();
      ctx.core.migrate();
      expect(count(ctx.sql, 'schema_version')).toBe(SCHEMA_VERSION);
      expect(count(ctx.sql, 'dungeon_drafts')).toBe(0);
      expect((await p.today()).draftTeam).toBeNull();
    });
  });
});

describe('PUT /api/dungeon/team', () => {
  it('stores the row and answers what was stored, with the time of the save', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const [a, b, c] = p.creatureIds as [string, string, string];
        ctx.clock.t = AFTER_RESET;
        const res = await p.call('PUT', PATH, { team: [c, null, a] });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ draftTeam: [c, null, a] });
        expect(draftRows(ctx)).toEqual([
          { user_id: p.id, team_json: JSON.stringify([c, null, a]), updated_at: AFTER_RESET },
        ]);
        // A second save replaces it (one row per player), and is the same save when repeated.
        ctx.clock.t += 1000;
        expect((await p.call('PUT', PATH, { team: [b, c, a] })).body).toEqual({
          draftTeam: [b, c, a],
        });
        expect((await p.call('PUT', PATH, { team: [b, c, a] })).body).toEqual({
          draftTeam: [b, c, a],
        });
        expect(draftRows(ctx)).toHaveLength(1);
        expect(draftRows(ctx)[0]?.updated_at).toBe(AFTER_RESET + 1000);
      },
      opts(),
    );
  });

  it('refuses a body that is not exactly a row of ids or nulls, all different', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const [a, b, c] = p.creatureIds as [string, string, string];
        expect(RULES.dungeon.teamSize).toBe(3);
        const bad: unknown[] = [
          { team: [a, b] }, // too short
          { team: [a, b, c, null] }, // too long
          { team: [] },
          { team: [a, a, b] }, // the same creature twice
          { team: [a, b, a] },
          { team: [a, b, c], extra: 1 }, // unknown key
          { team: [a, b, c], userId: '1' },
          { team: [a, b, c], idempotencyKey: newKey() },
          { team: [a, b, 'not-an-id'] },
          { team: [a, b, 7] },
          { team: [a, b, ''] },
          { team: 'abc' },
          { team: null },
          {},
          [],
          null,
        ];
        for (const body of bad) {
          const res = await p.call('PUT', PATH, body);
          expect(res.status, JSON.stringify(body)).toBe(400);
          expect(res.body).toEqual({ error: 'invalid_body' });
        }
        expect(draftRows(ctx)).toEqual([]);
        // Empty slots may repeat: they are not creatures.
        expect((await p.call('PUT', PATH, { team: [null, null, a] })).status).toBe(200);
        expect((await p.call('PUT', PATH, { team: [null, null, null] })).status).toBe(200);
      },
      opts(),
    );
  });

  it('turns ids the player does not own into empty slots, without an error', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const other = await dungeonPlayer(ctx, 2);
        const [a, b] = p.creatureIds as [string, string];
        const theirs = other.creatureIds[0] as string;
        const nobody = crypto.randomUUID();
        const res = await p.call('PUT', PATH, { team: [theirs, a, nobody] });
        expect(res.status).toBe(200);
        // The same answer for someone else's creature and one that does not exist.
        expect(res.body).toEqual({ draftTeam: [null, a, null] });
        expect(draftRows(ctx)[0]?.team_json).toBe(JSON.stringify([null, a, null]));
        expect((await p.call('PUT', PATH, { team: [theirs, nobody, b] })).body).toEqual({
          draftTeam: [null, null, b],
        });
        expect(JSON.stringify(await other.today())).not.toContain(a);
      },
      opts(),
    );
  });

  it('only changes the caller’s own draft', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const other = await dungeonPlayer(ctx, 2);
        const [a, b, c] = p.creatureIds as [string, string, string];
        const [x, y, z] = other.creatureIds as [string, string, string];
        await p.call('PUT', PATH, { team: [a, b, c] });
        expect((await other.today()).draftTeam).toBeNull();
        await other.call('PUT', PATH, { team: [z, y, x] });
        expect((await p.today()).draftTeam).toEqual([a, b, c]);
        expect((await other.today()).draftTeam).toEqual([z, y, x]);
        expect(
          draftRows(ctx)
            .map((r) => r.user_id)
            .sort(),
        ).toEqual([p.id, other.id].sort());
      },
      opts(),
    );
  });
});

describe('draftTeam in GET /api/dungeon/today', () => {
  it('is null before any save, and the saved row after, in the same order', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const [a, b, c] = p.creatureIds as [string, string, string];
        expect((await p.today()).draftTeam).toBeNull();
        await p.call('PUT', PATH, { team: [b, null, c] });
        expect((await p.today()).draftTeam).toEqual([b, null, c]);
        // Reading changes nothing.
        expect((await p.today()).draftTeam).toEqual([b, null, c]);
        expect(a).toBeDefined();
      },
      opts(),
    );
  });

  it('survives as all empty slots: an empty draft is still a draft', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const [a, b, c] = p.creatureIds as [string, string, string];
        await p.call('PUT', PATH, { team: [a, b, c] });
        await p.call('PUT', PATH, { team: [null, null, null] });
        expect((await p.today()).draftTeam).toEqual([null, null, null]);
      },
      opts(),
    );
  });

  it('shows a creature that is gone (fused away) as an empty slot', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, { creatures: 4 });
        const [a, b, c] = p.creatureIds as [string, string, string];
        await p.call('PUT', PATH, { team: [a, b, c] });
        ctx.sql.exec('DELETE FROM creatures WHERE id = ?', b);
        expect((await p.today()).draftTeam).toEqual([a, null, c]);
        // The stored row is left alone; only the view drops the id.
        expect(draftRows(ctx)[0]?.team_json).toBe(JSON.stringify([a, b, c]));
      },
      opts(),
    );
  });

  it('is null, not an error, when the stored row is damaged', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        await p.call('PUT', PATH, { team: [p.creatureIds[0] as string, null, null] });
        for (const bad of ['not json', '{}', '["x","y","z"]', '[null,null]']) {
          ctx.sql.exec('UPDATE dungeon_drafts SET team_json = ?', bad);
          const res = await p.call('GET', '/api/dungeon/today');
          expect(res.status).toBe(200);
          expect(res.body['draftTeam']).toBeNull();
        }
      },
      opts(),
    );
  });

  it('is cleared by a run, which answers with no draft; its team becomes the last team', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const other = await dungeonPlayer(ctx, 2, STRONG);
        const [a, b, c] = p.creatureIds as [string, string, string];
        ctx.clock.t = AFTER_RESET;
        await p.call('PUT', PATH, { team: [c, b, a] });
        await other.call('PUT', PATH, { team: other.creatureIds });
        const ran = await p.run({ team: [b, a, c] });
        expect(ran.status).toBe(200);
        expect(ran.body.today.draftTeam).toBeNull();
        expect(ran.body.today.lastTeam).toEqual([b, a, c]);
        expect((await p.today()).draftTeam).toBeNull();
        expect(draftRows(ctx).map((r) => r.user_id)).toEqual([other.id]);
        // The other player's draft is untouched.
        expect((await other.today()).draftTeam).toEqual(other.creatureIds);
      },
      opts(),
    );
  });

  it('is kept by a refused run, and a retry of a stored run does nothing to a newer draft', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1, STRONG);
        const [a, b, c] = p.creatureIds as [string, string, string];
        ctx.clock.t = AFTER_RESET;
        const body = p.body({ team: [a, b, c] });
        expect((await p.call('POST', '/api/dungeon/start', body)).status).toBe(200);
        await p.call('PUT', PATH, { team: [c, b, a] });
        // A second run the same day is refused: the draft stays.
        expect((await p.run()).status).toBe(409);
        expect((await p.today()).draftTeam).toEqual([c, b, a]);
        // The retry of the stored run returns it and leaves the draft alone.
        expect((await p.call('POST', '/api/dungeon/start', body)).status).toBe(200);
        expect((await p.today()).draftTeam).toEqual([c, b, a]);
      },
      opts(),
    );
  });

  it('is dropped by the prune once it is long untouched', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        await p.call('PUT', PATH, { team: [null, null, null] });
        ctx.clock.t += 91 * 86_400_000;
        ctx.core.dungeon.prune();
        expect(draftRows(ctx)).toEqual([]);
      },
      opts(),
    );
  });
});
