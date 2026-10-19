import { createSeededRng } from '@creatures/game';
import { describe, expect, it, vi } from 'vitest';
import type { Attention } from '../src/attention';
import type { DungeonToday } from '../src/dungeon';
import type { RaidView } from '../src/raid-view';
import { dungeonPlayer, withDeadlyFoes, type DungeonPlayer } from './dungeon-helpers';
import type { CoreContext } from './helpers';
import { HELSINKI, HOUR, W02, runRaid } from './raid-helpers';
import { newKey, captureConsole } from './kit';

/** `attention` on GET /api/state: the notification pips of the Activity. */
const options = {
  core: { dungeonRng: createSeededRng('attention'), gearRng: createSeededRng('attention-gear') },
};
/** Wednesday 12:00 in Helsinki, in raid week 2027-W02: the daily reset (13:37) is hours away, phase 1 is days away. */
const WEDNESDAY_NOON = Date.parse('2027-01-13T10:00:00Z');
/** Sunday 15:00 in Helsinki: the finale (20:00) comes before the next daily reset (Monday 13:37). */
const SUNDAY_AFTERNOON = Date.parse('2027-01-17T13:00:00Z');

async function stateOf(p: DungeonPlayer): Promise<Record<string, unknown>> {
  const res = await p.call('GET', '/api/state');
  expect(res.status).toBe(200);
  return res.body;
}

async function attentionOf(p: DungeonPlayer): Promise<Attention> {
  return (await stateOf(p))['attention'] as Attention;
}

describe('attention.dungeon', () => {
  it('is true for a fresh player with three creatures, false with fewer', async () => {
    await runRaid(async (ctx) => {
      const ready = await dungeonPlayer(ctx, 1);
      const short = await dungeonPlayer(ctx, 2, { creatures: 2 });
      expect((await attentionOf(ready)).dungeon).toBe(true);
      expect((await attentionOf(short)).dungeon).toBe(false);
      // The same answer as the dungeon tab's.
      expect((await ready.today()).canRun).toBe(true);
      expect((await short.today()).canRun).toBe(false);
    }, options);
  });

  it('is false after today’s run, and true again on the next game day', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1, { level: 30 });
      // Cleared on the first day: no retry.
      ctx.sql.exec(
        'INSERT INTO dungeon_progress (user_id, depth, first_day) VALUES (?, 1, ?)',
        p.id,
        '2020-01-01',
      );
      expect((await p.run()).status).toBe(200);
      const after = await attentionOf(p);
      expect(after.dungeon).toBe(false);
      expect(after.dungeon).toBe((await p.today()).canRun);
      ctx.clock.t += 24 * HOUR;
      expect((await attentionOf(p)).dungeon).toBe(true);
    }, options);
  });

  it('is true again for the free retry of a lost first run', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1, { level: 1 });
      expect((await withDeadlyFoes(() => p.run())).body.run.cleared).toBe(false);
      expect((await attentionOf(p)).dungeon).toBe(true);
      expect((await withDeadlyFoes(() => p.run({ idempotencyKey: newKey() }))).status).toBe(200);
      expect((await attentionOf(p)).dungeon).toBe(false);
      expect((await p.today()).canRun).toBe(false);
    }, options);
  });

  it('stays on while a run is open (an open run is a reason to come back), though a run cannot start', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1, { level: 30 });
      expect((await p.start()).status).toBe(200);
      expect((await p.today()).canRun).toBe(false);
      expect((await attentionOf(p)).dungeon).toBe(true);
    }, options);
  });

  it('does not draw or store the day’s modifiers', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1);
      await attentionOf(p);
      expect(ctx.sql.exec('SELECT COUNT(*) AS n FROM dungeon_days').one()['n']).toBe(0);
    }, options);
  });
});

