import { expeditionContent, goalDef } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import stateOffer from './fixtures/expedition-state-offer.json';
import { goalCards, rewardLines } from './push-on-view';

const offer = parseGameState(stateOffer).expeditions[0]?.offer;
if (offer === null || offer === undefined) throw new Error('the fixture has no offer');

describe('the push-on cards', () => {
  const cards = goalCards(offer.goals);

  it('has one card per offered goal, in the server order, with the exact odds and hours', () => {
    expect(cards.map((c) => c.id)).toEqual(['forage', 'shortcut']);
    const safe = cards[0];
    const risky = cards[1];
    expect(safe).toMatchObject({
      risk: 'safe',
      odds: '100%',
      oddsBp: 10000,
      extra: '+2 h',
      failure: null,
    });
    expect(risky).toMatchObject({ risk: 'risky', odds: '61%', oddsBp: 6100, extra: '+2 h' });
  });

  it('flags the risky one with what failing costs, and the safe one with nothing', () => {
    expect(cards[1]?.failure).toBe('39% chance the whole trip fails and brings nothing back.');
    expect(cards[0]?.failure).toBeNull();
  });

  it('names what each goal can bring, from the content', () => {
    expect(cards[0]?.rewards.map((r) => r.text)).toEqual([
      `${String(goalDef('forage')?.reward.parts?.scrap)} Scrap`,
    ]);
    for (const card of cards) {
      expect(card.rewards.length, card.id).toBeGreaterThan(0);
      expect(card.name.length).toBeGreaterThan(2);
      expect(card.flavor.length).toBeGreaterThan(10);
    }
  });

  it('shows the odds the server sent, not the content table: a later retune cannot disagree', () => {
    const retuned = goalCards([{ id: 'shortcut', risk: 'risky', extraHours: 3, oddsBp: 4550 }]);
    expect(retuned[0]).toMatchObject({ odds: '45.5%', extra: '+3 h' });
    expect(retuned[0]?.failure).toContain('54.5%');
  });

  it('leaves out a goal the content does not know', () => {
    expect(goalCards([{ id: 'no-such-goal', risk: 'safe', extraHours: 1, oddsBp: 10000 }])).toEqual(
      [],
    );
  });
});

describe('what a goal can bring', () => {
  it('has a line with a picture for every kind of reward of every goal', () => {
    for (const goal of expeditionContent.goals) {
      const lines = rewardLines(goal.reward);
      expect(lines.length, goal.id).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.text.length, `${goal.id} ${line.key}`).toBeGreaterThan(3);
        expect(line.icon.kind).toMatch(/^(glyph|part)$/);
      }
      // One line for each thing the reward names (parts give one per kind).
      const kinds = Object.keys(goal.reward).filter((k) => k !== 'parts').length;
      const parts = Object.values(goal.reward.parts ?? {}).filter((n) => (n ?? 0) > 0).length;
      expect(lines, goal.id).toHaveLength(kinds + parts);
    }
  });

  it('writes each reward in words', () => {
    expect(rewardLines({ catchRolls: 1 })[0]?.text).toBe('1 more catch roll');
    expect(rewardLines({ catchRolls: 2 })[0]?.text).toBe('2 more catch rolls');
    expect(rewardLines({ gear: 'rare' })[0]?.text).toBe('A rare gear piece');
    expect(rewardLines({ blueprint: true })[0]?.text).toBe('A blueprint');
    expect(rewardLines({ journal: true, xpBp: 5000 }).map((l) => l.text)).toEqual([
      'A journal page',
      '50% more explorer XP',
    ]);
    expect(rewardLines({ supply: true })[0]?.text).toBe('A supply');
    expect(rewardLines({ parts: { 'ember-shard': 2, scrap: 1 } }).map((l) => l.text)).toEqual([
      '1 Scrap',
      '2 Ember Shard',
    ]);
  });
});
