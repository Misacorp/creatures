import { describe, expect, it } from 'vitest';
import { parseGameState, type Creature } from './api';
import { autoSettledLines, noCatchLine } from './find-view';
import stateAfter from './fixtures/creatures-state-after.json';
import chooseFuse from './fixtures/creatures-choose-fuse.json';
import chooseRelease from './fixtures/creatures-choose-release.json';
import chooseTeach from './fixtures/creatures-choose-teach.json';
import { bookActions, bookRows, choiceResultText, slotTitle, talentTextParts } from './talent-view';

const after = parseGameState(stateAfter);
describe('what Recommended says and what happened', () => {
  it('tells each result in a sentence', () => {
    const creatures = after.creatures;
    expect(choiceResultText(chooseTeach.result as never, creatures)).toBe(
      'Taught Bigger Splash (golden) to Splashet: it is in the Talent Book.',
    );
    expect(choiceResultText(chooseFuse.result as never, creatures)).toBe(
      'Fused Splashet into Splashet: fusion 1 / 5.',
    );
    expect(choiceResultText(chooseRelease.result as never, creatures)).toBe(
      'Released Splashet for 3 Scrap.',
    );
    expect(
      choiceResultText({ ...(chooseFuse.result as object), auto: true } as never, creatures),
    ).toMatch(/^Recommended: Fused/);
    expect(
      choiceResultText(
        {
          choice: 'keep',
          auto: false,
          pendingId: 'p',
          species: 'splashet',
          talent: { talentId: 'x', golden: false },
        },
        creatures,
      ),
    ).toBe('Kept Splashet as a second creature.');
  });
});

describe('the talents on a creature card', () => {
  const card = after.creatures.find((c) => c.species === 'splashet') as Creature;

  it('names a slot, and says when a closed one opens', () => {
    expect(card.talents.slots.map(slotTitle)).toEqual(['Slot 1', 'Slot 2 opens at level 20']);
  });

  it('offers each book talent that is not in a slot for each open slot, and none for the one slotted', () => {
    const actions = bookActions(card);
    const bigger = card.talents.book.findIndex((t) => t.id === 'bigger-splash');
    const slotted = card.talents.book.findIndex((t) => t.slot === 1);
    expect(actions.filter((a) => a.entry === bigger)).toEqual([{ entry: bigger, slot: 1 }]);
    expect(actions.some((a) => a.entry === slotted)).toBe(false);
    // Slot 2 is closed: nothing goes there.
    expect(actions.some((a) => a.slot === 2)).toBe(false);
  });
});

describe('the lines of a claim', () => {
  const none = { catches: [], noCatch: 0 };
  it('says nothing when every roll brought a creature', () => {
    expect(noCatchLine(none)).toBeNull();
    expect(noCatchLine({ catches: [] })).toBeNull();
  });

  it('says it plainly when no creature came, and counts the empty rolls when some did', () => {
    expect(noCatchLine({ catches: [], noCatch: 1 })).toBe(
      'No creature came this time, only a small find.',
    );
    expect(noCatchLine({ catches: [], noCatch: 3 })).toBe(
      'No creature came this time, only small finds.',
    );
    const one = [
      { species: 'splashet', shiny: false, outcome: 'new', firstOnServer: false },
    ] as const;
    expect(noCatchLine({ catches: [...one], noCatch: 1 })).toBe('1 roll found no creature.');
    expect(noCatchLine({ catches: [...one], noCatch: 2 })).toBe('2 rolls found no creature.');
  });

  it('tells what the server settled for the player, one sentence for each', () => {
    expect(autoSettledLines(undefined, [])).toEqual([]);
    const lines = autoSettledLines([chooseRelease.result as never], after.creatures);
    expect(lines).toEqual([
      'An older waiting catch was settled for you. Released Splashet for 3 Scrap.',
    ]);
  });
});

describe('the number in a talent phrase', () => {
  it('cuts around a percentage, a flat value and a points value', () => {
    expect(talentTextParts('First pounce +14%')).toEqual({
      before: 'First pounce ',
      value: '+14%',
      after: '',
    });
    expect(talentTextParts('Crit chance +3 pt')).toEqual({
      before: 'Crit chance ',
      value: '+3 pt',
      after: '',
    });
    expect(talentTextParts('Haste −4.5%')).toEqual({ before: 'Haste ', value: '−4.5%', after: '' });
  });

  it('handles the local form, where the number comes first', () => {
    expect(talentTextParts('+60% Attack (this item)')).toEqual({
      before: '',
      value: '+60%',
      after: ' Attack (this item)',
    });
  });

  it('leaves a phrase without a number whole', () => {
    expect(talentTextParts('Unbothered')).toEqual({ before: 'Unbothered', value: null, after: '' });
  });

  it('always joins back to the server text', () => {
    for (const t of ['First pounce +14%', '+60% Attack (this item)', 'Unbothered']) {
      const p = talentTextParts(t);
      expect(`${p.before}${p.value ?? ''}${p.after}`).toBe(t);
    }
  });
});

describe('the Talent Book rows', () => {
  const card = after.creatures.find((c) => c.species === 'splashet') as Creature;

  it('puts what is in use first, then what is available', () => {
    const reversed = {
      ...card,
      talents: { ...card.talents, book: [...card.talents.book].reverse() },
    };
    expect(bookRows(reversed).map((r) => [r.entry.id, r.state, r.slot, r.moves])).toEqual([
      ['splashes-first', 'in-use', 1, []],
      ['wet-footprints', 'available', null, [1]],
      ['bigger-splash', 'available', null, [1]],
    ]);
  });

  it('offers a slotted talent the other open slots, and marks one with no open slot as blocked', () => {
    const open = (n: number) => ({ slot: n, opensAt: 1, open: true, talent: null });
    const two = {
      ...card,
      talents: { ...card.talents, slots: [{ ...card.talents.slots[0]!, open: true }, open(2)] },
    };
    const used = bookRows(two).find((r) => r.state === 'in-use');
    expect(used?.moves).toEqual([2]);
    const shut = {
      ...card,
      talents: { ...card.talents, slots: card.talents.slots.map((s) => ({ ...s, open: false })) },
    };
    expect(bookRows(shut).find((r) => r.entry.id === 'bigger-splash')?.state).toBe('blocked');
  });
});
