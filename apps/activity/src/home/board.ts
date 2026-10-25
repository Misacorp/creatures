/**
 * The Today board's content and its two options, as pure data (decisions.md 2026-10-24, the Home page).
 *
 * `BoardSettings` is the one small typed object a future player setting would fill in; nothing else decides
 * how the board looks or what it drops:
 *  - `tilt`: `none` (every notice flush, the default) or `still` (each notice leans a little, for good).
 *  - `idle`: `hide` (a place with nothing ongoing and nothing waiting gets no notice) or `show` (it gets a calm
 *    one-line notice).
 *
 * The board is the rows of `home-view.ts` plus these two choices. Nothing here draws or asks the server.
 */
import type { AwaySummary } from '../api';
import { hasAwayNotice } from './away-notice';
import {
  comingUp,
  needsYou,
  quietRows,
  valleyToday,
  type ComingRow,
  type HomeInput,
  type NeedRow,
  type QuietRow,
  type ValleyToday,
} from '../home-view';

export type TiltMode = 'none' | 'still';
export type IdleMode = 'hide' | 'show';

export interface BoardSettings {
  tilt: TiltMode;
  idle: IdleMode;
}

export const TILT_MODES: readonly TiltMode[] = ['none', 'still'];
export const IDLE_MODES: readonly IdleMode[] = ['hide', 'show'];

/** What a player gets until there is a setting for it: the notices hang flush and quiet places stay off the board. */
export const DEFAULT_BOARD_SETTINGS: BoardSettings = { tilt: 'none', idle: 'hide' };

/** The largest lean of a notice, in degrees. A notice never sits nearer to flush than `MIN_TILT` in `still`. */
export const MAX_TILT = 1.5;
export const MIN_TILT = 0.5;

/** FNV-1a over the id's UTF-16 units: a small, stable number for an id (never random, never changes between renders). */
export function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The lean of a notice in degrees, from -1.5 to 1.5 (never nearer to flush than 0.5), in steps of 0.1. Its
 * size comes from the notice's id, so it is the same on every render; its side alternates with the notice's
 * place on the board (`index`: even leans left, odd leans right), so neighbours lean different ways.
 */
export function noticeTilt(id: string, index: number): number {
  const steps = Math.round((MAX_TILT - MIN_TILT) * 10);
  const tenths = Math.round(MIN_TILT * 10) + (hashId(id) % (steps + 1));
  const size = tenths / 10;
  return index % 2 === 0 ? -size : size;
}

export interface Board {
  /** The "While you were away" paper, or null when nothing was recorded (or it was dismissed). */
  away: AwaySummary | null;
  /** One notice per place that needs the player, the most pressing first. */
  needs: NeedRow[];
  /** True when nothing needs the player: the calm line stands in the first section. */
  calm: boolean;
  /** The next things on the clock; empty when there is nothing ahead. */
  coming: ComingRow[];
  /** The calm one-line notices of places with nothing going on; always empty unless `idle` is `show`. */
  quiet: QuietRow[];
  valley: ValleyToday;
  /** The lean of every notice by its id, in degrees (all 0 with `tilt: none`). */
  tilts: Readonly<Record<string, number>>;
}

/** The ids of the notices in the order they lean: which way each leans follows this order. */
export function noticeIds(
  board: Pick<Board, 'away' | 'needs' | 'calm' | 'coming' | 'quiet'>,
): string[] {
  return [
    ...(board.away === null ? [] : ['away']),
    ...board.needs.map((row) => `need:${row.place}`),
    ...(board.calm ? ['calm'] : []),
    ...(board.coming.length > 0 ? ['coming'] : []),
    ...board.quiet.map((row) => `quiet:${row.place}`),
    'valley',
  ];
}

export function buildBoard(input: HomeInput, settings: BoardSettings): Board {
  const needs = needsYou(input);
  const parts = {
    away: hasAwayNotice(input.away) ? input.away : null,
    needs,
    calm: needs.length === 0,
    coming: comingUp(input),
    quiet: settings.idle === 'show' ? quietRows(input) : [],
  };
  const tilts: Record<string, number> = {};
  noticeIds(parts).forEach((id, index) => {
    tilts[id] = settings.tilt === 'none' ? 0 : noticeTilt(id, index);
  });
  return { ...parts, valley: valleyToday(input), tilts };
}
