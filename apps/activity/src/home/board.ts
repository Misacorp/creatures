/**
 * The Today board's content and its two options, as pure data (decisions.md 2026-10-24, the Home page).
 *
 * `BoardSettings` is the one small typed object a future player setting would fill in; nothing else decides
 * how the board looks or what it drops:
 *  - `tilt`: `none` (every notice flush), `still` (each notice leans a little, for good) or `sway` (the same
 *    lean, slowly rocking; the stylesheet turns it off under reduced motion).
 *  - `idle`: `hide` (a place with nothing ongoing and nothing waiting gets no notice) or `show` (it gets a calm
 *    one-line notice).
 *
 * The board is the rows of `home-view.ts` plus these two choices. Nothing here draws or asks the server.
 */
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
import { HOME_PAGES } from '../tabs';

export type TiltMode = 'none' | 'still' | 'sway';
export type IdleMode = 'hide' | 'show';

export interface BoardSettings {
  tilt: TiltMode;
  idle: IdleMode;
}

export const TILT_MODES: readonly TiltMode[] = ['none', 'still', 'sway'];
export const IDLE_MODES: readonly IdleMode[] = ['hide', 'show'];

/** What a player gets until there is a setting for it: the notices lean a little and quiet places stay off the board. */
export const DEFAULT_BOARD_SETTINGS: BoardSettings = { tilt: 'still', idle: 'hide' };

/** The largest lean of a notice, in degrees. A notice never sits nearer to flush than `MIN_TILT` in `still` or `sway`. */
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

/** A stable delay for the sway of a notice (seconds, from -6 to 0: every notice is already mid-rock, none in step). */
export function swayDelay(id: string): number {
  return -((hashId(id) >>> 8) % 61) / 10;
}

export interface Board {
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

/** The ids of the notices in the order they lean: which way each leans follows this order (the two pins come last). */
export function noticeIds(board: Pick<Board, 'needs' | 'calm' | 'coming' | 'quiet'>): string[] {
  return [
    ...board.needs.map((row) => `need:${row.place}`),
    ...(board.calm ? ['calm'] : []),
    ...(board.coming.length > 0 ? ['coming'] : []),
    ...board.quiet.map((row) => `quiet:${row.place}`),
    'valley',
    ...HOME_PAGES.map((page) => `pin:${page.id}`),
  ];
}

export function buildBoard(input: HomeInput, settings: BoardSettings): Board {
  const needs = needsYou(input);
  const parts = {
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
