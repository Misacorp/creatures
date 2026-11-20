/**
 * The Cave canvas's now line: the one caption on the scene, a polite live region (`ux-patterns.md`, "A place is a canvas"; the raid's
 * `raid-canvas/now-line.ts` is its model). It says where you are in the day's cave and what is asked of you next; a tap on it opens what
 * it names. It reads only what the screen may show now: during a fight it is the state before the room (`hold.ts`). Pure.
 */
import { nodeLevel } from '../dungeon-map';
import { fierceName, nodeFloor, undercroftName } from '../dungeon-text';
import type { DungeonRunState } from '../dungeon-types';

/** What a tap on the line opens. */
export type NowTap = 'enter' | 'blocked' | 'pending' | 'result' | null;

export type NowId =
  'blocked' | 'pick' | 'enter' | 'next' | 'event' | 'camp' | 'descend' | 'fight' | 'over';

export interface NowLine {
  id: NowId;
  text: string;
  tap: NowTap;
}

/** The room a fight or a replay is playing: where it stands in its floor count, and its foe. */
export interface PlayingRoom {
  /** "Room 3 / 7", or "Undercroft 1 · Room 2 / 4". */
  place: string;
  foe: string;
}

export type NowInput =
  | { screen: 'setup'; blocked: boolean; placed: number }
  | {
      screen: 'run';
      state: Pick<DungeonRunState, 'at' | 'pending' | 'map' | 'undercroft' | 'level'>;
    }
  | { screen: 'playing'; room: PlayingRoom | null }
  | { screen: 'results' };

/** "Room 3 / 7" for a room's node; in the Undercroft "Undercroft 1 · Room 2 / 4". `floors` is its own level's. */
export function roomPlace(node: string | undefined, floors: number): string {
  const floor = node === undefined ? null : nodeFloor(node);
  const level = node === undefined ? 0 : nodeLevel(node);
  const room = `Room ${String((floor ?? 0) + 1)} / ${String(floors)}`;
  return level > 0 ? `${undercroftName(level)} · ${room}` : room;
}

/** The place and foe of a room that plays (a fight or a watched run). `floors` is its own level's. */
export function playingRoom(
  room: { node?: string | undefined; elite?: boolean | undefined; foe: { name: string } },
  floors: number,
): PlayingRoom {
  return { place: roomPlace(room.node, floors), foe: fierceName(room.foe.name, room.elite) };
}

/** The room the run picks next, as the line says it: the floor after the one it stands on. */
function nextPlace(state: Pick<DungeonRunState, 'at' | 'map' | 'undercroft' | 'level'>): string {
  const level = state.level;
  const maps = [state.map, ...(state.undercroft?.maps ?? [])];
  const floors = maps[level]?.floors ?? state.map.floors;
  const at = state.at === null ? null : nodeFloor(state.at);
  // Standing on a floor, the next pick is one floor down (the first room of a level when it has just been entered).
  const next = at === null || (state.at !== null && nodeLevel(state.at) !== level) ? 0 : at + 1;
  const room = `Room ${String(next + 1)} / ${String(floors)}`;
  return level > 0 ? `${undercroftName(level)} · ${room}` : room;
}

export function nowLine(input: NowInput): NowLine {
  switch (input.screen) {
    case 'setup':
      if (input.blocked) return { id: 'blocked', text: 'Not today', tap: 'blocked' };
      return input.placed < 3
        ? { id: 'pick', text: 'Pick your team · Enter the cave', tap: null }
        : { id: 'enter', text: 'Your team is ready · Enter the cave', tap: 'enter' };
    case 'results':
      return { id: 'over', text: 'The run is over', tap: 'result' };
    case 'playing':
      return {
        id: 'fight',
        text: input.room === null ? 'A fight' : `${input.room.place}: ${input.room.foe}`,
        tap: null,
      };
    case 'run': {
      const { state } = input;
      switch (state.pending?.kind) {
        case 'event':
          return { id: 'event', text: `${state.pending.event.name}: pick one`, tap: 'pending' };
        case 'camp':
          return { id: 'camp', text: 'Camp: rest, keepsake or swap', tap: 'pending' };
        case 'descend':
          return { id: 'descend', text: 'The way down: descend or go home', tap: 'pending' };
        default:
          // In the Undercroft the place alone: the longer line does not fit a phone on one line.
          return {
            id: 'next',
            text: state.level > 0 ? nextPlace(state) : `${nextPlace(state)}: choose the next room`,
            tap: null,
          };
      }
    }
  }
}
