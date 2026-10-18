import { describe, expect, it } from 'vitest';
import stateFixture from './fixtures/collection-state.json';
import { parseGameState, type Creature } from './api';
import { experienceLabel, experienceLine } from './CreatureProgress';
import {
  experienceBar,
  experienceBoostLine,
  isExperienceView,
  isRibbonView,
  ribbonBlocker,
  ribbonCostText,
  ribbonName,
  type ExperienceView,
  type RibbonView,
} from './experience';

const view: ExperienceView = {
  creatureId: 'c1',
  gained: 120,
  treat: false,
  levelBefore: 4,
  level: 4,
  exp: 30,
  needed: 200,
  waiting: false,
  gold: false,
};

const bronze: RibbonView = {
  id: 'bronze',
  level: 10,
  parts: { scrap: 6, 'tide-shard': 2 },
  trips: 0,
  tripsDone: 0,
  ready: false,
};

const silver: RibbonView = {
  id: 'silver',
  level: 20,
  parts: { scrap: 15, 'ember-shard': 5, glimmer: 1 },
  trips: 5,
  tripsDone: 2,
  ready: false,
};

function creature(over: Partial<Creature>): Creature {
  const base = parseGameState(stateFixture).creatures[0] as Creature;
  return { ...base, ...over };
}

describe('the experience view parser', () => {
  it('accepts what the server sends', () => {
    expect(isExperienceView(view)).toBe(true);
    expect(isExperienceView({ ...view, needed: null })).toBe(true);
  });

  it('rejects wrong types and fractions', () => {
    expect(isExperienceView({ ...view, gained: 1.5 })).toBe(false);
    expect(isExperienceView({ ...view, treat: 'yes' })).toBe(false);
    expect(isExperienceView({ ...view, needed: undefined })).toBe(false);
    expect(isExperienceView(null)).toBe(false);
    expect(isExperienceView('x')).toBe(false);
  });
});

describe('the ribbon view parser', () => {
  it('accepts what the server sends', () => {
    expect(isRibbonView(bronze)).toBe(true);
    expect(isRibbonView(silver)).toBe(true);
  });

  it('rejects an unknown ribbon, an unknown part and a fraction', () => {
    expect(isRibbonView({ ...bronze, id: 'gold' })).toBe(false);
    expect(isRibbonView({ ...bronze, parts: { dust: 1 } })).toBe(false);
    expect(isRibbonView({ ...bronze, parts: { scrap: 1.5 } })).toBe(false);
    expect(isRibbonView({ ...bronze, ready: 1 })).toBe(false);
    expect(isRibbonView(undefined)).toBe(false);
  });
});

describe('the ribbon words', () => {
  it('names the three ribbons', () => {
    expect(ribbonName('bronze')).toBe('Bronze Ribbon');
    expect(ribbonName('silver')).toBe('Silver Ribbon');
    expect(ribbonName('gold')).toBe('Gold Ribbon');
  });

  it('lists the cost in words, parts first and trips last', () => {
    expect(ribbonCostText(bronze)).toBe('6 scrap and 2 Tide shards');
    expect(ribbonCostText(silver)).toBe('15 scrap, 5 Ember shards, 1 glimmer and 5 finished trips');
    expect(ribbonCostText({ ...bronze, parts: { scrap: 3 } })).toBe('3 scrap');
    expect(ribbonCostText({ ...bronze, parts: {}, trips: 1 })).toBe('1 finished trip');
  });

  it('says what is missing, and nothing when it is ready', () => {
    expect(ribbonBlocker({ ...bronze, ready: true })).toBeNull();
    expect(ribbonBlocker(bronze)).toBe('Short of parts.');
    expect(ribbonBlocker(silver)).toBe('Needs 3 more trips.');
    expect(ribbonBlocker({ ...silver, tripsDone: 4 })).toBe('Needs 1 more trip.');
  });
});

describe("what multiplied a dungeon run's experience", () => {
  it('says the treat and its factor, from what the server sent', () => {
    expect(experienceBoostLine(view)).toBeNull();
    expect(experienceBoostLine({ ...view, treat: true, treatTimes: 2 })).toBe(
      'Treat gave 2x experience',
    );
    expect(experienceBoostLine({ ...view, treat: true, treatTimes: 3 })).toBe(
      'Treat gave 3x experience',
    );
    // An older run knew only that a treat was packed: it doubled.
    expect(experienceBoostLine({ ...view, treat: true })).toBe('Treat gave 2x experience');
  });

  it('names the Boon or Omen that changed it, up or down', () => {
    const day = [{ name: 'Hearty Breakfast', bp: 2500 }];
    expect(experienceBoostLine({ ...view, dayEffects: day })).toBe(
      'Hearty Breakfast gave +25% experience',
    );
    expect(experienceBoostLine({ ...view, dayEffects: [{ name: 'Cold Snap', bp: -2000 }] })).toBe(
      'Cold Snap gave -20% experience',
    );
    expect(experienceBoostLine({ ...view, treat: true, treatTimes: 3, dayEffects: day })).toBe(
      'Treat gave 3x experience and Hearty Breakfast gave +25%',
    );
    expect(
      experienceBoostLine({
        ...view,
        treat: true,
        treatTimes: 3,
        dayEffects: [...day, { name: 'Cold Snap', bp: -2000 }],
      }),
    ).toBe('Treat gave 3x experience, Hearty Breakfast gave +25% and Cold Snap gave -20%');
    // A day effect of nothing is not worth a line.
    expect(
      experienceBoostLine({ ...view, dayEffects: [{ name: 'Quiet Night', bp: 0 }] }),
    ).toBeNull();
  });
});

