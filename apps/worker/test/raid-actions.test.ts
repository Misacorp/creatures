import { describe, expect, it } from 'vitest';
import type { RaidView, ReplayView } from '../src/raid-view';
import { eventTimes } from '../src/raid-schedule';
import { OTHER_USER_ID, USER_ID, type CoreContext } from './helpers';
import {
  HELSINKI,
  W02,
  count,
  forcePool,
  rows,
  runRaid,
  seedPlayer,
  type Seeded,
} from './raid-helpers';

const SUNDAY = W02.afterFinale;
type Ctx = CoreContext;

/** Calls an API route as a player (a fresh session at the current clock). */
async function login(ctx: Ctx, player: Seeded): Promise<string> {
  return ctx.core.createSession(ctx.guildId, { id: player.id, displayName: player.name });
}

/** The JSON answer, typed as `T` (error answers only have `error`: assert them with toMatchObject). */
async function api<T = RaidView>(
  ctx: Ctx,
  secret: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await ctx.request(secret, path, method, body);
  return { status: res.status, body: (await res.json()) as T };
}

describe('team', () => {
  it('picks the top three creatures by power automatically', async () => {
    await runRaid((ctx) => {
      // Four creatures: power order is gaiadrake > stormray > splashet > sproutle at level 10.
      const p = seedPlayer(ctx, 1, {
        creatures: 4,
        level: 10,
        species: ['sproutle', 'splashet', 'stormray', 'gaiadrake'],
      });
      const view = ctx.core.raid.view(p.id, HELSINKI);
      expect(view.you.team?.mode).toBe('auto');
      expect(view.you.team?.creatures.map((c) => c.species).sort()).toEqual(
        ['gaiadrake', 'splashet', 'stormray'].sort(),
      );
    });
  });

  it('takes every creature when the player owns fewer than three', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 1 });
      expect(ctx.core.raid.view(p.id, HELSINKI).you.team?.creatures).toHaveLength(1);
    });
  });

  it('accepts three distinct creatures the player owns, and null returns to automatic', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 4, level: 10 });
      const ids = p.creatureIds;
      const chosen = [ids[3], ids[2], ids[0]] as string[];
      expect(ctx.core.raid.setTeam(p.id, HELSINKI, chosen).ok).toBe(true);
      const team = ctx.core.raid.view(p.id, HELSINKI).you.team;
      expect(team?.mode).toBe('chosen');
      expect(team?.creatures.map((c) => c.creatureId)).toEqual(chosen);
      expect(ctx.core.raid.setTeam(p.id, HELSINKI, null).ok).toBe(true);
      expect(ctx.core.raid.view(p.id, HELSINKI).you.team?.mode).toBe('auto');
    });
  });

  it('refuses creatures that are not the player’s, duplicates and players outside the roster', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1, { creatures: 3 });
      const b = seedPlayer(ctx, 2, { creatures: 3 });
      const [a0, a1, a2] = a.creatureIds as [string, string, string];
      expect(ctx.core.raid.setTeam(a.id, HELSINKI, [a0, a1, b.creatureIds[0] as string])).toEqual({
        ok: false,
        status: 409,
        error: 'not_your_creature',
      });
      expect(
        ctx.core.raid.setTeam(a.id, HELSINKI, [a0, a1, '00000000-0000-4000-8000-000000000000']),
      ).toEqual({ ok: false, status: 409, error: 'not_your_creature' });
      expect(ctx.core.raid.setTeam(a.id, HELSINKI, [a0, a1, a1])).toEqual({
        ok: false,
        status: 400,
        error: 'duplicate_creatures',
      });
      expect(ctx.core.raid.view(a.id, HELSINKI).you.team?.mode).toBe('auto');
      expect(ctx.core.raid.setTeam(a.id, HELSINKI, [a0, a1, a2]).ok).toBe(true);
      // Someone without a creature is not on the roster.
      const nobody = seedPlayer(ctx, 3, { creatures: 0 });
      expect(ctx.core.raid.setTeam(nobody.id, HELSINKI, null)).toEqual({
        ok: false,
        status: 409,
        error: 'not_in_roster',
      });
    });
  });

  it('is open before phase 1, between the phases, and locked after the finale', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 4 });
      const ids = p.creatureIds;
      const set = (list: string[] | null) => ctx.core.raid.setTeam(p.id, HELSINKI, list);
      expect(set([ids[0], ids[1], ids[2]] as string[]).ok).toBe(true);
      ctx.clock.t = Date.parse('2027-01-15T12:30:00Z'); // after phase 1
      expect(set([ids[1], ids[2], ids[3]] as string[]).ok).toBe(true);
      expect(ctx.core.raid.view(p.id, HELSINKI).status).toBe('phase1');
      ctx.clock.t = Date.parse('2027-01-16T12:30:00Z'); // after phase 2
      expect(set(null).ok).toBe(true);
      expect(ctx.core.raid.view(p.id, HELSINKI).status).toBe('phase2');
      ctx.clock.t = SUNDAY;
      expect(set([ids[0], ids[1], ids[2]] as string[])).toEqual({
        ok: false,
        status: 409,
        error: 'locked',
      });
      const view = ctx.core.raid.view(p.id, HELSINKI);
      expect(view.status).toBe('finale');
      expect(view.you.canEdit).toBe(false);
    });
  });
});

