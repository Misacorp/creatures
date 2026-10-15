/**
 * The round count the fight stage shows ("Round 2 / 6"). It is always the fight's LIMIT from the
 * content, never how long the pre-computed fight actually lasted: a fight that ended after 3 rounds
 * must not show "Round 2 / 3" while it plays, because the 3 would give the result away (Misa,
 * 2026-10-15). The functions here take an id and read the limit from the content, so the stored
 * fight's own round count cannot be passed in by accident. Pure; text only.
 */
import { RULES, content, dungeonContent } from '@creatures/game';
import type { RaidPhaseId } from './raid-api';

/** "Round 2 / 6", or just "Round 2" when the fight has no known limit. */
export function roundLabel(round: number, max: number | null): string {
  return max === null ? `Round ${String(round)}` : `Round ${String(round)} / ${String(max)}`;
}

/**
 * The most rounds a dungeon room's fight lasts: the `rounds` of its foe in the content (up to
 * `MAX_ROOM_ROUNDS`). Null for a foe the content does not have (an old run's retired foe).
 */
export function roomMaxRounds(foeId: string): number | null {
  return dungeonContent.foes.find((f) => f.id === foeId)?.rounds ?? null;
}

/**
 * The most rounds a raid fight lasts: the finale's is the boss's own `finaleRounds`, a phase's is the
 * phase's `rounds` in the rules (the same limits the server plays the fight with). A finale of a boss
 * the content does not have falls back to the rules' finale entry; an unknown phase has no limit.
 */
export function raidMaxRounds(phase: RaidPhaseId, bossId: string): number | null {
  if (phase === 'finale') {
    const boss = content.bosses.find((b) => b.id === bossId);
    if (boss !== undefined) return boss.finaleRounds;
  }
  return RULES.raid.phases.find((p) => p.id === phase)?.rounds ?? null;
}
