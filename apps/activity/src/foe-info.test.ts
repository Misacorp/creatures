import { content, dungeonContent, roomModifier } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { foeButtonLabel, foeElement, foeInfoOf } from './foe-info';
import { modifierGimmicks } from './dungeon-playback';
import { gimmickText } from './raid-text';

describe('foeElement', () => {
  it('reads the element of every dungeon foe and raid boss from the content', () => {
    for (const foe of dungeonContent.foes) expect(foeElement(foe.id), foe.id).toBe(foe.element);
    for (const boss of content.bosses) expect(foeElement(boss.id), boss.id).toBe(boss.element);
  });

  it('is null for an id the content does not have', () => {
    expect(foeElement('retired-foe')).toBeNull();
  });
});

describe('foeInfoOf', () => {
  it('tells a dungeon foe: name, element, HP, its flavour and what it does', () => {
    const foe = dungeonContent.foes.find((f) => f.gimmicks.length > 0);
    if (foe === undefined) throw new Error('no foe with a trick');
    const info = foeInfoOf({ id: foe.id, name: foe.name, hp: 321, wording: 'row' });
    expect(info.name).toBe(foe.name);
    expect(info.element).toBe(foe.element);
    expect(info.hp).toBe(321);
    expect(info.about).toBe(foe.flavor);
    // The basic attack, then one line per trick, each led by the trick's own name.
    expect(info.moves).toHaveLength(1 + foe.gimmicks.length);
    expect(info.moves[0]).toMatch(/^Attack\./);
    foe.gimmicks.forEach((g, i) => {
      expect(info.moves[i + 1]).toBe(`${g.name}. ${gimmickText(g, 'row')}`);
    });
  });

  it('gives a foe with no trick only its attack', () => {
    const foe = dungeonContent.foes.find((f) => f.gimmicks.length === 0);
    if (foe === undefined) throw new Error('no foe without a trick');
    const info = foeInfoOf({ id: foe.id, name: foe.name, hp: 100, wording: 'row' });
    expect(info.moves).toHaveLength(1);
  });

  it("uses the element the server sent, and the content's when it sent none", () => {
    const foe = dungeonContent.foes[0];
    if (foe === undefined) throw new Error('no foes');
    const sent = foeInfoOf({ id: foe.id, name: 'X', element: 'spark', hp: 1, wording: 'row' });
    expect(sent.element).toBe('spark');
    expect(foeInfoOf({ id: foe.id, name: 'X', hp: 1, wording: 'row' }).element).toBe(foe.element);
    expect(foeInfoOf({ id: 'retired-foe', name: 'X', hp: 1, wording: 'row' }).element).toBe(
      'unknown',
    );
  });

  it("adds what the room's modifier gives the foe, once", () => {
    const thorns = modifierGimmicks({
      modifier: { id: 'thorns', name: 'Thorns', description: '' },
    });
    expect(roomModifier('thorns')).toBeDefined();
    expect(thorns.length).toBeGreaterThan(0);
    const foe = dungeonContent.foes[0];
    if (foe === undefined) throw new Error('no foes');
    const args = { id: foe.id, name: foe.name, hp: 1, wording: 'row' } as const;
    const base = foeInfoOf(args);
    const once = foeInfoOf({ ...args, added: thorns });
    expect(once.moves).toHaveLength(base.moves.length + thorns.length);
    const twice = foeInfoOf({ ...args, added: [...thorns, ...thorns] });
    expect(twice.moves).toHaveLength(base.moves.length + thorns.length);
  });

  it('tells a raid boss with its description and tricks, worded for zones', () => {
    const boss = content.bosses.find((b) => b.gimmicks.some((g) => g.op === 'hit_zone'));
    if (boss === undefined) throw new Error('no boss with a zone hit');
    const info = foeInfoOf({ id: boss.id, name: boss.name, hp: 5000, wording: 'zones' });
    expect(info.element).toBe(boss.element);
    expect(info.about).not.toBeNull();
    expect(info.moves).toHaveLength(1 + boss.gimmicks.length);
    expect(info.moves.join(' ')).toContain('zone');
  });

  it('writes no basis points into the lines', () => {
    for (const foe of dungeonContent.foes) {
      const info = foeInfoOf({ id: foe.id, name: foe.name, hp: 1, wording: 'row' });
      for (const line of info.moves) expect(line).not.toMatch(/\d{4,}/);
    }
  });
});

describe('foeButtonLabel', () => {
  it('keeps the name and says what it opens', () => {
    expect(foeButtonLabel('Puddle Imp')).toBe('Puddle Imp. Shows its element, HP and moves.');
  });
});