describe('placement', () => {
  it('places into empty slots, moves, and swaps among a player’s own creatures', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1);
      seedPlayer(ctx, 2);
      seedPlayer(ctx, 3);
      const [c0, c1] = p.creatureIds as [string, string];
      const slots = () =>
        rows<{ creature_id: string; slot: number }>(
          ctx.sql,
          'SELECT creature_id, slot FROM raid_placements ORDER BY slot',
        );
      expect(ctx.core.raid.place(p.id, HELSINKI, c0, 4).ok).toBe(true);
      expect(slots()).toEqual([{ creature_id: c0, slot: 4 }]);
      expect(ctx.core.raid.place(p.id, HELSINKI, c1, 1).ok).toBe(true);
      // Moving to an empty slot frees the old one.
      expect(ctx.core.raid.place(p.id, HELSINKI, c0, 7).ok).toBe(true);
      expect(slots()).toEqual([
        { creature_id: c1, slot: 1 },
        { creature_id: c0, slot: 7 },
      ]);
      // Placing onto an own creature swaps them.
      expect(ctx.core.raid.place(p.id, HELSINKI, c0, 1).ok).toBe(true);
      expect(slots()).toEqual([
        { creature_id: c0, slot: 1 },
        { creature_id: c1, slot: 7 },
      ]);
      // Same slot again is fine.
      expect(ctx.core.raid.place(p.id, HELSINKI, c0, 1).ok).toBe(true);
      // An unplaced creature taking an occupied own slot unplaces the occupant.
      const c2 = p.creatureIds[2] as string;
      expect(ctx.core.raid.place(p.id, HELSINKI, c2, 1).ok).toBe(true);
      expect(slots()).toEqual([
        { creature_id: c2, slot: 1 },
        { creature_id: c1, slot: 7 },
      ]);
    });
  });

  it('refuses a slot someone else holds, slots outside the row and creatures it should not move', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      const b = seedPlayer(ctx, 2);
      seedPlayer(ctx, 3);
      const a0 = a.creatureIds[0] as string;
      const b0 = b.creatureIds[0] as string;
      expect(ctx.core.raid.place(a.id, HELSINKI, a0, 3).ok).toBe(true);
      expect(ctx.core.raid.place(b.id, HELSINKI, b0, 3)).toEqual({
        ok: false,
        status: 409,
        error: 'slot_taken',
      });
      // Three players give a row of nine slots.
      expect(ctx.core.raid.place(b.id, HELSINKI, b0, 9)).toEqual({
        ok: false,
        status: 400,
        error: 'invalid_slot',
      });
      expect(ctx.core.raid.place(b.id, HELSINKI, b0, -1).ok).toBe(false);
      // Only own creatures can be moved.
      expect(ctx.core.raid.place(b.id, HELSINKI, a0, 5)).toEqual({
        ok: false,
        status: 409,
        error: 'not_your_creature',
      });
      expect(ctx.core.raid.unplace(b.id, HELSINKI, a0)).toEqual({
        ok: false,
        status: 409,
        error: 'not_your_creature',
      });
      expect(count(ctx.sql, 'raid_placements')).toBe(1);
    });
  });

  it('only places creatures that are in the team, and drops placements when the team changes', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 4, level: 10 });
      seedPlayer(ctx, 2);
      seedPlayer(ctx, 3);
      const ids = p.creatureIds;
      const team =
        ctx.core.raid.view(p.id, HELSINKI).you.team?.creatures.map((c) => c.creatureId) ?? [];
      const bench = ids.find((id) => !team.includes(id)) as string;
      expect(ctx.core.raid.place(p.id, HELSINKI, bench, 0)).toEqual({
        ok: false,
        status: 409,
        error: 'not_in_team',
      });
      expect(ctx.core.raid.place(p.id, HELSINKI, team[0] as string, 0).ok).toBe(true);
      // Swap the placed creature out of the team: its slot is cleared.
      const next = [bench, ...team.slice(1)];
      expect(ctx.core.raid.setTeam(p.id, HELSINKI, next).ok).toBe(true);
      expect(count(ctx.sql, 'raid_placements')).toBe(0);
    });
  });

  it('unplaces idempotently', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1);
      const c0 = p.creatureIds[0] as string;
      expect(ctx.core.raid.unplace(p.id, HELSINKI, c0).ok).toBe(true); // nothing to remove
      ctx.core.raid.place(p.id, HELSINKI, c0, 2);
      expect(ctx.core.raid.unplace(p.id, HELSINKI, c0).ok).toBe(true);
      expect(count(ctx.sql, 'raid_placements')).toBe(0);
    });
  });

  it('sizes the row: nine slots with guests below three players, three per player above', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      const b = seedPlayer(ctx, 2);
      expect(ctx.core.raid.view(a.id, HELSINKI).party).toMatchObject({
        rowLength: 9,
        guests: true,
      });
      seedPlayer(ctx, 3);
      seedPlayer(ctx, 4);
      const view = ctx.core.raid.view(b.id, HELSINKI);
      expect(view.party).toMatchObject({ rowLength: 12, guests: false });
      expect(view.party?.row.map((s) => s.zone)).toEqual([
        ...Array<string>(4).fill('front'),
        ...Array<string>(4).fill('middle'),
        ...Array<string>(4).fill('back'),
      ]);
    });
  });

  it('is editable between the phases and locked after the finale', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1);
      const c0 = p.creatureIds[0] as string;
      expect(ctx.core.raid.place(p.id, HELSINKI, c0, 0).ok).toBe(true);
      ctx.clock.t = Date.parse('2027-01-15T12:30:00Z');
      expect(ctx.core.raid.place(p.id, HELSINKI, c0, 1).ok).toBe(true);
      ctx.clock.t = Date.parse('2027-01-16T12:30:00Z');
      expect(ctx.core.raid.place(p.id, HELSINKI, c0, 2).ok).toBe(true);
      ctx.clock.t = SUNDAY;
      for (const outcome of [
        ctx.core.raid.place(p.id, HELSINKI, c0, 3),
        ctx.core.raid.unplace(p.id, HELSINKI, c0),
      ]) {
        expect(outcome).toEqual({ ok: false, status: 409, error: 'locked' });
      }
      expect(rows(ctx.sql, 'SELECT slot FROM raid_placements')).toEqual([{ slot: 2 }]);
    });
  });
});

