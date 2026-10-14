import { zoneSizes } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { boardRows, laneCount, placeOf } from '../raid-board';
import { bigRaidFight } from './raid-fight';

describe('the workbench raid fight', () => {
  it('has 33 slots for 11 players: 11 lanes, three of them yours', () => {
    const fight = bigRaidFight(11, 4);
    expect(fight.row).toHaveLength(33);
    expect(zoneSizes(33)).toEqual({ front: 11, middle: 11, back: 11 });
    expect(laneCount(boardRows(33))).toBe(11);
    expect(fight.mineIds.size).toBe(3);
    // Every one of yours stands in lane 5, one in each row.
    const lanes = fight.row
      .map((c, slot) => ({ c, place: placeOf(slot, 33) }))
      .filter(({ c }) => fight.mineIds.has(c.id))
      .map(({ place }) => place?.lane);
    expect(lanes).toEqual([5, 5, 5]);
  });

  it('plays the same fight every time, with turns in it', () => {
    const a = bigRaidFight(11, 4);
    const b = bigRaidFight(11, 4);
    expect(b).toBe(a);
    expect(a.events.filter((e) => e.t === 'turn').length).toBeGreaterThan(33);
    expect(new Set(a.row.map((c) => c.id)).size).toBe(33);
  });

  it('keeps the viewer and the party size in range', () => {
    expect(bigRaidFight(99, 99).row).toHaveLength(45);
    expect(bigRaidFight(0, -3).row).toHaveLength(3);
  });
});
