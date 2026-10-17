import { describe, expect, it } from 'vitest';
import stateFixture from './fixtures/collection-state.json';
import { parseGameState, type Creature } from './api';
import { experienceLabel, experienceLine } from './CreatureProgress';
import {
  experienceText,
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
    expect(ribbonBlocker(bronze)).toBe('Not enough parts yet.');
    expect(ribbonBlocker(silver)).toBe('Needs 3 more finished trips by this creature.');
    expect(ribbonBlocker({ ...silver, tripsDone: 4 })).toBe(
      'Needs 1 more finished trip by this creature.',
    );
  });
});

describe('the experience sentence', () => {
  it('says the gain, and a level-up, a treat, a gate and a Gold Ribbon when they happen', () => {
    expect(experienceText(view)).toBe('+120 experience');
    expect(experienceText({ ...view, treat: true })).toBe('+120 experience (treat)');
    expect(experienceText({ ...view, level: 5 })).toBe('+120 experience, level 4 to 5');
    expect(experienceText({ ...view, waiting: true })).toBe(
      '+120 experience, waiting at this level',
    );
    expect(experienceText({ ...view, level: 30, levelBefore: 29, gold: true })).toBe(
      '+120 experience, level 29 to 30, Gold Ribbon',
    );
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