describe('GET /api/raid', () => {
  it('shows the week, the roster, my party row and my team without leaking ids', async () => {
    await runRaid(async (ctx) => {
      const me = seedPlayer(ctx, 1, { name: 'Misa' });
      const other = seedPlayer(ctx, 2, { name: 'Other <b>bold</b>' });
      seedPlayer(ctx, 3, { name: 'Third' });
      const secret = await login(ctx, me);
      const myCreature = me.creatureIds[0] as string;
      const theirCreature = other.creatureIds[0] as string;
      expect(ctx.core.raid.place(me.id, HELSINKI, myCreature, 0).ok).toBe(true);
      expect(ctx.core.raid.place(other.id, HELSINKI, theirCreature, 5).ok).toBe(true);

      const res = await api(ctx, secret, 'GET', '/api/raid');
      expect(res.status).toBe(200);
      const body = res.body;
      expect(Object.keys(body).sort()).toEqual(
        [
          'boss',
          'next',
          'party',
          'parties',
          'roster',
          'schedule',
          'serverNow',
          'status',
          'timezone',
          'weekId',
          'you',
        ].sort(),
      );
      expect(body.weekId).toBe('2027-W02');
      expect(body.status).toBe('open');
      expect(body.timezone).toBe(HELSINKI);
      expect(body.schedule).toEqual(eventTimes('2027-W02', HELSINKI));
      expect(body.next).toEqual({ event: 'phase1', at: eventTimes('2027-W02', HELSINKI).phase1 });
      expect(body.boss).toMatchObject({
        id: 'storm-sovereign',
        name: 'Storm Sovereign',
        element: 'spark',
      });
      expect(body.roster).toEqual(
        expect.arrayContaining([
          { displayName: 'Misa', you: true, party: 1 },
          { displayName: 'Other <b>bold</b>', you: false, party: 1 },
          { displayName: 'Third', you: false, party: 1 },
        ]),
      );
      expect(body.roster).toHaveLength(3);
      expect(body.you).toMatchObject({ inRoster: true, optOut: false, party: 1, canEdit: true });
      expect(body.you.team?.creatures).toHaveLength(3);
      expect(body.party?.rowLength).toBe(9);
      expect(body.party?.row).toHaveLength(9);
      expect(body.party?.row[0]?.creature).toMatchObject({
        ownerName: 'Misa',
        mine: true,
        creatureId: myCreature,
        level: expect.any(Number) as number,
        species: expect.any(String) as string,
      });
      // Someone else's creature: owner name and species, but no creature id.
      expect(body.party?.row[5]?.creature).toMatchObject({
        ownerName: 'Other <b>bold</b>',
        mine: false,
      });
      expect(body.party?.row[5]?.creature).not.toHaveProperty('creatureId');
      expect(body.party?.row[1]?.creature).toBeNull();
      expect(body.party?.results).toEqual([]);
      expect(body.party?.adaptation).toBeNull();

      // No user ids anywhere in the answer, and no one else's creature ids.
      const text = JSON.stringify(body);
      for (const id of [me.id, other.id, USER_ID, OTHER_USER_ID, ctx.guildId, theirCreature]) {
        expect(text).not.toContain(id);
      }
    });
  });

  it('answers for a player with no creature, and requires a session', async () => {
    await runRaid(async (ctx) => {
      const nobody = seedPlayer(ctx, 1, { creatures: 0 });
      const secret = await login(ctx, nobody);
      const res = await api(ctx, secret, 'GET', '/api/raid');
      expect(res.status).toBe(200);
      expect(res.body.you).toMatchObject({ inRoster: false, party: null, team: null });
      expect(res.body.party).toBeNull();
      const anon = await ctx.core.handle(
        new Request('https://creatures.test/api/raid', { method: 'GET' }),
      );
      expect(anon.status).toBe(401);
    });
  });

  it('shows results with display names, essence and the counter-move after phase 1', async () => {
    await runRaid(async (ctx) => {
      const me = seedPlayer(ctx, 1, { name: 'Misa', level: 15 });
      seedPlayer(ctx, 2, { name: 'Bob', level: 15 });
      seedPlayer(ctx, 3, { name: 'Cy', level: 15 });
      ctx.core.raid.currentWeek(HELSINKI);
      forcePool(ctx.sql, 20_000);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      const secret = await login(ctx, me);
      const res = await api(ctx, secret, 'GET', '/api/raid');
      expect(res.body.status).toBe('phase1');
      const r = res.body.party?.results[0];
      expect(r).toMatchObject({
        phase: 'phase1',
        cleared: true,
        essence: expect.any(Number) as number,
      });
      expect(r?.essence).toBeGreaterThanOrEqual(10);
      expect(r?.reactions).toEqual(expect.any(Number));
      expect(r?.damage).toBeGreaterThan(0);
      expect(r?.top.length).toBeLessThanOrEqual(3);
      expect(r?.top.every((t) => ['Misa', 'Bob', 'Cy'].includes(t.displayName))).toBe(true);
      expect(res.body.party?.adaptation?.description).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toContain(me.id);
    });
  });
});

