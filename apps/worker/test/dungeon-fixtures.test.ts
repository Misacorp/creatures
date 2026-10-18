import { PART_KINDS, RULES } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import actCamp from '../../activity/src/fixtures/dungeon-act-camp.json';
import actCampPending from '../../activity/src/fixtures/dungeon-act-camp-pending.json';
import actCleared from '../../activity/src/fixtures/dungeon-act-cleared.json';
import actDescend from '../../activity/src/fixtures/dungeon-act-descend.json';
import actDescendPending from '../../activity/src/fixtures/dungeon-act-descend-pending.json';
import actDoor from '../../activity/src/fixtures/dungeon-act-door.json';
import actKeeper from '../../activity/src/fixtures/dungeon-act-keeper.json';
import actDefeat from '../../activity/src/fixtures/dungeon-act-defeat.json';
import actEvent from '../../activity/src/fixtures/dungeon-act-event.json';
import actEventPending from '../../activity/src/fixtures/dungeon-act-event-pending.json';
import actFight from '../../activity/src/fixtures/dungeon-act-fight.json';
import actHome from '../../activity/src/fixtures/dungeon-act-home.json';
import dungeonErrors from '../../activity/src/fixtures/dungeon-errors.json';
import dungeonReplay from '../../activity/src/fixtures/dungeon-replay.json';
import replayPath from '../../activity/src/fixtures/dungeon-replay-path.json';
import dungeonRequests from '../../activity/src/fixtures/dungeon-request-bodies.json';
import dungeonStart from '../../activity/src/fixtures/dungeon-start.json';
import runCleared from '../../activity/src/fixtures/dungeon-run-cleared.json';
import runLandmark from '../../activity/src/fixtures/dungeon-run-landmark.json';
import runLost from '../../activity/src/fixtures/dungeon-run-lost.json';
import runRetry from '../../activity/src/fixtures/dungeon-run-retry.json';
import runRetryAttempt from '../../activity/src/fixtures/dungeon-run-retry-attempt.json';
import teamDraft from '../../activity/src/fixtures/dungeon-team-draft.json';
import today from '../../activity/src/fixtures/dungeon-today.json';
import todayActive from '../../activity/src/fixtures/dungeon-today-active.json';
import todayMap from '../../activity/src/fixtures/dungeon-today-map.json';
import todayDone from '../../activity/src/fixtures/dungeon-today-done.json';
import todayDraft from '../../activity/src/fixtures/dungeon-today-draft.json';
import todayLandmark from '../../activity/src/fixtures/dungeon-today-landmark.json';
import todayNeed from '../../activity/src/fixtures/dungeon-today-need-creatures.json';
import todayRetry from '../../activity/src/fixtures/dungeon-today-retry.json';
import {
  ActBodySchema,
  DraftBodySchema,
  RunBodySchema,
  StartBodySchema,
} from '../src/dungeon-schemas';
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

/** What the map scenario captured (the all-at-once run's fixtures that came before it stay as the shapes of old runs). */
const NEW_RESPONSES = {
  'dungeon-today-map': todayMap,
  'dungeon-today-active': todayActive,
  'dungeon-start': dungeonStart,
  'dungeon-act-fight': actFight,
  'dungeon-act-event-pending': actEventPending,
  'dungeon-act-event': actEvent,
  'dungeon-act-camp-pending': actCampPending,
  'dungeon-act-camp': actCamp,
  'dungeon-act-home': actHome,
  'dungeon-act-defeat': actDefeat,
  'dungeon-act-cleared': actCleared,
  'dungeon-replay-path': replayPath,
  'dungeon-act-door': actDoor,
  'dungeon-act-descend-pending': actDescendPending,
  'dungeon-act-descend': actDescend,
  'dungeon-act-keeper': actKeeper,
} as const;

