import { describe, expect, it } from 'vitest';
import { BOARD_HOLD_MS, BOARD_JUMP_MS, calmRows, calmStep, type CalmState } from './board-calm';
import type { BoardRow } from './show-timeline';

const AB = ['a', 'b', 'c'];
const BA = ['b', 'a', 'c'];

function run(steps: [number, string[]][]): CalmState {
  let s: CalmState | null = null;
  for (const [ms, t] of steps) s = calmStep(s, 'e', t, ms);
  return s as CalmState;
}

describe('calmStep', () => {
  it('starts from the true order', () => {
    expect(run([[0, AB]]).order).toEqual(AB);
  });

  it('moves a row only after its place has held', () => {
    const early = run([
      [0, AB],
      [100, BA],
      [100 + BOARD_HOLD_MS - 1, BA],
    ]);
    expect(early.order).toEqual(AB);
    const due = run([
      [0, AB],
      [100, BA],
      [100 + BOARD_HOLD_MS, BA],
    ]);
    expect(due.order).toEqual(BA);
  });

  it('ignores a swap that flips back before the hold', () => {
    const s = run([
      [0, AB],
      [100, BA],
      [400, AB],
      [700, BA],
      [1100, AB],
      [2000, AB],
    ]);
    expect(s.order).toEqual(AB);
  });

  it('restarts the clock when the swap breaks and comes back', () => {
    const s = run([
      [0, AB],
      [100, BA],
      [500, AB],
      [600, BA],
      [600 + BOARD_HOLD_MS - 1, BA],
    ]);
    expect(s.order).toEqual(AB);
  });

  it('moves a long climb one neighbour at a time, always a permutation', () => {
    const s = run([
      [0, ['a', 'b', 'c', 'd']],
      [100, ['d', 'a', 'b', 'c']],
      [900, ['d', 'a', 'b', 'c']],
    ]);
    expect(s.order).toEqual(['d', 'a', 'b', 'c']);
    expect([...s.order].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('starts over on a seek back, a big jump, a new event or a new field', () => {
    const held = run([
      [0, AB],
      [100, BA],
    ]);
    expect(calmStep(held, 'e', BA, 50).order).toEqual(BA);
    expect(calmStep(held, 'e', BA, 100 + BOARD_JUMP_MS + 1).order).toEqual(BA);
    expect(calmStep(held, 'other', BA, 150).order).toEqual(BA);
    expect(calmStep(held, 'e', ['b', 'a'], 150).order).toEqual(['b', 'a']);
  });

  it('is deterministic and does not change its input', () => {
    const steps: [number, string[]][] = [
      [0, AB],
      [200, BA],
      [500, AB],
      [900, BA],
      [1700, BA],
    ];
    expect(run(steps)).toEqual(run(steps));
    const prev = run([
      [0, AB],
      [100, BA],
    ]);
    const before = JSON.stringify({ o: prev.order, s: [...prev.since] });
    calmStep(prev, 'e', BA, 900);
    expect(JSON.stringify({ o: prev.order, s: [...prev.since] })).toBe(before);
  });
});

function row(teamId: string, place: number): BoardRow {
  return { teamId, playerId: teamId, actor: place, place, text: String(place), out: false };
}

describe('calmRows', () => {
  const rows = [row('b', 1), row('a', 2), row('c', 3)];
  const start = [row('a', 1), row('b', 2), row('c', 3)];

  it('keeps the shown order and renumbers places by position', () => {
    const first = calmRows(null, 'e', start, 0, false);
    const next = calmRows(first.state, 'e', rows, 100, false);
    expect(next.rows.map((r) => [r.teamId, r.place])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    // Scores are the live ones, whatever the position.
    expect(next.rows.find((r) => r.teamId === 'b')?.text).toBe('1');
  });

  it('is exact at the end of the event, at once', () => {
    const first = calmRows(null, 'e', start, 0, false);
    const end = calmRows(first.state, 'e', rows, 100, true);
    expect(end.rows.map((r) => r.teamId)).toEqual(['b', 'a', 'c']);
  });
});
