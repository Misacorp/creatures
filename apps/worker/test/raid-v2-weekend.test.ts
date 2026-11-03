// A whole combat v2 raid weekend on the real scheduler (docs/design/combat/integration.md, sections 4 and 10): the automatic half of the
// phase 4 gate. A seeded world with the flag on: players place creatures with Knacks and talents, stage 1 locks the players, knocked-out
// creatures are replaced, a swap request is accepted, stage 2 is played, the finale is live with an input, and the week's end moves or
// holds the track. The server is on its second lap (slot 6, two failed weekends), where the boss outlasts a party of level 22 creatures
// and Determination applies.
import { knownKnacks } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import type { CoreContext } from './helpers';
import type { LiveSnapshotV2, RaidV2Part, ReplayViewV2 } from '../src/raid-v2-view';
import { HELSINKI, MINUTE, count, joinRaid, rows, runRaid } from './raid-helpers';
import { V2_WEEK, carryOf, eventsOfKind, setBossHp, v2Player } from './raid-v2-helpers';

const V2 = { combatV2: true } as const;
const LEVEL = 22;

const view = (ctx: CoreContext, id: string) => ctx.core.raid.view(id, HELSINKI);
const v2Of = (ctx: CoreContext, id: string): RaidV2Part => {
  const v = view(ctx, id).v2;
  if (v === undefined) throw new Error('not a v2 view');
  return v;
};
const live = (ctx: CoreContext, id: string): LiveSnapshotV2 =>
  ctx.core.raid.liveView(id, HELSINKI) as LiveSnapshotV2;
const placements = (ctx: CoreContext) =>
  rows<{ slot: number; user_id: string; creature_id: string }>(
    ctx.sql,
    'SELECT slot, user_id, creature_id FROM raid_placements ORDER BY slot',
  );
const track = (ctx: CoreContext) =>
  rows<{ slot: number; best_share_bp: number; failed_weekends: number }>(
    ctx.sql,
    'SELECT slot, best_share_bp, failed_weekends FROM raid_track',
  )[0];

/** A server on its second lap: slot 6 (the Tidal Colossus again, stronger) with two failed weekends behind it. */
const secondLap = (ctx: CoreContext): void => {
  ctx.sql.exec(
    'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 2)',
  );
};

