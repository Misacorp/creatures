import { beforeEach, describe, expect, it, vi } from 'vitest';
import actionFire from './fixtures/action-fire.json';
import errorFixtures from './fixtures/errors.json';
import practiceStart from './fixtures/practice-start.json';
import raidReveal from './fixtures/raid-reveal.json';
import raidRevealSeen from './fixtures/raid-reveal-seen.json';
import requestBodies from './fixtures/request-bodies.json';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { ApiError } from './api';
import { errorText } from './game';
import { buildAction } from './live';
import { sendLiveAction, startPractice } from './live-api';
import { markRevealSeen, setRaidAbility } from './raid-api';

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

  it('Hold is { action: "hold" } and Fire carries only the parameter its ability takes', async () => {
    apiFetch.mockResolvedValue(actionFire);
    await sendLiveAction(buildAction('rally', 'hold', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-hold'));

    apiFetch.mockClear();
    await sendLiveAction(buildAction('rally', 'fire', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-fire'));

    apiFetch.mockClear();
    await sendLiveAction(buildAction('shield-wall', 'fire', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-fire-zone'));

    apiFetch.mockClear();
    await sendLiveAction(buildAction('re-mark', 'fire', 'back', 'tide'));
    expect(sent()).toEqual(expected('action-fire-element'));
  });

  it('the ability pick is { abilityId }', async () => {
    apiFetch.mockResolvedValue(raidReveal);
    await setRaidAbility('rally');
    expect(sent()).toEqual(expected('ability'));
  });

  it('"reveal seen" sends the week as a string, the week id the server gave', async () => {
    apiFetch.mockResolvedValue(raidRevealSeen);
    await markRevealSeen(raidReveal.you.reveal.week);
    const request = sent();
    expect(request).toEqual(expected('reveal-seen'));
    expect(request.body).toEqual({ week: expect.any(String) as string });
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
      'hold_too_late',
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
