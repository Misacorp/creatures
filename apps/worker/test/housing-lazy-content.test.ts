/**
 * The housing content is lazy (`docs/design/housing.md`, "Server cost of the content"): the object's start, `/api/state` and an alarm tick
 * never load it, a house route does; and a content load that fails costs a reward moment only its drop roll, never the trophy.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it, vi } from 'vitest';
import { HousingDrops } from '../src/housing-drops';
import { player } from './dev-helpers';
import { runHouse } from './housing-helpers';
import { count, rows } from './raid-helpers';

const loads = vi.hoisted(() => ({ n: 0 }));
vi.mock('@creatures/game/housing-lazy', async (importOriginal) => {
  const real = await importOriginal<typeof import('@creatures/game/housing-lazy')>();
  return {
    ...real,
    shippedHousing: () => {
      loads.n++;
      return real.shippedHousing();
    },
  };
});

describe('lazy housing content', () => {
  it('is not loaded by the object start, /api/state or an alarm tick, only by a house route', async () => {
    loads.n = 0;
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      expect(ctx.core.housing).not.toBeNull();
      expect((await p.call('GET', '/api/state')).status).toBe(200);
      await ctx.core.alarm();
      expect(loads.n).toBe(0);
      expect((await p.call('GET', '/api/house')).status).toBe(200);
      expect(loads.n).toBeGreaterThan(0);
    });
  });
});

describe('a failed content load in a drop moment', () => {
  it('still writes the trophy once and records the moment, so a retry counts nothing twice', async () => {
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      const hook = new HousingDrops({
        storage: ctx.storage,
        now: () => ctx.clock.t,
        rng: createSeededRng('failing-content'),
        loadContent: () => {
          throw new Error('content is broken');
        },
      });
      const moment = {
        kind: 'raid' as const,
        key: 'raid:2027-W02',
        weekId: '2027-W02',
        bossId: 'tidal-colossus',
        rank: 3,
        cleared: true,
        festival: null,
        element: 'tide' as const,
      };
      const silent = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      hook.drop(p.id, moment);
      hook.drop(p.id, moment);
      silent.mockRestore();
      expect(rows(ctx.sql, 'SELECT ref, wins FROM house_trophies WHERE user_id = ?', p.id)).toEqual(
        [{ ref: 'tidal-colossus', wins: 1 }],
      );
      expect(count(ctx.sql, 'house_drops')).toBe(1);
    });
  });
});