describe('a combat v2 raid weekend', () => {
  it('plays from the opening to the end of the week, holding the track when the boss stands', async () => {
    await runRaid(
      (ctx) => {
        secondLap(ctx);
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: LEVEL }));
        const [a] = players as [(typeof players)[0]];

        // --- Monday: the week is a v2 week on the track's slot, with the track's boss ---
        ctx.core.raid.currentWeek(HELSINKI);
        expect(
          rows(ctx.sql, 'SELECT rules_version, track_slot, boss_id, rank FROM raid_weeks'),
        ).toEqual([{ rules_version: 2, track_slot: 6, boss_id: 'tidal-colossus', rank: 6 }]);
        const opening = view(ctx, a.id);
        expect(opening.rules).toBe(2);
        expect(opening.rank).toBe(6);
        expect(opening.v2).toMatchObject({
          slot: 6,
          bestShareBp: 2500,
          failedWeekends: 2,
          determinationBp: 1000,
          joiningOpen: true,
          stagesPlayed: 0,
        });
        // The v2 calendar: stage 1 Saturday, stage 2 Sunday, the finale Sunday evening.
        expect(opening.schedule.phase1).toBe(V2_WEEK.stage1);
        expect(opening.schedule.phase2).toBe(V2_WEEK.stage2);
        expect(opening.schedule.finale).toBe(V2_WEEK.finale);
        expect(opening.next).toEqual({ event: 'phase1', at: V2_WEEK.stage1 });

        // --- Before stage 1: players join by placing; a Knack is free until a creature has fought ---
        joinRaid(ctx, players);
        const spare = a.creatureIds[3] as string;
        const knacks = knownKnacks(
          rows<{ species: string }>(
            ctx.sql,
            'SELECT species FROM creatures WHERE id = ?',
            a.creatureIds[0] as string,
          )[0]?.species ?? '',
        );
        expect(
          ctx.core.collection.setKnack(a.id, a.creatureIds[0] as string, null, 'raid'),
        ).toMatchObject({
          ok: true,
        });
        expect(
          ctx.core.collection.setKnack(a.id, a.creatureIds[0] as string, knacks[0] ?? null, 'raid'),
        ).toMatchObject({ ok: true });

        // --- Stage 1, Saturday 13:37: the players lock and each party plays a stage ---
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(rows(ctx.sql, 'SELECT phase FROM raid_results')).toEqual([{ phase: 'stage1' }]);
        const stored = rows<{ input: string; seed: string }>(
          ctx.sql,
          "SELECT input, seed FROM raid_results WHERE phase = 'stage1'",
        )[0];
        const input = JSON.parse(stored?.input ?? '{}') as {
          version?: number;
          fighters: { key: string; owner: string }[];
          boss: { id: string; cols: number };
          options: { determinationBp?: number; log?: boolean };
        };
        expect(input.version).toBe(2);
        expect(input.boss).toMatchObject({ id: 'tidal-colossus', cols: 4 });
        // Determination: two failed weekends on a second-lap slot are +10% damage and healing.
        expect(input.options).toMatchObject({ determinationBp: 1000, log: true });
        // A creature's id is its key; its owner is an opaque alias.
        expect(new Set(input.fighters.map((f) => f.key))).toEqual(
          new Set(players.flatMap((p) => p.creatureIds.slice(0, 3))),
        );
        expect(input.fighters.every((f) => /^m[1-4]$/.test(f.owner))).toBe(true);
        expect(stored?.seed).toMatch(/^[0-9a-f]{32}$/);

        const afterOne = carryOf(ctx.sql);
        expect(afterOne).toMatchObject({ stage: 1 });
        expect(afterOne.bossHp).toBeGreaterThan(0);
        expect(afterOne.out.length).toBeGreaterThan(0);
        // The lineups and the stage were logged: one lineup per player, one stage result.
        expect(eventsOfKind(ctx.sql, 'raid_lineup')).toHaveLength(4);
        expect(eventsOfKind(ctx.sql, 'raid_lineup')[0]).toMatchObject({
          stage: 1,
          placed: 3,
          withKnack: 3,
        });
        expect(eventsOfKind(ctx.sql, 'stage_result')).toMatchObject([
          { slot: 6, stage: 1, players: 4, kill: false },
        ]);
        // The week's pool is the party's: stored for the view, as it is for a v1 week.
        expect(rows(ctx.sql, 'SELECT hp_current, v2_players FROM raid_parties')).toEqual([
          { hp_current: afterOne.bossHp, v2_players: 4 },
        ]);

        // Players are locked: nobody new gets in, and the Raid tab does not ask them to.
        const late = v2Player(ctx, 9, { level: LEVEL });
        expect(ctx.core.raid.place(late.id, HELSINKI, late.creatureIds[0] as string, 12)).toEqual({
          ok: false,
          status: 409,
          error: 'locked',
        });
        expect(ctx.core.raid.needsPlacement(late.id, HELSINKI).needed).toBe(false);

        // The carry is in the view: who is out, the stage.
        expect(v2Of(ctx, a.id)).toMatchObject({
          slot: 6,
          stagesPlayed: 1,
          nextStage: 2,
          joiningOpen: false,
        });
        expect(v2Of(ctx, a.id).carry?.out).toEqual(afterOne.out);
        expect(v2Of(ctx, a.id).out).toHaveLength(afterOne.out.length);

        // A creature that has fought is locked: its Knack does not change until the next week. A fresh one is free.
        const fought = Object.keys(afterOne.hp)[0] as string;
        const owner = rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM creatures WHERE id = ?',
          fought,
        )[0]?.user_id as string;
        expect(ctx.core.collection.setKnack(owner, fought, null, 'raid')).toMatchObject({
          ok: false,
          error: 'locked',
        });
        expect(ctx.core.collection.setKnack(a.id, spare, null, 'raid')).toMatchObject({ ok: true });

        // --- Between the stages: a knocked-out creature cannot come back; a fresh one takes an empty slot ---
        const out = new Set(afterOne.out);
        const hurt = players.find((p) => p.creatureIds.slice(0, 3).some((id) => out.has(id)));
        const fallen = (hurt?.creatureIds.slice(0, 3) ?? []).find((id) => out.has(id)) as string;
        expect(hurt).toBeDefined();
        const board = placements(ctx);
        // Knocked-out creatures left the board when the stage locked.
        expect(board.some((p) => p.creature_id === fallen)).toBe(false);
        const used = new Set(board.map((p) => p.slot));
        const target = Array.from({ length: 12 }, (_, i) => i).find((i) => !used.has(i)) as number;
        expect(ctx.core.raid.place(hurt?.id as string, HELSINKI, fallen, target)).toEqual({
          ok: false,
          status: 409,
          error: 'knocked_out',
        });
        const [replacement] = (hurt?.creatureIds ?? []).slice(3) as [string];
        // A fresh creature never pushes another off the board: an occupied slot is refused.
        expect(
          ctx.core.raid.place(hurt?.id as string, HELSINKI, replacement, board[0]?.slot as number),
        ).toEqual({ ok: false, status: 409, error: 'slot_taken' });
        expect(ctx.core.raid.place(hurt?.id as string, HELSINKI, replacement, target)).toEqual({
          ok: true,
          value: null,
        });

        // --- A swap request: two players trade places ---
        const standing = placements(ctx);
        const first = standing[0];
        const other = standing.find((p) => p.user_id !== first?.user_id);
        const asked = ctx.core.raid.askSwap(
          first?.user_id as string,
          HELSINKI,
          first?.slot as number,
          other?.slot as number,
        );
        expect(asked.ok).toBe(true);
        const incoming = ctx.core.raid.swaps(other?.user_id as string, HELSINKI).incoming;
        expect(incoming).toHaveLength(1);
        // Only the asked player can answer it.
        const requestId = incoming[0]?.id as string;
        expect(
          ctx.core.raid.answerSwap(first?.user_id as string, HELSINKI, requestId, 'accept'),
        ).toEqual({ ok: false, status: 404, error: 'not_found' });
        expect(
          ctx.core.raid.answerSwap(other?.user_id as string, HELSINKI, requestId, 'accept').ok,
        ).toBe(true);
        const moved = new Map(placements(ctx).map((p) => [p.creature_id, p.slot]));
        expect(moved.get(first?.creature_id as string)).toBe(other?.slot);
        expect(moved.get(other?.creature_id as string)).toBe(first?.slot);
        // A request still open when the next stage locks ends with it.
        expect(
          ctx.core.raid.askSwap(
            other?.user_id as string,
            HELSINKI,
            first?.slot as number,
            other?.slot as number,
          ).ok,
        ).toBe(true);
        expect(count(ctx.sql, 'raid_swap_requests', "status = 'open'")).toBe(1);

        // --- Stage 2, Sunday 13:37 ---
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_swap_requests', "status = 'open'")).toBe(0);
        expect(rows(ctx.sql, 'SELECT phase FROM raid_results ORDER BY rowid')).toEqual([
          { phase: 'stage1' },
          { phase: 'stage2' },
        ]);
        const afterTwo = carryOf(ctx.sql);
        expect(afterTwo.stage).toBe(2);
        // The replacement fought in stage 2; the creatures out in stage 1 did not come back.
        expect(Object.hasOwn(afterTwo.hp, replacement) || afterTwo.out.includes(replacement)).toBe(
          true,
        );
        for (const key of afterOne.out) expect(afterTwo.out).toContain(key);
        // No HP floor: the boss's HP is the party's, carried on from the first stage.
        expect(afterTwo.bossHp).toBeGreaterThan(0);
        expect(afterTwo.bossHp).toBeLessThan(afterOne.bossHp);
        expect(Object.keys(afterTwo.hp).length).toBeGreaterThan(0);

        // --- The finale, Sunday 20:00: live, with an input ---
        ctx.clock.t = V2_WEEK.finale - 2 * MINUTE;
        expect(live(ctx, a.id)).toMatchObject({ rules: 2, status: 'lobby' });
        ctx.clock.t = V2_WEEK.finale + 1000;
        const survivor = rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM raid_placements LIMIT 1',
        )[0]?.user_id as string;
        const started = live(ctx, survivor);
        expect(started).toMatchObject({ rules: 2, status: 'live', round: 1, rounds: 8 });
        expect(rows(ctx.sql, 'SELECT rules, practice, round_ms FROM raid_live')).toEqual([
          { rules: 2, practice: 0, round_ms: 30_000 },
        ]);
        const mine = started.abilities.find((x) => x.alias === started.you);
        expect(mine).toBeDefined();
        // Fire the caller's input in round 1: it takes effect in round 2.
        const fired = ctx.core.raid.liveAction(survivor, HELSINKI, {
          key: `${started.you as string}:basic`,
          action: 'fire',
          ...(mine?.kind === 'shieldWall' ? { row: 0 } : {}),
        });
        expect(fired.ok).toBe(true);
        const after = live(ctx, survivor).abilities.find((x) => x.alias === started.you);
        expect(after?.fireAtRound).toBe(2);
        // Later: the rounds so far, and never the seed.
        ctx.clock.t = V2_WEEK.finale + 3 * 30_000 + 1000;
        const mid = live(ctx, survivor);
        expect(mid.round).toBe(4);
        expect(mid.events.every((e) => e.round <= 4)).toBe(true);
        expect(JSON.stringify(mid)).not.toContain('"seed"');
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(0);
        // The end: the fight resolves once and the weekend ends.
        ctx.clock.t = V2_WEEK.finale + 9 * 30_000;
        const done = live(ctx, survivor);
        expect(done.status).toBe('done');
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(1);
        const replay = ctx.core.raid.replay(survivor, V2_WEEK.id, 1, 'finale') as ReplayViewV2;
        expect(replay).toMatchObject({ rules: 2, phase: 'finale', stage: 3 });
        expect(replay.actions?.some((x) => x.by === started.you)).toBe(true);
        const stage1 = ctx.core.raid.replay(survivor, V2_WEEK.id, 1, 'stage1') as ReplayViewV2;
        expect(stage1.events.length).toBeGreaterThan(0);
        expect(stage1.fighters).toHaveLength(12);
        // What the playback draws from: the boss card (move labels, the Escalating step) and each creature's Knack by name.
        expect(stage1.card.moves.length).toBeGreaterThan(0);
        expect(stage1.card.moves.every((m) => m.label !== '')).toBe(true);
        expect(stage1.fighters.every((f) => f.knack === null || f.knackName !== null)).toBe(true);
        expect(started.card?.moves.length).toBe(stage1.card.moves.length);
        expect(started.fighters.some((f) => f.knackName !== null)).toBe(true);
        expect(ctx.core.raid.stats(survivor, V2_WEEK.id, 1, 'stage1')).toMatchObject({
          rules: 2,
          stage: 1,
        });

        // --- The week's end: the boss stood, so the track holds, keeps the best share and Determination gains a stack ---
        const final = carryOf(ctx.sql);
        expect(final.stage).toBe(3);
        expect(final.bossHp).toBeGreaterThan(0);
        expect(track(ctx)).toMatchObject({ slot: 6, failed_weekends: 3 });
        // The best share is the better of last time's (25%) and this weekend's, never above 100%.
        const share = Math.floor(
          (((rows<{ hp_max: number }>(ctx.sql, 'SELECT hp_max FROM raid_parties')[0]?.hp_max ?? 1) -
            final.bossHp) *
            10_000) /
            (rows<{ hp_max: number }>(ctx.sql, 'SELECT hp_max FROM raid_parties')[0]?.hp_max ?? 1),
        );
        expect(track(ctx)?.best_share_bp).toBe(Math.max(2500, share));
        expect(rows(ctx.sql, 'SELECT ladder_won, rank_after FROM raid_weeks')).toEqual([
          { ladder_won: 0, rank_after: 6 },
        ]);
        expect(eventsOfKind(ctx.sql, 'track_change')).toMatchObject([
          { slot: 6, kill: false, determination: 3 },
        ]);

        // The next week opens on the same slot, the same boss, with the ghost of the best share.
        ctx.clock.t = V2_WEEK.next + 60_000;
        const next = ctx.core.raid.view(a.id, HELSINKI);
        expect(next.weekId).not.toBe(V2_WEEK.id);
        expect(next.v2).toMatchObject({
          slot: 6,
          bestShareBp: track(ctx)?.best_share_bp,
          failedWeekends: 3,
        });
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 120_000);

  it('moves the track one slot when the boss falls, and plays no later stage', async () => {
    await runRaid(
      (ctx) => {
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: LEVEL }));
        const [a] = players as [(typeof players)[0]];
        secondLap(ctx);
        // Open the week on slot 6, play stage 1, then leave the boss a sliver of HP: stage 2 finishes it.
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, players);
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        setBossHp(ctx.sql, 5);
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(carryOf(ctx.sql).bossHp).toBe(0);
        expect(eventsOfKind(ctx.sql, 'stage_result')[1]).toMatchObject({ stage: 2, kill: true });
        // The finale has nothing to play: no live fight, no finale row; the weekend ends at the finale's time.
        ctx.clock.t = V2_WEEK.finale + 1000;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_live')).toBe(0);
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(0);
        expect(track(ctx)).toEqual({ slot: 7, best_share_bp: 0, failed_weekends: 0 });
        expect(rows(ctx.sql, 'SELECT ladder_won, rank_after FROM raid_weeks')).toEqual([
          { ladder_won: 1, rank_after: 7 },
        ]);
        expect(eventsOfKind(ctx.sql, 'track_change')).toMatchObject([
          { slot: 6, kill: true, determination: 0 },
        ]);
        // Essence was paid for the stage that finished the boss, through today's settle code.
        expect(count(ctx.sql, 'ledger', "source = 'raid'")).toBeGreaterThan(0);
        // The next week fights the next boss on the track.
        ctx.clock.t = V2_WEEK.next + 60_000;
        const next = ctx.core.raid.view(a.id, HELSINKI);
        expect(next.boss.id).toBe('cinder-wyrm');
        expect(next.rank).toBe(7);
        expect(next.v2).toMatchObject({ slot: 7, bestShareBp: 0, failedWeekends: 0 });
        // The week's reveal reads the stage that killed the boss (there is no finale row), and shows what that stage paid.
        const stage2 = rows<{ summary: string }>(
          ctx.sql,
          "SELECT summary FROM raid_results WHERE phase = 'stage2'",
        )[0];
        const paid = (JSON.parse(stage2?.summary ?? '{}') as { essence: Record<string, number> })
          .essence[a.id];
        expect(paid).toBeGreaterThan(0);
        expect(next.you.reveal).toMatchObject({ week: V2_WEEK.id, party: 1, cleared: true });
        expect(next.you.reveal?.essence).toBeGreaterThanOrEqual(paid ?? 0);
        // Marking it seen works for that week and clears it.
        expect(ctx.core.raid.markRevealSeen(a.id, V2_WEEK.id).ok).toBe(true);
        expect(ctx.core.raid.view(a.id, HELSINKI).you.reveal).toBeNull();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 120_000);
});
