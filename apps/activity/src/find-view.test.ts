import { describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import state from './fixtures/creatures-state.json';
import {
  duplicateOptions,
  firstPick,
  lineCreatures,
  pendingFind,
  talentIsNew,
  tripFinds,
} from './find-view';
import type { PendingCatch } from './talent-types';

/** Real server output: three Splashet duplicates that can be taught or fused, one whose talent Splashet knows. */
const waiting = parseGameState(state);
const [teachable, , fuseFirst, known] = waiting.pending as [
  PendingCatch,
  PendingCatch,
  PendingCatch,
  PendingCatch,
];
const splashet = waiting.creatures.find((c) => c.species === 'splashet');

describe('the choice of a waiting duplicate', () => {
  it('lists Fuse and Teach for the creature of its line, then Release, with the recommended row marked', () => {
    const options = duplicateOptions(teachable, waiting.creatures);
    expect(options.map((o) => o.label)).toEqual(['Fuse', 'Teach', 'Release']);
    expect(options.find((o) => o.recommended)?.label).toBe('Teach');
    // One creature of the line: no name on the rows, the fusion as stars, Release as its parts.
    expect(options.every((o) => o.who === null)).toBe(true);
    expect(options[0]?.fusion).toEqual({ count: splashet?.fusionCount });
    expect(options[2]?.pays?.map((p) => [p.key, p.amount])).toEqual([['scrap', 3]]);
    // Teach goes into the Talent Book: the request names the creature, never a slot.
    expect(options[1]?.request).toEqual({ choice: 'teach', creatureId: splashet?.id });
  });

  it('greys Teach with the reason when the Talent Book already holds the talent', () => {
    const teach = duplicateOptions(known, waiting.creatures).find((o) => o.label === 'Teach');
    expect(teach?.blocked).toBe('Already in its Talent Book');
  });

  it('greys Fuse as fully fused when the server does not offer it', () => {
    const card = { ...teachable, offered: { ...teachable.offered, fuse: [] } };
    expect(duplicateOptions(card, waiting.creatures)[0]?.blocked).toBe('Fully fused');
  });

  it('names the creature on each row when the line has two, and adds Keep when it is offered', () => {
    if (splashet === undefined) throw new Error('the fixture has no Splashet');
    const twin = { ...splashet, id: 'twin', nickname: 'Twin' };
    const card = { ...teachable, offered: { ...teachable.offered, keep: true } };
    const options = duplicateOptions(card, [...waiting.creatures, twin]);
    expect(options.map((o) => `${o.label}:${o.who ?? ''}`)).toEqual([
      'Fuse:Splashet',
      'Fuse:Twin',
      'Teach:Splashet',
      'Teach:Twin',
      'Release:',
      'Keep:',
    ]);
    // Twin is not offered by the server: greyed.
    expect(options.find((o) => o.key === 'teach-twin')?.blocked).not.toBeNull();
  });

  it('picks Recommended first, else the first row that can be picked', () => {
    expect(firstPick(duplicateOptions(fuseFirst, waiting.creatures))).toBe(
      `fuse-${String(splashet?.id)}`,
    );
    const none = duplicateOptions(known, waiting.creatures).map((o) => ({
      ...o,
      recommended: false,
    }));
    expect(firstPick(none)).toBe(`fuse-${String(splashet?.id)}`);
    expect(firstPick([])).toBeNull();
  });
});

describe('a discovered talent', () => {
  it('is new when no creature of the line holds it, and not when one does', () => {
    const line = lineCreatures('splashet', waiting.creatures);
    expect(line.map((c) => c.species)).toEqual(['splashet']);
    expect(talentIsNew(teachable.talent, line)).toBe(true);
    expect(talentIsNew(known.talent, line)).toBe(false);
    expect(pendingFind(known, waiting.creatures).talentNew).toBe(false);
  });

  it('a golden one is new unless a golden one is held', () => {
    const line = lineCreatures('splashet', waiting.creatures);
    expect(talentIsNew({ ...known.talent, golden: true }, line)).toBe(true);
  });
});

describe('what a claim found', () => {
  it('gives a waiting duplicate its choice, a new creature its talent, and an answered one its sentence', () => {
    const finds = tripFinds(
      [
        {
          species: 'mistnewt',
          shiny: false,
          outcome: 'new',
          firstOnServer: true,
          talent: teachable.talent,
        },
        {
          species: 'splashet',
          shiny: false,
          outcome: 'duplicate',
          firstOnServer: false,
          pendingId: teachable.id,
        },
        {
          species: 'splashet',
          shiny: false,
          outcome: 'duplicate',
          firstOnServer: false,
          pendingId: 'gone',
        },
      ],
      waiting.pending,
      waiting.creatures,
      { gone: 'Fused Splashet into Splashet.' },
    );
    expect(finds[0]?.choice).toBeNull();
    expect(finds[0]?.talentNew).toBe(true);
    expect(finds[0]?.badges.map((b) => b.text)).toEqual(['New!', 'First on server!']);
    expect(finds[1]?.choice?.card.id).toBe(teachable.id);
    expect(finds[2]?.choice).toBeNull();
    expect(finds[2]?.answered).toBe('Fused Splashet into Splashet.');
  });
});
