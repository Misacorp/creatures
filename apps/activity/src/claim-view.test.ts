import { describe, expect, it } from 'vitest';
import { parseClaimResponse } from './expedition-api';
import {
  failureLine,
  foundSupplies,
  giftLines,
  journalPages,
  nothingInLoot,
  pileLabel,
  pushOnLine,
  rankGiftViews,
  revealTone,
  slotLine,
  starsView,
  xpView,
} from './claim-view';
import claimFailed from './fixtures/expedition-claim-failed.json';
import claimLoot from './fixtures/expedition-claim-loot.json';
import claimRecall from './fixtures/expedition-claim-recall.json';
import claimWorked from './fixtures/expedition-claim-worked.json';
import { rewardPileItems } from './reward-pile';

const worked = parseClaimResponse(claimWorked).result;
const failed = parseClaimResponse(claimFailed).result;
const recalled = parseClaimResponse(claimRecall).result;
const loot = parseClaimResponse(claimLoot).result;

describe('how a claimed trip went', () => {
  it('is home, recalled or failed', () => {
    expect(revealTone(worked)).toBe('home');
    expect(revealTone(recalled)).toBe('recalled');
    expect(revealTone(failed)).toBe('failed');
  });

  it('says a failed risky goal failed, without the odds it had, and brings nothing', () => {
    expect(failureLine(failed)).toContain('Take the shortcut');
    expect(failureLine(failed)).not.toMatch(/%|chance/);
    expect(failureLine(failed)).toContain('Nothing came back');
    expect(failed.catches).toEqual([]);
    expect(nothingInLoot(failed)).toBe(true);
    expect(xpView(failed)).toBeNull();
    expect(pushOnLine(failed)).toBeNull();
    expect(failureLine(worked)).toBeNull();
  });

  it('says what a push-on that worked added', () => {
    expect(pushOnLine(worked)).toBe('Forage around added its reward.');
    expect(pushOnLine(loot)).toBeNull();
    expect(
      pushOnLine({
        pushOn: { goalId: 'shortcut', risk: 'risky', oddsBp: 6100, outcome: 'worked' },
      }),
    ).toBe('Take the shortcut paid off.');
    expect(
      pushOnLine({
        pushOn: { goalId: 'forage', risk: 'safe', oddsBp: 10000, outcome: 'declined' },
      }),
    ).toContain('cut short');
  });
});

describe('the gift of a new rank', () => {
  it('lists the gift of the rank a trip reached, from the server result', () => {
    const [view] = rankGiftViews(worked);
    expect(worked.rankGifts?.length).toBe(1);
    expect(view?.rank).toBe(worked.xp?.rank);
    expect(view?.title).toBe(`Rank ${String(worked.xp?.rank)} gift`);
    expect(view?.lines.map((l) => l.key)).toEqual(['bait', 'scrap']);
    expect(view?.lines.map((l) => l.text)).toEqual(['4 Bait', '2 Scrap']);
  });

  it('has no gift for a trip that did not raise the rank, a recall or a failure', () => {
    expect(rankGiftViews(recalled)).toEqual([]);
    expect(rankGiftViews(failed)).toEqual([]);
    expect(rankGiftViews({})).toEqual([]);
  });

  it('counts supplies of a kind and leaves out what is not in the gift', () => {
    const lines = giftLines({
      bait: 0,
      parts: { glimmer: 3 },
      supplies: ['lure-good', 'lure-good', 'satchel-good'],
    });
    expect(lines.map((l) => l.text)).toEqual(['3 Glimmer', '2 Sweet Lure', 'Sturdy Satchel']);
    expect(lines.find((l) => l.key === 'lure-good')?.icon).toEqual({ kind: 'supply', id: 'lure' });
  });
});

describe('what the trip brought home', () => {
  it('builds the pile from gear, parts and found supplies, one icon for each kind', () => {
    const found = loot.loot as NonNullable<typeof loot.loot>;
    const source = { gear: found.gear, parts: found.parts, supplies: found.supplies ?? [] };
    // The trip's ticks may bring several of each: the pile has one icon for each kind.
    expect(source.supplies).toContain('map-scrap-basic');
    expect(rewardPileItems(source).map((i) => i.key)).toEqual(
      expect.arrayContaining(['scrap', 'ember-shard', 'glimmer', 'supply-map-scrap']),
    );
    expect(pileLabel(source, 'Loot')).toMatch(/^Loot: Scrap, Ember Shard/);
    expect(pileLabel({ bait: 3, essence: 1, parts: { scrap: 1 } }, 'Rewards')).toBe(
      'Rewards: Scrap, Essence, Bait',
    );
  });

  it('is empty for a recall and for a trip without loot', () => {
    const none = { loot: { gear: [], converted: [], parts: {}, blueprints: [] } };
    expect(nothingInLoot({ ...recalled, ...none })).toBe(true);
    expect(nothingInLoot(loot)).toBe(false);
    // A recall pays the ticks of the hours spent, so it may bring parts.
    expect(nothingInLoot(recalled)).toBe(false);
  });

  it('counts the supplies found, by kind of supply', () => {
    const found = foundSupplies(loot);
    expect(found.find((s) => s.id === 'map-scrap-basic')).toMatchObject({ name: 'Map Scrap' });
    expect(found.reduce((n, s) => n + s.amount, 0)).toBe(loot.loot?.supplies?.length);
    const two = {
      loot: { ...(loot.loot as object), supplies: ['lure-basic', 'lure-basic', 'lantern-good'] },
    };
    expect(foundSupplies(two as typeof loot).map((s) => [s.id, s.amount])).toEqual([
      ['lure-basic', 2],
      ['lantern-good', 1],
    ]);
  });
});

describe('what the explorer earned', () => {
  it('shows the XP and a rank-up', () => {
    expect(xpView(loot)).toEqual({
      gained: 300,
      total: 300,
      rank: 2,
      rankBefore: 1,
      rankedUp: true,
    });
    expect(xpView(worked)).toMatchObject({ rankBefore: 3, rank: 4, rankedUp: true });
    expect(xpView({ xp: { gained: 4, total: 10, rank: 1, rankBefore: 1 } })?.rankedUp).toBe(false);
    expect(xpView(recalled)).toBeNull();
  });

  it('shows the familiarity stars and whether one was earned', () => {
    expect(starsView(loot)).toEqual({ stars: 0, starsBefore: 0, trips: 1, gained: false });
    expect(starsView({ familiarity: { stars: 2, starsBefore: 1, trips: 9 } })?.gained).toBe(true);
    expect(starsView(recalled)).toBeNull();
  });

  it('celebrates a new slot', () => {
    expect(slotLine(worked)).toBe('A new expedition slot opened! You have 2 now.');
    expect(slotLine(loot)).toBeNull();
  });

  it('shows the journal pages found, with their set', () => {
    const pages = journalPages(worked);
    // The scenario's trip is one tick and its push-on adds two (an hour each): a page for every tick.
    expect(pages).toHaveLength(3);
    expect(pages[0]).toMatchObject({ entryId: 'tide-first-pool', setComplete: false });
    expect(pages[0]?.title.length).toBeGreaterThan(2);
    expect(pages[0]?.text.length).toBeGreaterThan(20);
    expect(pages[0]?.setName).not.toBeNull();
    expect(journalPages(loot)).toEqual([]);
    expect(
      journalPages({ journal: [{ entryId: 'not-a-page', set: null, setComplete: false }] }),
    ).toEqual([]);
  });
});
