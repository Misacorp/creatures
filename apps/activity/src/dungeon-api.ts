/**
 * The requests of the daily dungeon. A run is created once per request key: the key is made by the
 * caller (`actions.ts`) and sent again unchanged on a retry, so a repeat returns the stored run and
 * can never start a second one. The run is final when the answer arrives; the replay route returns
 * the same events at any later time (for the caller's own runs only).
 */
import { apiFetch, jsonRequest } from './api';
import {
  parseDungeonReplay,
  parseDungeonRun,
  parseDungeonTeamSaved,
  parseDungeonToday,
} from './dungeon-parse';
import type {
  DungeonReplay,
  DungeonRunRequest,
  DungeonRunResponse,
  DungeonTeamRequest,
  DungeonTeamResponse,
  DungeonToday,
} from './dungeon-types';

/** Today's state: the modifiers, the depth, the streak, and whether a run is possible. */
export async function fetchDungeonToday(): Promise<DungeonToday> {
  return parseDungeonToday(await apiFetch('/api/dungeon/today'));
}

/**
 * Starts today's run. The answer is the finished run and today's new state; refresh the collection
 * and the gear view afterwards, since balances and parts changed.
 */
export async function startDungeonRun(request: DungeonRunRequest): Promise<DungeonRunResponse> {
  return parseDungeonRun(await apiFetch('/api/dungeon/run', jsonRequest('POST', request)));
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
