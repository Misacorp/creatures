import { beforeEach, describe, expect, it, vi } from 'vitest';
import actionFire from './fixtures/action-fire.json';
import collectionState from './fixtures/collection-state.json';
import expeditionClaimFailed from './fixtures/expedition-claim-failed.json';
import expeditionClaimLoot from './fixtures/expedition-claim-loot.json';
import expeditionClaimRecall from './fixtures/expedition-claim-recall.json';
import expeditionClaimWorked from './fixtures/expedition-claim-worked.json';
import expeditionDestinations from './fixtures/expedition-destinations.json';
import expeditionErrors from './fixtures/expedition-errors.json';
import expeditionProfile from './fixtures/expedition-profile.json';
import expeditionPushOn from './fixtures/expedition-push-on.json';
import expeditionRequestBodies from './fixtures/expedition-request-bodies.json';
import expeditionSend from './fixtures/expedition-send.json';
import expeditionSend2 from './fixtures/expedition-send-2.json';
import expeditionSend3 from './fixtures/expedition-send-3.json';
import expeditionStateAfter from './fixtures/expedition-state-after.json';
import expeditionStateOffer from './fixtures/expedition-state-offer.json';
import workshopClaimSupply from './fixtures/workshop-claim-supply.json';
import workshopStartSupply from './fixtures/workshop-start-supply.json';
import gearDismantle from './fixtures/gear-dismantle.json';
import gearEquip from './fixtures/gear-equip.json';
import gearErrors from './fixtures/gear-errors.json';
import gearReady from './fixtures/gear-ready.json';
import gearRequestBodies from './fixtures/gear-request-bodies.json';
import gearRunning from './fixtures/gear-running.json';
import gearState from './fixtures/gear-state.json';
import gearUnequip from './fixtures/gear-unequip.json';
import gearUpgrade from './fixtures/gear-upgrade.json';
import gearWelcome from './fixtures/gear-welcome.json';
import workshopClaimCraft from './fixtures/workshop-claim-craft.json';
import workshopClaimEnchant from './fixtures/workshop-claim-enchant.json';
import workshopClaimImprove from './fixtures/workshop-claim-improve.json';
import workshopStartCraft from './fixtures/workshop-start-craft.json';
import workshopStartEnchant from './fixtures/workshop-start-enchant.json';
import workshopStartImprove from './fixtures/workshop-start-improve.json';
import dungeonErrors from './fixtures/dungeon-errors.json';
import dungeonReplay from './fixtures/dungeon-replay.json';
import dungeonRequestBodies from './fixtures/dungeon-request-bodies.json';
import dungeonRunCleared from './fixtures/dungeon-run-cleared.json';
import dungeonRunLandmark from './fixtures/dungeon-run-landmark.json';
import dungeonRunLost from './fixtures/dungeon-run-lost.json';
import dungeonRunRetry from './fixtures/dungeon-run-retry.json';
import dungeonRunRetryAttempt from './fixtures/dungeon-run-retry-attempt.json';
import dungeonToday from './fixtures/dungeon-today.json';
import dungeonTodayDone from './fixtures/dungeon-today-done.json';
import dungeonTodayLandmark from './fixtures/dungeon-today-landmark.json';
import dungeonTodayNeed from './fixtures/dungeon-today-need-creatures.json';
import dungeonTodayRetry from './fixtures/dungeon-today-retry.json';
import errorFixtures from './fixtures/errors.json';
import practiceStart from './fixtures/practice-start.json';
import raidAutofire from './fixtures/raid-autofire.json';
import raidReveal from './fixtures/raid-reveal.json';
import raidRevealSeen from './fixtures/raid-reveal-seen.json';
import statsFinale from './fixtures/raid-stats-finale.json';
import requestBodies from './fixtures/request-bodies.json';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { ApiError, parseGameState } from './api';
import {
  claimExpedition,
  fetchDestinations,
  fetchProfile,
  parseClaimResponse,
  pushOn,
  sendBody,
  sendExpedition,
  type SendRequest,
} from './expedition-api';
import { parseDestinations, parseProfile } from './expedition-parse';
import { fetchDungeonReplay, fetchDungeonToday, startDungeonRun } from './dungeon-api';
import { parseDungeonReplay, parseDungeonRun, parseDungeonToday } from './dungeon-parse';
import { buildRunRequest, type Slots } from './dungeon-team';
import { dungeonErrorText } from './dungeon-text';
import type { DungeonRunRequest } from './dungeon-types';
import { claimJob, dismantleGear, equipGear, fetchGear, startJob, upgradeGear } from './gear-api';
import { parseGearState } from './gear-parse';
import type { StartJobRequest } from './gear-types';
import { errorText } from './game';
import { autoFireTarget, buildAction } from './live';
import { sendLiveAction, startPractice } from './live-api';
import { fetchStats, markRevealSeen, setRaidAbility, setRaidAutofire } from './raid-api';

