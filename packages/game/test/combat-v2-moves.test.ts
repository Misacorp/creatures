/**
 * The move library's label (`moveLabel`, `src/combat-v2/moves.ts`): the plain behaviour label the board can show under a move's own
 * name ("Deepwater Spear · Nemesis Lance"). Every shape, every target word and the special cases are proved here once; that the
 * shipped library's labels are the decision's table is the content gate's test (`combat-v2-content.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { MOVE_ANCHORS, MOVE_SHAPES, combatV2, moveLabel, type MoveDef } from '../src/combat-v2';

const label = (
  shape: MoveDef['shape'],
  anchor: MoveDef['anchor'],
  extra: { silences?: boolean; oneShot?: boolean } = {},
): string => moveLabel({ shape, anchor, silences: extra.silences ?? false, ...extra });

describe('moveLabel', () => {
  it('names the target by the anchor and the shape by its word', () => {
    expect(label('line3', 'front')).toBe('Front Slam');
    expect(label('line3', 'payoff')).toBe('Payoff Slam');
    expect(label('line3', 'strongest')).toBe('Nemesis Slam');
    expect(label('columns', 'random')).toBe('Wild Lance');
    expect(label('columns', 'strongest')).toBe('Nemesis Lance');
    expect(label('columns', 'front')).toBe('Front Lance');
    expect(label('rows', 'back')).toBe('Rear Sweep');
    expect(label('row', 'payoff')).toBe('Payoff Sweep');
    expect(label('single', 'weakest')).toBe('Vulture Strike');
    expect(label('single', 'strongest')).toBe('Nemesis Strike');
    expect(label('single', 'payoff')).toBe('Payoff Strike');
    expect(label('single', 'grudge')).toBe('Grudge Strike');
  });

  it('a column and several columns are one Lance, and a row and several rows one Sweep', () => {
    expect(label('column', 'random')).toBe(label('columns', 'random'));
    expect(label('row', 'front')).toBe(label('rows', 'front'));
    expect(label('row', 'front')).toBe('Front Sweep');
  });

  it('a random row is a Wild Sweep, whatever its anchor says', () => {
    expect(label('randomRow', 'random')).toBe('Wild Sweep');
    expect(label('randomRow', 'front')).toBe('Wild Sweep');
  });

  it('a move that picks no target has the shape word alone, and the anchor does not matter', () => {
    for (const anchor of MOVE_ANCHORS) {
      expect(label('scatter', anchor)).toBe('Barrage');
      expect(label('all', anchor)).toBe('Quake');
      expect(label('chain', anchor)).toBe('Leaping Strike');
      expect(label('cross', anchor)).toBe('Cross');
      expect(label('checker', anchor)).toBe('Checker');
      expect(label('rowEnds', anchor)).toBe('Pincer');
    }
  });

  it('the row ends are a Hush when the move silences and a Pincer when it hits', () => {
    expect(label('rowEnds', 'front', { silences: true })).toBe('Hush');
    expect(label('rowEnds', 'front')).toBe('Pincer');
  });

  it('a one-shot is a One-shot, whatever its shape', () => {
    expect(label('single', 'payoff', { oneShot: true })).toBe('One-shot');
    expect(label('single', 'payoff', { oneShot: false })).toBe('Payoff Strike');
  });

  it('every shape and anchor has a label', () => {
    for (const shape of MOVE_SHAPES)
      for (const anchor of MOVE_ANCHORS) expect(label(shape, anchor).length).toBeGreaterThan(0);
  });

  it('labels the shipped library: Deepwater Spear is a Nemesis Lance, Great Wave a Wild Sweep, Judgement Bolt a One-shot', () => {
    const of = (id: string): string => {
      const m = combatV2.moves[id];
      if (m === undefined) throw new Error(`no move ${id}`);
      return moveLabel(m);
    };
    expect(of('deepwater-spear')).toBe('Nemesis Lance');
    expect(of('great-wave')).toBe('Wild Sweep');
    expect(of('judgement-bolt')).toBe('One-shot');
    expect(of('hush')).toBe('Hush');
  });
});
