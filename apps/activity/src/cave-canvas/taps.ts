/**
 * What a tap or a drop means on the Cave canvas, as pure functions (`docs/design/dungeon-canvas.md`, "Actions"): which drawer a tap opens,
 * which one opens by itself (a choice the run is waiting on), and what a creature let go of does. Names are text only.
 */
import {
  ROW_PLACES,
  placedCount,
  place,
  resolveDrop,
  slotIndexOf,
  unplace,
  type Slots,
} from '../dungeon-team';
import type { DungeonRunState } from '../dungeon-types';
import {
  CANCEL_ANNOUNCEMENT,
  dropOutcome,
  type DropOutcome,
  type DropTarget,
} from '../slot-outcome';
import type { CaveView } from './hold';
import type { NowTap } from './now-line';

/** The right drawer: the one thing tapped. */
export type RightPanel =
  | { kind: 'room'; id: string }
  | { kind: 'enter' }
  | { kind: 'mine'; creatureId: string }
  | { kind: 'event' }
  | { kind: 'camp' }
  | { kind: 'descend' }
  | { kind: 'result' }
  | { kind: 'blocked' }
  | { kind: 'retry' };

/** The left drawer: overviews that belong to no one spot. `log` only while a fight plays. */
export type LeftPanel = 'pack' | 'route' | 'log';

/** The panel of a choice the run waits on (a mystery room's, the camp's, the way down), or null. */
export function pendingPanel(state: Pick<DungeonRunState, 'pending'>): RightPanel | null {
  switch (state.pending?.kind) {
    case 'event':
      return { kind: 'event' };
    case 'camp':
      return { kind: 'camp' };
    case 'descend':
      return { kind: 'descend' };
    default:
      return null;
  }
}

/** What stands open by itself on the screen as it is: a reason ("Not today"), the first-day retry card, a choice, the result. */
export function autoPanel(input: {
  view: CaveView;
  blocked: boolean;
  retry: boolean;
}): RightPanel | null {
  const { view } = input;
  switch (view.kind) {
    case 'setup':
      return input.blocked ? { kind: 'blocked' } : input.retry ? { kind: 'retry' } : null;
    case 'run':
      return pendingPanel(view.state);
    case 'results':
      return { kind: 'result' };
    default:
      return null;
  }
}

/** A key that changes whenever the screen changes what should stand open by itself, and not otherwise (a tapped room keeps its drawer). */
export function autoKey(input: { view: CaveView; blocked: boolean; retry: boolean }): string {
  const { view } = input;
  switch (view.kind) {
    case 'setup':
      return input.blocked ? 'blocked' : input.retry ? 'retry' : 'setup';
    case 'run':
      return view.state.pending === null
        ? 'run'
        : `run:${view.state.pending.kind}:${String(view.state.step)}`;
    case 'results':
      return `results:${view.run.id}`;
    default:
      return view.kind;
  }
}

/** What a tap on the now line opens. */
export function nowTapPanel(
  tap: NowTap,
  state: Pick<DungeonRunState, 'pending'> | null,
): RightPanel | null {
  switch (tap) {
    case 'enter':
      return { kind: 'enter' };
    case 'blocked':
      return { kind: 'blocked' };
    case 'result':
      return { kind: 'result' };
    case 'pending':
      return state === null ? null : pendingPanel(state);
    case null:
      return null;
  }
}

// --- The team at the cave mouth ---

/** The two places that are not a slot of the row: the tray (a drop there takes a creature off the team) and the cave mouth (a drop adds it). */
export const TRAY_SLOT = -1;
export const MOUTH_SLOT = -2;
export const TRAY_TARGET: DropTarget = { kind: 'slot', slot: TRAY_SLOT };
export const MOUTH_TARGET: DropTarget = { kind: 'slot', slot: MOUTH_SLOT };

export interface CaveDrop {
  slots: Slots;
  outcome: DropOutcome;
}

const outcome = (
  status: DropOutcome['status'],
  hint: string | null,
  announce: string,
): DropOutcome => dropOutcome<never>(status, null, hint, announce);

/**
 * A hand carrying creature `id` lets go (before a run; `busy` while the run is being sent). On the tray: off the team. On the cave
 * mouth: onto the first free place, while the team has one. On a place of the row: a creature of the team moves there (or swaps), one
 * from the tray takes it (the one standing there goes back to the tray). Anywhere else is a cancel.
 */
export function resolveCaveDrop(
  slots: Slots,
  id: string,
  target: DropTarget | null,
  nameOf: (id: string) => string,
  busy = false,
): CaveDrop {
  const name = nameOf(id);
  if (busy) {
    return { slots, outcome: outcome('invalid', null, 'The run is being sent.') };
  }
  if (target === null) return { slots, outcome: outcome('none', null, CANCEL_ANNOUNCEMENT) };
  const from = slotIndexOf(slots, id);
  if (target.slot === TRAY_SLOT) {
    return from === null
      ? { slots, outcome: outcome('none', null, `${name} stays off the team.`) }
      : {
          slots: unplace(slots, id),
          outcome: outcome('valid', null, `${name} removed from the team.`),
        };
  }
  if (target.slot === MOUTH_SLOT) {
    if (from !== null)
      return { slots, outcome: outcome('none', null, `${name} is already on the team.`) };
    const free = slots.findIndex((s) => s === null);
    if (free < 0 || placedCount(slots) >= ROW_PLACES.length) {
      const hint = 'The team is full. Drop one on the tray first.';
      return { slots, outcome: outcome('invalid', hint, hint) };
    }
    return {
      slots: place(slots, id, free),
      outcome: outcome('valid', null, `${name} added to the team.`),
    };
  }
  if (from !== null) return resolveDrop(slots, id, target, nameOf);
  const spot = ROW_PLACES[target.slot];
  if (spot === undefined) {
    const hint = 'That place does not exist.';
    return { slots, outcome: outcome('invalid', hint, hint) };
  }
  const standing = slots[target.slot];
  if (standing !== null && standing !== undefined) {
    // The one that stood there goes back to the tray: still owned, no longer placed.
    return {
      slots: place(unplace(slots, standing), id, target.slot),
      outcome: outcome(
        'valid',
        null,
        `${name} takes the ${spot} place; ${nameOf(standing)} goes back to the tray.`,
      ),
    };
  }
  return {
    slots: place(slots, id, target.slot),
    outcome: outcome('valid', null, `${name} added to the ${spot} place.`),
  };
}
