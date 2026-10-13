import { describe, expect, it } from 'vitest';
import type { AbilityPreview } from './raid-api';
import { abilitiesSummary } from './raid-abilities';

const basic = (autoFire: boolean): AbilityPreview => ({
  key: 'm1:basic',
  abilityId: 'rally',
  creatureId: null,
  species: null,
  unlocked: true,
  unlockLevel: 1,
  autoFire,
});
const creature = (unlocked: boolean, autoFire: boolean): AbilityPreview => ({
  abilityId: 'tidal-mark',
  creatureId: 'c1',
  species: 'splashet',
  unlocked,
  unlockLevel: 10,
  autoFire,
});

describe('abilitiesSummary', () => {
  it('reads "Auto" when nothing is customised', () => {
    const summary = abilitiesSummary({
      ability: { abilityId: 'rally', chosen: false },
      abilities: [basic(true), creature(true, true)],
    });
    expect(summary).toEqual({ customised: false, manual: 0, text: 'Auto' });
  });

  it('names a basic ability the player picked', () => {
    const summary = abilitiesSummary({
      ability: { abilityId: 'rally', chosen: true },
      abilities: [basic(true)],
    });
    expect(summary.customised).toBe(true);
    expect(summary.text).toBe('Rally');
  });

  it('counts the abilities that wait for the player', () => {
    const summary = abilitiesSummary({
      ability: { abilityId: 'rally', chosen: false },
      abilities: [basic(false), creature(true, false)],
    });
    expect(summary).toMatchObject({ customised: true, manual: 2, text: '2 manual' });
  });

  it('joins the pick and the manual count', () => {
    const summary = abilitiesSummary({
      ability: { abilityId: 'rally', chosen: true },
      abilities: [basic(true), creature(true, false)],
    });
    expect(summary.text).toBe('Rally · 1 manual');
  });

  it('ignores locked abilities: their Auto fire is not in play', () => {
    const summary = abilitiesSummary({
      ability: null,
      abilities: [creature(false, false)],
    });
    expect(summary).toEqual({ customised: false, manual: 0, text: 'Auto' });
  });
});
