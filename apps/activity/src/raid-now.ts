/**
 * The one "what to do now" line at the top of the Raid tab, worked out from the raid view. Pure:
 * the screen shows `label` (with `detail` beneath it) and, when there is a `target`, makes it a
 * button that scrolls to that part or runs that action. The server still decides everything.
 */
import { RULES } from '@creatures/game';
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
  you: Pick<RaidView['you'], 'inRoster' | 'canEdit' | 'team'>;
};

/**
 * True when the Raid tab should ask the player to place creatures: they may edit and either have not
 * joined (placing a creature joins them) or have fewer on the board than they could bring. `owned` is how
 * many creatures they have; one who owns fewer than three cannot place three.
 */
export function needsPlacement(
  view: Pick<NowView, 'party' | 'you'>,
  owned: number = RULES.raid.teamSize,
): boolean {
  const { team, canEdit, inRoster } = view.you;
  if (view.party === null || !canEdit) return false;
  if (!inRoster) return true;
  return (team?.creatures.length ?? 0) < Math.min(RULES.raid.teamSize, owned);
}

export function nowAction(
  view: NowView,
  finale: FinaleWindow,
  serverNow: number,
  owned: number = RULES.raid.teamSize,
): NowAction {
  const { you, next, party } = view;
  if (party === null && next !== null && !you.inRoster) {
    return {
      kind: 'not-in',
      label: "You are not in this week's raid",
      detail: 'You join a raid by placing a creature on its board before Phase 1.',
      target: null,
    };
  }
  if (you.inRoster && (finale === 'lobby' || finale === 'live')) {
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
  if (needsPlacement(view, owned)) {
    return you.inRoster
      ? {
          kind: 'set-team',
          label: 'Set your team',
          detail: `${title} ${when}. Only the creatures you place fight.`,
          target: 'placement',
        }
      : {
          kind: 'set-team',
          label: "Join this week's raid",
          detail: `Place a creature on the board before ${title} ${when}.`,
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
