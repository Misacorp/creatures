import { describe, expect, it } from 'vitest';
import { GLOSSARY_IDS, entryView } from '@creatures/game';
import {
  backLabel,
  creatureButtonLabel,
  creatureFactRows,
  shownWornItems,
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

describe('creatureFactRows', () => {
  it('has the level for a creature without the other fields', () => {
    expect(creatureFactRows(info, 'Cindle')).toEqual([
      { label: 'Level', value: String(info.level) },
    ]);
  });

  it('lists the level, the owner, the species of a nicknamed creature, Crafting level and Explorer rank', () => {
    const room: CreatureInfo = {
      ...info,
      name: 'Sparky',
      ownerName: 'Misa',
      shiny: true,
      craftingLevel: 3,
      explorerRank: 2,
    };
    expect(creatureFactRows(room, 'Cindle')).toEqual([
      { label: 'Level', value: String(info.level) },
      { label: 'Owner', value: 'Misa' },
      { label: 'Species', value: 'Cindle' },
      { label: 'Crafting level', value: '3' },
      { label: 'Explorer rank', value: '2' },
    ]);
  });

  it('leaves out the species row when the name is the species name; shiny and an effect are not rows', () => {
    const line = "Boosts its neighbours' next hit by 15%.";
    expect(
      creatureFactRows({ ...info, ownerName: 'Bo', shiny: true, effect: line }, 'Cindle').map(
        (r) => r.label,
      ),
    ).toEqual(['Level', 'Owner']);
  });
});

describe('shownWornItems', () => {
  const worn = [
    { baseId: 'kelp-cap', slot: 'hat' as const, rarity: 'rare' as const, itemLevel: 3 },
  ];

  it('shows the items of a room creature (it has an owner)', () => {
    expect(shownWornItems({ ...info, ownerName: 'Misa', gear: worn })).toEqual(worn);
  });

  it('shows nothing when the creature wears nothing', () => {
    expect(shownWornItems({ ...info, ownerName: 'Misa', gear: [] })).toEqual([]);
    expect(shownWornItems({ ...info, ownerName: 'Misa' })).toEqual([]);
  });

  it('shows the items of any creature whose info carries them (a dungeon run), and none otherwise', () => {
    expect(shownWornItems({ ...info, gear: worn })).toEqual(worn);
    expect(shownWornItems(info)).toEqual([]);
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
