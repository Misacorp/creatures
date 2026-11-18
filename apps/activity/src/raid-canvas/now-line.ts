/**
 * The now line: the one line of text on the raid canvas's main view, always time-sensitive, a caption on the scene and a polite live
 * region (docs/design/combat/raid-screen.md, sections 1 and 6.4). When several messages apply the first wins:
 *
 *   an incoming swap request, a stage playing, the boss having fallen, still to place, the next time (and, with no raid, when the next
 *   one is).
 *
 * The round number shows only here. Pure: `nowInput` reads the raid view, `nowLine` decides. Every name in it is text.
 */
import { RULES } from '@creatures/game';
import { ACTION_NAME, isActionId } from '../finale-v2';
import type { RaidView } from '../raid-api';
import { incomingText } from '../raid-board-v2';
import { eventTitle } from '../raid-time';
import { earlyKillStage } from '../raid-timeline';
import { needsPlacement } from '../raid-now';
import { formatZoned } from '../time-format';
import { phaseOfStage, roundAt, type Playing } from './playing';

/** What a tap on the line opens: the thing it names. */
export type NowTap =
  | { kind: 'swap'; id: string }
  | { kind: 'log' }
  | { kind: 'weekend' }
  | { kind: 'place' }
  | { kind: 'order' }
  | null;

export type NowId = 'swap' | 'playing' | 'fell' | 'place' | 'next' | 'none';

export interface NowLine {
  id: NowId;
  text: string;
  tap: NowTap;
}

export interface NowInput {
  /** The first swap request asked of you, in words (no trailing full stop). */
  incoming: { id: string; text: string } | null;
  /** A stage is playing: its name and the round the clock is in (null before the first starts). */
  playing: { label: string; round: number | null; rounds: number | null } | null;
  /** The stage the boss fell in ("Stage 2"), when it fell before the finale. */
  fell: string | null;
  /** You may place and still have creatures to place: how many are on the board and how many seats you have. */
  toPlace: { placed: number; seats: number } | null;
  /** The next event of the week ("Stage 1", "Saturday 13:37"). */
  next: { title: string; when: string; finale: boolean } | null;
  /** When the next boss comes ("Monday 13:37"), for a week with nothing left. */
  nextBoss: string | null;
  /** Your finale action by name ("Shield Wall"), when you have one. */
  order: string | null;
}

export function nowLine(i: NowInput): NowLine {
  if (i.incoming !== null) {
    return { id: 'swap', text: i.incoming.text, tap: { kind: 'swap', id: i.incoming.id } };
  }
  if (i.playing !== null) {
    const round =
      i.playing.round !== null && i.playing.rounds !== null && i.playing.round > 0
        ? ` · round ${String(i.playing.round)} / ${String(i.playing.rounds)}`
        : '';
    return { id: 'playing', text: `${i.playing.label} is playing${round}`, tap: { kind: 'log' } };
  }
  if (i.fell !== null) {
    return { id: 'fell', text: `The boss fell in ${i.fell}`, tap: { kind: 'weekend' } };
  }
  const when = i.next === null ? null : `${i.next.title} ${i.next.when}`;
  if (i.toPlace !== null) {
    const head =
      i.toPlace.placed === 0
        ? `Place up to ${String(i.toPlace.seats)} creatures`
        : `${String(i.toPlace.placed)} / ${String(i.toPlace.seats)} placed`;
    return {
      id: 'place',
      text: when === null ? head : `${head} · ${when}`,
      tap: { kind: 'place' },
    };
  }
  if (i.next !== null && when !== null) {
    const order = i.next.finale && i.order !== null ? ` · your order: ${i.order}` : '';
    return {
      id: 'next',
      text: `${when}${order}`,
      tap: i.next.finale && i.order !== null ? { kind: 'order' } : { kind: 'weekend' },
    };
  }
  return {
    id: 'none',
    text: i.nextBoss === null ? 'No raid right now' : `Next raid ${i.nextBoss}`,
    tap: null,
  };
}

/** Reads the raid view into the line's input. `playing` is the stage playing out, `now` the server's clock. */
export function nowInput(
  view: RaidView,
  playing: Playing | null,
  now: number,
  owned: number = RULES.raid.teamSize,
  /** The stage's round count (the boss's); the round shows only when it is known. */
  rounds: number | null = view.boss.finaleRounds,
): NowInput {
  const v2 = view.v2;
  const grid = v2 === undefined ? { rows: 1, cols: 1 } : { rows: v2.rows, cols: v2.cols };
  const first = v2?.swaps.incoming[0];
  const incoming =
    first === undefined
      ? null
      : {
          id: first.id,
          text:
            (v2?.swaps.incoming.length ?? 0) > 1
              ? `${String(v2?.swaps.incoming.length)} swap requests`
              : incomingText(first, grid).replace(/\.$/, ''),
        };
  const fell = earlyKillStage(view);
  const stage = fell === null ? null : fell === 'phase1' ? 1 : 2;
  const ability = view.you.ability;
  const order =
    ability !== null && isActionId(ability.abilityId) ? ACTION_NAME[ability.abilityId] : null;
  const next =
    view.next === null
      ? null
      : {
          title: eventTitle(view.next.event, view.rules),
          when: formatZoned(view.next.at, view.timezone, 'short'),
          finale: view.next.event === 'finale',
        };
  return {
    incoming,
    playing:
      playing === null || now >= playing.endsAt
        ? null
        : {
            label: eventTitle(phaseOfStage(playing.stage), 2),
            round: rounds === null ? null : roundAt(playing, now, rounds),
            rounds,
          },
    fell: stage === null ? null : `Stage ${String(stage)}`,
    toPlace: needsPlacement(view, owned)
      ? { placed: view.you.team?.creatures.length ?? 0, seats: v2?.seats ?? RULES.raid.teamSize }
      : null,
    next,
    nextBoss: formatZoned(view.schedule.weekStart, view.timezone, 'long'),
    order,
  };
}
