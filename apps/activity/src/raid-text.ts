/** Plain-words text for the raid tab. Boss details come from the shared content pack. */
import type { Zone } from '@creatures/engine';
import { RULES, content, type BossDef } from '@creatures/game';
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

/**
 * The phase's place in the week, for the top left of the fight stage: "Phase 1 / 3", "Phase 2 / 3".
 * The finale is a phase too (the third) but goes by its own name, "Finale", as it does everywhere else.
 */
export function phaseLine(phase: RaidPhaseId): string {
  if (phase === 'finale') return phaseName(phase);
  const place = RULES.raid.phases.findIndex((p) => p.id === phase) + 1;
  return `Phase ${String(place)} / ${String(RULES.raid.phases.length)}`;
}

type Gimmick = BossDef['gimmicks'][number];

function percent(bp: number): string {
  return `${String(Math.round(bp / 100))}%`;
}

function when(g: Gimmick): string {
  return 'eachRound' in g.trigger ? 'Every round' : `Every ${String(g.trigger.every)} rounds`;
}

/** The creature at each place of the dungeon's row, by the zone that is that one creature. */
const ROW_PLACE: Readonly<Record<Zone, string>> = {
  front: 'left',
  middle: 'middle',
  back: 'right',
};

/**
 * One gimmick in plain words, for example "Every 3 rounds: hits every creature in the front zone for
 * 80% of its attack." `row` (the dungeon, where the team is one row of three and each zone is the one
 * creature at that place) says "hits the left creature" instead of naming a zone.
 */
export function gimmickText(g: Gimmick, wording: 'zones' | 'row' = 'zones'): string {
  switch (g.op) {
    case 'hit_zone':
      return wording === 'row'
        ? `${when(g)}: hits the ${ROW_PLACE[g.zone]} creature for ${percent(g.power)} of its attack.`
        : `${when(g)}: hits every creature in the ${g.zone} zone for ${percent(g.power)} of its attack.`;
    case 'silence_ends':
      return `${when(g)}: silences the creatures at both ends of the row for ${String(g.turns)} turn${g.turns === 1 ? '' : 's'}.`;
    case 'reflect_first_reaction':
      return `${when(g)}: turns the first reaction of the round back on the creature that set it off.`;
    case 'strike_highest_atk':
      return `${when(g)}: strikes your highest-attack creature for ${percent(g.power)} of its attack.`;
  }
}

/** A few words for a gimmick's icon label, for example "Hits the front zone, every 3 rounds". */
export function gimmickShort(g: Gimmick): string {
  const every =
    'eachRound' in g.trigger ? 'every round' : `every ${String(g.trigger.every)} rounds`;
  switch (g.op) {
    case 'hit_zone':
      return `Hits the ${g.zone} zone, ${every}`;
    case 'silence_ends':
      return `Silences the row's ends, ${every}`;
    case 'reflect_first_reaction':
      return `Reflects a reaction, ${every}`;
    case 'strike_highest_atk':
      return `Strikes your top attacker, ${every}`;
  }
}

/**
 * Plain-words gimmick lines for a boss id: the server's name, the gimmick's `op` (it picks the icon),
 * a short label and the full sentence. Falls back to the names the server sent, with no op.
 */
export function gimmickLines(
  bossId: string,
  fallback: readonly { id: string; name: string }[],
): { id: string; name: string; op: string | null; short: string; text: string }[] {
  const boss = content.bosses.find((b) => b.id === bossId);
  return fallback.map((g) => {
    const def = boss?.gimmicks.find((d) => d.id === g.id);
    return {
      id: g.id,
      name: g.name,
      op: def?.op ?? null,
      short: def === undefined ? '' : gimmickShort(def),
      text: def === undefined ? '' : gimmickText(def),
    };
  });
}
