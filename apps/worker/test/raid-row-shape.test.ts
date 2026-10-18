import { zoneOfIndex, zoneSizes } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { buildPhaseInput } from '../src/raid-resolve';
import { HELSINKI, W02, runRaid, seedPlayer } from './raid-helpers';

describe('the fight keeps the board rows', () => {
  it('a board with holes fights in the board rows, not the rows of the shorter line', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1, { level: 15 });
      const b = seedPlayer(ctx, 2, { level: 15, creatures: 1 });
      const c = seedPlayer(ctx, 3, { level: 15 });
      ctx.core.raid.currentWeek(HELSINKI);
      const week = ctx.core.raid.week(W02.id);
      if (week === null) throw new Error('no week');
      // Nine slots: Front 0-2, Middle 3-5, Back 6-8. The lone creature stands in the middle, with
      // holes around it, so the seven creatures are 3 / 1 / 3 on the board (2 / 3 / 2 by length).
      const place = (slot: number, userId: string, creatureId: string) =>
        ctx.sql.exec(
          'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, ?, ?, ?, ?)',
          W02.id,
          1,
          slot,
          userId,
          creatureId,
        );
      a.creatureIds.forEach((id, k) => place(k, a.id, id));
      place(4, b.id, b.creatureIds[0] as string);
      c.creatureIds.forEach((id, k) => place(6 + k, c.id, id));

      const built = buildPhaseInput(ctx.sql, week, 1, 'finale');
      if (built === null) throw new Error('no input');
      const { row, zones } = built.input;
      expect(row).toHaveLength(7);
      expect(zones).toEqual({ front: 3, middle: 1, back: 3 });
      expect(zoneSizes(7)).toEqual({ front: 2, middle: 3, back: 2 });
      // Each creature's zone in the fight is the zone of its board slot.
      const slotOf = new Map<string, number>([
        ...a.creatureIds.map((id, k) => [id, k] as const),
        [b.creatureIds[0] as string, 4],
        ...c.creatureIds.map((id, k) => [id, 6 + k] as const),
      ]);
      const sizes = zones ?? zoneSizes(7);
      row.forEach((s, i) => {
        expect(zoneOfIndex(i, sizes)).toBe(zoneOfIndex(slotOf.get(s.id) as number, 9));
      });
    });
  });

  it('carries the board shape for a lone player with guests, too', async () => {
    await runRaid((ctx) => {
      seedPlayer(ctx, 1, { level: 15 });
      ctx.core.raid.currentWeek(HELSINKI);
      const week = ctx.core.raid.week(W02.id);
      if (week === null) throw new Error('no week');
      const built = buildPhaseInput(ctx.sql, week, 1, 'finale');
      const zones = built?.input.zones;
      expect(zones).toBeDefined();
      expect(Object.values(zones ?? {}).reduce((a, b) => a + b, 0)).toBe(built?.input.row.length);
      expect(built?.input.row).toHaveLength(9);
    });
  });
});
