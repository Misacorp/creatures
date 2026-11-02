import { combatV2 } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import {
  creatureV2,
  critChanceText,
  critMultText,
  critText,
  chipParts,
  isCreatureV2Part,
  plainText,
  savedKnack,
  talentViewOf,
  textParts,
} from './combat-v2-view';
import { sampleCreature, SAMPLE_STATE } from './creature-card-sample';
import { withV2 } from './creature-page/v2-sample';

describe('the keywords in a text', () => {
  it('splits a Knack text at its braces, and the parts joined are the text again', () => {
    const parts = textParts('{Store} Heat: +1 at round start. The next {Reaction} deals double.');
    expect(parts).toEqual([
      { keyword: true, text: 'Store' },
      { keyword: false, text: ' Heat: +1 at round start. The next ' },
      { keyword: true, text: 'Reaction' },
      { keyword: false, text: ' deals double.' },
    ]);
    const joined = parts.map((p) => (p.keyword ? `{${p.text}}` : p.text)).join('');
    expect(joined).toBe('{Store} Heat: +1 at round start. The next {Reaction} deals double.');
  });

  it('leaves a text with no braces whole, and an unclosed brace as plain words', () => {
    expect(textParts('First pounce +14%.')).toEqual([
      { keyword: false, text: 'First pounce +14%.' },
    ]);
    expect(textParts('a { b')).toEqual([{ keyword: false, text: 'a { b' }]);
    expect(textParts('')).toEqual([]);
  });

  it('reads a plural after a keyword ("{Crit}s") and drops the braces for a spoken label', () => {
    expect(plainText('Its {Crit}s are 3x.')).toBe('Its Crits are 3x.');
  });

  it('takes the letters that run on after a keyword into its chip', () => {
    expect(chipParts('{Spend}s all of them. Its {Crit}s are 3x, {Mark} at 2.')).toEqual([
      { keyword: true, text: 'Spends' },
      { keyword: false, text: ' all of them. Its ' },
      { keyword: true, text: 'Crits' },
      { keyword: false, text: ' are 3x, ' },
      { keyword: true, text: 'Mark' },
      { keyword: false, text: ' at 2.' },
    ]);
    expect(chipParts('{Intercept}.')).toEqual([
      { keyword: true, text: 'Intercept' },
      { keyword: false, text: '.' },
    ]);
  });

  it('only ever finds keywords the content defines: every braced word of every Knack and talent text', () => {
    const texts = [
      ...Object.values(combatV2.knacks).map((k) => k.text),
      ...Object.values(combatV2.talents).map((t) => t.text),
    ];
    const names = new Set(Object.keys(combatV2.keywords));
    let chips = 0;
    for (const text of texts) {
      for (const part of textParts(text)) {
        if (!part.keyword) continue;
        chips++;
        expect(names.has(part.text), `${part.text} in "${text}"`).toBe(true);
      }
    }
    expect(chips).toBeGreaterThan(20);
  });
});

describe('crit in words (R7.1)', () => {
  it('writes the chance and the multiplier the game way', () => {
    expect(critChanceText(1700)).toBe('17%');
    expect(critChanceText(850)).toBe('8.5%');
    expect(critMultText(30_000)).toBe('3x');
    expect(critMultText(21_000)).toBe('2.1x');
    expect(critMultText(20_000)).toBe('2x');
    expect(critText({ critChanceBp: 1700, critMultBp: 30_000 })).toBe('17% · 3x');
  });
});

describe('the v2 part of a creature', () => {
  const plain = sampleCreature('growing');

  it('is absent from a creature the server sent without it (the flag off)', () => {
    expect(creatureV2(plain)).toBeNull();
    expect(isCreatureV2Part(plain as unknown as Record<string, unknown>)).toBe(true);
  });

  it('is read from a creature that carries all four fields', () => {
    const creature = withV2(plain, { knack: 0, learned: [0, 1] });
    const v2 = creatureV2(creature);
    expect(v2).not.toBeNull();
    expect(isCreatureV2Part(creature as unknown as Record<string, unknown>)).toBe(true);
    if (v2 === null) return;
    expect(savedKnack(v2)?.id).toBe(v2.knack);
    expect(v2.knownKnacks.length).toBeGreaterThan(0);
    expect(v2.talentsV2.book.filter((b) => b.learned)).toHaveLength(2);
  });

  it('reads no Knack as null, and a saved Knack the creature does not know as none', () => {
    const none = creatureV2(withV2(plain, { knack: null, learned: [0] }));
    expect(none === null ? null : savedKnack(none)).toBeNull();
    const stale = { ...withV2(plain, { knack: 0, learned: [0] }), knack: 'not-a-knack' };
    const v2 = creatureV2(stale);
    expect(v2 === null ? 'x' : savedKnack(v2)).toBeNull();
  });

  it('refuses a creature with some of the v2 fields, or with odd ones, so a state of that shape is an error', () => {
    const full = withV2(plain, { knack: 0, learned: [0] }) as unknown as Record<string, unknown>;
    const { statsV2: _s, ...partial } = full;
    void _s;
    expect(isCreatureV2Part(partial)).toBe(false);
    expect(isCreatureV2Part({ ...full, knack: 3 })).toBe(false);
    expect(isCreatureV2Part({ ...full, knownKnacks: [{ id: 'x' }] })).toBe(false);
    expect(isCreatureV2Part({ ...full, statsV2: { hp: 1 } })).toBe(false);
    const badBook = {
      ...(full['talentsV2'] as Record<string, unknown>),
      book: [
        { id: 'x', name: 'X', text: 't', golden: false, idle: false, learned: 'yes', slot: null },
      ],
    };
    expect(isCreatureV2Part({ ...full, talentsV2: badBook })).toBe(false);
  });

  it('goes through the state parser: v2 fields on a creature are kept, odd ones refuse the state', () => {
    const creature = withV2(plain, { knack: 0, learned: [0, 1], golden: [1] });
    const state = parseGameState({ ...SAMPLE_STATE, creatures: [creature] });
    expect(state.creatures[0]?.knack).toBe(creature.knack);
    expect(state.creatures[0]?.talentsV2?.book.some((b) => b.golden)).toBe(true);
    const odd = { ...creature, statsV2: { hp: 'many' } };
    expect(() => parseGameState({ ...SAMPLE_STATE, creatures: [odd] })).toThrow();
  });

  it('gives the shared talent parts a talent with no extra sentence', () => {
    const creature = withV2(plain, { knack: 0, learned: [0] });
    const talent = creature.talentsV2?.book[0];
    if (talent === undefined) throw new Error('the sample has a book');
    expect(talentViewOf(talent)).toEqual({
      id: talent.id,
      name: talent.name,
      golden: talent.golden,
      text: talent.text,
      about: '',
      idle: talent.idle,
    });
  });
});
