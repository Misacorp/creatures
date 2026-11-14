import { describe, expect, it } from 'vitest';
import {
  HOUSING_RULES,
  applyPayment,
  partPaidLines,
  partRemaining,
  piecePrice,
  skinPrice,
  type Holdings,
  type PaidLines,
  type PriceLine,
} from '../src/index';
import { clone, housingFixture } from './housing-fixture';

const content = housingFixture();
const cottage = content.parts.find((p) => p.id === 'cottage');
if (cottage === undefined) throw new Error('fixture has no cottage');

const rich: Holdings = {
  bait: 1000,
  scrap: 1000,
  shards: { mire: 100 },
  materials: { oak: 50, opal: 50 },
};

describe('piecePrice', () => {
  it('prices by form size and the set materials', () => {
    // reef-bed: a large form of a tier 1 set (primary: oak, accent: any stone).
    expect(piecePrice(content, 'reef-bed')).toEqual([
      { kind: 'bait', amount: HOUSING_RULES.price.large.bait },
      { kind: 'scrap', amount: HOUSING_RULES.price.large.scrap },
      { kind: 'material', id: 'oak', amount: 3 },
      { kind: 'family', family: 'stone', amount: 1 },
    ]);
    expect(piecePrice(content, 'reef-stool')).toEqual([
      { kind: 'bait', amount: 15 },
      { kind: 'scrap', amount: 40 },
      { kind: 'material', id: 'oak', amount: 1 },
      { kind: 'family', family: 'stone', amount: 1 },
    ]);
  });

  it('scales tier 2 by one and a half, with one more accent', () => {
    const tier2 = clone(content);
    const set = tier2.sets[0];
    if (set === undefined) throw new Error('no set');
    set.tier = 2;
    expect(piecePrice(tier2, 'reef-bed')).toEqual([
      { kind: 'bait', amount: 45 },
      { kind: 'scrap', amount: 180 },
      { kind: 'material', id: 'oak', amount: 3 },
      { kind: 'family', family: 'stone', amount: 2 },
    ]);
  });

  it('takes Acorns and scrap only for a wild piece, and honours an override', () => {
    expect(piecePrice(content, 'hammock')).toEqual([
      { kind: 'bait', amount: 30 },
      { kind: 'scrap', amount: 120 },
    ]);
    const priced = clone(content);
    const piece = priced.pieces.find((p) => p.id === 'hammock');
    if (piece === undefined) throw new Error('no piece');
    piece.price = [{ kind: 'bait', amount: 7 }];
    expect(piecePrice(priced, 'hammock')).toEqual([{ kind: 'bait', amount: 7 }]);
  });

  it('merges a primary and an accent that are the same line', () => {
    const same = clone(content);
    const set = same.sets[0];
    if (set === undefined) throw new Error('no set');
    set.accent = { material: 'oak' };
    expect(piecePrice(same, 'reef-stool')).toContainEqual({
      kind: 'material',
      id: 'oak',
      amount: 2,
    });
  });

  it('throws on an unknown piece', () => {
    expect(() => piecePrice(content, 'nope')).toThrow(/unknown piece/);
  });
});

describe('skinPrice', () => {
  it('prices wallpapers by the set and roofs by the teaching part', () => {
    expect(skinPrice(content, 'reef-wall')).toEqual([
      { kind: 'bait', amount: 20 },
      { kind: 'scrap', amount: 60 },
      { kind: 'material', id: 'oak', amount: 2 },
    ]);
    // slate is taught by the cottage, whose first material line is 2 opal.
    expect(skinPrice(content, 'slate')).toEqual([
      { kind: 'bait', amount: 60 },
      { kind: 'scrap', amount: 300 },
      { kind: 'material', id: 'opal', amount: 6 },
    ]);
    expect(skinPrice(content, 'plain-wall')).toEqual([
      { kind: 'bait', amount: 20 },
      { kind: 'scrap', amount: 60 },
    ]);
    expect(skinPrice(content, 'lawn')).toEqual([]);
  });
});

