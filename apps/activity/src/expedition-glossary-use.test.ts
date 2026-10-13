import { GLOSSARY_IDS, SUPPLY_KINDS, entryView, expeditionContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { glyph } from './glyphs';
import { EXPEDITION_GLYPHS } from './expedition-glyphs';

/**
 * The expedition screens put a glossary tag on destinations, supplies, push-on goals, explorer rank,
 * familiarity, slots, the journal and milestones. Each tag needs its entry: a tag without one is plain text
 * (see `GlossaryTag`), so this list is the coverage check for what the screens use.
 */
describe('the glossary entries the expedition screens use', () => {
  const fixed = [
    'explorer-rank',
    'familiarity',
    'deep-area',
    'push-on',
    'supplies',
    'journal',
    'journal-set',
    'weekly-special',
    'expedition-slot',
    'milestone',
    'destination',
    'bait',
    'blueprint',
    'workshop',
    'skill-crafting',
    'fusion',
    'shiny',
    'first-on-server',
  ];

  it('has every fixed entry', () => {
    for (const id of fixed) expect(entryView(id), id).toBeDefined();
  });

  it('has an entry for every destination, every kind of supply and both kinds of goal', () => {
    for (const d of expeditionContent.destinations) {
      expect(entryView(GLOSSARY_IDS.destination(d.id)), d.id).toBeDefined();
    }
    for (const kind of SUPPLY_KINDS) {
      expect(entryView(GLOSSARY_IDS.supply(kind)), kind).toBeDefined();
    }
    for (const risk of ['safe', 'risky']) {
      expect(entryView(GLOSSARY_IDS.goal(risk)), risk).toBeDefined();
    }
    expect(entryView(GLOSSARY_IDS.job('supply'))).toBeDefined();
  });
});

describe('the pictures of the expedition screens', () => {
  it('has a glyph for each kind of supply and for every icon the screens draw', () => {
    for (const kind of SUPPLY_KINDS) expect(glyph(kind), kind).toBeDefined();
    for (const id of [
      'journal',
      'star',
      'star-empty',
      'clock',
      'fork',
      'rank',
      'moon',
      'lock',
      'blueprint',
      'gear-piece',
      'paw',
      'warning',
      'check',
      'skull',
      'sparkle',
      'flag',
      'compass',
    ]) {
      expect(glyph(id), id).toBeDefined();
    }
  });

  it('keeps the expedition icons in the bundled glyph set', () => {
    for (const id of Object.keys(EXPEDITION_GLYPHS)) {
      expect(glyph(id), id).toBe(EXPEDITION_GLYPHS[id]);
    }
  });
});
