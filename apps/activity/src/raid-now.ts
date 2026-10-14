/**
 * The one "what to do now" line at the top of the Raid tab, worked out from the raid view. Pure:
 * the screen shows `label` (with `detail` beneath it) and, when there is a `target`, makes it a
 * button that scrolls to that part or runs that action. The server still decides everything.
 */
import { bannerText, type FinaleWindow } from './live';
import type { RaidView } from './raid-api';
import { eventTitle } from './raid-time';
import { formatCountdown, formatZoned } from './time-format';

/** What the action leads to: the placement step or the live finale. */
export type NowTarget = 'placement' | 'live';

type NowKind =
  | 'set-team'
  | 'watch-live'
  | 'countdown'
  | 'finale-countdown'
  | 'resolving'
  | 'week-done'
  | 'sitting-out'
  | 'not-in';

interface NowAction {
  kind: NowKind;
  /** The line itself, for example "Phase 1 in 2 h 10 m". */
  label: string;
  /** A smaller line under it (when the event happens), or null. */
  detail: string | null;
  /** Null when there is nothing to tap: the line is only a status. */
  target: NowTarget | null;
}

type NowView = Pick<RaidView, 'next' | 'schedule' | 'timezone' | 'party'> & {
  you: Pick<RaidView['you'], 'inRoster' | 'optOut' | 'canEdit' | 'canOptOut' | 'team'>;
};

/** True when the player is in a party, may still edit, and has a team creature without a slot. */
export function needsPlacement(view: Pick<NowView, 'party' | 'you'>): boolean {
  const { team, canEdit } = view.you;
  return (
    view.party !== null &&
    team !== null &&
    canEdit &&
    team.creatures.some((creature) => creature.slot === null)
  );
}

export function nowAction(view: NowView, finale: FinaleWindow, serverNow: number): NowAction {
  const { you, next, party } = view;
  // A week sat out earlier (the sit-out button is gone, the server still keeps the choice).
  if (you.optOut) {
    return {
      kind: 'sitting-out',
      label: 'You are sitting this week out',
      detail: null,
      target: null,
    };
  }
  if (party === null && next !== null && !you.inRoster) {
    return {
      kind: 'not-in',
      label: "You are not in this week's raid",
      detail: 'Pick a starter and open the game to join.',
      target: null,
    };
  }
  if (party !== null && (finale === 'lobby' || finale === 'live')) {
    return {
      kind: 'watch-live',
      label: 'Watch live',
      detail: bannerText(finale, view.schedule.finale, serverNow),
      target: 'live',
    };
  }
  if (next === null) {
    return {
      kind: 'week-done',
      label: `Next boss ${formatZoned(view.schedule.weekStart, view.timezone, 'long')}`,
      detail: `Times are in ${view.timezone}.`,
      target: null,
    };
  }
  const title = eventTitle(next.event);
  const when = formatZoned(next.at, view.timezone, 'short');
  if (needsPlacement(view)) {
    return {
      kind: 'set-team',
      label: 'Set your team',
      detail: `${title} ${when}. Unplaced creatures are placed for you.`,
      target: 'placement',
    };
  }
  const remaining = next.at - serverNow;
  if (remaining <= 0) {
    return { kind: 'resolving', label: `${title} is happening now`, detail: null, target: null };
  }
  return {
    kind: next.event === 'finale' ? 'finale-countdown' : 'countdown',
    label: `${title} in ${formatCountdown(remaining, 'short')}`,
    detail: `${when} (${view.timezone})`,
    target: null,
  };
}
