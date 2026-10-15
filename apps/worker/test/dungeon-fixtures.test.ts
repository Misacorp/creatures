import { PART_KINDS } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import dungeonErrors from '../../activity/src/fixtures/dungeon-errors.json';
import dungeonReplay from '../../activity/src/fixtures/dungeon-replay.json';
import dungeonRequests from '../../activity/src/fixtures/dungeon-request-bodies.json';
import runCleared from '../../activity/src/fixtures/dungeon-run-cleared.json';
import runLandmark from '../../activity/src/fixtures/dungeon-run-landmark.json';
import runLost from '../../activity/src/fixtures/dungeon-run-lost.json';
import runRetry from '../../activity/src/fixtures/dungeon-run-retry.json';
import runRetryAttempt from '../../activity/src/fixtures/dungeon-run-retry-attempt.json';
import today from '../../activity/src/fixtures/dungeon-today.json';
import todayDone from '../../activity/src/fixtures/dungeon-today-done.json';
import todayLandmark from '../../activity/src/fixtures/dungeon-today-landmark.json';
import todayNeed from '../../activity/src/fixtures/dungeon-today-need-creatures.json';
import todayRetry from '../../activity/src/fixtures/dungeon-today-retry.json';
import { RunBodySchema } from '../src/dungeon-schemas';
import { dungeonScenarioOptions, runDungeonScenario } from './dungeon-scenario';
import { runCore } from './helpers';
import { nextGuild } from './raid-helpers';

/**
 * The contract with the client for the daily dungeon. The files in `apps/activity/src/fixtures` were
 * captured from real server output (`dungeon-scenario.ts` plays the same game through the real
 * routes). These tests run that scenario again and compare the SHAPE of every response (keys and
 * types, not values: ids and tuned numbers may differ), so a change in what the server sends fails
 * here and points at the fixtures and the client types (`apps/activity/src/dungeon-types.ts`).
 */
const UPDATE =
  'the server shape changed: re-capture apps/activity/src/fixtures with test/dungeon-scenario.ts (see dungeon-capture.test.ts) and update apps/activity/src/dungeon-types.ts';

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const PART_KIND_SET: ReadonlySet<string> = new Set(PART_KINDS);

/**
 * Keys and value types, recursively; arrays are the set of their elements' shapes. A map keyed by
 * ids (the creatures' HP by creature id) or by part kinds (what a grant paid) is one entry whatever
 * the keys are: those keys are data, not shape.
 */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) {
    const shapes = new Set(value.map((x) => JSON.stringify(shape(x))));
    return [...shapes].sort().map((s) => JSON.parse(s) as unknown);
  }
  if (value === null) return 'null';
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const keys = entries.map(([k]) => k);
    if (
      keys.length > 0 &&
      (keys.every((k) => UUID.test(k)) || keys.every((k) => PART_KIND_SET.has(k)))
    ) {
      const shapes = new Set(entries.map(([, x]) => JSON.stringify(shape(x))));
      return { '*': [...shapes].sort().map((s) => JSON.parse(s) as unknown) };
    }
    return Object.fromEntries(
      entries.sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, shape(x)]),
    );
  }
  return typeof value;
}

const codes0 = (errors: readonly { body: { error: string } }[]): string[] =>
  errors.map((e) => e.body.error);

const sameShape = (live: unknown, fixture: unknown): void => {
  expect(shape(live), UPDATE).toEqual(shape(fixture));
};