describe('raid mutation routes', () => {
  it('PUT /api/raid/team validates strictly and answers with the fresh view', async () => {
    await runRaid(async (ctx) => {
      const me = seedPlayer(ctx, 1, { creatures: 4 });
      const secret = await login(ctx, me);
      const ids = me.creatureIds;
      const ok = await api(ctx, secret, 'PUT', '/api/raid/team', {
        creatureIds: [ids[0], ids[1], ids[3]],
      });
      expect(ok.status).toBe(200);
      expect(ok.body.you.team?.mode).toBe('chosen');
      const reset = await api(ctx, secret, 'PUT', '/api/raid/team', { creatureIds: null });
      expect(reset.body.you.team?.mode).toBe('auto');
      for (const bad of [
        {},
        { creatureIds: [ids[0], ids[1]] },
        { creatureIds: [ids[0], ids[1], ids[2], ids[3]] },
        { creatureIds: ['x', 'y', 'z'] },
        { creatureIds: null, extra: 1 },
        { creatureIds: 'abc' },
      ]) {
        expect((await api(ctx, secret, 'PUT', '/api/raid/team', bad)).status).toBe(400);
      }
      const dup = await api(ctx, secret, 'PUT', '/api/raid/team', {
        creatureIds: [ids[0], ids[0], ids[1]],
      });
      expect(dup).toMatchObject({ status: 400, body: { error: 'duplicate_creatures' } });
      const foreign = await api(ctx, secret, 'PUT', '/api/raid/team', {
        creatureIds: [ids[0], ids[1], crypto.randomUUID()],
      });
      expect(foreign).toMatchObject({ status: 409, body: { error: 'not_your_creature' } });
    });
  });

  it('PUT and DELETE /api/raid/placement, and conflicts between players', async () => {
    await runRaid(async (ctx) => {
      const a = seedPlayer(ctx, 1);
      const b = seedPlayer(ctx, 2);
      seedPlayer(ctx, 3);
      const sa = await login(ctx, a);
      const sb = await login(ctx, b);
      const a0 = a.creatureIds[0] as string;
      const b0 = b.creatureIds[0] as string;
      const placed = await api(ctx, sa, 'PUT', '/api/raid/placement', { creatureId: a0, slot: 2 });
      expect(placed.status).toBe(200);
      expect(placed.body.party?.row[2]?.creature?.mine).toBe(true);
      const taken = await api(ctx, sb, 'PUT', '/api/raid/placement', { creatureId: b0, slot: 2 });
      expect(taken).toMatchObject({ status: 409, body: { error: 'slot_taken' } });
      // Another player sees the owner but cannot move the creature.
      const steal = await api(ctx, sb, 'PUT', '/api/raid/placement', { creatureId: a0, slot: 4 });
      expect(steal).toMatchObject({ status: 409, body: { error: 'not_your_creature' } });
      const outside = await api(ctx, sb, 'PUT', '/api/raid/placement', { creatureId: b0, slot: 9 });
      expect(outside).toMatchObject({ status: 400, body: { error: 'invalid_slot' } });
      for (const bad of [
        { creatureId: b0 },
        { creatureId: b0, slot: -1 },
        { creatureId: b0, slot: 1.5 },
        { creatureId: b0, slot: '1' },
        { creatureId: b0, slot: 1000 },
        { creatureId: 'nope', slot: 1 },
        { creatureId: b0, slot: 1, extra: true },
      ]) {
        expect((await api(ctx, sb, 'PUT', '/api/raid/placement', bad)).status).toBe(400);
      }
      const removed = await api(ctx, sa, 'DELETE', '/api/raid/placement', { creatureId: a0 });
      expect(removed.status).toBe(200);
      expect(removed.body.party?.row[2]?.creature).toBeNull();
      expect((await api(ctx, sa, 'DELETE', '/api/raid/placement', {})).status).toBe(400);
    });
  });

  it('PUT /api/raid/opt-out sits out and rejoins before the lock, then answers 409 locked', async () => {
    await runRaid(async (ctx) => {
      const a = seedPlayer(ctx, 1);
      seedPlayer(ctx, 2);
      const sa = await login(ctx, a);
      const out = await api(ctx, sa, 'PUT', '/api/raid/opt-out', { optOut: true });
      expect(out.status).toBe(200);
      expect(out.body.you).toMatchObject({ optOut: true, inRoster: false });
      expect(out.body.roster).toHaveLength(1);
      const back = await api(ctx, sa, 'PUT', '/api/raid/opt-out', { optOut: false });
      expect(back.body.you).toMatchObject({ optOut: false, inRoster: true });
      expect((await api(ctx, sa, 'PUT', '/api/raid/opt-out', { optOut: 'yes' })).status).toBe(400);
      expect((await api(ctx, sa, 'PUT', '/api/raid/opt-out', {})).status).toBe(400);
      expect((await api(ctx, sa, 'GET', '/api/raid/opt-out')).status).toBe(405);
      ctx.clock.t = Date.parse('2027-01-15T12:30:00Z');
      const sa2 = await login(ctx, a);
      const late = await api(ctx, sa2, 'PUT', '/api/raid/opt-out', { optOut: true });
      expect(late).toMatchObject({ status: 409, body: { error: 'locked' } });
    });
  });

  it('answers from the session user, never from a user id in the body', async () => {
    await runRaid(async (ctx) => {
      const a = seedPlayer(ctx, 1);
      const b = seedPlayer(ctx, 2);
      const sa = await login(ctx, a);
      const attempt = await api(ctx, sa, 'PUT', '/api/raid/team', {
        creatureIds: null,
        userId: b.id,
      });
      expect(attempt.status).toBe(400);
    });
  });
});