describe('attention.raid', () => {
  it('is true when a team creature has no place on the board, false once all are placed', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1);
      const [a, b, c] = p.creatureIds as [string, string, string];
      expect((await attentionOf(p)).raid).toBe(true);
      expect(ctx.core.raid.place(p.id, HELSINKI, a, 0).ok).toBe(true);
      // One of three placed: the other two still have no slot.
      expect((await attentionOf(p)).raid).toBe(true);
      expect(ctx.core.raid.place(p.id, HELSINKI, b, 1).ok).toBe(true);
      expect(ctx.core.raid.place(p.id, HELSINKI, c, 2).ok).toBe(true);
      expect((await attentionOf(p)).raid).toBe(false);
      // The Raid tab agrees.
      const view = ctx.core.raid.view(p.id, HELSINKI);
      expect(view.you.team?.creatures.every((x) => x.slot !== null)).toBe(true);
    }, options);
  });

  it('matches what the raid view would tell the client', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1, { creatures: 4 });
      const wanted = (view: RaidView): boolean =>
        view.party !== null &&
        view.you.canEdit &&
        (view.you.team?.creatures.some((x) => x.slot === null) ?? false);
      expect((await attentionOf(p)).raid).toBe(wanted(ctx.core.raid.view(p.id, HELSINKI)));
      for (const id of p.creatureIds.slice(0, 3)) ctx.core.raid.place(p.id, HELSINKI, id, 0);
      const view = ctx.core.raid.view(p.id, HELSINKI);
      expect((await attentionOf(p)).raid).toBe(wanted(view));
    }, options);
  });

  it('is false during the finale', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1);
      expect((await attentionOf(p)).raid).toBe(true);
      ctx.clock.t = W02.afterFinale;
      expect((await attentionOf(p)).raid).toBe(false);
      expect(ctx.core.raid.view(p.id, HELSINKI).status).toBe('finale');
    }, options);
  });

  it('is false for a player who is not in a party', async () => {
    await runRaid(async (ctx) => {
      // No creatures: not on the roster.
      const p = await dungeonPlayer(ctx, 1, { creatures: 0 });
      expect((await attentionOf(p)).raid).toBe(false);
      expect(ctx.core.raid.view(p.id, HELSINKI).party).toBeNull();
    }, options);
  });
});

describe('attention.recheckAt', () => {
  const view = (ctx: CoreContext, userId: string): RaidView => ctx.core.raid.view(userId, HELSINKI);

  it('is the daily reset when that comes first', async () => {
    await runRaid(
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const today: DungeonToday = await p.today();
        const next = view(ctx, p.id).next;
        expect(next).not.toBeNull();
        expect(today.resetsAt).toBeLessThan(next?.at ?? 0);
        expect((await attentionOf(p)).recheckAt).toBe(today.resetsAt);
      },
      { ...options, start: WEDNESDAY_NOON },
    );
  });

  it('is the next raid event when that comes first', async () => {
    await runRaid(
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const today: DungeonToday = await p.today();
        const next = view(ctx, p.id).next;
        expect(next).not.toBeNull();
        expect(next?.at ?? 0).toBeGreaterThan(ctx.clock.t);
        expect(next?.at ?? 0).toBeLessThan(today.resetsAt);
        expect((await attentionOf(p)).recheckAt).toBe(next?.at);
      },
      { ...options, start: SUNDAY_AFTERNOON },
    );
  });

  it('ignores a raid with nothing left to happen, and is always in the future', async () => {
    await runRaid(
      async (ctx) => {
        const p = await dungeonPlayer(ctx, 1);
        const today: DungeonToday = await p.today();
        const a = await attentionOf(p);
        expect(view(ctx, p.id).next).toBeNull();
        expect(a.recheckAt).not.toBeNull();
        expect(a.recheckAt ?? 0).toBeGreaterThan(ctx.clock.t);
        expect(a.recheckAt ?? 0).toBeLessThanOrEqual(today.resetsAt);
      },
      { ...options, start: W02.afterFinale },
    );
  });
});

describe('where attention appears', () => {
  it('is on GET /api/state only, not in the answers of actions', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1, { creatures: 0 });
      expect(await attentionOf(p)).toEqual({
        dungeon: false,
        raid: false,
        recheckAt: expect.any(Number) as number,
      });
      const started = await p.call('POST', '/api/starter', {
        species: 'cindle',
        idempotencyKey: newKey(),
      });
      expect(started.status).toBe(200);
      expect(started.body).toHaveProperty('state');
      expect(started.body).not.toHaveProperty('attention');
      expect(started.body['state']).not.toHaveProperty('attention');
      // And the next GET has it again, now with the starter in hand.
      const again = await stateOf(p);
      expect(again).toHaveProperty('attention');
    }, options);
  });

  it('keeps the state when the attention cannot be worked out', async () => {
    await runRaid(async (ctx) => {
      const p = await dungeonPlayer(ctx, 1);
      const spy = vi.spyOn(ctx.core, 'attention').mockImplementation(() => {
        throw new Error('boom: private detail');
      });
      const log = captureConsole();
      try {
        const state = await stateOf(p);
        expect(state['attention']).toBeNull();
        expect(state).toHaveProperty('creatures');
        // Only the error kind is logged.
        expect(log.calls).toContainEqual(['attention failed', 'Error']);
        expect(JSON.stringify(log.calls)).not.toContain('private detail');
      } finally {
        spy.mockRestore();
        log.restore();
      }
    }, options);
  });
});
