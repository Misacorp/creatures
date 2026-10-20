import { zoneIndices, zoneOfIndex, zoneSizes, type FightBoard } from '@creatures/engine';
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
      const { row, board } = built.input;
      expect(row).toHaveLength(7);
      // The fight stands on the board: each creature at its own board slot, gaps kept.
      const slotOf = new Map<string, number>([
        ...a.creatureIds.map((id, k) => [id, k] as const),
        [b.creatureIds[0] as string, 4],
        ...c.creatureIds.map((id, k) => [id, 6 + k] as const),
      ]);
      expect(board).toEqual({ length: 9, slots: row.map((s) => slotOf.get(s.id)) });
      expect(board?.slots).toEqual([0, 1, 2, 4, 6, 7, 8]);
      // 3 / 1 / 3 on the board, where the length of the line would give 2 / 3 / 2.
      expect(zoneSizes(7)).toEqual({ front: 2, middle: 3, back: 2 });
      expect(zoneIndices('middle', board as FightBoard)).toEqual([3]);
      row.forEach((s, i) => {
        expect(zoneOfIndex(i, board as FightBoard)).toBe(
          zoneOfIndex(slotOf.get(s.id) as number, 9),
        );
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
      const board = built?.input.board;
      expect(board?.length).toBe(9);
      expect(board?.slots).toHaveLength(built?.input.row.length ?? -1);
      expect(built?.input.row).toHaveLength(9);
    });
  });
});

describe('Mire passives in every raid phase', () => {
  it('Phases 1 and 2 carry the passives of the row (and no finale ability); the finale carries the choice', async () => {
    await runRaid((ctx) => {
      const a = seedPlayer(ctx, 1, { level: 15, species: ['mudlump', 'squelch', 'splashet'] });
      ctx.core.raid.currentWeek(HELSINKI);
      const week = ctx.core.raid.week(W02.id);
      if (week === null) throw new Error('no week');
      const [mud, squelch] = a.creatureIds as [string, string];
      for (const phase of ['phase1', 'phase2'] as const) {
        const input = buildPhaseInput(ctx.sql, week, 1, phase)?.input;
        expect(input?.finaleAbilities).toEqual([]);
        expect(input?.passives).toEqual(
          expect.arrayContaining([
            { creatureId: mud, abilityId: 'mud-wall' },
            { creatureId: squelch, abilityId: 'squelch-song' },
          ]),
        );
        // Only the passive abilities: nothing else a creature brings is listed.
        expect(
          input?.passives?.every((p) => ['mud-wall', 'squelch-song'].includes(p.abilityId)),
        ).toBe(true);
      }
      const finale = buildPhaseInput(ctx.sql, week, 1, 'finale')?.input;
      expect(finale?.passives).toBeUndefined();
      expect(finale?.finaleAbilities.some((c) => c.abilityId === 'mud-wall')).toBe(true);
    });
  });
});
