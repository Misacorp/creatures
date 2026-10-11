/** Plain-words text for the raid tab. Boss details come from the shared content pack. */
import { content, type BossDef } from '@creatures/game';
import type { RaidPhaseId } from './raid-api';

export function turnOrderText(turnOrder: string): string {
  switch (turnOrder) {
    case 'left_to_right':
      return 'Creatures act from left to right.';
    case 'right_to_left':
      return 'Creatures act from right to left.';
    case 'speed':
      return 'Creatures act fastest first (highest Speed).';
    default:
      return 'Creatures act in a set order.';
  }
}

export function turnOrderShort(turnOrder: string): string {
  switch (turnOrder) {
    case 'left_to_right':
      return 'Left to right';
    case 'right_to_left':
      return 'Right to left';
    case 'speed':
      return 'By Speed';
    default:
      return 'Set order';
  }
}

const PHASE_NAMES: Record<RaidPhaseId, string> = {
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  finale: 'Finale',
};

export function phaseName(phase: RaidPhaseId): string {
  return PHASE_NAMES[phase];
}

type Gimmick = BossDef['gimmicks'][number];

function percent(bp: number): string {
  return `${String(Math.round(bp / 100))}%`;
}

function when(g: Gimmick): string {
  return 'eachRound' in g.trigger ? 'Every round' : `Every ${String(g.trigger.every)} rounds`;
}

/** One gimmick in plain words, for example "Every 3 rounds: hits the front zone for 80% of its attack." */
export function gimmickText(g: Gimmick): string {
  switch (g.op) {
    case 'hit_zone':
      return `${when(g)}: hits every creature in the ${g.zone} zone for ${percent(g.power)} of its attack.`;
    case 'silence_ends':
      return `${when(g)}: silences the creatures at both ends of the row for ${String(g.turns)} turn${g.turns === 1 ? '' : 's'}.`;
    case 'reflect_first_reaction':
      return `${when(g)}: turns the first reaction of the round back on the creature that set it off.`;
    case 'strike_highest_atk':
      return `${when(g)}: strikes your highest-attack creature for ${percent(g.power)} of its attack.`;
  }
}

/** Plain-words gimmick lines for a boss id. Falls back to the gimmick names the server sent. */
export function gimmickLines(
  bossId: string,
  fallback: readonly { id: string; name: string }[],
): { id: string; name: string; text: string }[] {
  const boss = content.bosses.find((b) => b.id === bossId);
  return fallback.map((g) => {
    const def = boss?.gimmicks.find((d) => d.id === g.id);
    return { id: g.id, name: g.name, text: def === undefined ? '' : gimmickText(def) };
  });
}
