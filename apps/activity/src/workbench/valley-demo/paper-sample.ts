import { composePaper, emptyLog, type Paper, type PaperLog } from '@creatures/game';
import type { Creature } from '../../api';

/**
 * The welcome-back Gazette's paper on real output (phase 5 step 4) for the workbench: what the server's arrival pass would have written
 * for three kinds of return, built with the same `composePaper` the server uses, from the demo's own creatures.
 * `short`: a day or so away, `long`: a week and more (the paper is no longer, it groups more), `push on`: a short absence in which an
 * Expert scout found a way deeper (the paper's one decision).
 */
export const VALLEY_PAPERS = ['off', 'short absence', 'long absence', 'push on'] as const;

const piece = (id: string, rarity: 'common' | 'rare' | 'epic', level: number) => ({
  id,
  baseId: 'kelp-cap',
  rarity,
  level,
});

export function samplePaper(
  kind: string,
  creatures: readonly Creature[],
  at: number,
): Paper | null {
  if (kind === 'off' || creatures.length < 3) return null;
  const ids = creatures.map((c) => c.id);
  const [a = '', b = '', c = '', d = ''] = ids;
  const newest = creatures[creatures.length - 1];
  const log: PaperLog = { ...emptyLog() };
  if (kind === 'long absence') {
    Object.assign(log, {
      newcomers: [
        { creatureId: newest?.id ?? c, species: newest?.species ?? 'splashet', by: a },
        { creatureId: c, species: creatures[2]?.species ?? 'cindle', by: b },
        { creatureId: d || b, species: creatures[3]?.species ?? 'mossback', by: a },
      ],
      newcomerCount: 3,
      duplicates: 4,
      gear: [
        { item: piece('w-1', 'epic', 9), by: a },
        { item: piece('w-2', 'rare', 8), by: b },
        { item: piece('w-3', 'common', 7), by: a },
      ],
      gearCount: 7,
      blueprints: [{ baseId: 'kelp-cap', by: b }],
      blueprintCount: 2,
      pages: 3,
      packsFull: [a, b],
      forge: { count: 11, byRarity: [8, 2, 1], best: [piece('w-4', 'epic', 9)], by: b },
      mastery: [{ post: 'scout', creatureId: a, step: 3 }],
      xp: [{ creatureId: c, gained: 800, levels: 3 }],
      moment: { creatureId: c, turn: 1 },
      brought: { acorns: 480, scrap: 310, shards: 41 },
    } satisfies Partial<PaperLog>);
  } else {
    Object.assign(log, {
      newcomers: [{ creatureId: newest?.id ?? c, species: newest?.species ?? 'splashet', by: a }],
      newcomerCount: 1,
      gear: [{ item: piece('s-1', 'rare', 5), by: a }],
      gearCount: 2,
      forge: { count: 3, byRarity: [2, 1, 0], best: [piece('s-2', 'rare', 5)], by: b },
      xp: [{ creatureId: c, gained: 120, levels: 1 }],
      moment: { creatureId: c, turn: 0 },
      brought: { acorns: 130, scrap: 60, shards: 7 },
    } satisfies Partial<PaperLog>);
  }
  const { headlines, more } = composePaper(log);
  return {
    id: kind,
    at,
    awayHours: kind === 'long absence' ? 9 * 24 : kind === 'push on' ? 8 : 26,
    headlines,
    more,
    brought: log.brought,
    decision:
      kind === 'push on'
        ? { kind: 'push-on', seatId: 'seat-1', creatureId: a, destination: 'ember-caves' }
        : null,
  };
}
