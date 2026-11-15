/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Combat v2 and the valley systems together (all three flags on): a raider's post pauses on combat v2's own calendar (stage 1 on
 * Saturday, the finale on Sunday evening), keeps pausing for a creature knocked out in a stage (its place is freed, it stays out of
 * the raid for the weekend), covers a week with two parties, and resumes after the finale or an early kill.
 */
import { ValleyViewSchema, type ValleyView } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import type { CoreContext } from './helpers';
import { HOUR, newKey, sessionCaller, type SessionCaller } from './kit';
import { HELSINKI, joinRaid, rows, runRaid, type Seeded } from './raid-helpers';
import { V2_WEEK, carryOf, setBossHp, v2Player } from './raid-v2-helpers';

const ALL = { ...ON, combatV2: true, valleySystems: true } as const;
const LEVEL = 22;

const view = (res: Json): ValleyView => v.parse(ValleyViewSchema, res.body.valley);

interface Raider {
  seeded: Seeded;
  api: SessionCaller<Json['body']>;
  /** Visits (the state call settles the valley) and returns the valley's view. */
  visit: () => Promise<ValleyView>;
}

async function raider(ctx: CoreContext, n: number): Promise<Raider> {
  const seeded = v2Player(ctx, n, { level: LEVEL });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  const visit = async (): Promise<ValleyView> => view(await api.call('GET', '/api/state'));
  await visit();
  return { seeded, api, visit };
}

/** Buys a scout seat and posts the creature on it. */
async function post(p: Raider, creatureId: string): Promise<string> {
  const bought = await p.api.call('POST', '/api/valley/seat/buy', {
    idempotencyKey: newKey('seat'),
  });
  expect(bought.status).toBe(200);
  const seatId = bought.body.seatId as string;
  const posted = await p.api.call('POST', '/api/valley/seat', {
    seatId,
    creatureId,
    destination: 'tidepools',
  });
  expect(posted.status).toBe(200);
  return seatId;
}

const pausedOf = (seen: ValleyView, seatId: string): string | null | undefined =>
  seen.seats.find((s) => s.id === seatId)?.paused;

