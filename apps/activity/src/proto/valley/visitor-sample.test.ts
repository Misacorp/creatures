import { describe, expect, it } from 'vitest';
import { initialWorld } from '../world';
import {
  SAMPLE_PURSE,
  canPay,
  rerollPiece,
  rerollPrice,
  shortOf,
  wornPieces,
} from './visitor-sample';

describe('the visitor reroll price', () => {
  it('is the lab base at item level 10 and linear in the level', () => {
    expect(rerollPrice(10, 0)).toEqual({ acorns: 60, scrap: 400 });
    expect(rerollPrice(15, 0)).toEqual({ acorns: 90, scrap: 600 });
    expect(rerollPrice(5, 0)).toEqual({ acorns: 30, scrap: 200 });
  });

  it('rises x1.5 with each reroll this week', () => {
    expect(rerollPrice(10, 1)).toEqual({ acorns: 90, scrap: 600 });
    expect(rerollPrice(10, 2)).toEqual({ acorns: 135, scrap: 900 });
    expect(rerollPrice(10, 3)).toEqual({ acorns: 203, scrap: 1350 });
  });

  it('says what the purse lacks', () => {
    expect(canPay(SAMPLE_PURSE, { acorns: 60, scrap: 400 })).toBe(true);
    expect(shortOf(SAMPLE_PURSE, { acorns: 60, scrap: 400 })).toBeNull();
    expect(shortOf({ acorns: 10, scrap: 10, shards: 0 }, { acorns: 60, scrap: 400 })).toBe(
      'Not enough Acorns and Scrap',
    );
  });
});

describe('the sample reroll', () => {
  const worn = wornPieces(initialWorld().items);

  it('only offers worn pieces', () => {
    expect(worn.length).toBeGreaterThan(0);
    expect(worn.every((p) => p.equippedOn !== null)).toBe(true);
  });

  it('rolls the same result every time and keeps rarity, level and wearer', () => {
    for (const piece of worn) {
      const a = rerollPiece(piece, 0);
      expect(rerollPiece(piece, 0)).toEqual(a);
      expect(a.rarity).toBe(piece.rarity);
      expect(a.itemLevel).toBe(piece.itemLevel);
      expect(a.equippedOn).toBe(piece.equippedOn);
      expect(a.id).toBe(piece.id);
      expect(a.baseId).toBe(piece.baseId);
    }
  });

  it('draws the lines again, never keeping the old roll, and a second reroll differs again', () => {
    const epic = worn.find((p) => p.rarity === 'epic');
    expect(epic).toBeDefined();
    const sig = (p: { lines: { id: string; text: string }[] }) =>
      p.lines.map((l) => `${l.id}:${l.text}`).join('|');
    const first = rerollPiece(epic!, 0);
    expect(sig(first)).not.toBe(sig(epic!));
    const second = rerollPiece(first, 1);
    expect(sig(second)).not.toBe(sig(first));
  });
});