describe('GET /api/raid/replay/:week/:party/:phase', () => {
  it('returns the stored events with names after the phase resolved, and 404 before', async () => {
    await runRaid(async (ctx) => {
      const me = seedPlayer(ctx, 1, { name: 'Misa' });
      seedPlayer(ctx, 2, { name: 'Bob' });
      seedPlayer(ctx, 3, { name: 'Cy' });
      ctx.core.raid.currentWeek(HELSINKI);
      const secret = await login(ctx, me);
      expect((await api(ctx, secret, 'GET', '/api/raid/replay/2027-W02/1/phase1')).status).toBe(
        404,
      );
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      const secret2 = await login(ctx, me);
      const res = await api<ReplayView>(ctx, secret2, 'GET', '/api/raid/replay/2027-W02/1/phase1');
      expect(res.status).toBe(200);
      const stored = JSON.parse(
        rows<{ result: string }>(
          ctx.sql,
          "SELECT result FROM raid_results WHERE phase = 'phase1'",
        )[0]?.result as string,
      ) as { events: unknown[] };
      expect(res.body.events).toEqual(stored.events);
      expect(res.body).toMatchObject({ weekId: '2027-W02', party: 1, phase: 'phase1' });
      expect(res.body.seed).toMatch(/^[0-9a-f]{32}$/);
      expect(res.body.names.boss).toBe('Storm Sovereign');
      expect(Object.values(res.body.names.players ?? {}).sort()).toEqual(['Bob', 'Cy', 'Misa']);
      expect(Object.keys(res.body.names.players ?? {}).every((k) => /^m\d+$/.test(k))).toBe(true);
      // Phase 2 has not resolved yet.
      expect((await api(ctx, secret2, 'GET', '/api/raid/replay/2027-W02/1/phase2')).status).toBe(
        404,
      );
      // Nobody's user id is in the replay.
      const text = JSON.stringify(res.body);
      for (const id of [me.id, ...['2', '3'].map((n) => `8${n.padStart(17, '0')}`)]) {
        expect(text).not.toContain(id);
      }
    });
  });

  it('rejects malformed parameters and unknown parties or weeks', async () => {
    await runRaid(async (ctx) => {
      const me = seedPlayer(ctx, 1);
      ctx.core.raid.currentWeek(HELSINKI);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      const secret = await login(ctx, me);
      for (const path of [
        '/api/raid/replay/2027-W99/1/phase1',
        '/api/raid/replay/nope/1/phase1',
        '/api/raid/replay/2027-W02/0/phase1',
        '/api/raid/replay/2027-W02/-1/phase1',
        '/api/raid/replay/2027-W02/1/phase3',
        '/api/raid/replay/2027-W02/abc/phase1',
        '/api/raid/replay/2027-W02/1/__proto__',
      ]) {
        expect((await api(ctx, secret, 'GET', path)).status, path).toBe(400);
      }
      expect((await api(ctx, secret, 'GET', '/api/raid/replay/2027-W02/7/phase1')).status).toBe(
        404,
      );
      expect((await api(ctx, secret, 'GET', '/api/raid/replay/2027-W05/1/phase1')).status).toBe(
        404,
      );
      expect((await api(ctx, secret, 'GET', '/api/raid/replay/2027-W02/1/phase1')).status).toBe(
        200,
      );
    });
  });

  it('serves only this guild: another guild has no such replay', async () => {
    await runRaid((ctx) => {
      seedPlayer(ctx, 1);
      ctx.core.raid.currentWeek(HELSINKI);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      ctx.core.raid.runDue(HELSINKI);
      expect(count(ctx.sql, 'raid_results')).toBe(1);
    });
    await runRaid(async (ctx) => {
      const other = seedPlayer(ctx, 1);
      const secret = await login(ctx, other);
      expect((await api(ctx, secret, 'GET', '/api/raid/replay/2027-W02/1/phase1')).status).toBe(
        404,
      );
    });
  });
});
