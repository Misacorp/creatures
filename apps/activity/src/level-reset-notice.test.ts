import { describe, expect, it } from 'vitest';
import { parseGameState, type LevelResetNotice } from './api';
import stateOffer from './fixtures/expedition-state-offer.json';
import { levelResetLines } from './level-reset-notice';

const notice = (over: Partial<LevelResetNotice> = {}): LevelResetNotice => ({
  creatures: 3,
  bait: 825,
  unequipped: 0,
  talentsToBook: 0,
  ...over,
});

describe('the level reset card', () => {
  it('says what happened in one warm sentence, with the Bait', () => {
    expect(levelResetLines(notice())).toEqual([
      "Creatures now grow by doing things. Every creature's level was halved and you got back the Bait those levels cost: 825 Bait.",
    ]);
  });

  it('adds a line for worn items and talents only when there were some', () => {
    expect(levelResetLines(notice({ unequipped: 1, talentsToBook: 1 })).slice(1)).toEqual([
      'One worn item went back to your bag, because its creature is below its level now.',
      'One talent rests in its Talent Book until its slot opens again.',
    ]);
    expect(levelResetLines(notice({ unequipped: 4, talentsToBook: 2 })).slice(1)).toEqual([
      '4 worn items went back to your bag, because their creatures are below their levels now.',
      '2 talents rest in their Talent Books until their slots open again.',
    ]);
  });
});

describe('the level reset in the state', () => {
  it('is null when the server sends nothing or null, and the notice when it sends one', () => {
    expect(parseGameState(stateOffer).levelReset).toBeNull();
    expect(parseGameState({ ...stateOffer, levelReset: null }).levelReset).toBeNull();
    expect(parseGameState({ ...stateOffer, levelReset: notice() }).levelReset).toEqual(notice());
  });

  it('rejects a damaged notice', () => {
    expect(() => parseGameState({ ...stateOffer, levelReset: { bait: 1 } })).toThrow();
    expect(() => parseGameState({ ...stateOffer, levelReset: notice({ bait: 1.5 }) })).toThrow();
  });
});
