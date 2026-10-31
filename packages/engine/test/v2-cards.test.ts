/**
 * Combat v2: boss rule cards as operations (`applyCard`). Each operation is proved on a hand-built boss and hand-written
 * operations, never on the shipped cards, so a rule is proven without the catalogue; the shipped cards' numbers are the game's
 * (`cards.json`), and the lab's parity digest holds them to the numbers the lab had.
 */
import { applyCard, type BossDef, type BossMove, type CardOp } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import { boss, move } from './v2-helpers';

const base = (over: Partial<BossDef> = {}): BossDef =>
  boss({ armour: 20, spd: 50, atk: 110, ...over });
const FULL = 10_000;

describe('applyCard', () => {
  it('does nothing but set the strength for a card with no operations', () => {
    const b = base();
    expect(applyCard(b, [])).toEqual({ ...b, strengthBp: FULL });
    expect(applyCard(b, [], 4_000)).toEqual({ ...b, strengthBp: 4_000 });
  });

  it('does not change the boss it is given', () => {
    const b = base();
    const before = JSON.stringify(b);
    applyCard(b, [{ op: 'add', stat: 'armour', value: 70 }], 5_000);
    expect(JSON.stringify(b)).toBe(before);
  });

  it('every card sets the boss strength to its own, the last card winning', () => {
    const b = base({ strengthBp: 9_000 });
    expect(applyCard(b, [{ op: 'flag', mod: 'fizzle' }], 3_000).strengthBp).toBe(3_000);
    expect(applyCard(b, [{ op: 'add', stat: 'spd', value: 1 }]).strengthBp).toBe(FULL);
    const twice = applyCard(applyCard(b, [], 3_000), [], 6_500);
    expect(twice.strengthBp).toBe(6_500);
  });

  describe('add', () => {
    const ops: CardOp[] = [{ op: 'add', stat: 'armour', value: 70 }];
    it('adds the share of the value to the stat', () => {
      expect(applyCard(base(), ops).armour).toBe(90);
      expect(applyCard(base(), ops, 5_000).armour).toBe(55);
      expect(applyCard(base(), [{ op: 'add', stat: 'spd', value: 300 }], 5_000).spd).toBe(200);
    });
    it('rounds the share down, and adds nothing at strength 0', () => {
      expect(applyCard(base(), ops, 3_333).armour).toBe(20 + 23);
      expect(applyCard(base(), ops, 0).armour).toBe(20);
    });
  });

  describe('set', () => {
    it('sets the stat to the share of the value, replacing what it was', () => {
      const ops: CardOp[] = [{ op: 'set', stat: 'dodgeBp', value: 2_500 }];
      expect(applyCard(base(), ops).dodgeBp).toBe(2_500);
      expect(applyCard(base({ dodgeBp: 9_000 }), ops, 4_000).dodgeBp).toBe(1_000);
      expect(applyCard(base(), ops, 0).dodgeBp).toBe(0);
      expect(
        applyCard(base(), [{ op: 'set', stat: 'critChanceBp', value: 2_000 }], 5_000).critChanceBp,
      ).toBe(1_000);
    });
  });

  describe('raise', () => {
    const ops: CardOp[] = [{ op: 'raise', stat: 'atk', bp: 2_000 }];
    it('raises the stat by the share of the bp, rounded down', () => {
      expect(applyCard(base(), ops).atk).toBe(132);
      expect(applyCard(base(), ops, 5_000).atk).toBe(121);
      expect(applyCard(base({ atk: 77 }), ops, 3_333).atk).toBe(Math.floor((77 * 10_666) / 10_000));
    });
    it('leaves the stat at strength 0', () => {
      expect(applyCard(base(), ops, 0).atk).toBe(110);
    });
  });

  describe('flag', () => {
    it.each(['shedMarks', 'reflectFirst', 'fizzle', 'adapts', 'adaptsElement'] as const)(
      'turns %s on, and keeps the other mods',
      (mod) => {
        const b = applyCard(base({ mods: { capPerHit: 5 } }), [{ op: 'flag', mod }], 6_500);
        expect(b.mods).toEqual({ capPerHit: 5, [mod]: true });
        expect(b.strengthBp).toBe(6_500);
      },
    );
    it('is on at strength 0 too: the engine scales the rule by the boss strength', () => {
      expect(applyCard(base(), [{ op: 'flag', mod: 'fizzle' }], 0).mods.fizzle).toBe(true);
    });
  });

  describe('mod', () => {
    it('base plus the share of plus', () => {
      const ops: CardOp[] = [{ op: 'mod', mod: 'wardBp', base: 10_000, plus: 20_000 }];
      expect(applyCard(base(), ops).mods.wardBp).toBe(30_000);
      expect(applyCard(base(), ops, 5_000).mods.wardBp).toBe(20_000);
      expect(applyCard(base(), ops, 0).mods.wardBp).toBe(10_000);
    });
    it('base minus the share of minus, which rounds the share down (not the negative number)', () => {
      const ops: CardOp[] = [{ op: 'mod', mod: 'healBp', base: 10_000, minus: 5_000 }];
      expect(applyCard(base(), ops).mods.healBp).toBe(5_000);
      expect(applyCard(base(), ops, 5_000).mods.healBp).toBe(7_500);
      expect(applyCard(base(), ops, 3_333).mods.healBp).toBe(
        10_000 - Math.floor(16_665_000 / 10_000),
      );
      expect(applyCard(base(), ops, 0).mods.healBp).toBe(10_000);
    });
    it('with neither, base as it is: not scaled by the strength', () => {
      const ops: CardOp[] = [{ op: 'mod', mod: 'shakeEvery', base: 3 }];
      expect(applyCard(base(), ops).mods.shakeEvery).toBe(3);
      expect(applyCard(base(), ops, 1_000).mods.shakeEvery).toBe(3);
      expect(applyCard(base(), ops, 0).mods.shakeEvery).toBe(3);
    });
  });

  describe('cap', () => {
    const ops: CardOp[] = [{ op: 'cap', value: 260 }];
    it('no hit above the value at full strength, a higher cap when weaker', () => {
      expect(applyCard(base(), ops).mods.capPerHit).toBe(260);
      expect(applyCard(base(), ops, 5_000).mods.capPerHit).toBe(520);
      expect(applyCard(base(), ops, 3_000).mods.capPerHit).toBe(Math.floor(2_600_000 / 3_000));
    });
    it('does nothing at strength 0 (and below): no cap, the strength still set', () => {
      const none = applyCard(base(), ops, 0);
      expect(none.mods.capPerHit).toBeUndefined();
      expect(none.strengthBp).toBe(0);
      expect(applyCard(base(), ops, -5).mods.capPerHit).toBeUndefined();
    });
  });

  describe('move', () => {
    const slam: BossMove = move(
      { anchor: 'payoff', shape: 'line3' },
      { id: 'slam', powerBp: 15_000, every: 3 },
    );
    it('power: adds the move with its power scaled by the strength', () => {
      const ops: CardOp[] = [{ op: 'move', move: slam, scale: 'power' }];
      expect(applyCard(base(), ops).moves).toEqual([slam]);
      expect(applyCard(base(), ops, 5_000).moves).toEqual([{ ...slam, powerBp: 7_500 }]);
      expect(applyCard(base(), ops, 5_000).moves[0]?.strengthBp).toBeUndefined();
    });
    it('power: at least 1 bp, so the move still lands at strength 0', () => {
      const ops: CardOp[] = [{ op: 'move', move: slam, scale: 'power' }];
      expect(applyCard(base(), ops, 0).moves[0]?.powerBp).toBe(1);
      expect(applyCard(base(), ops, 1).moves[0]?.powerBp).toBe(1);
    });
    it('gate: adds the move with the strength as its gate, power as written', () => {
      const bind: BossMove = move(
        { anchor: 'front', shape: 'rowEnds', n: 1 },
        { id: 'bind', powerBp: 0, silenceTurns: 2 },
      );
      const ops: CardOp[] = [{ op: 'move', move: bind, scale: 'gate' }];
      expect(applyCard(base(), ops).moves).toEqual([{ ...bind, strengthBp: FULL }]);
      expect(applyCard(base(), ops, 4_000).moves).toEqual([{ ...bind, strengthBp: 4_000 }]);
      expect(applyCard(base(), ops, 0).moves).toEqual([{ ...bind, strengthBp: 0 }]);
    });
    it('keeps the boss’s own moves, in order, and does not change the card’s move', () => {
      const own = move({ anchor: 'front', shape: 'row' }, { id: 'own' });
      const b = applyCard(
        base({ moves: [own] }),
        [{ op: 'move', move: slam, scale: 'power' }],
        5_000,
      );
      expect(b.moves.map((m) => m.id)).toEqual(['own', 'slam']);
      expect(slam.powerBp).toBe(15_000);
    });
  });

  describe('plain', () => {
    it('aim: a new pattern with the power raised by the share, the rest of the plain attack kept', () => {
      const ops: CardOp[] = [
        { op: 'plain', aim: { anchor: 'grudge', shape: 'single' }, raiseBp: 5_000 },
      ];
      const b = base({
        plain: { pattern: { anchor: 'front', shape: 'row' }, powerBp: 7_000, hits: 2 },
      });
      expect(applyCard(b, ops).plain).toEqual({
        pattern: { anchor: 'grudge', shape: 'single' },
        powerBp: 10_500,
        hits: 2,
      });
      expect(applyCard(b, ops, 5_000).plain.powerBp).toBe(8_750);
      // No strength: the aim still changes, the power stays.
      expect(applyCard(b, ops, 0).plain).toEqual({
        pattern: { anchor: 'grudge', shape: 'single' },
        powerBp: 7_000,
        hits: 2,
      });
    });
    it('replace: a new plain attack whose hits are rounded by the strength, at least 1', () => {
      const ops: CardOp[] = [
        {
          op: 'plain',
          replace: { pattern: { anchor: 'random', shape: 'single' }, powerBp: 4_500 },
          hits: 4,
        },
      ];
      const hitsAt = (st: number) => applyCard(base(), ops, st).plain.hits;
      expect(applyCard(base(), ops).plain).toEqual({
        pattern: { anchor: 'random', shape: 'single' },
        powerBp: 4_500,
        hits: 4,
      });
      expect(hitsAt(5_000)).toBe(2);
      expect(hitsAt(3_000)).toBe(1);
      // Rounds to nearest, half up: 4 x 0.625 = 2.5 is 3.
      expect(hitsAt(6_250)).toBe(3);
      expect(hitsAt(0)).toBe(1);
    });
  });

  it('runs the operations in order (Wither: Attack, then healing)', () => {
    const ops: CardOp[] = [
      { op: 'raise', stat: 'atk', bp: 2_000 },
      { op: 'mod', mod: 'healBp', base: 10_000, minus: 5_000 },
    ];
    const b = applyCard(base(), ops, 5_000);
    expect(b.atk).toBe(121);
    expect(b.mods.healBp).toBe(7_500);
    // Two operations on one stat compose.
    const twice = applyCard(base(), [
      { op: 'add', stat: 'armour', value: 10 },
      { op: 'add', stat: 'armour', value: 5 },
    ]);
    expect(twice.armour).toBe(35);
  });
});
