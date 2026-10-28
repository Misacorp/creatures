import { content, seasonOf } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { RaidView, ReplayView } from '../src/raid-view';
import { eventTimes, weekIndex } from '../src/raid-schedule';
import { OTHER_USER_ID, USER_ID, type CoreContext } from './helpers';
import {
  HELSINKI,
  W02,
  count,
  forcePool,
  joinRaid,
  rows,
  runRaid,
  seedMember,
  seedPlayer,
  storedRuns,
  type Seeded,
} from './raid-helpers';
import { setCreature } from './kit';

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
  it('brings nothing when nothing is placed: the player is not in the raid', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, {
        creatures: 4,
        level: 10,
        species: ['sproutle', 'splashet', 'stormray', 'gaiadrake'],
      });
      const view = ctx.core.raid.view(p.id, HELSINKI);
      // Nobody's creatures are picked for them, however strong.
      expect(view.you).toMatchObject({ inRoster: false, party: null, team: null, ability: null });
      expect(view.you.abilities).toEqual([]);
      expect(view.roster).toEqual([]);
    });
  });

  it('takes every creature placed when the player owns fewer than three', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 1 });
      joinRaid(ctx, p);
      expect(ctx.core.raid.view(p.id, HELSINKI).you.team?.creatures).toHaveLength(1);
    });
  });

  it('is exactly the placed creatures, strongest first, and never more than three', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, {
        creatures: 4,
        level: 10,
        species: ['sproutle', 'splashet', 'stormray', 'gaiadrake'],
      });
      const [sproutle, splashet] = p.creatureIds as [string, string, string, string];
      const team = () =>
        ctx.core.raid
          .view(p.id, HELSINKI)
          .you.team?.creatures.map((c) => [c.creatureId, c.slot])
          .sort();
      // The weakest, placed, is the whole team: the strong ones are not added.
      expect(ctx.core.raid.place(p.id, HELSINKI, sproutle, 3).ok).toBe(true);
      expect(team()).toEqual([[sproutle, 3]]);
      expect(ctx.core.raid.place(p.id, HELSINKI, splashet, 4).ok).toBe(true);
      expect(team()).toEqual(
        [
          [sproutle, 3],
          [splashet, 4],
        ].sort(),
      );
      // Removing one takes it out of the team; nothing fills its place.
      expect(ctx.core.raid.unplace(p.id, HELSINKI, sproutle).ok).toBe(true);
      expect(team()).toEqual([[splashet, 4]]);
    });
  });

  it('is open before phase 1, between the phases, and locked after the finale', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, { creatures: 4 });
      const [c0, c1] = p.creatureIds as [string, string];
      expect(ctx.core.raid.place(p.id, HELSINKI, c0, 0).ok).toBe(true);
      ctx.clock.t = Date.parse('2027-01-15T12:30:00Z'); // after phase 1
      expect(ctx.core.raid.place(p.id, HELSINKI, c1, 1).ok).toBe(true);
      expect(ctx.core.raid.view(p.id, HELSINKI).status).toBe('phase1');
      ctx.clock.t = Date.parse('2027-01-16T12:30:00Z'); // after phase 2
      expect(ctx.core.raid.unplace(p.id, HELSINKI, c1).ok).toBe(true);
      expect(ctx.core.raid.view(p.id, HELSINKI).status).toBe('phase2');
      ctx.clock.t = SUNDAY;
      expect(ctx.core.raid.place(p.id, HELSINKI, c1, 2)).toEqual({
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
      // A refused first placement does not join the player either.
      expect(ctx.core.raid.view(b.id, HELSINKI).you.inRoster).toBe(false);
      // Three players give a row of nine slots.
      expect(ctx.core.raid.place(b.id, HELSINKI, b0, 9)).toEqual({
        ok: false,
        status: 400,
        error: 'invalid_slot',
      });
      expect(ctx.core.raid.place(b.id, HELSINKI, b0, -1).ok).toBe(false);
      // Only a player's own creatures can be placed or moved, whoever is away.
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

  it('places any creature the player owns, up to three on the board', async () => {
    await runRaid((ctx) => {
      const p = seedPlayer(ctx, 1, {
        creatures: 4,
        level: 10,
        species: ['sproutle', 'splashet', 'stormray', 'gaiadrake'],
      });
      seedPlayer(ctx, 2);
      seedPlayer(ctx, 3);
      const [sproutle, splashet, stormray, gaiadrake] = p.creatureIds as [
        string,
        string,
        string,
        string,
      ];
      // Any creature may be placed, the weakest first.
      expect(ctx.core.raid.place(p.id, HELSINKI, sproutle, 0).ok).toBe(true);
      expect(ctx.core.raid.place(p.id, HELSINKI, splashet, 1).ok).toBe(true);
      expect(ctx.core.raid.place(p.id, HELSINKI, stormray, 2).ok).toBe(true);
      // A fourth new creature is refused, a creature already on the board moves.
      expect(ctx.core.raid.place(p.id, HELSINKI, gaiadrake, 3)).toEqual({
        ok: false,
        status: 409,
        error: 'board_full',
      });
      expect(ctx.core.raid.place(p.id, HELSINKI, stormray, 3).ok).toBe(true);
      expect(count(ctx.sql, 'raid_placements')).toBe(3);
      // Even onto the slot of an own creature: a new one needs a free place.
      expect(ctx.core.raid.place(p.id, HELSINKI, gaiadrake, 0)).toEqual({
        ok: false,
        status: 409,
        error: 'board_full',
      });
      // Removing one makes room.
      expect(ctx.core.raid.unplace(p.id, HELSINKI, sproutle).ok).toBe(true);
      expect(ctx.core.raid.place(p.id, HELSINKI, gaiadrake, 0).ok).toBe(true);
      expect(count(ctx.sql, 'raid_placements')).toBe(3);
    });
  });

  it('never puts a fourth creature of one player on the board (production bug, level change)', async () => {
    await runRaid((ctx) => {
      // Power order at level 10: gaiadrake > stormray > splashet > sproutle.
      const p = seedPlayer(ctx, 1, {
        creatures: 4,
        level: 10,
        species: ['sproutle', 'splashet', 'stormray', 'gaiadrake'],
      });
      seedPlayer(ctx, 2);
      seedPlayer(ctx, 3);
      const [sproutle, splashet, stormray, gaiadrake] = p.creatureIds as [
        string,
        string,
        string,
        string,
      ];
      for (const [i, id] of [splashet, stormray, gaiadrake].entries()) {
        expect(ctx.core.raid.place(p.id, HELSINKI, id, i).ok).toBe(true);
      }
      // The placed splashet falls behind in power (any level or gear change does this) ...
      setCreature(ctx, splashet, { level: 1 });
      // ... and the sproutle must still not make a fourth.
      const fourth = ctx.core.raid.place(p.id, HELSINKI, sproutle, 5);
      expect(fourth).toEqual({ ok: false, status: 409, error: 'board_full' });
      const view = ctx.core.raid.view(p.id, HELSINKI);
      expect(view.party?.row.filter((s) => s.creature?.mine)).toHaveLength(3);
      expect(count(ctx.sql, 'raid_placements', `user_id = '${p.id}'`)).toBe(3);
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
      const a = seedMember(ctx, 1);
      const b = seedMember(ctx, 2);
      expect(ctx.core.raid.view(a.id, HELSINKI).party).toMatchObject({
        rowLength: 9,
        guests: true,
      });
      seedMember(ctx, 3);
      seedMember(ctx, 4);
      const view = ctx.core.raid.view(b.id, HELSINKI);
      expect(view.party).toMatchObject({ rowLength: 12, guests: false });
      expect(view.party?.row.map((s) => s.zone)).toEqual([
        ...Array<string>(4).fill('front'),
        ...Array<string>(4).fill('middle'),
        ...Array<string>(4).fill('back'),
      ]);
    });
  });

  it('has room for three creatures of every active player, joined or not', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      for (let n = 2; n <= 5; n++) seedPlayer(ctx, n);
      // One of five active players joined: the row is made for five, guests still fill it.
      joinRaid(ctx, a);
      expect(ctx.core.raid.view(a.id, HELSINKI).party).toMatchObject({
        rowLength: 15,
        guests: true,
      });
      // A player over a party's maximum is capped: 20 active players make two parties of 10 each.
      for (let n = 6; n <= 20; n++) seedPlayer(ctx, n);
      expect(ctx.core.raid.view(a.id, HELSINKI).party).toMatchObject({ rowLength: 30 });
    });
  });

  it('keeps the board as it was made when players go quiet in the middle of the week', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1);
      for (let n = 2; n <= 5; n++) seedPlayer(ctx, n);
      expect(ctx.core.raid.place(a.id, HELSINKI, a.creatureIds[0] as string, 14).ok).toBe(true);
      expect(ctx.core.raid.view(a.id, HELSINKI).party?.rowLength).toBe(15);
      // Four of the five stop playing: the board is sized from who was active when the week opened.
      ctx.sql.exec('UPDATE players SET last_seen_at = 0 WHERE user_id <> ?', a.id);
      ctx.clock.t += 3_600_000;
      expect(ctx.core.raid.view(a.id, HELSINKI).party?.rowLength).toBe(15);
      // And a placement is never cut off by a shorter row.
      expect(ctx.core.raid.view(a.id, HELSINKI).you.team?.creatures[0]?.slot).toBe(14);
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
          'bestRank',
          'boss',
          'channel',
          'effectiveRank',
          'festival',
          'festivalCreature',
          'next',
          'party',
          'parties',
          'rank',
          'roster',
          'schedule',
          'season',
          'serverNow',
          'status',
          'timezone',
          'weekId',
          'you',
        ].sort(),
      );
      expect(body.weekId).toBe('2027-W02');
      // A new server is placed at its first week, from its roster; a normal week is not a Festival.
      const season = seasonOf(weekIndex('2027-W02'));
      expect(body.rank).toBeGreaterThanOrEqual(1);
      expect(body.effectiveRank).toBe(
        season.festival ? Math.max(1, (body.rank as number) - 3) : body.rank,
      );
      expect(body.festival).toBe(season.festival);
      expect(body.season).toEqual({ index: season.seasonIndex, week: season.weekInSeason + 1 });
      expect(body.bestRank).toBeNull();
      expect(Object.keys(body.party ?? {}).sort()).toEqual(
        [
          'adaptation',
          'bossHp',
          'guests',
          'party',
          'readiness',
          'results',
          'row',
          'rowLength',
        ].sort(),
      );
      expect(['long_shot', 'even', 'likely', 'strong']).toContain(body.party?.readiness);
      expect(body.status).toBe('open');
      expect(body.timezone).toBe(HELSINKI);
      expect(body.schedule).toEqual(eventTimes('2027-W02', HELSINKI));
      expect(body.next).toEqual({ event: 'phase1', at: eventTimes('2027-W02', HELSINKI).phase1 });
      // The week's boss is the week index's turn in the rotation of the content.
      const boss = content.bosses[weekIndex('2027-W02') % content.bosses.length];
      expect(body.boss).toMatchObject({ id: boss?.id, name: boss?.name, element: boss?.element });
      // Only the two who placed a creature are on the roster: Third is active but did not join.
      expect(body.roster).toEqual([
        { displayName: 'Misa', you: true, party: 1 },
        { displayName: 'Other <b>bold</b>', you: false, party: 1 },
      ]);
      expect(body.you).toMatchObject({ inRoster: true, party: 1, canEdit: true });
      expect(body.you.team?.creatures).toHaveLength(1);
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
      // Nobody placed slot 1: it is empty, nothing joins by itself.
      expect(body.party?.row[1]?.creature).toBeNull();
      expect(body.party?.row.filter((s) => s.creature !== null)).toHaveLength(2);
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
      const me = seedMember(ctx, 1, { name: 'Misa', level: 15 });
      seedMember(ctx, 2, { name: 'Bob', level: 15 });
      seedMember(ctx, 3, { name: 'Cy', level: 15 });
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
  it('PUT /api/raid/team is retired: it validates, changes nothing and answers with the view', async () => {
    await runRaid(async (ctx) => {
      const me = seedMember(ctx, 1, { creatures: 4 });
      const secret = await login(ctx, me);
      const ids = me.creatureIds;
      const before = (await api(ctx, secret, 'GET', '/api/raid')).body.you.team;
      const ok = await api(ctx, secret, 'PUT', '/api/raid/team', {
        creatureIds: [ids[0], ids[1], ids[3]],
      });
      expect(ok.status).toBe(200);
      // No team was chosen: the team is the same as before, and nothing was stored.
      expect(ok.body.you.team).toEqual(before);
      expect((await api(ctx, secret, 'PUT', '/api/raid/team', { creatureIds: null })).status).toBe(
        200,
      );
      expect(count(ctx.sql, 'raid_teams')).toBe(0);
      // Only the three placements the player made themselves.
      expect(count(ctx.sql, 'raid_placements')).toBe(3);
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
      // The first placement joined the raid.
      expect(placed.body.you).toMatchObject({ inRoster: true, party: 1 });
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
      // The slot is empty again, and the player, with nothing left on the board, is out of the raid.
      expect(removed.body.party?.row[2]?.creature).toBeNull();
      expect(removed.body.you.inRoster).toBe(false);
      expect((await api(ctx, sa, 'DELETE', '/api/raid/placement', {})).status).toBe(400);
    });
  });

  it('has no opt-out route any more: joining is placing a creature', async () => {
    await runRaid(async (ctx) => {
      const a = seedMember(ctx, 1);
      const sa = await login(ctx, a);
      expect((await api(ctx, sa, 'PUT', '/api/raid/opt-out', { optOut: true })).status).toBe(404);
      expect((await api(ctx, sa, 'GET', '/api/raid')).body.you.inRoster).toBe(true);
    });
  });

  it('answers from the session user, never from a user id in the body', async () => {
    await runRaid(async (ctx) => {
      const a = seedMember(ctx, 1);
      const b = seedMember(ctx, 2);
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
      const me = seedMember(ctx, 1, { name: 'Misa' });
      seedMember(ctx, 2, { name: 'Bob' });
      seedMember(ctx, 3, { name: 'Cy' });
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
      const boss = content.bosses[weekIndex('2027-W02') % content.bosses.length];
      expect(res.body.names.boss).toBe(boss?.name);
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

  it('schedules Old Bogback in the rotation and fights it through the finished phase', async () => {
    // Five bosses rotate by the week index; 2027-W06 is Old Bogback's turn (the fifth, after four weeks).
    expect(content.bosses[weekIndex('2027-W06') % content.bosses.length]?.id).toBe('old-bogback');
    await runRaid(
      async (ctx) => {
        const me = seedMember(ctx, 1, { name: 'Misa' });
        seedMember(ctx, 2, { name: 'Bob' });
        seedMember(ctx, 3, { name: 'Cy' });
        expect(ctx.core.raid.currentWeek(HELSINKI).bossId).toBe('old-bogback');
        ctx.clock.t = Date.parse('2027-02-12T12:00:00Z');
        const secret = await login(ctx, me);
        const res = await api<ReplayView>(ctx, secret, 'GET', '/api/raid/replay/2027-W06/1/phase1');
        expect(res.status).toBe(200);
        expect(res.body.names.boss).toBe('Old Bogback');
        expect(res.body.events.length).toBeGreaterThan(0);
        const view = await api(ctx, secret, 'GET', '/api/raid');
        expect(view.body.boss).toMatchObject({ id: 'old-bogback', element: 'mire' });
      },
      { start: Date.parse('2027-02-12T10:00:00Z') },
    );
  });

  it('names the caller by their owner key, and has the boss maximum HP', async () => {
    await runRaid(async (ctx) => {
      const me = seedMember(ctx, 1, { name: 'Misa' });
      const bobPlayer = seedMember(ctx, 2, { name: 'Bob' });
      seedMember(ctx, 3, { name: 'Cy' });
      ctx.core.raid.currentWeek(HELSINKI);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      const secret = await login(ctx, me);
      const res = await api<ReplayView>(ctx, secret, 'GET', '/api/raid/replay/2027-W02/1/phase1');
      expect(res.status).toBe(200);
      const run = storedRuns(ctx.sql)[0];
      const alias = run?.summary.members.find((m) => m.userId === me.id)?.alias;
      expect(alias).toMatch(/^m\d+$/);
      expect(res.body.you).toBe(alias);
      expect(res.body.names.players?.[res.body.you as string]).toBe('Misa');
      expect(res.body.row.some((r) => r.owner === res.body.you)).toBe(true);
      // The same source as the raid view's phase result.
      const view = await api(ctx, secret, 'GET', '/api/raid');
      const phase1 = view.body.party?.results.find((r) => r.phase === 'phase1');
      expect(res.body.bossHpMax).toBe(phase1?.bossHpMax);
      expect(Number.isInteger(res.body.bossHpMax)).toBe(true);
      expect(res.body.bossHpMax).toBeGreaterThan(0);
      // Another member sees their own key.
      const bobSecret = await login(ctx, bobPlayer);
      const bob = await api<ReplayView>(
        ctx,
        bobSecret,
        'GET',
        '/api/raid/replay/2027-W02/1/phase1',
      );
      expect(bob.body.you).not.toBe(alias);
      expect(bob.body.names.players?.[bob.body.you as string]).toBe('Bob');
    });
  });

  it('has no owner key for a guild member who was not in that fight', async () => {
    await runRaid(async (ctx) => {
      // 16 players do not fit one party of at most 15, so there are two parties.
      const players = Array.from({ length: 16 }, (_, i) => seedPlayer(ctx, i + 1));
      joinRaid(ctx, players);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      const outsider = players.find((p) => ctx.core.raid.view(p.id, HELSINKI).you.party === 2);
      const insider = players.find((p) => ctx.core.raid.view(p.id, HELSINKI).you.party === 1);
      expect(outsider).toBeDefined();
      expect(insider).toBeDefined();
      const outsiderSecret = await login(ctx, outsider as Seeded);
      const res = await api<ReplayView>(
        ctx,
        outsiderSecret,
        'GET',
        '/api/raid/replay/2027-W02/1/phase1',
      );
      expect(res.status).toBe(200);
      expect(res.body.you).toBeNull();
      const insiderSecret = await login(ctx, insider as Seeded);
      const own = await api<ReplayView>(
        ctx,
        insiderSecret,
        'GET',
        '/api/raid/replay/2027-W02/1/phase1',
      );
      expect(own.body.you).toMatch(/^m\d+$/);
    });
  });

  it('rejects malformed parameters and unknown parties or weeks', async () => {
    await runRaid(async (ctx) => {
      const me = seedMember(ctx, 1);
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
      seedMember(ctx, 1);
      ctx.core.raid.currentWeek(HELSINKI);
      ctx.clock.t = Date.parse('2027-01-15T12:00:00Z');
      ctx.core.raid.runDue(HELSINKI);
      expect(count(ctx.sql, 'raid_results')).toBe(1);
    });
    await runRaid(async (ctx) => {
      const other = seedMember(ctx, 1);
      const secret = await login(ctx, other);
      expect((await api(ctx, secret, 'GET', '/api/raid/replay/2027-W02/1/phase1')).status).toBe(
        404,
      );
    });
  });
});
