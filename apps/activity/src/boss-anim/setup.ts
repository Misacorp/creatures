import type { FightBossV2, FightCreatureV2 } from '../fight-v2-api';
import type { BossCardV2 } from '../raid-v2-api';
import type { BossAnimSetup } from '../use-playback-v2';

/**
 * What the playback needs to animate a raid boss's moves: the boss, its grid (as the stage draws it: the boss's columns or, when the
 * party stands wider, the party's) and the shapes of its moves from the boss card. The replay and the live finale both pass this.
 */
export function bossAnimSetup(
  boss: FightBossV2,
  card: BossCardV2,
  fighters: readonly Pick<FightCreatureV2, 'col'>[],
): BossAnimSetup {
  return {
    bossId: boss.id,
    element: boss.element,
    grid: { rows: boss.rows, cols: Math.max(boss.cols, ...fighters.map((f) => f.col + 1)) },
    moves: card.moves.map((m) => ({ id: m.id, name: m.name, shape: m.shape })),
    plainShape: card.plain.shape,
  };
}
