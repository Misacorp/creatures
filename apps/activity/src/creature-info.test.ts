import { describe, expect, it } from 'vitest';
import { GLOSSARY_IDS, entryView } from '@creatures/game';
import { backLabel, creatureButtonLabel, creatureInfoOf, type CreatureInfo } from './creature-info';

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
