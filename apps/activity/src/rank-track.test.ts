import { MAX_EXPLORER_RANK, RULES, expeditionContent, rankGift } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { glyph } from './glyphs';
import { trackNodes } from './progress-track';
import { giftTags, rankIndex, rankSteps } from './rank-track';

const steps = rankSteps();
const unlocks = (rank: number): string[] =>
  (steps[rank - 1]?.unlocks ?? []).map((u) => `${u.icon}:${u.text}`);

describe('the explorer rank ladder', () => {
  it('has a step for every rank, from 1 to the top', () => {
    expect(steps).toHaveLength(MAX_EXPLORER_RANK);
    expect(steps.map((s) => s.label)).toEqual(
      Array.from({ length: MAX_EXPLORER_RANK }, (_, i) => `Rank ${String(i + 1)}`),
    );
  });

  it('lists what Misa named, from the content: places, goals and the 24 h trip', () => {
    const at = (rank: number) => unlocks(rank).filter((u) => u !== 'bait:Gift');
    expect(at(1)).toEqual([]);
    expect(at(2)).toEqual(['compass:Old Crossroads', 'fork:Goal: Scout ahead']);
    expect(at(3).sort()).toEqual([
      'fork:Goal: Open the lost cache',
      'fork:Goal: Take the shortcut',
    ]);
    expect(at(4)).toEqual([
      'moon:Moonlit Reef',
      'fork:Goal: Linger a while',
      'fork:Goal: Press deeper',
    ]);
    expect(at(RULES.expeditions.lengths.day.minRank)).toEqual(['clock:24 h trips']);
    expect(at(6)).toEqual(['fork:Goal: Break into the vault']);
    for (const rank of [7, 8, 9, 10]) expect(at(rank), `rank ${String(rank)}`).toEqual([]);
  });

  it('gives every rank from 2 something to unlock, a gift at least, and nothing at rank 1', () => {
    expect(unlocks(1)).toEqual([]);
    for (let rank = 2; rank <= MAX_EXPLORER_RANK; rank++) {
      expect(unlocks(rank).length, `rank ${String(rank)}`).toBeGreaterThan(0);
      expect(
        unlocks(rank).some((u) => u === 'bait:Gift'),
        `gift ${String(rank)}`,
      ).toBe(true);
    }
  });

  it('moves a place or goal on the track when the content moves it', () => {
    // Every place and goal with a rank above 1 is on the track at exactly that rank.
    for (const place of expeditionContent.destinations) {
      if (place.access.minRank < 2) continue;
      expect(unlocks(place.access.minRank).some((u) => u.endsWith(`:${place.name}`))).toBe(true);
    }
    for (const goal of expeditionContent.goals) {
      if (goal.minRank < 2) continue;
      expect(unlocks(goal.minRank)).toContain(`fork:Goal: ${goal.name}`);
    }
  });

  it('draws every unlock with a picture we have, and shows no chance or percentage', () => {
    for (const step of steps) {
      for (const unlock of step.unlocks) {
        expect(glyph(unlock.icon), unlock.icon).toBeDefined();
        expect(unlock.text, unlock.text).not.toMatch(/%|percent|chance/i);
      }
    }
  });

  it('shows only the previous, current and next rank around an explorer', () => {
    expect(trackNodes(steps, rankIndex(3)).map((n) => n.label)).toEqual([
      'Rank 2',
      'Rank 3',
      'Rank 4',
    ]);
    expect(trackNodes(steps, rankIndex(1)).map((n) => n.label)).toEqual(['Rank 1', 'Rank 2']);
    expect(trackNodes(steps, rankIndex(MAX_EXPLORER_RANK)).at(-1)?.role).toBe('max');
  });

  it('clamps the rank into the ladder', () => {
    expect(rankIndex(0)).toBe(0);
    expect(rankIndex(1)).toBe(0);
    expect(rankIndex(5)).toBe(4);
    expect(rankIndex(99)).toBe(MAX_EXPLORER_RANK - 1);
  });
});

describe('the gift as tags', () => {
  const view = (tags: ReturnType<typeof giftTags>) =>
    tags.map((t) => `${t.key}:${String(t.amount)}:${t.label ?? ''}:${t.name ?? ''}`);

  it('lists Bait, parts and supplies as tags, supplies with their name', () => {
    expect(
      view(giftTags({ bait: 30, parts: { scrap: 3, glimmer: 1 }, supplies: ['lure-good'] })),
    ).toEqual([
      'bait:30:Bait:',
      'scrap:3:Scrap:',
      'glimmer:1:Glimmer:',
      'supply-lure-good:1::Sweet Lure',
    ]);
    expect(view(giftTags({ bait: 0, parts: {}, supplies: ['lantern-basic'] }))).toEqual([
      'supply-lantern-basic:1::Candle Lantern',
    ]);
  });

  it('shows shards with the generic icon and the gear piece with a rarity hint, and no help buttons', () => {
    const tags = giftTags({
      bait: 25,
      parts: { scrap: 10 },
      supplies: [],
      shards: 3,
      gearOddsBp: { common: 8000, rare: 2000, epic: 0 },
    });
    expect(view(tags)).toEqual([
      'bait:25:Bait:',
      'scrap:10:Scrap:',
      'shards:3:Shards of its element:',
      'gear:1:Gear piece:Gear',
    ]);
    expect(tags.find((t) => t.key === 'shards')?.icon).toEqual({ kind: 'glyph', id: 'sparkle' });
    expect(tags.some((t) => t.entry !== undefined)).toBe(false);
    expect(
      giftTags({
        bait: 0,
        parts: {},
        supplies: [],
        shards: 0,
        gearOddsBp: { common: 0, rare: 10000, epic: 0 },
      }).map((t) => t.name),
    ).toEqual(['Rare gear']);
  });

  it('matches the gift the rules set for every rank', () => {
    for (let rank = 2; rank <= MAX_EXPLORER_RANK; rank++) {
      const gift = rankGift(rank);
      if (gift === null) throw new Error(`no gift at rank ${String(rank)}`);
      const unlock = steps[rank - 1]?.unlocks.find((u) => u.icon === 'bait');
      expect(unlock?.text).toBe('Gift');
      expect(unlock?.tags).toEqual(giftTags(gift));
    }
  });
});