describe('the dungeon fixtures match what the server sends', () => {
  it('has the same responses for the whole scenario', async () => {
    const captured = await runCore(nextGuild(), (ctx) => runDungeonScenario(ctx), {
      ...dungeonScenarioOptions(),
    });
    const r = captured.responses;
    sameShape(r['dungeon-today'], today);
    sameShape(r['dungeon-today-done'], todayDone);
    sameShape(r['dungeon-today-landmark'], todayLandmark);
    sameShape(r['dungeon-today-retry'], todayRetry);
    sameShape(r['dungeon-today-need-creatures'], todayNeed);
    sameShape(r['dungeon-run-cleared'], runCleared);
    sameShape(r['dungeon-run-retry'], runRetry);
    sameShape(r['dungeon-run-landmark'], runLandmark);
    sameShape(r['dungeon-run-lost'], runLost);
    sameShape(r['dungeon-run-retry-attempt'], runRetryAttempt);
    sameShape(r['dungeon-replay'], dungeonReplay);
    // And the errors are the real ones, code for code.
    expect(captured.errors, UPDATE).toEqual(dungeonErrors);
    // The request bodies are what the scenario sent (ids differ from run to run).
    sameShape(captured.requests, dungeonRequests);
  });

  it('shows what each fixture is meant to show', () => {
    // A fresh day: three modifiers, depth 1, a run is possible and nothing has run yet.
    expect(today).toMatchObject({ depth: 1, canRun: true, blocked: null, last: null });
    expect(today.modifiers).toHaveLength(3);
    // After a run: the day is used up, the run is in `last`, the depth went up.
    expect(todayDone).toMatchObject({ canRun: false, blocked: 'already_run', attemptsToday: 1 });
    expect(todayDone.last?.id).toBe(runCleared.run.id);
    expect(todayDone.depth).toBe(runCleared.run.newDepth);
    // A cleared run: all three rooms, no unplayed room, and what it paid.
    expect(runCleared.run).toMatchObject({ cleared: true, roomsCleared: 3, attempt: 1 });
    expect(runCleared.run.rooms.every((x) => x.played && x.cleared)).toBe(true);
    expect(runCleared.today.last?.id).toBe(runCleared.run.id);
    // The last team: none before a first run, the run's ids in its row order after it.
    expect(today.lastTeam).toBeNull();
    expect(todayDone.lastTeam).toEqual(runCleared.run.team.map((t) => t.id));
    expect(runCleared.today.lastTeam).toEqual(runCleared.run.team.map((t) => t.id));
    // The retry of a key is the same run.
    expect(runRetry.run).toEqual(runCleared.run);
    // The landmark: a certain gear drop, the streak bonus of day 3, a landmark depth.
    expect(todayLandmark).toMatchObject({ depth: 7, landmark: true, streak: 2 });
    expect(runLandmark.run).toMatchObject({ depth: 7, landmark: true, cleared: true, streak: 3 });
    expect(runLandmark.run.rewards.gear).toHaveLength(1);
    expect(runLandmark.run.rewards.streak?.day).toBe(3);
    expect(runLandmark.run.rewards.landmark).toBe(true);
    // A lost run: later rooms were not played, nothing was paid, the depth is kept.
    expect(runLost.run.cleared).toBe(false);
    expect(runLost.run.rooms.some((x) => !x.played)).toBe(true);
    expect(runLost.run.newDepth).toBe(runLost.run.depth);
    expect(runLost.run.rewards.bait).toBe(0);
    // The first-day retry is offered, and the second attempt is attempt 2 on the same day.
    expect(todayRetry).toMatchObject({ canRun: true, attemptsToday: 1, attemptsAllowed: 2 });
    expect(runRetryAttempt.run).toMatchObject({ attempt: 2, day: runLost.run.day });
    // Too few creatures.
    expect(todayNeed).toMatchObject({ canRun: false, blocked: 'need_creatures' });
    // The replay carries the full events of every played room, the row and the names.
    expect(dungeonReplay.summary.id).toBe(runCleared.run.id);
    expect(dungeonReplay.rooms).toHaveLength(3);
    expect(dungeonReplay.row.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(dungeonReplay.rooms.every((room) => room.events.length > 0)).toBe(true);
    // No seed anywhere a client can read.
    for (const fixture of [today, todayDone, runCleared, runLandmark, runLost, dungeonReplay]) {
      expect(JSON.stringify(fixture)).not.toMatch(/seed/i);
    }
    // The team is one row and its order is the formation: no zones anywhere in a run.
    expect(runCleared.run.team.map((t) => t.id)).toEqual(dungeonReplay.row.map((r) => r.id));
    for (const fixture of [runCleared, runLandmark, runLost, dungeonReplay, dungeonRequests]) {
      expect(JSON.stringify(fixture)).not.toContain('formation');
    }
    expect(codes0(dungeonErrors)).not.toContain('invalid_formation');
    expect(codes0(dungeonErrors)).not.toContain('invalid_abilities');
    // The request has no ability choice any more.
    expect(JSON.stringify(dungeonRequests)).not.toContain('abilities');
    // Errors the client has to write text for.
    const codes = new Set(codes0(dungeonErrors));
    for (const code of [
      'already_run',
      'key_conflict',
      'duplicate_creature',
      'not_found',
      'invalid_body',
      'invalid_id',
    ]) {
      expect(codes.has(code), code).toBe(true);
    }
  });
});

describe('the request bodies the client sends', () => {
  const bodies = dungeonRequests as Record<string, { path: string; method: string; body: unknown }>;

  it('pass the strict schema, and no extra key gets through', () => {
    for (const name of ['dungeon-run-cleared', 'dungeon-run-landmark', 'dungeon-run-lost']) {
      const entry = bodies[name];
      expect(entry, name).toBeDefined();
      expect(entry?.method).toBe('POST');
      expect(entry?.path).toBe('/api/dungeon/run');
      expect(v.safeParse(RunBodySchema, entry?.body).success, name).toBe(true);
      expect(v.safeParse(RunBodySchema, { ...(entry?.body as object), extra: 1 }).success).toBe(
        false,
      );
    }
  });

  it('read the replay from the path of the run', () => {
    const entry = bodies['dungeon-replay'];
    expect(entry?.method).toBe('GET');
    expect(entry?.path).toBe(`/api/dungeon/run/${runCleared.run.id}`);
  });
});
