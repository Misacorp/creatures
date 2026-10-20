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
import gearEquip from './fixtures/gear-equip.json';
import gearErrors from './fixtures/gear-errors.json';
import gearReady from './fixtures/gear-ready.json';
import gearRequestBodies from './fixtures/gear-request-bodies.json';
import gearRunning from './fixtures/gear-running.json';
import gearState from './fixtures/gear-state.json';
import gearUnequip from './fixtures/gear-unequip.json';
import gearEquipBest from './fixtures/gear-equip-best.json';
import gearNotice from './fixtures/gear-notice.json';
import gearNoticeDismissed from './fixtures/gear-notice-dismissed.json';
import gearWelcome from './fixtures/gear-welcome.json';
import workshopClaimCraft from './fixtures/workshop-claim-craft.json';
import workshopClaimDismantle from './fixtures/workshop-claim-dismantle.json';
import workshopPreviewCraft from './fixtures/workshop-preview-craft.json';
import workshopPreviewDismantle from './fixtures/workshop-preview-dismantle.json';
import workshopStartDismantle from './fixtures/workshop-start-dismantle.json';
import workshopClaimRetired from './fixtures/workshop-claim-retired.json';
import workshopStartCraft from './fixtures/workshop-start-craft.json';
import dungeonActCampPending from './fixtures/dungeon-act-camp-pending.json';
import dungeonActCamp from './fixtures/dungeon-act-camp.json';
import dungeonActCleared from './fixtures/dungeon-act-cleared.json';
import dungeonActDefeat from './fixtures/dungeon-act-defeat.json';
import dungeonActDescendPending from './fixtures/dungeon-act-descend-pending.json';
import dungeonActDescend from './fixtures/dungeon-act-descend.json';
import dungeonActDoor from './fixtures/dungeon-act-door.json';
import dungeonActKeeper from './fixtures/dungeon-act-keeper.json';
import dungeonActEventPending from './fixtures/dungeon-act-event-pending.json';
import dungeonActEvent from './fixtures/dungeon-act-event.json';
import dungeonActFight from './fixtures/dungeon-act-fight.json';
import dungeonActHome from './fixtures/dungeon-act-home.json';
import dungeonMapErrors from './fixtures/dungeon-errors.json';
import legacyDungeonErrors from './fixtures/dungeon-legacy-errors.json';
import legacyDungeonRequestBodies from './fixtures/dungeon-legacy-request-bodies.json';
import dungeonReplayPath from './fixtures/dungeon-replay-path.json';
import dungeonStart from './fixtures/dungeon-start.json';
import dungeonTodayActive from './fixtures/dungeon-today-active.json';
import dungeonTodayMap from './fixtures/dungeon-today-map.json';
import dungeonReplay from './fixtures/dungeon-replay.json';
import dungeonRequestBodies from './fixtures/dungeon-request-bodies.json';

import dungeonRunCleared from './fixtures/dungeon-run-cleared.json';
import dungeonRunLandmark from './fixtures/dungeon-run-landmark.json';
import dungeonRunLost from './fixtures/dungeon-run-lost.json';
import dungeonRunRetry from './fixtures/dungeon-run-retry.json';
import dungeonRunRetryAttempt from './fixtures/dungeon-run-retry-attempt.json';
import dungeonTeamDraft from './fixtures/dungeon-team-draft.json';
import dungeonToday from './fixtures/dungeon-today.json';
import dungeonTodayDraft from './fixtures/dungeon-today-draft.json';
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
import {
  dungeonAct,
  fetchDungeonReplay,
  fetchDungeonToday,
  saveDungeonTeam,
  startDungeonRun,
} from './dungeon-api';
import {
  parseDungeonAct,
  parseDungeonReplay,
  parseDungeonStart,
  parseDungeonToday,
} from './dungeon-parse';
import { sampleState } from './dungeon-path-samples';
import { buildRunRequest, type Slots } from './dungeon-team';
import { keepsakeAct, restAct, swapAct } from './dungeon-run';
import { DUNGEON_ERROR_TEXT, dungeonErrorText, isStaleDungeonError } from './dungeon-text';
import { DUNGEON_ERRORS, type DungeonActRequest, type DungeonStartRequest } from './dungeon-types';
import {
  claimJob,
  dismissGearNotice,
  equipBestGear,
  equipGear,
  fetchGear,
  previewCraft,
  previewDismantle,
  startJob,
} from './gear-api';
import { parseGearState, parseJobResult } from './gear-parse';
import type { StartJobRequest } from './gear-types';
import { errorText } from './game';
import { autoFireTarget, buildAction } from './live';
import { sendLiveAction, startPractice } from './live-api';
import { fetchStats, markRevealSeen, setRaidAbility, setRaidAutofire } from './raid-api';