describe('the raider post pause on combat v2 weekends', () => {
  it('pauses from stage 1 to the finale, also a knocked-out creature and the second party, and resumes after the finale', async () => {
    await runRaid(
      async (ctx) => {
        // Sixteen players are more than one party holds (15): the first and the last two raiders end up in different parties.
        const players: Raider[] = [];
        for (let n = 1; n <= 16; n++) players.push(await raider(ctx, n));
        const [a] = players as [Raider];
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(
          ctx,
          players.map((p) => p.seeded),
        );
        const partyOf = (p: Raider): number =>
          rows<{ party: number }>(
            ctx.sql,
            'SELECT party FROM raid_party_members WHERE user_id = ?',
            p.seeded.id,
          )[0]?.party ?? 0;
        const e = players.find((p) => partyOf(p) !== partyOf(a)) as Raider;
        expect(e).toBeDefined();
        const seatA = await post(a, a.seeded.creatureIds[0] as string);
        const seatE = await post(e, e.seeded.creatureIds[0] as string);
        expect(pausedOf(await a.visit(), seatA)).toBeNull();

        // Saturday morning: nothing is paused yet (the v1 calendar would have locked the week on Friday).
        ctx.clock.t = V2_WEEK.stage1 - 3 * HOUR;
        expect(pausedOf(await a.visit(), seatA)).toBeNull();
        expect(pausedOf(await e.visit(), seatE)).toBeNull();

        // Stage 1 locks: both parties' raiders pause.
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(rows(ctx.sql, 'SELECT party FROM raid_parties')).toHaveLength(2);
        ctx.clock.t = V2_WEEK.stage1 + HOUR;
        expect(pausedOf(await a.visit(), seatA)).toBe('raid');
        expect(pausedOf(await e.visit(), seatE)).toBe('raid');

        // A creature knocked out in stage 1 loses its place on the board but is out for the weekend: a post it takes now is paused.
        // (With sixteen players a stage knocks nobody out, so one falls the way the stage records it: in the carry, off the board.)
        const carry = carryOf(ctx.sql, 1);
        const fallen = rows<{ creature_id: string }>(
          ctx.sql,
          'SELECT creature_id FROM raid_placements WHERE party = 1 AND user_id <> ? ORDER BY slot',
          a.seeded.id,
        )[0]?.creature_id as string;
        ctx.sql.exec(
          'UPDATE raid_parties SET carry_json = ? WHERE party = 1',
          JSON.stringify({ ...carry, out: [...carry.out, fallen] }),
        );
        ctx.sql.exec('DELETE FROM raid_placements WHERE creature_id = ?', fallen);
        const owner = players.find((p) => p.seeded.creatureIds.includes(fallen)) as Raider;
        expect(
          rows(ctx.sql, 'SELECT 1 FROM raid_placements WHERE creature_id = ?', fallen),
        ).toEqual([]);
        const seatF = await post(owner, fallen);
        ctx.clock.t = V2_WEEK.stage1 + 2 * HOUR;
        expect(pausedOf(await owner.visit(), seatF)).toBe('raid');

        // Between the stages and through Sunday: still paused up to the finale.
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        ctx.clock.t = V2_WEEK.finale - HOUR;
        expect(pausedOf(await a.visit(), seatA)).toBe('raid');
        ctx.clock.t = V2_WEEK.finale - 60_000;
        expect(pausedOf(await e.visit(), seatE)).toBe('raid');

        // The finale starts (a live fight of about four and a half minutes) and its done marker is written at the start, as in v1:
        // from there the posts work again.
        ctx.clock.t = V2_WEEK.finale + 10 * 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const finale = rows<{ done_at: number }>(
          ctx.sql,
          "SELECT done_at FROM raid_events WHERE event = 'finale' AND week_id = ?",
          V2_WEEK.id,
        );
        expect(finale).toHaveLength(1);
        ctx.clock.t = (finale[0]?.done_at ?? 0) + HOUR;
        expect(pausedOf(await a.visit(), seatA)).toBeNull();
        expect(pausedOf(await e.visit(), seatE)).toBeNull();
        expect(pausedOf(await owner.visit(), seatF)).toBeNull();
      },
      { start: V2_WEEK.open, core: ALL },
    );
  }, 180_000);

  it('resumes after an early kill, at the finale time (there is no finale to play)', async () => {
    await runRaid(
      async (ctx) => {
        const players: Raider[] = [];
        for (const n of [1, 2, 3, 4]) players.push(await raider(ctx, n));
        const [a] = players as [Raider];
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(
          ctx,
          players.map((p) => p.seeded),
        );
        const seatA = await post(a, a.seeded.creatureIds[0] as string);
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        setBossHp(ctx.sql, 5);
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(carryOf(ctx.sql).bossHp).toBe(0);
        // The boss is down, yet the weekend lasts until the finale's time: Sunday afternoon is still paused.
        ctx.clock.t = V2_WEEK.stage2 + 2 * HOUR;
        expect(pausedOf(await a.visit(), seatA)).toBe('raid');
        ctx.clock.t = V2_WEEK.finale + 1000;
        ctx.core.raid.runDue(HELSINKI);
        ctx.clock.t = V2_WEEK.finale + 2 * HOUR;
        expect(pausedOf(await a.visit(), seatA)).toBeNull();
      },
      { start: V2_WEEK.open, core: ALL },
    );
  }, 180_000);

  it('reads a creature level that the valley raised between the stages, and keeps the boss sized by players, not levels', async () => {
    await runRaid(
      async (ctx) => {
        // The second lap (slot 6, as in the weekend test): the boss outlasts stage 1.
        ctx.sql.exec(
          'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 1)',
        );
        const players: Raider[] = [];
        for (const n of [1, 2, 3, 4]) players.push(await raider(ctx, n));
        const [a] = players as [Raider];
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(
          ctx,
          players.map((p) => p.seeded),
        );
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const hpMax = rows<{ hp_max: number; v2_players: number }>(
          ctx.sql,
          'SELECT hp_max, v2_players FROM raid_parties',
        )[0];
        // Catch-up XP (or idle XP) lifts a standing creature a level on Saturday night.
        const standing = rows<{ creature_id: string }>(
          ctx.sql,
          'SELECT creature_id FROM raid_placements WHERE user_id = ? ORDER BY slot',
          a.seeded.id,
        )[0]?.creature_id as string;
        const maxHpIn = (phase: string): number => {
          const input = JSON.parse(
            rows<{ input: string }>(
              ctx.sql,
              'SELECT input FROM raid_results WHERE phase = ?',
              phase,
            )[0]?.input ?? '{}',
          ) as { fighters: { key: string; maxHp: number }[] };
          return input.fighters.find((f) => f.key === standing)?.maxHp ?? 0;
        };
        const before = maxHpIn('stage1');
        ctx.sql.exec('UPDATE creatures SET level = level + 1 WHERE id = ?', standing);
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(maxHpIn('stage2')).toBeGreaterThan(before);
        // The boss was sized once, from the party's players: its HP is the same after the stage.
        expect(rows(ctx.sql, 'SELECT hp_max, v2_players FROM raid_parties')[0]).toEqual(hpMax);
      },
      { start: V2_WEEK.open, core: ALL },
    );
  }, 180_000);
});
