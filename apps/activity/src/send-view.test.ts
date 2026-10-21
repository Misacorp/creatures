import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState, type Creature } from './api';
import { destinationCards } from './destination-view';
import { parseDestinations } from './expedition-parse';
import destinationsFixture from './fixtures/expedition-destinations.json';
import stateOffer from './fixtures/expedition-state-offer.json';
import {
  clampLength,
  defaultExplorer,
  explorerInfo,
  explorerOptions,
  sendBlocker,
  slotsFullReason,
  stepBlocker,
  starsAt,
  tripsAt,
  tripsHereText,
} from './send-view';

const view = parseDestinations(destinationsFixture);
// The explorer of the fixture's running trip is at home here, so everybody can go.
const creatures = parseGameState(stateOffer)
  .creatures.filter((c) => c.species !== 'sproutle')
  .map((c) => ({ ...c, away: false, busy: null }));
const cindle = creatures.find((c) => c.species === 'cindle') as Creature;
const splashet = creatures.find((c) => c.species === 'splashet') as Creature;
const TZ = 'Europe/Helsinki';

const open = { total: 2, used: 0, rankSum: 2, tripsFinished: 3, next: null };
const place = (id: string) => {
  const found = destinationCards(view, cindle, TZ).find((c) => c.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};

describe('who can go', () => {
  it('lists the creatures that can go first, the higher explorer rank first', () => {
    const options = explorerOptions(creatures, place('tidepools'), view);
    expect(options.map((o) => o.creature.id)).toEqual([cindle.id, splashet.id]);
    expect(options[0]).toMatchObject({ rank: cindle.explorer.rank, blocked: null });
    const xp = options[0]?.xp;
    expect(xp?.startCap).toBe(`Rank ${String(cindle.explorer.rank)}`);
    expect(xp?.endCap).toBe(`Rank ${String(cindle.explorer.rank + 1)}`);
  });

  it('lists a creature below the place rank, but blocked, after the ones that can go', () => {
    const options = explorerOptions(creatures, { id: 'old-crossroads', minRank: 4 }, view);
    expect(options.map((o) => o.blocked === null)).toEqual([false, false]);
    expect(options[0]?.blocked).toBe('Needs explorer rank 4 for this place');
    const easy = explorerOptions(creatures, { id: 'old-crossroads', minRank: 2 }, view);
    expect(easy.map((o) => o.creature.id)).toEqual([cindle.id, splashet.id]);
    expect(easy[1]?.blocked).toBe('Needs explorer rank 2 for this place');
  });

  it('says where a busy creature is, and puts it last', () => {
    const away: Creature = { ...cindle, away: true, busy: { kind: 'expedition', id: 'x' } };
    const onJob: Creature = { ...splashet, busy: { kind: 'job', id: 'j' } };
    const options = explorerOptions([away, onJob], place('tidepools'), view);
    expect(options.map((o) => o.blocked)).toEqual(['Away on a trip', 'On a job']);
  });

  it('shows the stars of each creature at the chosen place', () => {
    const recorded = view.familiarity.find(
      (f) => f.creatureId === cindle.id && f.destination === 'tidepools',
    );
    expect(starsAt(view, cindle.id, 'tidepools')).toBe(recorded?.stars ?? 0);
    expect(starsAt(view, 'nobody', 'tidepools')).toBe(0);
    expect(starsAt(null, cindle.id, 'tidepools')).toBe(0);
    const starry = {
      familiarity: [
        {
          creatureId: cindle.id,
          destination: 'ember-caves',
          trips: 9,
          found: [],
          shiny: false,
          stars: 2,
          deepChanceBp: 4000,
        },
      ],
    };
    const options = explorerOptions(creatures, { id: 'ember-caves', minRank: 1 }, starry);
    expect(options.find((o) => o.creature.id === cindle.id)?.stars).toBe(2);
    // The trips of the creature at the place sit with its stars.
    expect(options.find((o) => o.creature.id === cindle.id)?.trips).toBe(9);
    expect(options.find((o) => o.creature.id === splashet.id)?.trips).toBe(0);
    expect(tripsAt(starry, cindle.id, 'ember-caves')).toBe(9);
    expect(tripsAt(starry, cindle.id, 'tidepools')).toBe(0);
    expect(tripsAt(null, cindle.id, 'ember-caves')).toBe(0);
  });

  it('says the trips of a creature at the place in words', () => {
    expect(tripsHereText(0)).toBe('No trips here yet');
    expect(tripsHereText(1)).toBe('1 trip here');
    expect(tripsHereText(4)).toBe('4 trips here');
  });

  it('keeps the explorer picked while it exists, else the first that can go', () => {
    const options = explorerOptions(creatures, place('tidepools'), view);
    expect(defaultExplorer(options, splashet.id)?.creature.id).toBe(splashet.id);
    expect(defaultExplorer(options, null)?.creature.id).toBe(cindle.id);
    expect(defaultExplorer(options, 'gone')?.creature.id).toBe(cindle.id);
    expect(defaultExplorer([], null)).toBeUndefined();
  });

  it('gives the small-creature popover what it needs for an explorer', () => {
    expect(explorerInfo(cindle)).toMatchObject({
      species: 'cindle',
      level: cindle.level,
      element: 'ember',
    });
    expect(explorerInfo({ ...cindle, species: 'unknown-beast' })).toBeNull();
  });
});

describe('the trip length when the explorer changes', () => {
  it('keeps a length that is still open and falls back to the longest open one', () => {
    const day = RULES.expeditions.lengths.day.minRank;
    expect(clampLength('long', 1)).toBe('long');
    expect(clampLength('day', day)).toBe('day');
    expect(clampLength('day', 1)).toBe('long');
  });
});

describe('why a trip cannot be sent', () => {
  const options = explorerOptions(creatures, place('tidepools'), view);
  const explorer = options[0];
  const base = {
    slots: open,
    explorer,
    place: place('tidepools'),
    length: 'long' as const,
    picks: [],
    stock: {},
  };

  it('is fine for a free trip', () => {
    expect(sendBlocker(base)).toBeNull();
  });

  it('names the full slots as one reason, for the sheet button as well', () => {
    expect(slotsFullReason({ ...open, total: 2, used: 1 })).toBeNull();
    expect(slotsFullReason({ ...open, total: 2, used: 2 })).toBe(
      'All 2 expedition slots are in use. Claim a trip first.',
    );
  });

  it('says when every slot is out', () => {
    expect(sendBlocker({ ...base, slots: { ...open, total: 1, used: 1 } })).toContain(
      'All 1 expedition slot is in use',
    );
    expect(sendBlocker({ ...base, slots: { ...open, total: 3, used: 3 } })).toContain(
      'All 3 expedition slots are in use',
    );
  });

  it('says when nobody can go, the place is closed or the trip is too long', () => {
    expect(sendBlocker({ ...base, explorer: undefined })).toBe('No creature to send.');
    expect(sendBlocker({ ...base, place: undefined })).toBe('Pick a place first.');
    const away = explorerOptions([{ ...cindle, away: true }], place('tidepools'), view)[0];
    expect(sendBlocker({ ...base, explorer: away })).toContain('Away on a trip');
    expect(sendBlocker({ ...base, place: place('festival-grounds') })).toContain('Festival');
    const lowRank = { ...(explorer as NonNullable<typeof explorer>), rank: 1 };
    expect(sendBlocker({ ...base, explorer: lowRank, length: 'day' })).toBe(
      'That trip is too long for this explorer.',
    );
  });

  it('says when a supply is missing from the stock, and lets a trip with the supplies in stock go', () => {
    expect(sendBlocker({ ...base, picks: [{ id: 'lure-good', source: 'owned' }] })).toContain(
      'no Sweet Lure',
    );
    expect(
      sendBlocker({
        ...base,
        picks: [{ id: 'lure-good', source: 'owned' }],
        stock: { 'lure-good': 1 },
      }),
    ).toBeNull();
  });
});

describe('why Next is disabled on a step', () => {
  const options = explorerOptions(creatures, place('tidepools'), view);
  const explorer = options[0];
  const base = {
    slots: open,
    explorer,
    place: place('tidepools'),
    length: 'long' as const,
    picks: [],
    stock: {},
  };

  it('is open on every step for a free trip', () => {
    for (const step of ['who', 'pack', 'ready'] as const) {
      expect(stepBlocker(step, base)).toBeNull();
    }
  });

  it('checks who goes on the first step only', () => {
    const full = { ...base, slots: { ...open, total: 1, used: 1 } };
    expect(stepBlocker('who', full)).toContain('All 1 expedition slot is in use');
    expect(stepBlocker('pack', full)).toBeNull();
    expect(stepBlocker('who', { ...base, explorer: undefined })).toBe('No creature to send.');
    const low = explorerOptions(creatures, place('old-crossroads'), view).find(
      (o) => o.blocked !== null,
    );
    expect(low?.blocked).toContain('Needs explorer rank');
    expect(stepBlocker('who', { ...base, explorer: low })).toContain('Needs explorer rank');
  });

  it('checks the length and the supplies on the pack step', () => {
    const missing = { ...base, picks: [{ id: 'lure-good', source: 'owned' as const }] };
    expect(stepBlocker('who', missing)).toBeNull();
    expect(stepBlocker('pack', missing)).toContain('no Sweet Lure');
    const lowRank = { ...(explorer as NonNullable<typeof explorer>), rank: 1 };
    expect(stepBlocker('pack', { ...base, explorer: lowRank, length: 'day' })).toBe(
      'That trip is too long for this explorer.',
    );
  });

  it('says on the last step that a place the clock shuts opens later; the steps before go on', () => {
    const reef = { ...base, place: place('moonlit-reef') };
    const text = reef.place.timeRule?.text;
    expect(text).toMatch(/^Opens (tonight at|\w{3}) 20:00$/);
    expect(stepBlocker('who', reef)).toBeNull();
    expect(stepBlocker('pack', reef)).toBeNull();
    expect(stepBlocker('ready', reef)).toBe(text);
    expect(sendBlocker(reef)).toBe(text);
  });
});
