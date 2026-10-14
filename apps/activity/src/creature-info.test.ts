import { describe, expect, it } from 'vitest';
import { GLOSSARY_IDS, entryView } from '@creatures/game';
import {
  backLabel,
  creatureButtonLabel,
  creatureFacts,
  shownWornItem,
  creatureInfoOf,
  ownedCreatureLabel,
  type CreatureInfo,
} from './creature-info';

const info: CreatureInfo = {
  name: 'Cindle',
  species: 'cindle',
  level: 7,
  element: 'ember',
  role: 'payoff',
};

describe('the tags and the labels', () => {
  it('has a glossary entry for the element and the role of a creature', () => {
    expect(entryView(GLOSSARY_IDS.element(info.element))).toBeDefined();
    expect(entryView(GLOSSARY_IDS.role(info.role))).toBeDefined();
  });

  it('has a spoken label and a back label that name the creature', () => {
    expect(creatureButtonLabel(info)).toBe('Cindle, level 7. Shows its role and element.');
    expect(backLabel(info)).toBe('Back to Cindle');
  });
});

describe('creatureInfoOf', () => {
  it('keeps exactly the five popover fields of a bigger creature record', () => {
    const unit = { ...info, id: 'u1', hp: 40, extra: { nested: true } };
    expect(creatureInfoOf(unit)).toEqual(info);
    expect(Object.keys(creatureInfoOf(unit)).sort()).toEqual([
      'element',
      'level',
      'name',
      'role',
      'species',
    ]);
  });
});

describe('creatureFacts', () => {
  it('says nothing extra for a creature without the new fields', () => {
    expect(creatureFacts(info, 'Cindle')).toEqual([]);
  });

  it('lists the owner, the species of a nicknamed creature, shiny, Crafting level and Explorer rank', () => {
    const room: CreatureInfo = {
      ...info,
      name: 'Sparky',
      ownerName: 'Misa',
      shiny: true,
      craftingLevel: 3,
      explorerRank: 2,
    };
    expect(creatureFacts(room, 'Cindle')).toEqual([
      'Owner: Misa',
      'Species: Cindle',
      'Shiny',
      'Crafting level 3',
      'Explorer rank 2',
    ]);
  });

  it('ends with the one line about what the creature does for its neighbours', () => {
    const line = "Boosts its neighbours' next hit by 15%.";
    expect(creatureFacts({ ...info, ownerName: 'Bo', effect: line }, 'Cindle')).toEqual([
      'Owner: Bo',
      line,
    ]);
    expect(creatureFacts({ ...info, effect: line }, 'Cindle')).toEqual([line]);
  });

  it('leaves out the species line when the name is the species name, and shiny when false', () => {
    expect(creatureFacts({ ...info, ownerName: 'Bo', shiny: false }, 'Cindle')).toEqual([
      'Owner: Bo',
    ]);
  });
});

describe('shownWornItem', () => {
  const worn = { baseId: 'bark-band', rarity: 'rare' as const, level: 3, enchantId: null };

  it('shows the item of a room creature (it has an owner)', () => {
    expect(shownWornItem({ ...info, ownerName: 'Misa', gear: worn })).toEqual(worn);
  });

  it('shows nothing when the creature wears nothing', () => {
    expect(shownWornItem({ ...info, ownerName: 'Misa', gear: null })).toBeNull();
    expect(shownWornItem({ ...info, ownerName: 'Misa' })).toBeNull();
  });

  it('shows nothing in popovers that are not about a room creature', () => {
    expect(shownWornItem({ ...info, gear: worn })).toBeNull();
    expect(shownWornItem(info)).toBeNull();
  });
});

describe('ownedCreatureLabel', () => {
  it('reads "<owner>\'s <name>, level <n>"', () => {
    expect(ownedCreatureLabel({ name: 'Splashet', level: 12, ownerName: 'Misa' })).toBe(
      "Misa's Splashet, level 12",
    );
    expect(ownedCreatureLabel({ name: 'Splashet', level: 12 })).toBe('Splashet, level 12');
  });
});
