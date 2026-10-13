import { describe, expect, it } from 'vitest';
import errors from './fixtures/dungeon-errors.json';
import replay from './fixtures/dungeon-replay.json';
import requests from './fixtures/dungeon-request-bodies.json';
import runCleared from './fixtures/dungeon-run-cleared.json';
import runLost from './fixtures/dungeon-run-lost.json';
import today from './fixtures/dungeon-today.json';
import {
  DUNGEON_ERRORS,
  type DungeonReplay,
  type DungeonRunRequest,
  type DungeonRunResponse,
  type DungeonToday,
} from './dungeon-types';

/**
 * The client types describe the real server output: the fixtures (captured from the Worker, and
 * checked there by `dungeon-fixtures.test.ts`) read through them, and the error codes the fixtures
 * hold are the ones the types list.
 */
describe('the dungeon types', () => {
  it('read today, a run and a replay from real server output', () => {
    const t = today as unknown as DungeonToday;
    expect(t.modifiers.map((m) => m.room)).toEqual([0, 1, 2]);
    expect(t.blocked).toBeNull();
    const cleared = runCleared as unknown as DungeonRunResponse;
    // The team is one row, in fighting order, with no zones.
    expect(cleared.run.team.map((m) => m.id)).toEqual(
      (replay as unknown as DungeonReplay).row.map((m) => m.id),
    );
    expect(Object.keys(cleared.run.team[0] ?? {})).not.toContain('zone');
    expect(cleared.run.rooms.at(-1)?.kind).toBe('boss');
    expect(cleared.today.last?.id).toBe(cleared.run.id);
    const lost = runLost as unknown as DungeonRunResponse;
    expect(lost.run.rooms.filter((r) => !r.played).length).toBeGreaterThan(0);
    const r = replay as unknown as DungeonReplay;
    expect(r.rooms.length).toBe(r.summary.rooms.filter((x) => x.played).length);
    expect(r.rooms[0]?.events[0]?.t).toBe('round_start');
  });

  it('has request bodies of the type, and error codes the types know', () => {
    const body = requests['dungeon-run-cleared'].body as unknown as DungeonRunRequest;
    expect(body.team).toHaveLength(3);
    expect(Object.keys(body).sort()).toEqual(['idempotencyKey', 'team']);
    expect(new Set(body.team).size).toBe(3);
    // The ability choices are gone with their error code.
    expect(Object.keys(DUNGEON_ERRORS)).not.toContain('invalid_abilities');
    for (const e of errors) {
      expect(Object.keys(DUNGEON_ERRORS), e.body.error).toContain(e.body.error);
      expect(DUNGEON_ERRORS[e.body.error as keyof typeof DUNGEON_ERRORS]).toBe(e.status);
    }
  });
});