describe('partRemaining and applyPayment', () => {
  const price = cottage.price;

  it('starts owing the whole price and shows nothing paid', () => {
    expect(partRemaining(cottage, {})).toEqual(price);
    expect(partPaidLines(cottage, {})).toEqual([]);
  });

  it('never takes more than owed', () => {
    const r = applyPayment(cottage, {}, { bait: 999, scrap: 5 }, rich, content);
    expect(r.take.bait).toBe(10);
    expect(r.take.scrap).toBe(5);
    expect(r.complete).toBe(false);
    expect(partRemaining(cottage, r.paid)).toContainEqual({ kind: 'scrap', amount: 15 });
    expect(partRemaining(cottage, r.paid).some((l) => l.kind === 'bait')).toBe(false);
  });

  it('never takes more than held', () => {
    const poor: Holdings = { bait: 3, scrap: 0, shards: {}, materials: { oak: 1 } };
    const r = applyPayment(
      cottage,
      {},
      { bait: 10, scrap: 20, shards: { mire: 4 }, materials: { oak: 3, opal: 2 } },
      poor,
      content,
    );
    expect(r.take).toEqual({ bait: 3, scrap: 0, shards: {}, materials: { oak: 1 } });
  });

  it('pays a family line with the named materials, a specific line with its own first', () => {
    const r = applyPayment(cottage, {}, { materials: { oak: 2, opal: 3 } }, rich, content);
    // opal pays the "material opal" line first (2 of 2); the third opal is stone, not wood, so it is not taken.
    expect(r.take.materials).toEqual({ opal: 2, oak: 2 });
    expect(r.paid['family:wood']).toEqual({ oak: 2 });
    expect(r.paid['material:opal']).toBe(2);
    expect(partRemaining(cottage, r.paid).find((l) => l.kind === 'family')).toEqual({
      kind: 'family',
      family: 'wood',
      amount: 1,
    });
  });

  it('completes exactly at zero over several payments, and then takes nothing', () => {
    let paid: PaidLines = {};
    const offer = { bait: 6, scrap: 12, shards: { mire: 2 }, materials: { oak: 2, opal: 1 } };
    let results = applyPayment(cottage, paid, offer, rich, content);
    expect(results.complete).toBe(false);
    paid = results.paid;
    results = applyPayment(cottage, paid, offer, rich, content);
    // Bait 6 + 4, scrap 12 + 8, mire 2 + 2, opal 1 + 1, oak 2 + 1: done at the second payment, to the unit.
    expect(results.take).toEqual({
      bait: 4,
      scrap: 8,
      shards: { mire: 2 },
      materials: { opal: 1, oak: 1 },
    });
    expect(results.complete).toBe(true);
    expect(partRemaining(cottage, results.paid)).toEqual([]);
    const total = (key: 'bait' | 'scrap') => results.paid[key];
    expect(total('bait')).toBe(10);
    expect(total('scrap')).toBe(20);
    const again = applyPayment(cottage, results.paid, offer, rich, content);
    expect(again.take).toEqual({ bait: 0, scrap: 0, shards: {}, materials: {} });
    expect(again.complete).toBe(true);
  });

  it('does not mutate its inputs and treats a free part as complete', () => {
    const paid: PaidLines = { 'family:wood': { oak: 1 } };
    const copy = clone(paid);
    applyPayment(cottage, paid, { materials: { oak: 1 } }, rich, content);
    expect(paid).toEqual(copy);
    const hut = content.parts[0];
    if (hut === undefined) throw new Error('no hut');
    expect(applyPayment(hut, {}, {}, rich, content).complete).toBe(true);
  });

  it('ignores negative, fractional and unlisted offers', () => {
    const r = applyPayment(
      cottage,
      {},
      { bait: -5, scrap: 1.5, materials: { gold: 4 } },
      rich,
      content,
    );
    expect(r.take).toEqual({ bait: 0, scrap: 0, shards: {}, materials: {} });
  });

  it('reports paid lines for the view', () => {
    const r = applyPayment(cottage, {}, { bait: 4, materials: { oak: 2 } }, rich, content);
    const lines: PriceLine[] = partPaidLines(cottage, r.paid);
    expect(lines).toEqual([
      { kind: 'bait', amount: 4 },
      { kind: 'family', family: 'wood', amount: 2 },
    ]);
  });
});
