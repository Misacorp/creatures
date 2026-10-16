import { describe, expect, it } from 'vitest';
import { parseGameState, type Creature } from './api';
import { autoSettledLines, noCatchLine } from './CatchList';
import stateAfter from './fixtures/creatures-state-after.json';
import state from './fixtures/creatures-state.json';
import chooseFuse from './fixtures/creatures-choose-fuse.json';
import chooseRelease from './fixtures/creatures-choose-release.json';
import chooseTeach from './fixtures/creatures-choose-teach.json';
import type { PendingCatch } from './talent-types';
import {
  CHOICE_LABEL,
  CHOICE_ORDER,
  applyAllText,
  bookActions,
  cardsFor,
  choiceHint,
  choiceResultText,
  fuseTargets,
  isOffered,
  recommendedText,
  slotTitle,
  talentLine,
  teachTargets,
} from './talent-view';

const waiting = parseGameState(state);
const after = parseGameState(stateAfter);
const [first, second, third, fourth] = waiting.pending as [
  PendingCatch,
  PendingCatch,
  PendingCatch,
  PendingCatch,
];
const splashet = waiting.creatures.find((c) => c.species === 'splashet') as Creature;

describe('the four choices of a duplicate', () => {
  it('are always in the order Teach, Fuse, Release, Keep, with plain labels', () => {
    expect(CHOICE_ORDER).toEqual(['teach', 'fuse', 'release', 'keep']);
    expect(CHOICE_ORDER.map((c) => CHOICE_LABEL[c])).toEqual(['Teach', 'Fuse', 'Release', 'Keep']);
  });

  it('says what Release pays, in parts and never Bait', () => {
    expect(choiceHint('release', first)).toContain('3 Scrap');
    for (const choice of CHOICE_ORDER) {
      expect(choiceHint(choice, first)).not.toMatch(/Bait/);
    }
  });

  it('offers what the server offers: Keep is not offered, the rest are', () => {
    expect(isOffered('teach', first)).toBe(true);
    expect(isOffered('fuse', first)).toBe(true);
    expect(isOffered('release', first)).toBe(true);
    expect(isOffered('keep', first)).toBe(false);
    expect(isOffered('teach', { ...first, offered: { ...first.offered, teach: [] } })).toBe(false);
    expect(isOffered('keep', { ...first, offered: { ...first.offered, keep: true } })).toBe(true);
  });
});

describe('where a talent or a fusion can go', () => {
  it('lists each offered creature with its open slots and what sits in them', () => {
    const targets = teachTargets(first, waiting.creatures);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.creature.id).toBe(splashet.id);
    // A common creature of level 8 has one open slot, holding its first talent.
    expect(targets[0]?.slots).toHaveLength(1);
    expect(targets[0]?.slots[0]?.slot).toBe(1);
    expect(targets[0]?.slots[0]?.current?.id).toBe('splashes-first');
    // The server recommends Teach into that slot for this card.
    expect(targets[0]?.slots[0]?.recommended).toBe(true);
  });

  it('leaves a creature out that is not in the list, and one with no open slot', () => {
    const none = { ...first, offered: { ...first.offered, teach: ['no-such-creature'] } };
    expect(teachTargets(none, waiting.creatures)).toEqual([]);
    const closed: Creature = {
      ...splashet,
      talents: {
        ...splashet.talents,
        slots: splashet.talents.slots.map((s) => ({ ...s, open: false })),
      },
    };
    expect(teachTargets(first, [closed])).toEqual([]);
  });

  it('lists the fusion targets with the count after the fusion', () => {
    const targets = fuseTargets(fourth, waiting.creatures);
    expect(targets.map((t) => [t.creature.id, t.after])).toEqual([[splashet.id, 1]]);
    expect(targets[0]?.recommended).toBe(fourth.recommended.choice === 'fuse');
    expect(fuseTargets({ ...fourth, offered: { ...fourth.offered, fuse: [] } }, [])).toEqual([]);
  });
});

describe('what Recommended says and what happened', () => {
  it('describes the recommended choice with the creature and slot', () => {
    expect(recommendedText(first, waiting.creatures)).toBe('Teach it to Splashet (slot 1)');
    expect(recommendedText(fourth, waiting.creatures)).toBe('Fuse it into Splashet');
    expect(recommendedText({ ...third, recommended: { choice: 'release' } }, [])).toBe(
      'Release it for 3 Scrap',
    );
    expect(recommendedText({ ...third, recommended: { choice: 'keep' } }, [])).toContain('Keep');
  });

  it('tells each result in a sentence', () => {
    const creatures = after.creatures;
    expect(choiceResultText(chooseTeach.result as never, creatures)).toBe(
      'Taught Bigger Splash (golden) to Splashet, slot 1.',
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

  it('puts the words of the apply-to-all button right for one and many', () => {
    expect(applyAllText(1)).toBe('Apply Recommended');
    expect(applyAllText(3)).toBe('Apply Recommended to all 3');
  });

  it('picks the cards of one claim out of the waiting ones, oldest first', () => {
    expect(cardsFor(waiting).map((c) => c.id)).toEqual(waiting.pending.map((c) => c.id));
    expect(cardsFor(waiting, [second.id]).map((c) => c.id)).toEqual([second.id]);
    expect(cardsFor(waiting, [])).toEqual([]);
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

  it('reads a talent in a line of text, with Golden said in words', () => {
    const plain = card.talents.book.find((t) => !t.golden);
    const golden = card.talents.book.find((t) => t.golden);
    expect(talentLine(plain as never)).toMatch(/^Splashes First: First pounce \+14%$/);
    expect(talentLine(golden as never)).toBe('Bigger Splash: Marking hit +19% (golden)');
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
