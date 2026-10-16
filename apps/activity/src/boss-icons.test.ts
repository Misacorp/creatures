import { bossAtRank, content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { bossIcons } from './boss-icons';

function boss(id: string, rank = 10) {
  const def = content.bosses.find((b) => b.id === id);
  if (def === undefined) throw new Error(`no boss ${id}`);
  return {
    id: def.id,
    turnOrder: def.turnOrder,
    // As the server sends it: the moves at the week's rank, a gated one with its `fromRank`.
    gimmicks: bossAtRank(def, rank).gimmicks.map((g) => ({
      id: g.id,
      name: g.id,
      ...(g.fromRank === undefined ? {} : { fromRank: g.fromRank }),
    })),
  };
}

describe('bossIcons', () => {
  it('starts with the turn order, then one icon for each trick', () => {
    const icons = bossIcons(boss('tidal-colossus'));
    const tricks = content.bosses.find((b) => b.id === 'tidal-colossus')?.gimmicks ?? [];
    expect(icons.map((i) => i.kind)).toEqual(['turn', ...tricks.map(() => 'gimmick')]);
    expect(tricks).toHaveLength(5);
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

  it('shows only the tricks of the rank, and tags a trick that is new at this rank', () => {
    const keys = (rank: number) =>
      bossIcons(boss('tidal-colossus', rank), rank).map((i) => i.key.replace('gimmick:', ''));
    expect(keys(1)).toEqual(['turn:left_to_right', 'undertow', 'riptide', 'great-wave']);
    expect(keys(4)).toContain('deepwater-spear');
    expect(keys(4)).not.toContain('spring-tide');
    expect(keys(7)).toContain('spring-tide');
    const newOnes = (rank: number) =>
      bossIcons(boss('tidal-colossus', rank), rank)
        .filter((i) => i.newAtRank !== null)
        .map((i) => [i.key, i.newAtRank]);
    expect(newOnes(1)).toEqual([]);
    expect(newOnes(4)).toEqual([['gimmick:deepwater-spear', 4]]);
    // Rank 5 has the rank-4 trick but it is no longer new; with no rank known nothing is tagged.
    expect(newOnes(5)).toEqual([]);
    expect(bossIcons(boss('tidal-colossus', 7)).every((i) => i.newAtRank === null)).toBe(true);
    const tagged = bossIcons(boss('tidal-colossus', 4), 4).find((i) => i.newAtRank !== null);
    expect(tagged?.detail).toMatch(/New at rank 4\.$/);
    expect(tagged?.label).toContain('new at rank 4');
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
