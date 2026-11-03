/** The report's "Similar behaviours" section: content grouped by what it does (retro 2026-11-01, proposal 2). */
import { describe, expect, it } from 'vitest';
import { similarBehaviours } from '../src/behaviours';
import { KNACKS } from '../src/knacks';

const { markdown, data } = similarBehaviours();
const text = markdown.join('\n');

describe('the similar behaviours section', () => {
  it('has its heading and one table per kind of content', () => {
    expect(text).toContain('## Similar behaviours');
    for (const h of ['### Knacks and talents', '### Boss and foe moves', '### Rule cards'])
      expect(text).toContain(h);
  });

  it('groups Knacks that use the same fields, with their numbers and what they share', () => {
    const known = ['clear-skies', 'sunbeam'];
    for (const id of known) expect(KNACKS[id]?.fx).toHaveProperty('support');
    const groups = data['effectGroups'] as { fields: string; members: string[] }[];
    const support = groups.find((g) => g.fields === 'support');
    expect(support?.members).toEqual(expect.arrayContaining(known.map((id) => `Knack:${id}`)));
    const row = markdown.find((l) => l.startsWith('| support |')) ?? '';
    expect(row).toContain(KNACKS['clear-skies']?.name);
    expect(row).toContain(KNACKS['sunbeam']?.name);
    expect(row).toMatch(/families \(/);
    // Every group has two or more members.
    for (const g of groups) expect(g.members.length).toBeGreaterThanOrEqual(2);
  });

  it('flags pairs whose field sets are one field apart', () => {
    const near = data['effectNear'] as { a: string[]; b: string[] }[];
    const ids = (n: { a: string[]; b: string[] }) => [...n.a, ...n.b];
    // Detonate (bonus, spend all) and All at Once (the same and a minimum of stacks).
    expect(
      near.some((n) => ids(n).includes('Knack:detonate') && ids(n).includes('Knack:all-at-once')),
    ).toBe(true);
  });

  it('lists the library moves by label, and none twice for one element', () => {
    expect(data['moveClashes']).toEqual([]);
    const labels = data['moveLabels'] as { label: string; elements: string[] }[];
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l.elements.length).toBeGreaterThanOrEqual(2);
  });

  it('groups the rule cards by operation kind', () => {
    const groups = data['cardGroups'] as { op: string; cards: string[] }[];
    const flags = groups.find((g) => g.op === 'flag');
    expect(flags?.cards.length).toBeGreaterThanOrEqual(2);
    expect(markdown.some((l) => l.startsWith('| flag |') && l.includes('shedMarks'))).toBe(true);
  });
});