/**
 * The client against the Worker's strict schemas (`apps/worker/src/raid-schemas.ts`). The bodies in
 * `fixtures/request-bodies.json` are the contract: the Worker test "accepts the request bodies the
 * client sends" feeds them to the real routes, and here the client's own request functions must
 * build exactly those bodies. The error fixtures are the real error bodies of the same routes.
 */
describe('the requests the client sends', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  /** The path, method and parsed JSON body of the only request made. */
  function sent(): { path: string; method: string; body: unknown } {
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    return { path, method: init.method ?? 'GET', body: JSON.parse(init.body as string) };
  }

  const expected = (key: keyof typeof requestBodies) => {
    const { path, method, body } = requestBodies[key];
    return { path, method, body };
  };

  it('every action names its ability by key; Hold sends nothing else', async () => {
    apiFetch.mockResolvedValue(actionFire);
    await sendLiveAction(buildAction('m3:basic', 'rally', 'hold', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-hold'));

    apiFetch.mockClear();
    await sendLiveAction(buildAction('m3:basic', 'rally', 'fire', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-fire'));
  });

  it('Fire carries only the parameter its ability takes', async () => {
    apiFetch.mockResolvedValue(actionFire);
    await sendLiveAction(buildAction('m1:basic', 'shield-wall', 'fire', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-fire-zone'));

    apiFetch.mockClear();
    await sendLiveAction(buildAction('m2:basic', 're-mark', 'fire', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-fire-element'));
  });

  it('creature abilities are fired and held by their own key, with no parameters', async () => {
    apiFetch.mockResolvedValue(actionFire);
    await sendLiveAction(buildAction('m1:c1', 'static-zap', 'hold', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-hold-creature'));

    apiFetch.mockClear();
    await sendLiveAction(buildAction('m1:c1', 'static-zap', 'fire', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-fire-creature'));
  });

  it('the ability pick is { abilityId }', async () => {
    apiFetch.mockResolvedValue(raidReveal);
    await setRaidAbility('rally');
    expect(sent()).toEqual(expected('ability'));
  });

  it('the Auto fire preference is { target, on }: "basic" or a creature id', async () => {
    apiFetch.mockResolvedValue(raidAutofire);
    await setRaidAutofire('basic', false);
    expect(sent()).toEqual(expected('autofire-basic'));

    apiFetch.mockClear();
    const creature = requestBodies['autofire-creature'];
    await setRaidAutofire(creature.body.target, creature.body.on);
    expect(sent()).toEqual(expected('autofire-creature'));
  });

  it('names the preference target the way the server expects', () => {
    // A creature ability's target is its creature; the basic one is "basic".
    expect(autoFireTarget({ creature: 'c-1' })).toBe('c-1');
    expect(autoFireTarget({ creature: null })).toBe('basic');
  });

  it('"reveal seen" sends the week as a string, the week id the server gave', async () => {
    apiFetch.mockResolvedValue(raidRevealSeen);
    await markRevealSeen(raidReveal.you.reveal.week);
    const request = sent();
    expect(request).toEqual(expected('reveal-seen'));
    expect(request.body).toEqual({ week: expect.any(String) as string });
  });

  it('the stats are asked for by week, party and phase in the path, with no body', async () => {
    apiFetch.mockResolvedValue(statsFinale);
    const stats = await fetchStats('2027-W02', 1, 'finale');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/raid/stats/2027-W02/1/finale');
    expect(stats.phase).toBe('finale');
  });

  it('the practice start is an empty object', async () => {
    apiFetch.mockResolvedValue(practiceStart);
    await startPractice();
    expect(sent()).toEqual(expected('practice'));
  });
});

describe('the errors the server sends', () => {
  const GENERIC = /^Something went wrong/;

  it('has a friendly text for every error code of the live, ability, practice and reveal routes', () => {
    expect(errorFixtures.length).toBeGreaterThan(10);
    for (const { route, status, body } of errorFixtures) {
      const text = errorText(new ApiError(status, body.error));
      expect(text, `${route} ${String(status)} ${body.error}`).not.toMatch(GENERIC);
      expect(text.length).toBeGreaterThan(10);
    }
  });

  it('covers the codes the finale adds', () => {
    const codes = new Set(errorFixtures.map((e) => e.body.error));
    for (const code of [
      'invalid_body',
      'not_in_fight',
      'too_late',
      'already_fired',
      'not_your_ability',
      'hold_too_late',
      'not_held',
      'locked',
      'not_in_roster',
      'not_found',
      'practice_blocked',
      'practice_cooldown',
      'invalid_session',
      'rate_limited',
    ]) {
      expect(codes.has(code), code).toBe(true);
    }
  });

  it('says what a practice refusal means, and what a missing reveal week means', () => {
    expect(errorText(new ApiError(409, 'practice_blocked'))).toContain('30 minutes');
    expect(errorText(new ApiError(409, 'practice_cooldown'))).toContain('10 minutes');
    expect(errorText(new ApiError(404, 'not_found'))).toContain('no longer exists');
  });
});

describe('the gear requests the client sends', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  function sent(): { path: string; method: string; body: unknown } {
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    return { path, method: init.method ?? 'GET', body: JSON.parse(init.body as string) };
  }

  const expected = (key: keyof typeof gearRequestBodies) => {
    const { path, method, body } = gearRequestBodies[key];
    return { path, method, body };
  };

  it('equip and unequip send { creatureId }, with null to take it off', async () => {
    apiFetch.mockResolvedValue(gearEquip);
    const equip = gearRequestBodies.equip;
    await equipGear(equip.path.split('/')[3] as string, equip.body.creatureId);
    expect(sent()).toEqual(expected('equip'));

    apiFetch.mockClear();
    apiFetch.mockResolvedValue(gearUnequip);
    await equipGear(equip.path.split('/')[3] as string, null);
    expect(sent()).toEqual(expected('unequip'));
  });

  it('upgrade and dismantle send only the idempotency key', async () => {
    apiFetch.mockResolvedValue(gearUpgrade);
    const up = gearRequestBodies.upgrade;
    await upgradeGear(up.path.split('/')[3] as string, up.body.idempotencyKey);
    expect(sent()).toEqual(expected('upgrade'));

    apiFetch.mockClear();
    apiFetch.mockResolvedValue(gearDismantle);
    const dis = gearRequestBodies.dismantle;
    await dismantleGear(dis.path.split('/')[3] as string, dis.body.idempotencyKey);
    expect(sent()).toEqual(expected('dismantle'));
  });

  it('a craft, an improve and an enchant each send exactly their fields and a key', async () => {
    apiFetch.mockResolvedValue(workshopStartCraft);
    await startJob(gearRequestBodies['job-craft'].body as StartJobRequest);
    expect(sent()).toEqual(expected('job-craft'));

    apiFetch.mockClear();
    apiFetch.mockResolvedValue(workshopStartImprove);
    await startJob(gearRequestBodies['job-improve'].body as StartJobRequest);
    expect(sent()).toEqual(expected('job-improve'));

    apiFetch.mockClear();
    apiFetch.mockResolvedValue(workshopStartEnchant);
    await startJob(gearRequestBodies['job-enchant'].body as StartJobRequest);
    expect(sent()).toEqual(expected('job-enchant'));
  });

  it('claiming a job sends the key; claiming an expedition still sends an empty object', async () => {
    apiFetch.mockResolvedValue(workshopClaimCraft);
    const claim = gearRequestBodies['job-claim'];
    await claimJob(claim.path.split('/')[4] as string, claim.body.idempotencyKey);
    expect(sent()).toEqual(expected('job-claim'));

    // The expedition claim is sent by api.ts itself; its body is the empty object recorded here.
    expect(gearRequestBodies['expedition-claim'].body).toEqual({});
    expect(gearRequestBodies['expedition-claim'].path).toMatch(
      /^\/api\/expeditions\/[^/]+\/claim$/,
    );
  });

  it('asks for the gear view with a plain GET', async () => {
    apiFetch.mockResolvedValue(gearState);
    await fetchGear();
    expect(apiFetch).toHaveBeenCalledWith('/api/gear');
  });
});

describe('the gear responses the server sends', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('parses every GET /api/gear fixture', () => {
    for (const fixture of [gearState, gearReady, gearRunning, gearWelcome]) {
      const parsed = parseGearState(fixture);
      expect(parsed.slots.total).toBeGreaterThan(0);
      expect(Object.keys(parsed.parts)).toHaveLength(6);
    }
  });

  it('reads the welcome kit, a running job and a ready job', () => {
    expect(parseGearState(gearWelcome).grants[0]?.source).toBe('welcome');
    expect(parseGearState(gearRunning).jobs.some((j) => j.status === 'running')).toBe(true);
    expect(parseGearState(gearReady).jobs.some((j) => j.status === 'ready')).toBe(true);
  });

  it('parses the result, the gear view and the collection of every action', async () => {
    const calls = [
      [gearEquip, () => equipGear('g', 'c')],
      [gearUnequip, () => equipGear('g', null)],
      [gearUpgrade, () => upgradeGear('g', 'k')],
      [gearDismantle, () => dismantleGear('g', 'k')],
      [workshopStartCraft, () => startJob(gearRequestBodies['job-craft'].body as StartJobRequest)],
      [
        workshopStartImprove,
        () => startJob(gearRequestBodies['job-improve'].body as StartJobRequest),
      ],
      [
        workshopStartEnchant,
        () => startJob(gearRequestBodies['job-enchant'].body as StartJobRequest),
      ],
      [workshopClaimCraft, () => claimJob('j', 'k')],
      [workshopClaimImprove, () => claimJob('j', 'k')],
      [workshopClaimEnchant, () => claimJob('j', 'k')],
    ] as const;
    for (const [fixture, call] of calls) {
      apiFetch.mockResolvedValue(fixture);
      const done = await call();
      expect(done.gear.items.length).toBeGreaterThanOrEqual(0);
      expect(done.state.creatures.length).toBeGreaterThan(0);
      expect(done.state.creatures.every((c) => c.busy !== undefined)).toBe(true);
    }
  });

  it('reads the claim results of the three kinds of job', async () => {
    apiFetch.mockResolvedValue(workshopClaimCraft);
    expect((await claimJob('j', 'k')).result.kind).toBe('craft');
    apiFetch.mockResolvedValue(workshopClaimImprove);
    expect((await claimJob('j', 'k')).result.kind).toBe('improve');
    apiFetch.mockResolvedValue(workshopClaimEnchant);
    expect((await claimJob('j', 'k')).result.kind).toBe('enchant');
  });

  it('refuses a payload that is not the shape the server sends', async () => {
    expect(() => parseGearState({ ...gearState, parts: { scrap: 1 } })).toThrow();
    expect(() => parseGearState({ ...gearState, items: [{ id: 'x' }] })).toThrow();
    apiFetch.mockResolvedValue({ ...gearUpgrade, result: { gearId: 5 } });
    await expect(upgradeGear('g', 'k')).rejects.toThrow('upgrade result');
    apiFetch.mockResolvedValue({ result: {}, gear: gearState });
    await expect(upgradeGear('g', 'k')).rejects.toThrow();
  });

  it('puts gear, statsWithGear and busy on every creature of the collection', () => {
    const game = parseGameState(collectionState);
    expect(game.creatures.some((c) => c.gear !== null)).toBe(true);
    expect(game.creatures.some((c) => c.busy?.kind === 'job')).toBe(true);
    for (const c of game.creatures) {
      expect(c.statsWithGear.atk).toBeGreaterThanOrEqual(c.stats.atk);
    }
    expect(() =>
      parseGameState({
        ...collectionState,
        creatures: collectionState.creatures.map((c) => ({ ...c, busy: undefined })),
      }),
    ).toThrow();
  });

  it('reads the loot of an expedition claim, and a claim without loot', () => {
    const claimed = parseClaimResponse(expeditionClaimLoot);
    expect(claimed.result.loot?.parts.scrap ?? 0).toBe(
      expeditionClaimLoot.result.loot.parts.scrap ?? 0,
    );
    expect(claimed.result.loot?.blueprints).toHaveLength(1);
    expect(claimed.result.catches).toHaveLength(expeditionClaimLoot.result.catches.length);
    expect(claimed.result.catches.length).toBeGreaterThan(0);
    const older = parseClaimResponse({
      ...expeditionClaimLoot,
      result: { recalled: true, catches: [] },
    });
    expect(older.result.loot).toBeUndefined();
    expect(() =>
      parseClaimResponse({
        ...expeditionClaimLoot,
        result: { ...expeditionClaimLoot.result, loot: { gear: 1 } },
      }),
    ).toThrow();
  });
});

describe('the gear errors the server sends', () => {
  const GENERIC = /^Something went wrong/;

  it('has a friendly text for every error code of the gear and workshop routes', () => {
    expect(gearErrors.length).toBeGreaterThan(10);
    for (const { route, status, body } of gearErrors) {
      const text = errorText(new ApiError(status, body.error));
      expect(text, `${route} ${String(status)} ${body.error}`).not.toMatch(GENERIC);
      expect(text.length).toBeGreaterThan(10);
    }
  });

  it('has a text for every code the server can send beyond the fixtures', () => {
    for (const code of [
      'insufficient_parts',
      'creature_on_job',
      'workshop_full',
      'inventory_full',
      'item_busy',
      'not_ready',
      'max_level',
      'same_enchant',
      'blueprint_unknown',
      'nothing_to_improve',
      'invalid_secondary',
      'invalid_blueprint',
      'invalid_enchant',
      'item_gone',
    ]) {
      expect(errorText(new ApiError(409, code)), code).not.toMatch(GENERIC);
    }
  });

  it('names Essence when an upgrade is refused for money', () => {
    expect(errorText(new ApiError(409, 'insufficient_funds'), 'Essence')).toBe(
      'Not enough Essence.',
    );
  });

  it('says where a busy creature is, for an expedition and for a job', () => {
    expect(errorText(new ApiError(409, 'creature_on_job'))).toContain('job');
    expect(errorText(new ApiError(409, 'creature_away'))).toContain('expedition');
  });
});

describe('the dungeon requests the client sends', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  function sent(): { path: string; method: string; body: unknown } {
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    return { path, method: init.method ?? 'GET', body: JSON.parse(init.body as string) };
  }

  const bodyOf = (key: keyof typeof dungeonRequestBodies): DungeonRunRequest =>
    dungeonRequestBodies[key].body as unknown as DungeonRunRequest;

  it('a run sends exactly the strict body the Worker accepts, at POST /api/dungeon/run', async () => {
    for (const key of [
      'dungeon-run-cleared',
      'dungeon-run-retry',
      'dungeon-run-landmark',
      'dungeon-run-lost',
      'dungeon-run-retry-attempt',
    ] as const) {
      apiFetch.mockReset();
      apiFetch.mockResolvedValue(dungeonRunCleared);
      await startDungeonRun(bodyOf(key));
      const { path, method, body } = dungeonRequestBodies[key];
      expect(sent(), key).toEqual({ path, method, body });
    }
  });

  it('the screen builds the same bodies from the same picks', () => {
    for (const key of ['dungeon-run-cleared', 'dungeon-run-lost'] as const) {
      const fixtureBody = bodyOf(key);
      const [front, middle, back] = fixtureBody.team;
      const slots: Slots = [front, middle, back];
      expect(buildRunRequest(slots, fixtureBody.idempotencyKey)).toEqual(fixtureBody);
      // Exactly the strict body: the team and the key, and nothing about abilities.
      expect(Object.keys(fixtureBody).sort()).toEqual(['idempotencyKey', 'team']);
    }
  });

  it('every body has a key of the form the Worker wants, and is retried with the same one', () => {
    for (const key of Object.keys(dungeonRequestBodies) as (keyof typeof dungeonRequestBodies)[]) {
      const body = dungeonRequestBodies[key].body;
      if (body === null) continue;
      expect((body as { idempotencyKey: string }).idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    }
    // A retry of a run is the same call with the same body, so the key travels along unchanged.
    expect(bodyOf('dungeon-run-retry')).toEqual(bodyOf('dungeon-run-cleared'));
  });

  it("asks for today's state and for a run's replay with plain GETs", async () => {
    apiFetch.mockResolvedValue(dungeonToday);
    await fetchDungeonToday();
    expect(apiFetch).toHaveBeenCalledWith('/api/dungeon/today');

    apiFetch.mockClear();
    apiFetch.mockResolvedValue(dungeonReplay);
    const { path } = dungeonRequestBodies['dungeon-replay'];
    await fetchDungeonReplay(path.split('/')[4] as string);
    expect(apiFetch).toHaveBeenCalledWith(path);
  });

  it('encodes a run id so it can never leave the path', async () => {
    apiFetch.mockResolvedValue(dungeonReplay);
    await fetchDungeonReplay('../gear');
    expect(apiFetch).toHaveBeenCalledWith('/api/dungeon/run/..%2Fgear');
  });
});

describe('the dungeon responses the server sends', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('parses every GET /api/dungeon/today fixture', () => {
    const states = [
      dungeonToday,
      dungeonTodayRetry,
      dungeonTodayDone,
      dungeonTodayLandmark,
      dungeonTodayNeed,
    ].map(parseDungeonToday);
    for (const state of states) expect(state.modifiers).toHaveLength(3);
    expect(states[0]?.canRun).toBe(true);
    expect(states[1]?.last?.cleared).toBe(false);
    expect(states[2]?.blocked).toBe('already_run');
    expect(states[3]?.landmark).toBe(true);
    expect(states[4]?.blocked).toBe('need_creatures');
    // The last team: null before a first run, the run's ids in its row order after one.
    expect(states[0]?.lastTeam).toBeNull();
    expect(states[2]?.lastTeam).toEqual(dungeonRunCleared.run.team.map((t) => t.id));
  });

  it('parses the run and the new state of every POST /api/dungeon/run fixture', async () => {
    for (const fixture of [
      dungeonRunCleared,
      dungeonRunLost,
      dungeonRunLandmark,
      dungeonRunRetry,
      dungeonRunRetryAttempt,
    ]) {
      apiFetch.mockResolvedValue(fixture);
      const done = await startDungeonRun(bodyOf0());
      expect(done.run.rooms).toHaveLength(3);
      expect(done.today.last?.id).toBe(done.run.id);
    }
    expect(parseDungeonRun(dungeonRunLandmark).run.rewards.gear).toHaveLength(1);
    expect(parseDungeonRun(dungeonRunLost).run.rewards.bait).toBe(0);
  });

  it('parses the replay of a run: rooms with events, hpStart, hpMax and names', async () => {
    apiFetch.mockResolvedValue(dungeonReplay);
    const replay = await fetchDungeonReplay('x');
    expect(replay.rooms).toHaveLength(3);
    for (const room of replay.rooms) {
      expect(room.events.length).toBeGreaterThan(0);
      expect(Object.keys(room.hpStart)).toHaveLength(3);
      expect(Object.keys(room.hpMax)).toHaveLength(3);
      expect(room.names.creatures).toBeDefined();
    }
  });

  it('refuses a payload that is not the shape the server sends', () => {
    expect(() => parseDungeonToday({ ...dungeonToday, depth: 'deep' })).toThrow('dungeon state');
    expect(() => parseDungeonToday({ ...dungeonToday, blocked: 'because' })).toThrow();
    expect(() => parseDungeonToday({ ...dungeonToday, modifiers: [{ id: 'x' }] })).toThrow();
    expect(() => parseDungeonToday({ ...dungeonToday, lastTeam: [1, 2, 3] })).toThrow();
    expect(() => parseDungeonToday({ ...dungeonToday, lastTeam: undefined })).toThrow();
    expect(() => parseDungeonRun({ run: {}, today: dungeonToday })).toThrow('dungeon run');
    expect(() => parseDungeonRun({ ...dungeonRunCleared, today: null })).toThrow();
    const bad = {
      ...dungeonReplay,
      rooms: [{ ...dungeonReplay.rooms[0], events: [{ t: 'nope' }] }],
    };
    expect(() => parseDungeonReplay(bad)).toThrow('dungeon replay');
    expect(() => parseDungeonReplay({ ...dungeonReplay, row: [{ id: 1 }] })).toThrow();
    const noHp = { ...dungeonReplay.rooms[0], hpStart: { a: -1 } };
    expect(() => parseDungeonReplay({ ...dungeonReplay, rooms: [noHp] })).toThrow();
  });
});

describe('the dungeon errors the server sends', () => {
  const GENERIC = /^Something went wrong/;

  it('has a friendly text for every error code of the dungeon routes', () => {
    expect(dungeonErrors.length).toBeGreaterThan(5);
    for (const { route, status, body } of dungeonErrors) {
      const text = dungeonErrorText(new ApiError(status, body.error));
      expect(text, `${route} ${String(status)} ${body.error}`).not.toMatch(GENERIC);
      expect(text.length).toBeGreaterThan(10);
    }
  });
});

/** Any run body: the answer fixtures do not depend on what is asked. */
function bodyOf0(): DungeonRunRequest {
  return dungeonRequestBodies['dungeon-run-cleared'].body as unknown as DungeonRunRequest;
}

describe('the expedition requests the client sends', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  /** The path, method and parsed JSON body of the only request made. */
  function sent(): { path: string; method: string; body: unknown } {
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    return { path, method: init.method ?? 'GET', body: JSON.parse(init.body as string) };
  }

  /** The id in a recorded path such as /api/expeditions/<id>/claim: it changes with every re-capture. */
  const idOfPath = (path: string): string => path.split('/')[3] ?? '';

  const recorded = (key: keyof typeof expeditionRequestBodies) => {
    const { path, method, body } = expeditionRequestBodies[key];
    return { path, method, body };
  };

  /** The request the screen would make for a recorded body (the key is added by the key store). */
  const requestOf = (body: {
    creatureId: string;
    destination: string;
    duration: string;
    supplies: { id: string; source: string }[];
  }): SendRequest => body as SendRequest;

  it('sends exactly the keys and values the Worker accepted, for every recorded trip', async () => {
    const cases = [
      ['expedition-send', expeditionSend],
      ['expedition-send-2', expeditionSend2],
      ['expedition-send-3', expeditionSend3],
    ] as const;
    for (const [key, answer] of cases) {
      apiFetch.mockReset();
      apiFetch.mockResolvedValue(answer);
      const { idempotencyKey, ...rest } = expeditionRequestBodies[key].body;
      const done = await sendExpedition(requestOf(rest), idempotencyKey);
      expect(sent(), key).toEqual(recorded(key));
      expect(done.expedition.status).toBe('active');
      expect(done.state.expeditions.some((e) => e.id === done.expedition.id)).toBe(true);
    }
  });

  it('sends nothing the Worker would reject: no extra keys, whatever the screen holds', () => {
    const extra = {
      creatureId: 'c',
      destination: 'tidepools',
      duration: 'day' as const,
      supplies: [{ id: 'lure-good', source: 'buy' as const, price: 30 }],
      mood: 'happy',
    };
    const body = sendBody(extra, 'k');
    expect(Object.keys(body).sort()).toEqual(
      Object.keys(expeditionRequestBodies['expedition-send'].body).sort(),
    );
    expect(body.supplies).toEqual([{ id: 'lure-good', source: 'buy' }]);
    expect(body.duration).toBe('day');
  });

  it('pushes on with only the goal, and claims with an empty body', async () => {
    apiFetch.mockResolvedValue(expeditionPushOn);
    const done = await pushOn(
      expeditionPushOn.expedition.id,
      expeditionRequestBodies['expedition-push-on'].body.goalId,
    );
    expect(sent()).toEqual(recorded('expedition-push-on'));
    expect(done.expedition.pushOn?.goalId).toBe('shortcut');

    apiFetch.mockReset();
    apiFetch.mockResolvedValue(expeditionClaimWorked);
    await claimExpedition(idOfPath(expeditionRequestBodies['expedition-claim-worked'].path));
    expect(sent()).toEqual(recorded('expedition-claim-worked'));
  });

  it('reads every claim: worked, failed, recalled and one with loot, supplies and XP', async () => {
    for (const fixture of [
      expeditionClaimWorked,
      expeditionClaimFailed,
      expeditionClaimRecall,
      expeditionClaimLoot,
    ]) {
      apiFetch.mockReset();
      apiFetch.mockResolvedValue(fixture);
      const done = await claimExpedition('x');
      expect(done.state.expeditions.length).toBeGreaterThan(0);
    }
    const loot = parseClaimResponse(expeditionClaimLoot);
    expect(loot.result.loot?.supplies).toEqual(['lure-basic']);
    expect(loot.result.xp).toMatchObject({ gained: 300, rank: 2, rankBefore: 1 });
    expect(loot.result.familiarity?.trips).toBe(1);
    const failed = parseClaimResponse(expeditionClaimFailed);
    expect(failed.result.failed).toBe(true);
    expect(failed.result.pushOn).toMatchObject({ risk: 'risky', outcome: 'failed' });
    const worked = parseClaimResponse(expeditionClaimWorked);
    expect(worked.result.slotUnlocked?.total).toBe(2);
    expect(worked.result.rankGifts?.[0]).toMatchObject({ rank: 4, bait: 15, parts: { scrap: 2 } });
    expect(worked.result.rankGifts?.[0]?.supplies).toEqual([]);
    expect(worked.result.journal?.[0]?.entryId).toBe('tide-first-pool');
    expect(parseClaimResponse(expeditionClaimRecall).result.recalled).toBe(true);
  });

  it('reads the destinations and the profile', async () => {
    apiFetch.mockResolvedValue(expeditionDestinations);
    const view = await fetchDestinations();
    expect(view.destinations.map((d) => d.id)).toEqual([
      'tidepools',
      'ember-caves',
      'verdant-hollow',
      'storm-ridge',
      'old-crossroads',
      'moonlit-reef',
      'festival-grounds',
    ]);
    expect(view.special.destination).toBe('moonlit-reef');
    expect(view.familiarity[0]?.found).toEqual(['mistnewt']);

    apiFetch.mockReset();
    apiFetch.mockResolvedValue(expeditionProfile);
    const profile = await fetchProfile();
    expect(profile.journal.total).toBe(40);
    expect(profile.explorers).toHaveLength(4);
    expect(profile.milestones).toHaveLength(10);
    expect(profile.slots.next).toEqual({ kind: 'rank_sum', at: 26 });
  });

  it('refuses destinations and a profile that are not the shape the server sends', () => {
    expect(() => parseDestinations({ ...expeditionDestinations, night: 'yes' })).toThrow();
    expect(() =>
      parseDestinations({
        ...expeditionDestinations,
        destinations: [
          { id: 'x', minRank: 1, nightOnly: false, festivalOnly: false, closed: ['x'] },
        ],
      }),
    ).toThrow();
    expect(() => parseProfile({ ...expeditionProfile, stats: { trips: -1 } })).toThrow();
    expect(() => parseProfile({ ...expeditionProfile, slots: {} })).toThrow();
  });
});

describe('the expedition state the server sends', () => {
  it('reads a trip with a pending choice: its goals with exact odds, and the new fields', () => {
    const offer = parseGameState(expeditionStateOffer);
    const trip = offer.expeditions[0];
    expect(trip?.status).toBe('active');
    expect(trip?.supplies).toBe('great');
    expect(trip?.kit).toEqual(['lure-great', 'map-scrap-basic']);
    expect(trip?.destination).toBe('tidepools');
    expect(trip?.readyAt).toBe(trip?.endsAt);
    expect(trip?.offer?.goals.map((g) => [g.id, g.risk, g.oddsBp])).toEqual([
      ['forage', 'safe', 10000],
      ['shortcut', 'risky', 6100],
    ]);
    expect(offer.slots).toMatchObject({ total: 1, used: 1, next: { kind: 'trips', at: 3 } });
    expect(offer.supplies).toEqual({ 'lure-great': 2 });
    expect(offer.timezone).toBe('Europe/Helsinki');
    expect(offer.creatures.every((c) => c.explorer.rank >= 1)).toBe(true);
  });

  it('reads claimed trips with their results and a running push-on', () => {
    const after = parseGameState(expeditionStateAfter);
    expect(after.expeditions.some((e) => e.status === 'claimed' && e.result !== null)).toBe(true);
    expect(after.expeditions.every((e) => e.pushOn !== null)).toBe(true);
    const push = parseGameState(expeditionPushOn.state);
    expect(push.expeditions[0]?.pushOn).toMatchObject({ goalId: 'shortcut', oddsBp: 6100 });
    expect(push.expeditions[0]?.readyAt).toBeGreaterThan(push.expeditions[0]?.endsAt ?? 0);
  });

  it('keeps the whole state readable for a 24 hour trip and for every other length', () => {
    for (const duration of ['short', 'medium', 'long', 'day']) {
      const state = structuredClone(expeditionStateOffer);
      (state.expeditions[0] as { duration: string }).duration = duration;
      expect(parseGameState(state).expeditions[0]?.duration).toBe(duration);
    }
    const bad = structuredClone(expeditionStateOffer);
    (bad.expeditions[0] as { duration: string }).duration = 'week';
    expect(() => parseGameState(bad)).toThrow('game state');
  });

  it('refuses a state without an explorer, with a broken slot or with a bad offer', () => {
    const noExplorer = structuredClone(expeditionStateOffer);
    delete (noExplorer.creatures[0] as { explorer?: unknown }).explorer;
    expect(() => parseGameState(noExplorer)).toThrow('game state');
    expect(() => parseGameState({ ...expeditionStateOffer, slots: { total: 1, used: 1 } })).toThrow(
      'game state',
    );
    const badOffer = structuredClone(expeditionStateOffer);
    (badOffer.expeditions[0] as { offer: unknown }).offer = { goals: [{ id: 'x' }] };
    expect(() => parseGameState(badOffer)).toThrow('game state');
    expect(() =>
      parseGameState({ ...expeditionStateOffer, supplies: { 'lure-basic': -1 } }),
    ).toThrow();
  });

  it('reads the trips that were called home when the slots were reset', () => {
    const state = structuredClone(expeditionStateAfter);
    (state as { cancelled: unknown[] }).cancelled = [
      {
        id: 't1',
        creatureId: state.creatures[0]?.id,
        destination: 'old-crossroads',
        duration: 'long',
        startedAt: 1,
        reason: 'slot_wipe',
      },
    ];
    expect(parseGameState(state).cancelled).toHaveLength(1);
    (state as { cancelled: unknown[] }).cancelled = [{ id: 't1' }];
    expect(() => parseGameState(state)).toThrow('game state');
  });
});

describe('the expedition errors the server sends', () => {
  const GENERIC = /^Something went wrong/;

  it('has a friendly text for every error of the expedition routes, with its reason', () => {
    expect(expeditionErrors.length).toBeGreaterThan(8);
    for (const { route, status, body } of expeditionErrors) {
      const reason = 'reason' in body ? body.reason : null;
      const text = errorText(new ApiError(status, body.error, reason));
      expect(text, `${route} ${String(status)} ${body.error}`).not.toMatch(GENERIC);
      expect(text.length).toBeGreaterThan(10);
    }
  });

  it('says why a place refused, by its reason', () => {
    expect(errorText(new ApiError(409, 'destination_closed', 'night'))).toContain('night');
    expect(errorText(new ApiError(409, 'destination_closed', 'festival'))).toContain('Festival');
    expect(errorText(new ApiError(409, 'destination_closed', 'rank'))).toContain('rank');
    expect(errorText(new ApiError(409, 'rank_too_low', 'length'))).toContain('long');
  });

  it('has a text for every code the server can send beyond the fixtures', () => {
    for (const code of [
      'no_offer',
      'not_active',
      'cancelled',
      'invalid_destination',
      'invalid_supply',
      'skill_too_low',
      'creature_on_job',
    ]) {
      expect(errorText(new ApiError(409, code)), code).not.toMatch(GENERIC);
    }
  });
});

describe('supply crafts in the Workshop', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('keeps the supply job in the Workshop view, with its supply and its result', () => {
    for (const fixture of [workshopStartSupply, workshopClaimSupply]) {
      const gear = parseGearState(fixture.gear);
      const job = gear.jobs.find((j) => j.kind === 'supply');
      expect(job?.input.supplyId).toBe('lure-basic');
      expect(gear.jobs).toHaveLength(fixture.gear.jobs.length);
    }
    const claimed = parseGearState(workshopClaimSupply.gear).jobs[0];
    expect(claimed?.result).toMatchObject({ kind: 'supply', supplyId: 'lure-basic', amount: 1 });
  });

  it('starts a supply craft with exactly the recorded body and claims it with a key', async () => {
    apiFetch.mockResolvedValue(workshopStartSupply);
    const recordedStart = expeditionRequestBodies['workshop-start-supply'];
    const { idempotencyKey, ...rest } = recordedStart.body;
    const request: StartJobRequest = {
      ...(rest as { kind: 'supply'; creatureId: string; supplyId: string }),
      idempotencyKey,
    };
    await startJob(request);
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    const startBody: unknown = JSON.parse(init.body as string);
    expect({ path, method: init.method, body: startBody }).toEqual({
      path: recordedStart.path,
      method: recordedStart.method,
      body: recordedStart.body,
    });

    apiFetch.mockReset();
    apiFetch.mockResolvedValue(workshopClaimSupply);
    const claimed = await claimJob(
      expeditionRequestBodies['workshop-claim-supply'].path.split('/')[4] ?? '',
      expeditionRequestBodies['workshop-claim-supply'].body.idempotencyKey,
    );
    expect(claimed.result).toMatchObject({ kind: 'supply', supplyId: 'lure-basic', amount: 1 });
    expect(claimed.state.supplies).toEqual({ 'lure-basic': 1, 'lure-great': 1 });
  });

  it('refuses a supply result without a supply', () => {
    const broken = structuredClone(workshopClaimSupply.gear) as unknown as {
      jobs: { result: unknown }[];
    };
    const job = broken.jobs[0];
    if (job === undefined) throw new Error('the fixture has no job');
    job.result = { kind: 'supply', xp: 1, skillXp: 1, skillLevel: 1, leveledUp: false };
    expect(() => parseGearState(broken)).toThrow('gear view');
  });
});

describe('gear views of other sources', () => {
  it('reads a gear view whose newest grant is a daily dungeon drop', () => {
    const grant = gearWelcome.grants[0];
    if (grant === undefined) throw new Error('the fixture has no grant');
    const parsed = parseGearState({
      ...gearWelcome,
      grants: [{ ...grant, source: 'dungeon', key: 'dungeon:2026-10-13:1' }],
    });
    expect(parsed.grants[0]?.source).toBe('dungeon');
  });
});
