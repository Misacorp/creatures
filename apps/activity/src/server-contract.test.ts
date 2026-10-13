import { beforeEach, describe, expect, it, vi } from 'vitest';
import actionFire from './fixtures/action-fire.json';
import collectionState from './fixtures/collection-state.json';
import expeditionClaimLoot from './fixtures/expedition-claim-loot.json';
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

import { ApiError, parseClaimResponse, parseGameState, type Creature } from './api';
import { fetchDungeonReplay, fetchDungeonToday, startDungeonRun } from './dungeon-api';
import { parseDungeonReplay, parseDungeonRun, parseDungeonToday } from './dungeon-parse';
import {
  DEFAULT_ABILITY_SETTINGS,
  buildRunRequest,
  type AbilitySettings,
  type Slots,
} from './dungeon-team';
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
    expect(claimed.result.loot?.parts.scrap).toBe(6);
    expect(claimed.result.loot?.blueprints).toHaveLength(1);
    expect(claimed.result.catches).toHaveLength(3);
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
    const ability = { id: 'static-zap', unlocked: true, unlockLevel: 10 };
    const fixtureBody = bodyOf('dungeon-run-cleared');
    const [front, middle, back] = fixtureBody.team;
    const make = (id: string, species: string, withAbility: boolean): Creature =>
      ({
        id,
        species,
        level: 12,
        stats: { hp: 100, atk: 10, spd: 10 },
        ability: withAbility ? ability : null,
      }) as unknown as Creature;
    const creatures = [
      make(front, 'sproutle', false),
      make(middle, 'splashet', false),
      make(back, 'cindle', true),
    ];
    const slots: Slots = [front, middle, back];
    const settings: AbilitySettings = {
      ...DEFAULT_ABILITY_SETTINGS,
      basicId: 'shield-wall',
      basicRound: 2,
      zone: 'front',
      creatureRounds: { [back]: 3 },
    };
    expect(buildRunRequest(slots, creatures, settings, fixtureBody.idempotencyKey)).toEqual(
      fixtureBody,
    );

    // The default picks: Rally on Auto, no creature rounds, the same shape as the lost and landmark runs.
    const lost = bodyOf('dungeon-run-lost');
    const lostCreatures = lost.team.map((id) => make(id, 'mistnewt', false));
    const [a, b, c] = lost.team;
    expect(
      buildRunRequest([a, b, c], lostCreatures, DEFAULT_ABILITY_SETTINGS, lost.idempotencyKey),
    ).toEqual(lost);
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