describe('the experience bar of a creature after a run', () => {
  it('shows where it stands in its level, with the part just gained', () => {
    expect(experienceBar(view)).toEqual({
      level: 4,
      levelsGained: 0,
      value: 30,
      max: 200,
      text: '30 / 200 XP',
      // 120 were gained, but only 30 are in the bar: it was empty at the start.
      gained: 30,
      gainedLine: '+120 experience',
      boostLine: null,
      note: null,
    });
    expect(experienceBar({ ...view, gained: 10 })).toMatchObject({ value: 30, gained: 10 });
  });

  it('counts the levels gained, and draws all of the new level as gained', () => {
    const up = experienceBar({ ...view, levelBefore: 3, level: 5, exp: 50, treat: true });
    expect(up).toMatchObject({ level: 5, levelsGained: 2, gained: 50, value: 50 });
    expect(up.boostLine).toBe('Treat gave 2x experience');
  });

  it('says it waits at a level, and a Gold Ribbon; the top level is a full bar', () => {
    expect(experienceBar({ ...view, waiting: true, exp: 200 }).note).toBe('Waiting at this level');
    const gold = experienceBar({ ...view, levelBefore: 29, level: 30, needed: null, gold: true });
    expect(gold).toMatchObject({ note: 'Gold Ribbon!', text: 'Top level', value: 1, max: 1 });
    expect(experienceBar({ ...view, level: 30, levelBefore: 30, needed: null })).toMatchObject({
      note: null,
      gained: 0,
    });
  });
});

describe('reading the experience a dungeon run paid', () => {
  it('takes the treat factor and the day effects, and still takes a view without them', () => {
    expect(isExperienceView(view)).toBe(true);
    expect(
      isExperienceView({
        ...view,
        treatTimes: 3,
        dayEffects: [{ name: 'Hearty Breakfast', bp: 2500 }],
      }),
    ).toBe(true);
    expect(isExperienceView({ ...view, treatTimes: null, dayEffects: [] })).toBe(true);
  });

  it('turns away a broken factor or day effect', () => {
    expect(isExperienceView({ ...view, treatTimes: '3' })).toBe(false);
    expect(isExperienceView({ ...view, treatTimes: 2.5 })).toBe(false);
    expect(isExperienceView({ ...view, dayEffects: 'Hearty Breakfast' })).toBe(false);
    expect(isExperienceView({ ...view, dayEffects: [{ name: 5, bp: 1 }] })).toBe(false);
    expect(isExperienceView({ ...view, dayEffects: [{ name: 'Cold Snap', bp: 1.5 }] })).toBe(false);
  });
});

describe('the creature card growth lines', () => {
  it('shows the bar and what comes next', () => {
    const c = creature({
      level: 6,
      exp: 40,
      expNeeded: 200,
      waiting: false,
      ribbon: null,
      nextUnlock: { level: 7, name: 'Scarf' },
    });
    expect(experienceLine(c)).toBe('40 / 200 experience · Scarf at 7');
    expect(experienceLabel(c)).toBe('Experience: 40 / 200 towards level 7');
  });

  it('says what a waiting creature waits for', () => {
    const waitingForRibbon = creature({
      level: 10,
      exp: 300,
      expNeeded: 340,
      waiting: true,
      ribbon: { ...bronze, ready: false },
    });
    expect(experienceLine(waitingForRibbon)).toBe('300 / 340 experience, Bronze Ribbon first');
    const waitingToEvolve = {
      ...creature({}),
      level: 15,
      exp: 10,
      expNeeded: 600,
      waiting: true,
      ribbon: null,
      evolution: { toSpecies: 'cindle', level: 15, essence: 0, available: false },
    } satisfies Creature;
    expect(experienceLine(waitingToEvolve)).toBe('10 / 600 experience, evolve first');
  });

  it('says so at the top level', () => {
    const top = creature({ level: 30, expNeeded: null, nextUnlock: null, ribbon: null });
    expect(experienceLine(top)).toBe('Top level reached');
    expect(experienceLabel(top)).toBe('Experience: level 30, the top level');
  });

  it('is parsed from the server fixture for every creature', () => {
    for (const c of parseGameState(stateFixture).creatures) {
      expect(Number.isInteger(c.exp)).toBe(true);
      expect(c.treatCost).toBeGreaterThan(3);
      expect(experienceLine(c).length).toBeGreaterThan(0);
    }
  });
});
