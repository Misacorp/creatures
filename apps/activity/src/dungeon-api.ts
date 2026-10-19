/**
 * The requests of the daily dungeon (`docs/design/dungeon-paths.md`). A run is created once per
 * request key and every step of it (`act`) has its own key: the key is made by the caller
 * (`actions.ts`) and sent again unchanged on a retry, so a repeat returns the stored answer and can
 * never start a second run or play a room twice. A fight is final when its answer arrives; the
 * replay route returns the events of every fight so far at any later time (the caller's own runs only).
 */
import { apiFetch, jsonRequest } from './api';
import {
  parseDungeonAct,
  parseDungeonReplay,
  parseDungeonStart,
  parseDungeonTeamSaved,
  parseDungeonToday,
} from './dungeon-parse';
import type {
  DungeonActRequest,
  DungeonActResponse,
  DungeonReplay,
  DungeonStartRequest,
  DungeonStartResponse,
  DungeonTeamRequest,
  DungeonTeamResponse,
  DungeonToday,
} from './dungeon-types';

/** Today's state: the map, the depth, the streak, and whether a run is possible. */
export async function fetchDungeonToday(): Promise<DungeonToday> {
  return parseDungeonToday(await apiFetch('/api/dungeon/today'));
}

/**
 * Enters the dungeon: opens today's run at step 0 and answers with its state and today's new state
 * (a run is open now). Balances change only when the run ends, in `dungeonAct`'s answer.
 */
export async function startDungeonRun(request: DungeonStartRequest): Promise<DungeonStartResponse> {
  return parseDungeonStart(await apiFetch('/api/dungeon/start', jsonRequest('POST', request)));
}

/**
 * One step of an open run: a move, an event option, a camp choice or heading home. `request.step`
 * must be the state's step (a mismatch is `stale_step`). The answer has the new state, the fight
 * just played (`room`) and, when the run ended, its summary and today; refresh balances and the bag
 * then.
 */
export async function dungeonAct(request: DungeonActRequest): Promise<DungeonActResponse> {
  return parseDungeonAct(await apiFetch('/api/dungeon/act', jsonRequest('POST', request)));
}

/** The events of one of the caller's own runs, for "Watch again". */
export async function fetchDungeonReplay(runId: string): Promise<DungeonReplay> {
  return parseDungeonReplay(await apiFetch(`/api/dungeon/run/${encodeURIComponent(runId)}`));
}

/**
 * Saves the row of the setup screen as the player's draft (so it is there again on another visit or
 * device). Not a spend: no key, and saving the same row twice is harmless. The server keeps the
 * latest one it was sent.
 */
export async function saveDungeonTeam(request: DungeonTeamRequest): Promise<DungeonTeamResponse> {
  // keepalive: a save sent as the page is hidden or closed still goes out.
  const init: RequestInit = { ...jsonRequest('PUT', request), keepalive: true };
  return parseDungeonTeamSaved(await apiFetch('/api/dungeon/team', init));
}