describe('the dungeon fixtures match what the server sends', () => {
  it('has the same responses for the whole map scenario', async () => {
    const captured = await runCore(nextGuild(), (ctx) => runDungeonScenario(ctx), {
      ...dungeonScenarioOptions(),
    });
    expect(Object.keys(captured.responses).sort()).toEqual(Object.keys(NEW_RESPONSES).sort());
    for (const [name, fixture] of Object.entries(NEW_RESPONSES)) {
      sameShape(captured.responses[name], fixture);
    }
    // And the errors are the real ones, code for code (the rows of the older run route come first and stay).
    expect(dungeonErrors.slice(-captured.errors.length), UPDATE).toEqual(captured.errors);
    // The request bodies are what the scenario sent (ids differ from run to run).
    const sent = Object.fromEntries(
      Object.keys(captured.requests).map((k) => [
        k,
        (dungeonRequests as Record<string, unknown>)[k],
      ]),
    );
    sameShape(captured.requests, sent);
    expect(Object.keys(captured.requests).sort()).toEqual(
      Object.keys(NEW_RESPONSES)
        .filter((k) => k !== 'dungeon-today-map' && k !== 'dungeon-today-active')
        .sort(),
    );
  });

  it('shows what each map fixture is meant to show', () => {
    // A fresh day: the map, no run, and a run is possible.
    expect(todayMap).toMatchObject({
      canRun: true,
      blocked: null,
      last: null,
      active: null,
      depth: 1,
    });
    expect(todayMap.map.floors).toBe(RULES.dungeon.floors);
    expect(todayMap.map.nodes.filter((n) => n.floor === 0).every((n) => n.kind === 'fight')).toBe(
      true,
    );
    expect(todayMap.map.nodes.find((n) => n.floor === RULES.dungeon.campFloor)?.kind).toBe('camp');
    expect(todayMap.modifiers).toHaveLength(RULES.dungeon.rooms);
    // The start: an open run before floor 0, and today shows the same run as open.
    expect(dungeonStart.state).toMatchObject({
      status: 'active',
      step: 0,
      at: null,
      outcome: null,
    });
    expect(dungeonStart.state.reachable).toEqual(
      dungeonStart.state.map.nodes.filter((n) => n.floor === 0).map((n) => n.id),
    );
    expect(dungeonStart.today).toMatchObject({ canRun: false });
    expect(dungeonStart.today.active?.id).toBe(dungeonStart.state.id);
    // A fight answers with the room to play and the state after it.
    expect(actFight.state).toMatchObject({ step: 1, roomsCleared: 1 });
    expect(actFight.room).toMatchObject({ node: actFight.state.at, index: 0, cleared: true });
    expect(actFight.room.events.length).toBeGreaterThan(0);
    expect(actFight.room.row).toHaveLength(3);
    expect('summary' in actFight).toBe(false);
    // A mystery room waits for an answer, with two options and the scene; the answer says what happened.
    expect(actEventPending.state.pending?.kind).toBe('event');
    expect(actEventPending.state.reachable).toEqual([]);
    const scene = actEventPending.state.pending;
    expect(scene?.kind === 'event' ? scene.event.options : []).toHaveLength(2);
    expect(actEvent.state.pending).toBeNull();
    expect(actEvent.state.lastEvent?.outcome.length).toBeGreaterThan(0);
    // The camp: two offers, no way on until it is answered; the choice (a swap) changes the row.
    const camp = actCampPending.state.pending;
    expect(camp?.kind === 'camp' ? camp.offers : []).toHaveLength(RULES.dungeon.camp.offers);
    expect(camp?.kind === 'camp' ? camp.restBp : 0).toBe(RULES.dungeon.camp.restBp);
    expect(actCampPending.state.reachable).toEqual([]);
    expect(todayActive.active?.pending?.kind).toBe('camp');
    expect(todayActive.canRun).toBe(false);
    expect(todayActive.active?.id).toBe(actCampPending.state.id);
    expect(actCamp.state.pending).toBeNull();
    expect(actCamp.state.reachable.length).toBeGreaterThan(0);
    expect(actCamp.state.team.map((t) => t.id)).not.toEqual(
      actCampPending.state.team.map((t) => t.id),
    );
    expect(actCamp.state.team.every((t) => t.hp > 0 && !t.treat)).toBe(true);
    // The ends: home keeps the pack, a defeat keeps half of it, a clear goes one depth deeper.
    expect(actHome.state).toMatchObject({ status: 'done', outcome: 'home', reachable: [] });
    expect(actHome.summary).toMatchObject({ outcome: 'home', newDepth: 1, cleared: false });
    expect(actHome.summary.pack?.kept).toEqual(actHome.summary.pack?.found);
    expect(actHome.today.active).toBeNull();
    expect(actDefeat.state).toMatchObject({ status: 'done', outcome: 'defeat' });
    expect(actDefeat.room?.cleared).toBe(false);
    expect(actDefeat.summary).toMatchObject({ outcome: 'defeat', newDepth: 1, cleared: false });
    expect(actCleared.state).toMatchObject({ status: 'done', outcome: 'cleared' });
    expect(actCleared.summary).toMatchObject({ outcome: 'cleared', cleared: true, newDepth: 2 });
    expect(actCleared.summary.rooms.at(-1)?.kind).toBe('boss');
    expect(actCleared.today.depth).toBe(2);
    expect(actCleared.summary.rewards.experience?.length).toBeGreaterThan(3); // the creature swapped out is paid too
    // The replay of a path run: every fight, with the node, the row that fought it and the starting row on top.
    expect(replayPath.summary.id).toBe(actCleared.summary.id);
    expect(replayPath.rooms).toHaveLength(actCleared.summary.rooms.length);
    expect(replayPath.rooms.every((r) => r.node !== undefined && r.events.length > 0)).toBe(true);
    expect(replayPath.rooms[0]?.row?.map((r) => r.id)).toEqual(replayPath.row.map((r) => r.id));
    expect(replayPath.rooms.at(-1)?.row?.map((r) => r.id)).not.toEqual(
      replayPath.row.map((r) => r.id),
    );
    // The room history: one entry per visited room, in order, and a waiting room is `pending` until answered.
    expect(dungeonStart.state.history).toEqual([]);
    expect(actFight.state.history).toHaveLength(1);
    expect(actFight.state.history[0]).toMatchObject({
      node: actFight.state.at,
      kind: 'fight',
      result: 'fight',
      cleared: true,
      foeHpEnd: 0,
      supply: true,
    });
    expect(actEventPending.state.history.at(-1)).toMatchObject({
      kind: 'mystery',
      result: 'pending',
      event:
        actEventPending.state.pending?.kind === 'event'
          ? actEventPending.state.pending.event.name
          : '',
    });
    expect(actEvent.state.history).toHaveLength(actEventPending.state.history.length);
    expect(actEvent.state.history.at(-1)).toMatchObject({
      kind: 'mystery',
      result: 'event',
      option: actEvent.state.lastEvent?.option,
      outcome: actEvent.state.lastEvent?.outcome,
    });
    expect(actCampPending.state.history.at(-1)).toMatchObject({ kind: 'camp', result: 'pending' });
    expect(todayActive.active?.history).toEqual(actCampPending.state.history);
    expect(actCamp.state.history).toHaveLength(actCampPending.state.history.length);
    expect(actCamp.state.history.at(-1)).toMatchObject({
      kind: 'camp',
      result: 'camp',
      choice: 'swap',
    });
    expect(actHome.state.history.at(-1)).toMatchObject({ kind: 'camp', choice: 'home' });
    expect(actDefeat.state.history.at(-1)).toMatchObject({ result: 'fight', cleared: false });
    expect(actCleared.state.history.at(-1)).toMatchObject({ kind: 'boss', cleared: true });
    // The route on the summary of every path run that ended: the map, the path and the same log.
    for (const done of [actHome, actDefeat, actCleared]) {
      expect(done.summary.route).toEqual({
        map: done.state.map,
        path: done.state.path,
        history: done.state.history,
      });
      expect(done.state.history.map((h) => h.node)).toEqual(done.state.path);
    }
    expect(replayPath.summary.route).toEqual(actCleared.summary.route);
    // No seed anywhere a client can read, and no HP or loot in anything it sends.
    for (const fixture of Object.values(NEW_RESPONSES)) {
      expect(JSON.stringify(fixture)).not.toMatch(/seed/i);
    }
    // The Undercroft: a carved door adds a room without saying which, the boss offers the way down,
    // going down draws a labelled level, and the keeper's clear ends the run with the summary.
    expect(actDoor.state.pending).toBeNull();
    expect(actDoor.state.history.at(-1)).toMatchObject({
      kind: 'door',
      result: 'door',
      added: true,
    });
    expect(Object.keys(actDoor.state.history.at(-1) ?? {}).sort()).toEqual(
      ['added', 'kind', 'node', 'result'].sort(),
    );
    expect(actDoor.state.undercroft).toEqual({ maps: [], marks: 1 });
    expect(actDoor.state.level).toBe(0);
    expect(actDoor.state.map.nodes.some((n) => n.kind === 'door')).toBe(true);
    const card = actDescendPending.state.pending;
    expect(card).toMatchObject({
      kind: 'descend',
      level: 1,
      depthBonus: RULES.dungeon.undercroft.depthBonus,
      catchBreathBp: RULES.dungeon.undercroft.catchBreathBp,
      reviveBp: RULES.dungeon.undercroft.reviveBp,
    });
    expect(card?.kind === 'descend' ? card.floors : 0).toBe(2 + actDoor.state.undercroft.marks + 1);
    expect(card?.kind === 'descend' ? card.banked.gear.length : 0).toBeGreaterThan(0);
    expect(actDescendPending.state).toMatchObject({
      status: 'active',
      outcome: null,
      reachable: [],
    });
    expect(actDescendPending.room).toMatchObject({ cleared: true });
    expect(actDescendPending.state.history.at(-1)).toMatchObject({
      kind: 'descend',
      result: 'pending',
      level: 1,
    });
    expect(
      actDescendPending.state.history.some((h) => h.kind === 'boss' && h.result === 'chest'),
    ).toBe(true);
    expect(actDescend.state).toMatchObject({ level: 1, pending: null, at: null, status: 'active' });
    expect(actDescend.state.undercroft?.maps).toHaveLength(1);
    const lowerMap = actDescend.state.undercroft?.maps[0];
    expect(lowerMap?.level).toBe(1);
    expect(lowerMap?.label).toContain('Undercroft');
    expect(lowerMap?.nodes.every((n) => n.id.startsWith('u1'))).toBe(true);
    expect(actDescend.state.reachable.every((id) => id.startsWith('u1'))).toBe(true);
    expect(actDescend.state.history.at(-1)).toMatchObject({
      kind: 'descend',
      result: 'descend',
      level: 1,
      revived: 0,
    });
    expect(actKeeper.state).toMatchObject({ status: 'done', outcome: 'cleared', level: 1 });
    expect(actKeeper.summary).toMatchObject({
      outcome: 'cleared',
      cleared: true,
      deepest: 1,
      newDepth: 15,
    });
    expect(actKeeper.summary.route?.undercroft).toHaveLength(1);
    expect(actKeeper.summary.rewards.gear.length).toBeGreaterThan(0);
    expect(actKeeper.room?.node?.startsWith('u1')).toBe(true);
    // The run's own four creatures keep their ids across the fixtures.
    expect(actKeeper.state.team.map((t) => t.id)).toEqual(dungeonStart.state.team.map((t) => t.id));
    // The errors the client has to write text for.
    const codes = new Set(codes0(dungeonErrors));
    for (const code of [
      'run_active',
      'stale_step',
      'invalid_act',
      'gone',
      'key_conflict',
      'not_found',
      'invalid_body',
      'invalid_treat',
      'insufficient_funds',
      'duplicate_creature',
      'already_run',
    ]) {
      expect(codes.has(code), code).toBe(true);
    }
    expect(dungeonErrors.find((e) => e.body.error === 'gone')?.status).toBe(410);
  });

  it('shows what each fixture of the older three-room runs is meant to show', () => {
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
    // The saved draft: none before it is saved, what `PUT /api/dungeon/team` stored after (empty slots
    // are null), and none once a run has spent it.
    expect(today.draftTeam).toBeNull();
    expect(teamDraft.draftTeam).toHaveLength(3);
    expect(teamDraft.draftTeam.filter((id) => id === null)).toHaveLength(1);
    expect(todayDraft.draftTeam).toEqual(teamDraft.draftTeam);
    expect(todayDone.draftTeam).toBeNull();
    expect(runCleared.today.draftTeam).toBeNull();
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

  it('save the draft with the strict schema, and no extra key gets through', () => {
    const entry = bodies['dungeon-team-draft'];
    expect(entry?.method).toBe('PUT');
    expect(entry?.path).toBe('/api/dungeon/team');
    expect(v.safeParse(DraftBodySchema, entry?.body).success).toBe(true);
    expect(v.safeParse(DraftBodySchema, { ...(entry?.body as object), extra: 1 }).success).toBe(
      false,
    );
    expect(entry?.body).toEqual({ team: teamDraft.draftTeam });
  });

  it('read the replay from the path of the run', () => {
    const entry = bodies['dungeon-replay'];
    expect(entry?.method).toBe('GET');
    expect(entry?.path).toBe(`/api/dungeon/run/${runCleared.run.id}`);
  });

  it('start and act with the strict schemas, and no extra key gets through', () => {
    for (const name of ['dungeon-start']) {
      const entry = bodies[name];
      expect(entry?.method).toBe('POST');
      expect(entry?.path).toBe('/api/dungeon/start');
      expect(v.safeParse(StartBodySchema, entry?.body).success).toBe(true);
      expect(v.safeParse(StartBodySchema, { ...(entry?.body as object), extra: 1 }).success).toBe(
        false,
      );
    }
    const acts = [
      'dungeon-act-fight',
      'dungeon-act-event-pending',
      'dungeon-act-event',
      'dungeon-act-camp-pending',
      'dungeon-act-camp',
      'dungeon-act-home',
      'dungeon-act-defeat',
      'dungeon-act-cleared',
      'dungeon-act-door',
      'dungeon-act-descend-pending',
      'dungeon-act-descend',
      'dungeon-act-keeper',
    ];
    for (const name of acts) {
      const entry = bodies[name];
      expect(entry, name).toBeDefined();
      expect(entry?.method).toBe('POST');
      expect(entry?.path).toBe('/api/dungeon/act');
      expect(v.safeParse(ActBodySchema, entry?.body).success, name).toBe(true);
      expect(v.safeParse(ActBodySchema, { ...(entry?.body as object), extra: 1 }).success).toBe(
        false,
      );
    }
    expect(bodies['dungeon-replay-path']?.path).toBe(`/api/dungeon/run/${replayPath.summary.id}`);
  });
});
