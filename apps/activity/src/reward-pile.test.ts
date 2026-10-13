import { expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { glyph } from './glyphs';
import clearedFixture from './fixtures/dungeon-run-cleared.json';
import landmarkFixture from './fixtures/dungeon-run-landmark.json';
import lostFixture from './fixtures/dungeon-run-lost.json';
import type { DungeonRunResponse } from './dungeon-types';
import { rewardPileItems } from './reward-pile';

const keys = (source: Parameters<typeof rewardPileItems>[0]): string[] =>
  rewardPileItems(source).map((i) => i.key);

describe('the reward pile', () => {
  it('has one icon for each kind earned: scrap, Essence and Bait for a plain clear', () => {
    expect(keys({ bait: 3, essence: 1, parts: { scrap: 1 } })).toEqual([
      'scrap',
      'essence',
      'bait',
    ]);
  });

  it('leaves out every kind that was not earned, and is empty when nothing was', () => {
    expect(keys({ bait: 1 })).toEqual(['bait']);
    expect(keys({ essence: 0, bait: 0, parts: { scrap: 0 }, gear: [] })).toEqual([]);
    expect(keys({})).toEqual([]);
  });

  it('is in a fixed order whatever order the source lists things in', () => {
    const a = keys({ bait: 2, essence: 2, parts: { glimmer: 1, 'ember-shard': 1, scrap: 4 } });
    expect(a).toEqual(['scrap', 'ember-shard', 'glimmer', 'essence', 'bait']);
    const b = keys({ parts: { scrap: 4, glimmer: 1, 'ember-shard': 1 }, essence: 2, bait: 2 });
    expect(b).toEqual(a);
  });

  it('puts gear first, once, however many items dropped, drawn from the first', () => {
    const items = rewardPileItems({
      gear: [{ baseId: 'keen-trinket' }, { baseId: 'trail-charm' }],
      bait: 1,
    });
    expect(items.map((i) => i.key)).toEqual(['gear', 'bait']);
    expect(items[0]?.icon).toEqual({ kind: 'gear', baseId: 'keen-trinket' });
  });

  it('shows a kind once, not once per amount', () => {
    expect(keys({ parts: { scrap: 40 }, bait: 99 })).toEqual(['scrap', 'bait']);
    const keysOut = keys({ parts: { scrap: 2, 'tide-shard': 1, 'grove-shard': 1 } });
    expect(new Set(keysOut).size).toBe(keysOut.length);
  });

  it('gives each item the icon of its kind', () => {
    const items = rewardPileItems({ bait: 1, essence: 1, parts: { scrap: 1 } });
    expect(items.map((i) => i.icon)).toEqual([
      { kind: 'part', part: 'scrap' },
      { kind: 'glyph', id: 'gem' },
      { kind: 'glyph', id: 'bait' },
    ]);
  });

  it('shows supplies as one icon for each kind of supply, after the parts and before Essence', () => {
    const items = rewardPileItems({
      parts: { scrap: 2 },
      supplies: ['lure-basic', 'lure-great', 'lantern-good'],
      essence: 1,
      bait: 1,
    });
    expect(items.map((i) => i.key)).toEqual([
      'scrap',
      'supply-lure',
      'supply-lantern',
      'essence',
      'bait',
    ]);
    expect(items.find((i) => i.key === 'supply-lure')?.icon).toEqual({ kind: 'glyph', id: 'lure' });
    expect(items.find((i) => i.key === 'supply-lantern')?.icon).toEqual({
      kind: 'glyph',
      id: 'lantern',
    });
  });

  it('has a glyph for every kind of supply, so every supply can be drawn in the pile', () => {
    for (const def of expeditionContent.supplies) {
      const [item] = rewardPileItems({ supplies: [def.id] });
      expect(item?.icon.kind, def.id).toBe('glyph');
      expect(glyph(def.kind), def.id).toBeDefined();
    }
  });

  it('ignores a supply the content does not know, and shows nothing for an empty list', () => {
    expect(keys({ supplies: ['no-such-supply'] })).toEqual([]);
    expect(keys({ supplies: [] })).toEqual([]);
  });

  it('reads the real runs: a clear is scrap, Essence and Bait; a lost first room is nothing', () => {
    const cleared = (clearedFixture as unknown as DungeonRunResponse).run.rewards;
    expect(keys(cleared)).toEqual(expect.arrayContaining(['scrap', 'essence', 'bait']));
    const landmark = (landmarkFixture as unknown as DungeonRunResponse).run.rewards;
    expect(keys(landmark)[0]).toBe('gear');
    const lost = (lostFixture as unknown as DungeonRunResponse).run.rewards;
    expect(keys(lost)).toEqual([]);
  });
});