/** The older run route's error rows come first, then the map's: the codes of both are in the fixtures. */
const dungeonErrors: { route: string; status: number; body: { error: string; reason?: string } }[] =
  [...legacyDungeonErrors, ...dungeonMapErrors];

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

  it('equip best sends the creature ids', async () => {
    apiFetch.mockResolvedValue(gearEquipBest);
    await equipBestGear(gearRequestBodies['equip-best'].body.creatureIds);
    expect(sent()).toEqual(expected('equip-best'));
  });

  it('dismissing the conversion notice sends an empty object', async () => {
    apiFetch.mockResolvedValue(gearNoticeDismissed);
    await dismissGearNotice();
    expect(sent()).toEqual(expected('notice-dismiss'));
  });

  it('a craft sends exactly its fields, what it is aimed at and a key', async () => {
    apiFetch.mockResolvedValue(workshopStartCraft);
    await startJob(gearRequestBodies['job-craft'].body as StartJobRequest);
    expect(sent()).toEqual(expected('job-craft'));
    expect(gearRequestBodies['job-craft'].body.reach).toBe('none');
    apiFetch.mockClear();
    await startJob(gearRequestBodies['job-craft-reach'].body as StartJobRequest);
    expect(sent()).toEqual(expected('job-craft-reach'));
    expect(gearRequestBodies['job-craft-reach'].body.reach).toBe('rare');
  });

  it('a dismantle job sends the creature, the items and a key', async () => {
    apiFetch.mockResolvedValue(workshopStartDismantle);
    await startJob(gearRequestBodies['job-dismantle'].body as StartJobRequest);
    expect(sent()).toEqual(expected('job-dismantle'));
  });

  it('asks for a preview with the creature and the blueprint or the items, and reads the answer', async () => {
    apiFetch.mockResolvedValue(workshopPreviewCraft);
    const craft = gearRequestBodies['preview-craft'].body;
    const crafted = await previewCraft(craft.creatureId, craft.blueprintId);
    expect(sent()).toEqual(expected('preview-craft'));
    // The odds are the server's: this client only carries them.
    expect(crafted.options.map((o) => o.reach)).toEqual(['none', 'rare', 'epic']);
    for (const o of crafted.options) {
      expect(o.oddsBp.common + o.oddsBp.rare + o.oddsBp.epic).toBe(10_000);
    }
    apiFetch.mockClear();
    apiFetch.mockResolvedValue(workshopPreviewDismantle);
    const dis = gearRequestBodies['preview-dismantle'].body;
    const taken = await previewDismantle(dis.creatureId, dis.itemIds);
    expect(sent()).toEqual(expected('preview-dismantle'));
    expect(taken.range.scrap.max).toBeGreaterThan(0);
    expect(taken.items).toHaveLength(dis.itemIds.length);
    // A payload that is not the shape the server sends is an error, never a half-drawn screen.
    apiFetch.mockResolvedValue({ result: { ...workshopPreviewCraft.result, options: [{}] } });
    await expect(previewCraft('c', 'b')).rejects.toThrow('craft preview');
    apiFetch.mockResolvedValue({
      result: {
        ...workshopPreviewCraft.result,
        options: workshopPreviewCraft.result.options.map((o) => ({
          ...o,
          oddsBp: { common: 1, rare: 0, epic: 0 },
        })),
      },
    });
    await expect(previewCraft('c', 'b')).rejects.toThrow('craft preview');
    apiFetch.mockResolvedValue({ result: { ...workshopPreviewDismantle.result, learnBp: 'x' } });
    await expect(previewDismantle('c', ['i'])).rejects.toThrow('dismantle preview');
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
    for (const fixture of [gearState, gearReady, gearRunning, gearWelcome, gearNotice]) {
      const parsed = parseGearState(fixture);
      expect(parsed.slots.total).toBeGreaterThan(0);
      expect(Object.keys(parsed.parts)).toHaveLength(7);
    }
  });

  it('reads the welcome kit, a running job and a ready job', () => {
    expect(parseGearState(gearWelcome).grants[0]?.source).toBe('welcome');
    expect(parseGearState(gearRunning).jobs.some((j) => j.status === 'running')).toBe(true);
    expect(parseGearState(gearReady).jobs.some((j) => j.status === 'ready')).toBe(true);
  });

  it('reads the one-time conversion notice, and none once it is dismissed', () => {
    expect(parseGearState(gearNotice).notice?.converted).toBeGreaterThan(0);
    expect(parseGearState(gearState).notice).toBeNull();
    expect(parseGearState(gearNoticeDismissed.gear).notice).toBeNull();
  });

  it('parses the result, the gear view and the collection of every action', async () => {
    const calls = [
      [gearEquip, () => equipGear('g', 'c')],
      [gearUnequip, () => equipGear('g', null)],
      [gearEquipBest, () => equipBestGear(['c'])],
      [gearNoticeDismissed, () => dismissGearNotice()],
      [
        workshopStartDismantle,
        () => startJob(gearRequestBodies['job-dismantle'].body as StartJobRequest),
      ],
      [workshopClaimDismantle, () => claimJob('j', 'k')],
      [workshopStartCraft, () => startJob(gearRequestBodies['job-craft'].body as StartJobRequest)],
      [workshopClaimCraft, () => claimJob('j', 'k')],
      [workshopClaimRetired, () => claimJob('j', 'k')],
    ] as const;
    for (const [fixture, call] of calls) {
      apiFetch.mockResolvedValue(fixture);
      const done = await call();
      expect(done.gear.items.length).toBeGreaterThanOrEqual(0);
      expect(done.state.creatures.length).toBeGreaterThan(0);
      expect(done.state.creatures.every((c) => c.busy !== undefined)).toBe(true);
    }
  });

  it('reads the claim results of a craft, a dismantle, a supply and a job from before gear v2', async () => {
    apiFetch.mockResolvedValue(workshopClaimCraft);
    expect((await claimJob('j', 'k')).result.kind).toBe('craft');
    apiFetch.mockResolvedValue(workshopClaimDismantle);
    const taken = (await claimJob('j', 'k')).result;
    expect(taken.kind).toBe('dismantle');
    expect(taken.kind === 'dismantle' ? taken.items.length : 0).toBeGreaterThan(0);
    apiFetch.mockResolvedValue(workshopClaimSupply);
    expect((await claimJob('j', 'k')).result.kind).toBe('supply');
    apiFetch.mockResolvedValue(workshopClaimRetired);
    expect((await claimJob('j', 'k')).result.kind).toBe('retired');
  });

  it('refuses a payload that is not the shape the server sends', async () => {
    expect(() => parseGearState({ ...gearState, parts: { scrap: 1 } })).toThrow();
    // An item that is not the shape is left out (and logged), the view as a whole is still read.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(parseGearState({ ...gearState, items: [{ id: 'x' }] }).items).toEqual([]);
    quiet.mockRestore();
    expect(() => parseGearState({ ...gearState, items: 'x' })).toThrow();
    apiFetch.mockResolvedValue({
      ...workshopClaimDismantle,
      result: { kind: 'dismantle', items: 5 },
    });
    await expect(claimJob('j', 'k')).rejects.toThrow('job result');
    apiFetch.mockResolvedValue({ result: {}, gear: gearState });
    await expect(claimJob('j', 'k')).rejects.toThrow();
  });

  it('puts gear, statsWithGear and busy on every creature of the collection', () => {
    const game = parseGameState(collectionState);
    // The attention block of GET /api/state (the tab pips).
    expect(game.attention).toEqual(collectionState.attention);
    expect(game.creatures.some((c) => c.gear.length > 0)).toBe(true);
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
      'wrong_role',
      'slot_locked',
      'item_level_too_high',
      'gear_upgrade_removed',
      'blueprint_unknown',
      'invalid_blueprint',
      'item_gone',
    ]) {
      expect(errorText(new ApiError(409, code)), code).not.toMatch(GENERIC);
    }
  });

  it('says what the wear rule needs, from the reason the server gives', () => {
    expect(errorText(new ApiError(409, 'slot_locked', '13'))).toBe(
      'That slot opens at creature level 13.',
    );
    expect(errorText(new ApiError(409, 'item_level_too_high', '16'))).toBe(
      'That item needs creature level 16.',
    );
    expect(errorText(new ApiError(409, 'wrong_role', 'guard'))).toBe(
      'Only a Guard can wear that Charm.',
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

  type BodyKey = keyof typeof dungeonRequestBodies;
  const bodyOf = (key: BodyKey): DungeonStartRequest =>
    dungeonRequestBodies[key].body as unknown as DungeonStartRequest;
  const actBodyOf = (key: BodyKey): DungeonActRequest =>
    dungeonRequestBodies[key].body as unknown as DungeonActRequest;

  const ACT_KEYS = [
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
  ] as const satisfies readonly BodyKey[];

  it('entering sends exactly the strict body the Worker accepts, at POST /api/dungeon/start', async () => {
    apiFetch.mockResolvedValue(dungeonStart);
    await startDungeonRun(bodyOf('dungeon-start'));
    const { path, method, body } = dungeonRequestBodies['dungeon-start'];
    expect(sent()).toEqual({ path, method, body });
    expect(path).toBe('/api/dungeon/start');
    // The scenario packs a treat for one creature of the team.
    expect(Object.keys(body).sort()).toEqual(['idempotencyKey', 'team', 'treats']);
  });

  it('the screen builds the same start body from the same picks', () => {
    const fixtureBody = bodyOf('dungeon-start');
    const [front, middle, back] = fixtureBody.team;
    const slots: Slots = [front, middle, back];
    expect(
      buildRunRequest(slots, fixtureBody.idempotencyKey, new Set(fixtureBody.treats ?? [])),
    ).toEqual(fixtureBody);
    // The run that was started is the run the next acts name.
    expect(parseDungeonStart(dungeonStart).state.team.map((c) => c.id)).toEqual(fixtureBody.team);
  });

  it('every act sends exactly the strict body the Worker accepts, at POST /api/dungeon/act', async () => {
    for (const key of ACT_KEYS) {
      apiFetch.mockReset();
      apiFetch.mockResolvedValue({ state: sampleState() });
      await dungeonAct(actBodyOf(key));
      const { path, method, body } = dungeonRequestBodies[key];
      expect(sent(), key).toEqual({ path, method, body });
      expect(path).toBe('/api/dungeon/act');
      expect(Object.keys(body as object).sort(), key).toEqual([
        'act',
        'idempotencyKey',
        'runId',
        'step',
      ]);
    }
  });

  // The moves, the event pick and heading home are built by the screens themselves: the Dungeon tab
  // tests (`dungeon-fixture-screens.test.tsx`) send them and compare with these bodies.
  it('the camp builders make the same act as the captured one', () => {
    // The camp: the order of the row, the creature that goes home and the one that comes in.
    const camp = actBodyOf('dungeon-act-camp').act;
    if (camp.type !== 'camp' || camp.out === undefined || camp.in === undefined) {
      throw new Error('the captured camp act is a swap');
    }
    const order = camp.order ?? [];
    expect(swapAct(order, camp.out, camp.in)).toEqual(camp);
    // Rest and a keepsake are built the same way; the order is sent with them too.
    expect(restAct(order)).toEqual({ type: 'camp', choice: 'rest', order });
    expect(keepsakeAct(order, 'lullaby-bell')).toEqual({
      type: 'camp',
      choice: 'keepsake',
      keepsake: 'lullaby-bell',
      order,
    });
  });

  it('every act names the run and the step it was made at, and keeps its key a retry can reuse', () => {
    const start = parseDungeonStart(dungeonStart).state;
    // The first move: the run that was just started, at the step it stands at.
    expect(actBodyOf('dungeon-act-fight')).toMatchObject({ runId: start.id, step: start.step });
    // A step is the run's step before the act; the answer is the next one.
    const pairs = [
      ['dungeon-act-fight', dungeonActFight],
      ['dungeon-act-event-pending', dungeonActEventPending],
      ['dungeon-act-event', dungeonActEvent],
      ['dungeon-act-camp-pending', dungeonActCampPending],
      ['dungeon-act-camp', dungeonActCamp],
      ['dungeon-act-home', dungeonActHome],
      ['dungeon-act-defeat', dungeonActDefeat],
      ['dungeon-act-cleared', dungeonActCleared],
      ['dungeon-act-door', dungeonActDoor],
      ['dungeon-act-descend-pending', dungeonActDescendPending],
      ['dungeon-act-descend', dungeonActDescend],
      ['dungeon-act-keeper', dungeonActKeeper],
    ] as const;
    for (const [key, answer] of pairs) {
      const body = actBodyOf(key);
      const state = parseDungeonAct(answer).state;
      expect(state.id, key).toBe(body.runId);
      // A move into a fight or the camp, an event pick, a camp choice or going home ends the act
      // at the same step or one on: the state never goes backwards.
      expect(state.step, key).toBeGreaterThan(body.step);
    }
    // Keys of different acts differ (the server answers a repeat with the stored step).
    const keys = ACT_KEYS.map((k) => actBodyOf(k).idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every body has a key of the form the Worker wants, and is retried with the same one', () => {
    for (const { body, method } of [
      ...Object.values(legacyDungeonRequestBodies),
      ...Object.values(dungeonRequestBodies),
    ]) {
      // Only runs are spends with a key; the team draft (PUT) has none, and a GET has no body.
      if (body === null || method !== 'POST') continue;
      expect((body as { idempotencyKey: string }).idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    }
  });

  it('saves the team draft with the PUT body of the fixture, which has no key, and reads the answer', async () => {
    apiFetch.mockResolvedValue(dungeonTeamDraft);
    const { path, method, body } = legacyDungeonRequestBodies['dungeon-team-draft'];
    const done = await saveDungeonTeam(
      body as { team: [string | null, string | null, string | null] },
    );
    expect(sent()).toEqual({ path, method, body });
    expect(method).toBe('PUT');
    expect(Object.keys(body)).toEqual(['team']);
    expect(done.draftTeam).toEqual(body.team);
    // A draft keeps its empty places: the middle one is null, not dropped.
    expect(done.draftTeam).toHaveLength(3);
    expect(done.draftTeam[1]).toBeNull();
  });

  it("reads a saved draft from today's state", () => {
    expect(parseDungeonToday(dungeonTodayDraft).draftTeam).toEqual(dungeonTeamDraft.draftTeam);
    expect(parseDungeonToday(dungeonToday).draftTeam).toBeNull();
  });

  it("asks for today's state and for a run's replay with plain GETs", async () => {
    apiFetch.mockResolvedValue(dungeonToday);
    await fetchDungeonToday();
    expect(apiFetch).toHaveBeenCalledWith('/api/dungeon/today');

    apiFetch.mockClear();
    apiFetch.mockResolvedValue(dungeonReplay);
    const { path } = legacyDungeonRequestBodies['dungeon-replay'];
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
    for (const state of states) expect(state).not.toHaveProperty('modifiers');
    expect(states[0]?.canRun).toBe(true);
    expect(states[1]?.last?.cleared).toBe(false);
    expect(states[2]?.blocked).toBe('already_run');
    expect(states[3]?.landmark).toBe(true);
    expect(states[4]?.blocked).toBe('need_creatures');
    // The last team: null before a first run, the run's ids in its row order after one.
    expect(states[0]?.lastTeam).toBeNull();
    expect(states[2]?.lastTeam).toEqual(dungeonRunCleared.run.team.map((t) => t.id));
  });

  it("parses the old-route run fixtures: an old run summary still reads, in today's `last`", () => {
    for (const fixture of [
      dungeonRunCleared,
      dungeonRunLost,
      dungeonRunLandmark,
      dungeonRunRetry,
      dungeonRunRetryAttempt,
    ]) {
      const done = parseDungeonToday(fixture.today);
      expect(done.last?.rooms).toHaveLength(3);
      // An old run has no path fields: they read as absent, and the map and open run as null.
      expect(done.last?.outcome).toBeUndefined();
      expect(done.map).toBeNull();
      expect(done.active).toBeNull();
      expect(done.last?.id).toBe(fixture.run.id);
    }
    expect(dungeonRunLandmark.run.rewards.gear).toHaveLength(1);
    expect(dungeonRunLost.run.rewards.bait).toBe(0);
  });

  it('parses today with a map and no open run: the same map for everyone, foe HP at the depth', () => {
    const map = parseDungeonToday(dungeonTodayMap);
    expect(map.canRun).toBe(true);
    expect(map.active).toBeNull();
    expect(map.map?.floors).toBe(7);
    expect(map.map?.nodes.length).toBeGreaterThanOrEqual(10);
    const kinds = new Set(map.map?.nodes.map((n) => n.kind));
    expect(kinds.has('camp')).toBe(true);
    expect(kinds.has('boss')).toBe(true);
    for (const node of map.map?.nodes ?? []) {
      expect(node.id).toBe(`f${String(node.floor)}l${String(node.lane)}`);
      if (node.kind === 'fight' || node.kind === 'elite' || node.kind === 'boss') {
        expect(node.foe?.hpMax, node.id).toBeGreaterThan(0);
        expect(node.modifier, node.id).toBeDefined();
      }
      if (node.kind === 'mystery') expect(node.event?.name, node.id).toBeTruthy();
    }
  });

  it('parses today with an open run: the run is the state the next act names', () => {
    const today = parseDungeonToday(dungeonTodayActive);
    // While a run is open the server says a new one cannot start.
    expect(today.canRun).toBe(false);
    expect(today.active?.status).toBe('active');
    expect(today.active?.pending?.kind).toBe('camp');
    expect(today.active?.map.nodes.length).toBe(today.map?.nodes.length);
    // It is the very state the camp-pending answer carried.
    expect(today.active).toEqual(parseDungeonAct(dungeonActCampPending).state);
  });

  it('parses the start: the run at step 0 before the entrance, and today with it open', () => {
    const { state, today } = parseDungeonStart(dungeonStart);
    expect(state).toMatchObject({ step: 0, at: null, path: [], status: 'active', outcome: null });
    expect(state.reachable.every((id) => id.startsWith('f0'))).toBe(true);
    expect(state.team).toHaveLength(3);
    expect(state.pack).toEqual({ bait: 0, essence: 0, scrap: 0 });
    expect(today.active).toEqual(state);
    expect(today.canRun).toBe(false);
  });

  it('parses every act answer', () => {
    const fight = parseDungeonAct(dungeonActFight);
    // A fight: the room just played (with the row that fought it), no summary, the run goes on.
    expect(fight.room?.node).toBe('f0l0');
    expect(fight.room?.row?.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(fight.room?.events.length).toBeGreaterThan(0);
    expect(fight.summary).toBeUndefined();
    expect(fight.today).toBeUndefined();
    expect(fight.state.step).toBe(1);

    // A mystery room and the camp stop with a choice pending, and play nothing.
    const event = parseDungeonAct(dungeonActEventPending);
    expect(event.state.pending?.kind).toBe('event');
    expect(event.room).toBeUndefined();
    if (event.state.pending?.kind === 'event') {
      expect(event.state.pending.event.options).toHaveLength(2);
    }
    const camp = parseDungeonAct(dungeonActCampPending);
    expect(camp.state.pending?.kind).toBe('camp');
    if (camp.state.pending?.kind === 'camp') expect(camp.state.pending.offers).toHaveLength(2);

    // The choices resolve and leave the next rooms to go to.
    const picked = parseDungeonAct(dungeonActEvent);
    expect(picked.state.pending).toBeNull();
    expect(picked.state.lastEvent?.name).toBeTruthy();
    expect(picked.state.reachable.length).toBeGreaterThan(0);
    const rested = parseDungeonAct(dungeonActCamp);
    expect(rested.state.pending).toBeNull();
    expect(rested.state.reachable.length).toBeGreaterThan(0);

    // The three ends: home (no fight), defeat and cleared (the fight, then the summary and today).
    const home = parseDungeonAct(dungeonActHome);
    expect(home.room).toBeUndefined();
    expect(home.summary?.outcome).toBe('home');
    expect(home.state).toMatchObject({ status: 'done', outcome: 'home' });
    const defeat = parseDungeonAct(dungeonActDefeat);
    expect(defeat.room?.cleared).toBe(false);
    expect(defeat.summary?.outcome).toBe('defeat');
    expect(defeat.state).toMatchObject({ status: 'done', outcome: 'defeat' });
    const cleared = parseDungeonAct(dungeonActCleared);
    expect(cleared.room?.kind).toBe('boss');
    expect(cleared.summary).toMatchObject({ outcome: 'cleared', cleared: true });
    expect(cleared.summary?.newDepth).toBe((cleared.summary?.depth ?? 0) + 1);
    expect(cleared.state).toMatchObject({ status: 'done', outcome: 'cleared' });
    // The treated creature's experience carries its breakdown; the others have none.
    const [treated, ...plain] = cleared.summary?.rewards.experience ?? [];
    expect(treated?.boost).toEqual({
      parts: [{ source: 'treat', name: 'Treat', times: 2 }],
      totalBp: 20_000,
    });
    expect(plain.every((e) => e.boost === undefined)).toBe(true);
    for (const ended of [home, defeat, cleared]) {
      expect(ended.today?.active).toBeNull();
      expect(ended.today?.last?.id).toBe(ended.summary?.id);
      expect(ended.summary?.path?.length).toBeGreaterThan(0);
      expect(ended.summary?.pack?.kept).toBeDefined();
      expect(ended.summary?.keepsakes).toBeDefined();
    }
  });

  it('parses the Undercroft answers: the door, the descent card, the way down and the keeper', () => {
    // A carved door: nothing pending, no fight, a history line that says only that a room was added.
    const door = parseDungeonAct(dungeonActDoor);
    expect(door.room).toBeUndefined();
    expect(door.state.pending).toBeNull();
    expect(door.state.history?.at(-1)).toMatchObject({ kind: 'door', result: 'door', added: true });
    expect(door.state.map.nodes.some((n) => n.kind === 'door')).toBe(true);
    expect(door.state.undercroft).toEqual({ maps: [], marks: 1 });
    expect(door.state.level).toBe(0);

    // The floor boss falls: its fight plays, the descent card waits, nothing can be moved to.
    const pending = parseDungeonAct(dungeonActDescendPending);
    expect(pending.room?.kind).toBe('boss');
    expect(pending.state.reachable).toEqual([]);
    expect(pending.summary).toBeUndefined();
    if (pending.state.pending?.kind !== 'descend') throw new Error('the descent card is pending');
    const card = pending.state.pending;
    expect(card).toMatchObject({
      level: 1,
      floors: 4,
      depthBonus: 1,
      catchBreathBp: 2000,
      reviveBp: 1000,
    });
    expect(card.newDepth).toBe(pending.state.depth + 1);
    expect(card.banked.gear.length).toBeGreaterThan(0);
    expect(card.banked.supplies.length).toBeGreaterThan(0);
    expect(pending.state.history?.map((e) => e.result).slice(-3)).toEqual([
      'fight',
      'chest',
      'pending',
    ]);

    // Descending draws the level (labelled), stands the run before its first floor and heals the row.
    const down = parseDungeonAct(dungeonActDescend);
    expect(down.state).toMatchObject({ level: 1, at: null, pending: null });
    const level = down.state.undercroft?.maps[0];
    expect(level).toMatchObject({ level: 1, floors: 4 });
    expect(level?.label).toContain('Undercroft');
    expect(down.state.reachable.every((id) => id.startsWith('u1f0'))).toBe(true);
    expect(down.state.history?.at(-1)).toMatchObject({ result: 'descend', level: 1 });

    // The keeper ends the run: cleared, and the summary counts the level cleared with its route.
    const keeper = parseDungeonAct(dungeonActKeeper);
    expect(keeper.summary).toMatchObject({ outcome: 'cleared', cleared: true, deepest: 1 });
    expect(keeper.summary?.route?.undercroft).toHaveLength(1);
    expect(keeper.state.history?.at(-1)).toMatchObject({ result: 'chest', level: 1 });
    expect(keeper.summary?.path).toContain('door');
  });

  it('a defeat keeps half the pack, rounded up, and the others keep all of it', () => {
    const half = (n: number): number => Math.ceil(n / 2);
    for (const answer of [dungeonActHome, dungeonActDefeat, dungeonActCleared, dungeonActKeeper]) {
      const { summary } = parseDungeonAct(answer);
      const pack = summary?.pack;
      if (summary === undefined || pack === undefined) throw new Error('summary');
      for (const kind of ['bait', 'essence', 'scrap'] as const) {
        const kept = summary.outcome === 'defeat' ? half(pack.found[kind]) : pack.found[kind];
        expect(pack.kept[kind], `${summary.outcome ?? ''} ${kind}`).toBe(kept);
      }
    }
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

  it('parses the replay of a path run: each room has its node and the row that fought it', async () => {
    apiFetch.mockResolvedValue(dungeonReplayPath);
    const { path } = dungeonRequestBodies['dungeon-replay-path'];
    const replay = await fetchDungeonReplay(path.split('/')[4] as string);
    expect(apiFetch).toHaveBeenCalledWith(path);
    expect(replay.summary.outcome).toBe('cleared');
    expect(replay.rooms.map((r) => r.node)).toEqual(['f0l0', 'f4l0', 'f5l0', 'f6l1']);
    expect(replay.rooms.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    expect(replay.rooms.at(-1)?.kind).toBe('boss');
    for (const room of replay.rooms) {
      expect(room.row, room.node).toHaveLength(3);
      // The creatures in the room's row are the creatures that have HP in it.
      expect((room.row ?? []).map((r) => r.id).sort()).toEqual(Object.keys(room.hpStart).sort());
    }
    // The camp's swap changed the row: the replay's own row is the starting one.
    const ids = (row: { id: string }[] | undefined): string[] => (row ?? []).map((r) => r.id);
    expect(ids(replay.rooms[0]?.row)).toEqual(ids(replay.row));
    expect(ids(replay.rooms[1]?.row)).not.toEqual(ids(replay.row));
  });

  it('refuses a payload that is not the shape the server sends', () => {
    expect(() => parseDungeonToday({ ...dungeonToday, depth: 'deep' })).toThrow('dungeon state');
    expect(() => parseDungeonToday({ ...dungeonToday, blocked: 'because' })).toThrow();
    expect(() => parseDungeonToday({ ...dungeonToday, lastTeam: [1, 2, 3] })).toThrow();
    expect(() => parseDungeonToday({ ...dungeonToday, lastTeam: undefined })).toThrow();
    expect(() => parseDungeonStart({ state: {}, today: dungeonToday })).toThrow('dungeon run');
    expect(() => parseDungeonStart({ ...dungeonStart, today: null })).toThrow();
    expect(() => parseDungeonAct({ ...dungeonActFight, state: null })).toThrow('dungeon step');
    expect(() =>
      parseDungeonAct({ ...dungeonActFight, room: { ...dungeonActFight.room, row: [{ id: 1 }] } }),
    ).toThrow();
    expect(() =>
      parseDungeonAct({
        ...dungeonActHome,
        summary: { ...dungeonActHome.summary, outcome: 'won' },
      }),
    ).toThrow();
    expect(() =>
      parseDungeonToday({ ...dungeonTodayMap, map: { floors: 7, nodes: [{ id: 'x' }] } }),
    ).toThrow();
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

  it('knows every captured code, with the status the server sent it at', () => {
    for (const { route, status, body } of dungeonErrors) {
      const label = `${route} ${body.error}`;
      expect(Object.keys(DUNGEON_ERRORS), label).toContain(body.error);
      expect(DUNGEON_ERRORS[body.error as keyof typeof DUNGEON_ERRORS], label).toBe(status);
    }
    // The codes the path runs added are all in the captures.
    const seen = new Set(dungeonErrors.map((e) => e.body.error));
    for (const code of [
      'run_active',
      'stale_step',
      'invalid_act',
      'gone',
      'invalid_treat',
      'insufficient_funds',
    ]) {
      expect(seen.has(code), code).toBe(true);
    }
  });

  it('reads an invalid_act with its extra reason, and says the same plain thing for it', () => {
    const rows = dungeonErrors.filter((e) => e.body.error === 'invalid_act');
    expect(rows.length).toBeGreaterThan(0);
    for (const { status, body } of rows) {
      expect(typeof (body as { reason?: unknown }).reason).toBe('string');
      const err = new ApiError(status, body.error, (body as { reason: string }).reason);
      // The server's reason is for logs, not for the player: the text is the client's own.
      expect(dungeonErrorText(err)).toBe(DUNGEON_ERROR_TEXT['invalid_act']);
      expect(dungeonErrorText(err)).not.toContain((body as { reason: string }).reason);
      // And the screen reloads quietly: it was showing an old state.
      expect(isStaleDungeonError(err)).toBe(true);
    }
    expect(isStaleDungeonError(new ApiError(409, 'stale_step'))).toBe(true);
    expect(isStaleDungeonError(new ApiError(409, 'key_conflict'))).toBe(false);
  });

  it('gives the 410 gone its own text: reload the Activity', () => {
    expect(dungeonErrorText(new ApiError(410, 'gone'))).toMatch(/reopen the Activity/);
  });
});

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
      supplies: [{ id: 'lure-good', source: 'owned' as const, price: 30 }],
      mood: 'happy',
    };
    const body = sendBody(extra, 'k');
    expect(Object.keys(body).sort()).toEqual(
      Object.keys(expeditionRequestBodies['expedition-send'].body).sort(),
    );
    expect(body.supplies).toEqual([{ id: 'lure-good', source: 'owned' }]);
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
    expect(loot.result.loot?.supplies).toEqual(['map-scrap-basic']);
    expect(loot.result.xp).toMatchObject({ gained: 300, rank: 2, rankBefore: 1 });
    expect(loot.result.familiarity?.trips).toBe(1);
    const failed = parseClaimResponse(expeditionClaimFailed);
    expect(failed.result.failed).toBe(true);
    expect(failed.result.pushOn).toMatchObject({ risk: 'risky', outcome: 'failed' });
    const worked = parseClaimResponse(expeditionClaimWorked);
    expect(worked.result.slotUnlocked?.total).toBe(2);
    expect(worked.result.rankGifts?.[0]).toMatchObject({ rank: 4, bait: 4, parts: { scrap: 2 } });
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
    expect(profile.journal.total).toBe(41);
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
      'base_locked',
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

  it('leaves out a job whose supply result has no supply, and keeps the rest', () => {
    const broken = structuredClone(workshopClaimSupply.gear) as unknown as {
      jobs: { result: unknown }[];
    };
    const job = broken.jobs[0];
    if (job === undefined) throw new Error('the fixture has no job');
    job.result = { kind: 'supply', xp: 1, skillXp: 1, skillLevel: 1, leveledUp: false };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(parseGearState(broken).jobs).toHaveLength(broken.jobs.length - 1);
    quiet.mockRestore();
    // A job result that is read on its own (the claim answer) is still refused.
    expect(() => parseJobResult(job.result)).toThrow('job result');
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
