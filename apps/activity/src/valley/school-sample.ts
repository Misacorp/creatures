/**
 * Sample School answers (the workbench and the tests): the School as the server sends it (`GET /api/valley/school`), with a talent from
 * combat v2's real library, and a valley view carrying trials and the ceremony. The stay is Monday 00:00 to Thursday 00:00 in Helsinki
 * (Sunday 22:00 UTC), the week of 2026-11-09, as the server counts it.
 */
import { combatV2 } from '@creatures/game/combat-v2';
import type { ValleyTrialView } from '@creatures/game';
import type { SchoolState, ValleyVisit } from '../api';

/** The stay's first and last moments (epoch ms): Monday 00:00 and Thursday 00:00, Helsinki. */
export const STAY_FROM = Date.UTC(2026, 10, 8, 22);
export const STAY_UNTIL = STAY_FROM + 3 * 24 * 3_600_000;
/** A moment of the stay (Monday noon, Helsinki) and the Friday before it. */
export const STAY_NOON = STAY_FROM + 10 * 3_600_000;
export const FRIDAY_BEFORE = STAY_FROM - 3 * 24 * 3_600_000 + 10 * 3_600_000;

/** The teacher's talent: from the real library. */
export const SAMPLE_TALENT = 'first-pounce';

const def = combatV2.talents[SAMPLE_TALENT];
if (def === undefined) throw new Error('the sample talent is not in combat v2');

/** The School while the teacher is here (or announced), with the given students and the creatures that would learn. */
export function sampleSchool(
  options: {
    phase?: 'here' | 'announced' | 'away';
    /** Creature ids at seat 0 and seat 1 (null: empty). */
    seated?: readonly (string | null)[];
    wouldLearn?: readonly string[];
    talent?: boolean;
  } = {},
): SchoolState {
  const phase = options.phase ?? 'here';
  const seated = options.seated ?? [null, null];
  const open = phase !== 'away';
  const talent = open && options.talent !== false;
  return {
    phase,
    talent: talent ? { id: def.id, name: def.name, text: def.text } : null,
    arrivesAt: open ? STAY_FROM : null,
    leavesAt: open ? STAY_UNTIL : null,
    seats: [0, 1].map((index) => {
      const creatureId = seated[index] ?? null;
      return {
        index,
        creatureId,
        learnsAt: creatureId === null ? null : STAY_FROM + 24 * 3_600_000,
      };
    }),
    wouldLearn: open ? [...(options.wouldLearn ?? [])] : [],
  };
}

/** The next trial with some boxes ticked (the first `ticked` of Bronze's four). */
export function sampleTrial(
  options: { honour?: 0 | 1 | 2 | 3; ticked?: number; ready?: boolean } = {},
): ValleyTrialView {
  const honour = options.honour ?? 0;
  const tier = honour >= 3 ? null : ((honour + 1) as 1 | 2 | 3);
  const count = tier === null ? 0 : tier === 1 ? 4 : 3;
  const ticked = options.ready === true ? count : (options.ticked ?? 0);
  return {
    honour,
    tier,
    boxes: Array.from({ length: count }, (_, i) => i < ticked),
    ready: options.ready === true,
  };
}

/** A valley view with trials for some creatures and the ceremony's count (everything else as it was). */
export function withTrials(
  visit: ValleyVisit,
  trials: Readonly<Record<string, ValleyTrialView>>,
  graduation?: { ready: number; nextAt: number },
): ValleyVisit {
  return {
    ...visit,
    creatures: visit.creatures.map((c) => {
      const trial = trials[c.id];
      return trial === undefined ? c : { ...c, trial };
    }),
    ...(graduation === undefined ? {} : { graduation }),
  };
}
