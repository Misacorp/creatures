import { describe, expect, it } from 'vitest';
import { capPlacements, type PlacementRow } from '../src/raid-teams';
import { undoPlacementCapMigration } from './helpers';
import {
  HELSINKI,
  W02,
  count,
  joinRaid,
  rows,
  runRaid,
  seedPlayer,
  storedRuns,
} from './raid-helpers';

const row = (rowid: number, slot: number, creature: string, user = 'u1'): PlacementRow => ({
  rowid,
  slot,
  user_id: user,
  creature_id: creature,
});

describe('capPlacements', () => {
  it('keeps three per player: preferred first, then the earliest placed, then the lowest slot', () => {
    const input = [row(1, 5, 'a'), row(2, 4, 'b'), row(3, 3, 'c'), row(4, 2, 'd')];
    // Nothing preferred: the first three placed.
    expect(capPlacements(input).map((r) => r.creature_id)).toEqual(['a', 'b', 'c']);
    // A preferred creature outranks being earlier.
    expect(capPlacements(input, new Set(['d'])).map((r) => r.creature_id)).toEqual(['a', 'b', 'd']);
    expect(capPlacements(input, new Set(['c', 'd'])).map((r) => r.creature_id)).toEqual([
      'a',
      'c',
      'd',
    ]);
    // The same insertion order: the lowest slot goes first.
    const tie = [row(1, 9, 'a'), row(1, 2, 'b'), row(1, 5, 'c'), row(1, 7, 'd')];
    expect(capPlacements(tie).map((r) => r.creature_id)).toEqual(['b', 'c', 'd']);
  });

  it('caps each player on their own and leaves the rest alone', () => {
    const input = [
      row(1, 0, 'a'),
      row(2, 1, 'x', 'u2'),
      row(3, 2, 'b'),
      row(4, 3, 'c'),
      row(5, 4, 'd'),
      row(6, 5, 'y', 'u2'),
    ];
    expect(capPlacements(input).map((r) => r.creature_id)).toEqual(['a', 'x', 'b', 'c', 'y']);
  });
});

/** A player whose table holds four placements (as the production bug left it); the sproutle is the odd one out. */
function legacyBoard(ctx: Parameters<Parameters<typeof runRaid>[0]>[0]) {
  const p = seedPlayer(ctx, 1, {
    creatures: 4,
    level: 10,
    species: ['sproutle', 'splashet', 'stormray', 'gaiadrake'],
  });
  seedPlayer(ctx, 2);
  seedPlayer(ctx, 3);
  // Placed in this order, sproutle first: it is the oldest row. The first placement joins the player.
  joinRaid(ctx, p, { creatures: 1 });
  p.creatureIds.slice(1).forEach((id, k) => {
    ctx.sql.exec(
      'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, ?, ?, ?)',
      W02.id,
      k + 1,
      p.id,
      id,
    );
  });
  return p;
}

describe('a table with four placements of one player (legacy data)', () => {
  it('never shows more than three of a player on the board', async () => {
    await runRaid((ctx) => {
      const p = legacyBoard(ctx);
      expect(count(ctx.sql, 'raid_placements')).toBe(4);
      const view = ctx.core.raid.view(p.id, HELSINKI);
      const mine = view.party?.row.filter((s) => s.creature?.mine) ?? [];
      expect(mine).toHaveLength(3);
      // The three placed first stay (the table is not read for a team any more); the latest goes.
      expect(mine.map((s) => s.creature?.species).sort()).toEqual([
        'splashet',
        'sproutle',
        'stormray',
      ]);
      // And the creatures the player brings are those three, not four.
      expect(view.you.team?.creatures).toHaveLength(3);
    });
  });

  it('never fights with more than three of a player', async () => {
    await runRaid((ctx) => {
      legacyBoard(ctx);
      ctx.clock.t = W02.afterPhase1;
      ctx.core.raid.runDue(HELSINKI);
      const [run] = storedRuns(ctx.sql);
      const mine = run?.input.row.filter((s) => s.ownerId === 'm1') ?? [];
      expect(mine.length).toBeLessThanOrEqual(3);
    });
  });

  it('is repaired by a write: the next placement deletes the extra rows', async () => {
    await runRaid((ctx) => {
      const p = legacyBoard(ctx);
      const kept = p.creatureIds[1] as string;
      expect(ctx.core.raid.place(p.id, HELSINKI, kept, 8).ok).toBe(true);
      expect(count(ctx.sql, 'raid_placements', `user_id = '${p.id}'`)).toBe(3);
    });
  });

  it('is repaired by the migration, keeping the team first, then the earliest, then the lowest slot', async () => {
    await runRaid((ctx) => {
      const p = legacyBoard(ctx);
      // Another player and week that are fine stay as they are.
      const other = seedPlayer(ctx, 4);
      joinRaid(ctx, other, { creatures: 1 });
      undoPlacementCapMigration(ctx.sql);
      ctx.core.migrate();
      const left = rows<{ creature_id: string }>(
        ctx.sql,
        'SELECT creature_id FROM raid_placements WHERE user_id = ? ORDER BY slot',
        p.id,
      ).map((r) => r.creature_id);
      expect(left).toEqual(p.creatureIds.slice(1));
      expect(count(ctx.sql, 'raid_placements', `user_id = '${other.id}'`)).toBe(1);
      // Running it again changes nothing.
      undoPlacementCapMigration(ctx.sql);
      ctx.core.migrate();
      expect(count(ctx.sql, 'raid_placements')).toBe(4);
    });
  });
});
