import { gearContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  buildModifiers,
  GEAR_CLASS,
  IDEAS,
  MODIFIER_CATEGORIES,
  MODIFIER_KINDS,
  MODIFIER_STATUSES,
  MODIFIERS,
  nameKey,
  TALENT_IS_GEAR,
  TALENTS,
} from '../src';

/** The raw gear line ids: an element line (`tide-attunement`) once, as `attunement`. */
const RAW_LINES = [
  ...new Set(
    gearContent.lines.map((l) => (l.element === null ? l.id : l.id.slice(l.element.length + 1))),
  ),
];

describe('the modifier library', () => {
  it('classifies every shipped gear line, and only gear lines', () => {
    expect(RAW_LINES.length).toBeGreaterThan(80);
    expect(RAW_LINES.filter((id) => GEAR_CLASS[id] === undefined)).toEqual([]);
    expect(Object.keys(GEAR_CLASS).filter((id) => !RAW_LINES.includes(id))).toEqual([]);
  });

  it('lists every gear line once, as a game modifier with its own words', () => {
    const game = MODIFIERS.filter((m) => m.status === 'game');
    expect(game.map((m) => m.id).sort()).toEqual([...RAW_LINES].sort());
    for (const id of RAW_LINES) {
      const m = game.find((x) => x.id === id);
      const line = gearContent.lines.find((l) => l.id === id);
      // Element lines are generic; any other line keeps the game's name and text.
      if (line !== undefined) {
        expect(m?.name, id).toBe(GEAR_CLASS[id]?.name ?? line.name);
        expect(m?.text, id).toBe(GEAR_CLASS[id]?.text ?? line.about);
      }
    }
  });

  it('shows the lines made per element without a placeholder or an element name', () => {
    for (const id of ['attunement', 'hunter', 'reaction', 'ward']) {
      const m = MODIFIERS.find((x) => x.id === id);
      expect(m, id).toBeDefined();
      expect(`${m?.name} ${m?.text}`, id).not.toMatch(/[{}]|\b(Tide|Ember|Grove|Spark|Mire)\b/);
    }
  });

  it('gives every modifier one of the five categories, a known kind and status, and roles', () => {
    expect(MODIFIER_CATEGORIES).toEqual(['damage', 'marks', 'protection', 'support', 'outside']);
    for (const m of MODIFIERS) {
      expect(MODIFIER_CATEGORIES, m.id).toContain(m.category);
      expect(MODIFIER_KINDS, m.id).toContain(m.kind);
      expect(MODIFIER_STATUSES, m.id).toContain(m.status);
      expect(m.roles.length, m.id).toBeGreaterThan(0);
      expect(m.name.trim(), m.id).not.toBe('');
      expect(m.text.trim(), m.id).not.toBe('');
    }
    for (const category of MODIFIER_CATEGORIES) {
      expect(MODIFIERS.filter((m) => m.category === category).length, category).toBeGreaterThan(3);
    }
  });

  it('has a unique id for every modifier, and one entry per name except the item lines', () => {
    const ids = MODIFIERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    // A name used twice is only a gear line pair that differs by what it changes (an item's own stat).
    const names = MODIFIERS.map((m) => nameKey(m.name));
    const twice = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    expect(twice.sort()).toEqual(['attack', 'critchance', 'critdamage', 'hp']);
  });

  it('has every lab draft talent: on a gear line, on an idea, or as a lab modifier', () => {
    for (const t of Object.values(TALENTS)) {
      const on = MODIFIERS.filter((m) => m.talents.includes(t.id));
      expect(on.length, t.id).toBe(1);
      const m = on[0];
      if (m?.status === 'lab') expect(m.text, t.id).not.toMatch(/[{}]/);
    }
    for (const gear of Object.values(TALENT_IS_GEAR)) {
      expect(GEAR_CLASS[gear], gear).toBeDefined();
    }
  });

  it('shows a talent that is a gear line on the line, with the line name', () => {
    const line = MODIFIERS.find((m) => m.id === 'first-pounce');
    expect(line?.status).toBe('game');
    expect(line?.talents).toContain('first-strike');
    expect(MODIFIERS.some((m) => nameKey(m.name) === 'firststrike')).toBe(false);
  });

  it('lists the design ideas once, and an idea that is a gear line on the line as a second name', () => {
    for (const idea of IDEAS) {
      const key = nameKey(idea.name);
      const own = MODIFIERS.filter((m) => nameKey(m.name) === key);
      const onLine = MODIFIERS.filter((m) => m.also.includes(idea.name));
      expect(own.length + onLine.length, idea.name).toBe(1);
    }
    // An idea built as a lab talent is no longer an idea: its entry shows the lab status.
    const built = new Set(Object.values(TALENTS).map((t) => nameKey(t.name)));
    for (const m of MODIFIERS.filter((x) => x.status === 'idea'))
      expect(built.has(nameKey(m.name)), m.name).toBe(false);
    expect(MODIFIERS.find((m) => m.id === 'rally-cry')?.also).toContain('Vengeful');
  });

  it('shows a talent added to the lab with no change here', () => {
    const talent = {
      id: 'brand-new',
      name: 'Brand New Trick',
      text: 'Its {Boost} +9%.',
      roles: ['support'],
      intent: 'x',
      fx: { boostBonusBp: 900 },
    } as const;
    const more = buildModifiers([...Object.values(TALENTS), talent]);
    const m = more.find((x) => x.id === 'talent-brand-new');
    expect(m).toMatchObject({
      status: 'lab',
      category: 'support',
      roles: ['support'],
      text: 'Its Boost +9%.',
    });
    // A new talent with the name of a gear line or an idea joins that entry.
    const same = buildModifiers([{ ...talent, id: 'x', name: 'Finisher' }]);
    expect(same.find((x) => x.name === 'Finisher')).toMatchObject({
      status: 'lab',
      talents: ['x'],
    });
  });
});
