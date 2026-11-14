import { describe, expect, it } from 'vitest';
import { VALLEY_RULES, rerollOdds, gearBase } from '@creatures/game';
import { sayParts } from '../resource-count';
import { homeInput } from '../workbench/home-sample';
import { placeStates } from './place-state';
import { SAMPLE_AWAY, SAMPLE_GEAR, sampleVisitor } from './visitor-sample';
import {
  AWAY_LINE,
  GONE_LINE,
  WAITING_LINE,
  blueprintCost,
  blueprintNote,
  blueprintShort,
  isHere,
  oddsLines,
  pieces,
  rerollCost,
  rerollPrice,
  rerollShort,
  shardsHeld,
  tierText,
  visitorLine,
} from './visitor-view';

const items = SAMPLE_GEAR.items;
const keys = (list: readonly { key: string; amount?: number | string | undefined }[]) =>
  list.map((c) => [c.key, c.amount]);

describe('where he stands', () => {
  it('is here only when the server says so', () => {
    expect(isHere(sampleVisitor())).toBe(true);
    expect(isHere(SAMPLE_AWAY)).toBe(false);
    expect(isHere(null)).toBe(false);
    expect(isHere(undefined)).toBe(false);
  });

  it('says back Thursday when he is away, never a timer or "until Saturday"', () => {
    expect(AWAY_LINE).toBe('The stall is shuttered. Back Thursday.');
    expect(AWAY_LINE).not.toMatch(/Saturday|\d/);
    expect(visitorLine(SAMPLE_AWAY)).toBe('back Thursday');
    expect(visitorLine(sampleVisitor())).toBe('the stall is open');
    expect(visitorLine(null)).toBeNull();
    expect(WAITING_LINE).toMatch(/once a week/);
  });

  it('gives his place a line in the Places list once the server has said, else it stays not open yet', () => {
    const input = homeInput('busy', true);
    expect(placeStates(input).visitor).toBe('not open yet');
    expect(placeStates({ ...input, visitor: null }).visitor).toBe('not open yet');
    expect(placeStates({ ...input, visitor: SAMPLE_AWAY }).visitor).toBe('back Thursday');
    expect(placeStates({ ...input, visitor: sampleVisitor() }).visitor).toBe('the stall is open');
  });
});

describe('prices are icons and numbers', () => {
  it('a reroll costs Acorns (the bait icon) and scrap, free when both are nothing', () => {
    expect(keys(rerollCost({ acorns: 60, scrap: 400 }))).toEqual([
      ['bait', 60],
      ['scrap', 400],
    ]);
    expect(rerollPrice({ acorns: 0, scrap: 0 })).toEqual({ text: 'free', items: [] });
  });

  it('the blueprint costs Acorns and shards of any kind', () => {
    const view = sampleVisitor();
    expect(keys(blueprintCost(view.blueprint))).toEqual([
      ['bait', VALLEY_RULES.visitor.blueprintAcorns],
      ['shards:any', VALLEY_RULES.visitor.blueprintShards],
    ]);
  });

  it('what is short is the shared have-and-cost pair, null when it can be paid', () => {
    const price = { acorns: 60, scrap: 400 };
    expect(rerollShort(price, { acorns: 60, scrap: 400, shards: 0 })).toBeNull();
    const short = rerollShort(price, { acorns: 10, scrap: 400, shards: 0 });
    expect(keys(short?.have ?? [])).toEqual([
      ['bait', 10],
      ['scrap', 400],
    ]);
    expect(keys(short?.cost ?? [])).toEqual([
      ['bait', 60],
      ['scrap', 400],
    ]);
    const blueprint = sampleVisitor().blueprint;
    expect(blueprintShort(blueprint, { acorns: 999, scrap: 0, shards: 999 })).toBeNull();
    expect(
      keys(blueprintShort(blueprint, { acorns: 999, scrap: 0, shards: 1 })?.have ?? []),
    ).toEqual([
      ['bait', 999],
      ['shards:any', 1],
    ]);
    // Said as a sentence there are still no resource names.
    expect(
      sayParts([...(blueprintShort(blueprint, { acorns: 0, scrap: 0, shards: 0 })?.cost ?? [])]),
    ).toHaveLength(2);
  });

  it('shards held are every element together', () => {
    expect(shardsHeld(null)).toBe(0);
    expect(shardsHeld({ scrap: 99, 'tide-shard': 2, 'ember-shard': 4, glimmer: 7 })).toBe(6);
    expect(shardsHeld(SAMPLE_GEAR.parts)).toBe(10);
  });
});

describe('the odds in words', () => {
  const hat = items.find((i) => i.baseId === 'emberkeepers-crown');
  if (hat === undefined) throw new Error('fixture');
  const base = gearBase(hat.baseId);
  if (base === undefined) throw new Error('fixture');

  it('says how many lines are drawn again and the chance of the best tier the piece can reach', () => {
    const odds = rerollOdds(base, hat.rarity, hat.itemLevel);
    const lines = oddsLines({ ...odds, tiers: odds.tiers.map((t) => ({ ...t })) });
    expect(lines[0]).toBe(`All ${String(odds.lines)} of its lines are drawn again.`);
    expect(lines[1]).toBe(
      `Each tiered line has a ${String(Math.round(odds.topChance * 100))}% chance of ${tierText(odds.topTier)}, the best this piece can reach.`,
    );
  });

  it('a piece that can only reach the first tier says so, and one line reads in the singular', () => {
    const lines = oddsLines({
      lines: 1,
      topTier: 0,
      tiers: [{ tier: 0, chance: 1 }],
      topChance: 1,
      singleShare: 0,
    });
    expect(lines).toEqual([
      'Its one line is drawn again.',
      'This piece can only reach Tier 1 / 5, so every tiered line lands there.',
    ]);
  });

  it('mentions single lines (no tier) only when some can be drawn', () => {
    const lines = oddsLines({ lines: 2, topTier: 2, tiers: [], topChance: 0.4, singleShare: 0.25 });
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('About 25% of what can be drawn is a single line, with no tier.');
  });

  it('numbers the tier as the card does: the roller`s 0 is Tier 1 / 5', () => {
    expect(tierText(0)).toBe('Tier 1 / 5');
    expect(tierText(4)).toBe('Tier 5 / 5');
  });

  it('says plainly that the old lines are gone', () => {
    expect(GONE_LINE).toMatch(/old lines are gone/);
    expect(GONE_LINE).toMatch(/no keeping the old version/);
  });
});

describe('the pieces he can be handed', () => {
  it('lists worn pieces first, then the bag by item level, the higher first, in a steady order', () => {
    const list = pieces(items);
    expect(list).toHaveLength(items.length);
    const worn = items.filter((i) => i.equippedOn !== null).length;
    expect(list.slice(0, worn).every((i) => i.equippedOn !== null)).toBe(true);
    expect(list.slice(worn).every((i) => i.equippedOn === null)).toBe(true);
    const bag = list.slice(worn).map((i) => i.itemLevel);
    expect(bag).toEqual([...bag].sort((a, b) => b - a));
    // The same input in another order gives the same list.
    expect(pieces([...items].reverse()).map((i) => i.id)).toEqual(list.map((i) => i.id));
  });
});

describe('the blueprint card`s note', () => {
  it('a copy adds a mark; a new one says it is new', () => {
    expect(blueprintNote(true)).toMatch(/a copy adds a mark of quality/);
    expect(blueprintNote(false)).toMatch(/A new one for you/);
  });
});
