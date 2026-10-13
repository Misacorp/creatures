import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { bossIcons } from './boss-icons';

function boss(id: string) {
  const def = content.bosses.find((b) => b.id === id);
  if (def === undefined) throw new Error(`no boss ${id}`);
  return {
    id: def.id,
    turnOrder: def.turnOrder,
    gimmicks: def.gimmicks.map((g) => ({ id: g.id, name: g.id })),
  };
}

describe('bossIcons', () => {
  it('starts with the turn order, then one icon for each trick', () => {
    const icons = bossIcons(boss('tidal-colossus'));
    expect(icons.map((i) => i.kind)).toEqual(['turn', 'gimmick']);
    expect(icons[0]).toMatchObject({
      glyph: 'left_to_right',
      caption: 'Left to right',
      detail: 'Creatures act from left to right.',
    });
  });

  it('carries the boss-specific details that used to sit in "How the boss fights"', () => {
    const trick = bossIcons(boss('tidal-colossus')).find((i) => i.kind === 'gimmick');
    expect(trick?.glyph).toBe('hit_zone');
    expect(trick?.detail).toMatch(/front zone/);
    expect(trick?.general).not.toBeNull();
  });

  it('gives every boss in the content an icon for each trick, each with glossary text', () => {
    for (const def of content.bosses) {
      const icons = bossIcons(boss(def.id));
      expect(icons).toHaveLength(1 + def.gimmicks.length);
      for (const icon of icons) {
        expect(icon.general, `${def.id} ${icon.key}`).not.toBeNull();
        expect(icon.detail).not.toBe('');
        expect(icon.label).toContain('?');
      }
    }
  });

  it('keeps a trick the content does not know, with a plain icon', () => {
    const icons = bossIcons({
      id: 'unknown-boss',
      turnOrder: 'speed',
      gimmicks: [{ id: 'mystery', name: 'Mystery' }],
    });
    expect(icons[1]).toMatchObject({ glyph: '', title: 'Mystery', general: null });
  });
});
