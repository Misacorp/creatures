/**
 * Combat v2: the board's move preview (`previewMoves`). Fixed-rule moves answer with the creatures they would hit with the placement as it
 * stands, by the engine's own targeting; a move aimed by a roll or a Wind-up has no answer before it is announced; no dice are drawn.
 */
import { startCarry, previewMoves, type BossDef, type StageInputV2 } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import { boss, CHART, ELEMENTS, move, RULES, spec, striker, type SpecOver } from './v2-helpers';

const stage = (b: BossDef, ...over: SpecOver[]): StageInputV2 => ({
  version: 2,
  rules: RULES,
  elements: ELEMENTS,
  chart: CHART,
  boss: b,
  fighters: over.map((o) => spec({ key: `k-${o.name ?? 'A'}`, ...o })),
  options: {},
});

const grid = { rows: 3, cols: 3 };

describe('previewMoves', () => {
  it('lights the slots a fixed move hits: a row sweep from the front anchor, a column lance from the strongest', () => {
    const b = boss({
      ...grid,
      moves: [
        move({ anchor: 'front', shape: 'row' }, { id: 'sweep' }),
        move({ anchor: 'strongest', shape: 'column' }, { id: 'lance' }),
      ],
    });
    const input = stage(
      b,
      { name: 'A', row: 0, col: 0, atk: 100 },
      { name: 'B', row: 0, col: 1, atk: 100 },
      { name: 'C', row: 1, col: 2, atk: 300 },
      { name: 'D', row: 2, col: 2, atk: 50 },
    );
    const preview = previewMoves(input, startCarry(b));
    expect(preview.moves['sweep']).toEqual(['k-A', 'k-B']);
    expect(preview.moves['lance']).toEqual(['k-C', 'k-D']);
  });

  it('answers null for a move aimed by a roll and for a Wind-up move', () => {
    const b = boss({
      ...grid,
      moves: [
        move({ anchor: 'random', shape: 'single' }, { id: 'wild' }),
        move({ anchor: 'front', shape: 'scatter', n: 2 }, { id: 'barrage' }),
        move({ anchor: 'front', shape: 'randomRow' }, { id: 'tide' }),
        move({ anchor: 'front', shape: 'row' }, { id: 'slow', charged: true }),
        move({ anchor: 'front', shape: 'single' }, { id: 'fixed' }),
      ],
    });
    const preview = previewMoves(stage(b, { name: 'A' }, { name: 'B', col: 1 }), startCarry(b));
    expect(preview.moves).toEqual({
      wild: null,
      barrage: null,
      tide: null,
      slow: null,
      fixed: ['k-A'],
    });
  });

  it('never draws a die', () => {
    const b = boss({
      ...grid,
      moves: [move({ anchor: 'random', shape: 'single' }, { id: 'wild' })],
      plain: { pattern: { anchor: 'random', shape: 'single' }, powerBp: 10_000 },
    });
    expect(() => previewMoves(stage(b, { name: 'A' }), startCarry(b))).not.toThrow();
  });

  it('aims the plain attack at the front-most creature, and a Taunt takes it', () => {
    const b = striker(grid);
    const calm = stage(b, { name: 'A', row: 1, col: 0 }, { name: 'B', row: 0, col: 2 });
    expect(previewMoves(calm, startCarry(b)).plain).toBe('k-B');
    const taunt = stage(
      b,
      { name: 'A', row: 2, col: 0, fx: { taunt: true } },
      { name: 'B', row: 0, col: 2 },
    );
    expect(previewMoves(taunt, startCarry(b)).plain).toBe('k-A');
  });

  it('has no plain target on an empty board, and leaves out a creature that is out for the weekend', () => {
    const b = striker(grid);
    expect(previewMoves(stage(b), startCarry(b)).plain).toBeNull();
    const input = stage(b, { name: 'A', row: 0, col: 0 }, { name: 'B', row: 1, col: 0 });
    const carry = { ...startCarry(b), out: ['k-A'] };
    expect(previewMoves(input, carry).plain).toBe('k-B');
  });

  it('picks the most hurt from the HP the carry holds', () => {
    const b = boss({ ...grid, moves: [move({ anchor: 'weakest', shape: 'single' }, { id: 'v' })] });
    const input = stage(b, { name: 'A', maxHp: 400 }, { name: 'B', col: 1, maxHp: 400 });
    const carry = { ...startCarry(b), hp: { 'k-A': 380, 'k-B': 100 } };
    expect(previewMoves(input, carry).moves['v']).toEqual(['k-B']);
  });

  it('widens an area with the escalation step the carry holds', () => {
    const b = boss({
      ...grid,
      moves: [move({ anchor: 'front', shape: 'columns', n: 1 }, { id: 'lances' })],
      escalation: { name: 'Rising', feed: 'rounds', per: 1, cap: 3, grow: { area: 1 } },
    });
    const input = stage(b, { name: 'A', col: 0 }, { name: 'B', col: 1 }, { name: 'C', col: 2 });
    expect(previewMoves(input, startCarry(b)).moves['lances']).toEqual(['k-A']);
    const grown = {
      ...startCarry(b),
      escalation: { step: 1, phase: false, count: 1 },
    };
    expect(previewMoves(input, grown).moves['lances']).toEqual(['k-A', 'k-B']);
  });
});
