import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { TRACK_LANES, moveTrack } from './move-track';

const bossOf = (id: string) => {
  const boss = content.bosses.find((b) => b.id === id);
  if (boss === undefined) throw new Error(`no boss ${id}`);
  return boss;
};
const tidal = bossOf('tidal-colossus');
const at = (view: ReturnType<typeof moveTrack>) =>
  view.tiles.map((t) => [t.gimmick, t.kind, t.from, t.to]);

describe('the move track', () => {
  it('puts each move in the box of the round it comes in, this round on top', () => {
    // Tidal Colossus: Undertow every 3, Riptide every 4, Great Wave (charge) every 5, Deepwater Spear
    // every 7, Spring Tide (charge) every 9.
    const view = moveTrack(tidal, 4, 12);
    expect(view.rounds).toEqual([4, 5, 6, 7, 8]);
    expect(at(view)).toEqual([
      ['riptide', 'move', 4, 4],
      ['great-wave', 'charge', 4, 5],
      ['undertow', 'move', 6, 6],
      ['deepwater-spear', 'move', 7, 7],
      ['riptide', 'move', 8, 8],
      ['spring-tide', 'charge', 8, 9],
    ]);
    // This round: Riptide strikes, and Great Wave marks its targets (it lands next round).
    expect(view.now).toEqual([
      { name: 'Riptide', note: null },
      { name: 'Great Wave', note: 'marks' },
    ]);
  });

  it('draws a charge as one block over the round it marks and the round it lands', () => {
    const view = moveTrack(tidal, 5, 12);
    const wave = view.tiles.find((t) => t.gimmick === 'great-wave');
    // Marked last round, it lands now: the block starts above the track.
    expect(wave).toMatchObject({ from: 4, to: 5, kind: 'charge' });
    expect(view.now).toEqual([{ name: 'Great Wave', note: null }]);
  });

  it('stands moves of the same round side by side', () => {
    const view = moveTrack(tidal, 8, 12);
    const r8 = view.tiles.filter((t) => t.from <= 8 && t.to >= 8);
    expect(r8.map((t) => t.gimmick).sort()).toEqual(['riptide', 'spring-tide']);
    expect(new Set(r8.map((t) => t.lane)).size).toBe(2);
    expect(view.tiles.every((t) => t.lane < TRACK_LANES)).toBe(true);
  });

  it('starts at round 1 before the fight, and never shows a round past the last', () => {
    expect(moveTrack(tidal, 0, 12).rounds).toEqual([1, 2, 3, 4, 5]);
    const late = moveTrack(tidal, 11, 12);
    expect(late.rounds).toEqual([11, 12]);
    // A charge never lands past the last round: Great Wave's next landing would be 15.
    expect(late.tiles.every((t) => t.to <= 12)).toBe(true);
  });

  it('shows an every-round move in the top box only, and a whole-round trap as its own kind', () => {
    const storm = moveTrack(bossOf('storm-sovereign'), 1, 12);
    expect(storm.tiles.filter((t) => t.gimmick === 'lightning-rod').map((t) => t.from)).toEqual([
      1,
    ]);
    const wyrm = moveTrack(bossOf('cinder-wyrm'), 1, 12);
    expect(wyrm.tiles.find((t) => t.gimmick === 'backdraft')?.kind).toBe('round');
  });

  it('uses the names the fight was played with', () => {
    const view = moveTrack(tidal, 3, 12, { undertow: 'Deep Undertow' });
    expect(view.now).toEqual([{ name: 'Deep Undertow', note: null }]);
  });
});
