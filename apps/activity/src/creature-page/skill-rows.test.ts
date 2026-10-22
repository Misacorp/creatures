import { describe, expect, it } from 'vitest';
import { sampleCreature } from '../creature-card-sample';
import { skillRows } from './skill-rows';

const creature = { ...sampleCreature('growing'), id: 'c1' };

function withExplorer(explorer: { rank: number; xp: number; nextRankXp: number | null }) {
  return { ...creature, explorer: { ...explorer, trips: 4 } };
}

describe('skillRows', () => {
  it('shows the XP into the explorer rank against the span to the next rank', () => {
    // Rank 3 starts at 800 XP and rank 4 at 2000.
    const [row] = skillRows(withExplorer({ rank: 3, xp: 1300, nextRankXp: 2000 }), undefined);
    expect(row).toMatchObject({
      kind: 'explorer',
      unit: 'Rank',
      level: 3,
      value: 500,
      max: 1200,
      top: false,
      text: '500 / 1200',
    });
  });

  it('shows a full bar and Max at the top rank', () => {
    const [row] = skillRows(withExplorer({ rank: 10, xp: 200_000, nextRankXp: null }), undefined);
    expect(row).toMatchObject({ level: 10, value: 1, max: 1, top: true, text: 'Max' });
  });

  it('leaves Crafting out until the skills are known, or when the creature has none', () => {
    expect(skillRows(creature, undefined).map((r) => r.kind)).toEqual(['explorer']);
    const other = [{ creatureId: 'x', xp: 0, level: 1, nextLevelXp: 100 }];
    expect(skillRows(creature, other).map((r) => r.kind)).toEqual(['explorer']);
  });

  it('shows Crafting after Explorer, from the level start to the next level', () => {
    // Level 3 starts at 250 XP and level 4 at 450.
    const rows = skillRows(creature, [{ creatureId: 'c1', xp: 320, level: 3, nextLevelXp: 450 }]);
    expect(rows.map((r) => r.kind)).toEqual(['explorer', 'crafting']);
    expect(rows[1]).toMatchObject({
      unit: 'Craft',
      level: 3,
      value: 70,
      max: 200,
      top: false,
      text: '70 / 200',
    });
  });

  it('shows a full bar and Max at the top Crafting level', () => {
    const rows = skillRows(creature, [
      { creatureId: 'c1', xp: 9000, level: 10, nextLevelXp: null },
    ]);
    expect(rows[1]).toMatchObject({ level: 10, top: true, text: 'Max' });
  });
});
