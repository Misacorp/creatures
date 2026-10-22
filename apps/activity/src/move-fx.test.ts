import { content, dungeonContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { MOVE_FX, elementTheme, fxPlanOf } from './move-fx';
import type { BossStrike } from './stage';

const strike = (over: Partial<BossStrike>): BossStrike => ({
  action: 'attack',
  gimmick: null,
  targets: ['a'],
  zone: 'front',
  blocked: [],
  guarded: null,
  ...over,
});

describe('what a boss action looks like', () => {
  it('gives every boss move and every dungeon foe move a look of its own', () => {
    const ids = [
      ...content.bosses.flatMap((b) => b.gimmicks.map((g) => g.id)),
      ...dungeonContent.foes.flatMap((f) => f.gimmicks.map((g) => g.id)),
    ];
    expect(ids.filter((id) => MOVE_FX[id] === undefined)).toEqual([]);
  });

  it('plays the plain attack as a crescent in the colours of the boss', () => {
    expect(fxPlanOf(strike({}), 'tide')).toMatchObject({ recipe: 'crescent', theme: 'water' });
    expect(fxPlanOf(strike({}), 'grove')).toMatchObject({ recipe: 'crescent', theme: 'vine' });
    expect(elementTheme(null)).toBe('fire');
  });

  it('plays a move by its own recipe and theme', () => {
    expect(
      fxPlanOf(
        strike({ action: 'silence_ends', gimmick: 'bramble-bind', targets: ['a', 'b'] }),
        'grove',
      ),
    ).toMatchObject({ recipe: 'vines', theme: 'thorn', targets: ['a', 'b'] });
    expect(
      fxPlanOf(strike({ action: 'slam', gimmick: 'bog-lob', splash: ['b'] }), 'mire'),
    ).toMatchObject({
      recipe: 'meteor',
      theme: 'mud',
      splash: ['b'],
    });
    expect(fxPlanOf(strike({ action: 'slam', gimmick: 'judgement-bolt' }), 'spark')).toMatchObject({
      recipe: 'skybolt',
      big: true,
    });
  });

  it('falls back on the kind of move and the boss element for a move it does not know', () => {
    expect(fxPlanOf(strike({ action: 'slam', gimmick: 'new-move' }), 'spark')?.recipe).toBe(
      'skybolt',
    );
    expect(fxPlanOf(strike({ action: 'slam', gimmick: 'new-move' }), 'mire')?.recipe).toBe(
      'meteor',
    );
    expect(fxPlanOf(strike({ action: 'hit_zone', gimmick: 'new-move' }), 'tide')).toMatchObject({
      recipe: 'surge',
      rows: ['front'],
    });
  });

  it('covers every row in the enrage round, and plays nothing for a charge being announced', () => {
    expect(fxPlanOf(strike({ action: 'enrage', targets: ['a', 'b'] }), 'ember')).toMatchObject({
      recipe: 'surge',
      rows: ['front', 'middle', 'back'],
      big: true,
    });
    expect(fxPlanOf(strike({ action: 'charge', gimmick: 'great-wave' }), 'tide')).toBeNull();
  });

  it('plays a charged move bigger when it lands', () => {
    expect(
      fxPlanOf(
        strike({ action: 'sweep', gimmick: 'great-wave', rows: ['middle'], charged: true }),
        'tide',
      ),
    ).toMatchObject({ recipe: 'surge', rows: ['middle'], big: true });
  });
});
