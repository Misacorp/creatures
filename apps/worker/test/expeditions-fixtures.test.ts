import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import claimFailed from '../../activity/src/fixtures/expedition-claim-failed.json';
import claimRecall from '../../activity/src/fixtures/expedition-claim-recall.json';
import claimWorked from '../../activity/src/fixtures/expedition-claim-worked.json';
import destinations from '../../activity/src/fixtures/expedition-destinations.json';
import errors from '../../activity/src/fixtures/expedition-errors.json';
import profile from '../../activity/src/fixtures/expedition-profile.json';
import pushOn from '../../activity/src/fixtures/expedition-push-on.json';
import requests from '../../activity/src/fixtures/expedition-request-bodies.json';
import send from '../../activity/src/fixtures/expedition-send.json';
import send2 from '../../activity/src/fixtures/expedition-send-2.json';
import send3 from '../../activity/src/fixtures/expedition-send-3.json';
import stateAfter from '../../activity/src/fixtures/expedition-state-after.json';
import stateOffer from '../../activity/src/fixtures/expedition-state-offer.json';
import claimSupply from '../../activity/src/fixtures/workshop-claim-supply.json';
import startSupply from '../../activity/src/fixtures/workshop-start-supply.json';
import { PushOnBodySchema, StartExpeditionBodySchema } from '../src/collection-schemas';
import { StartJobBodySchema } from '../src/gear-schemas';
import { expectSameShape } from './fixture-contract';
import { fixtureSet } from './fixture-sets';

/**
 * The contract with the client for expeditions v2. The files in `apps/activity/src/fixtures` were
 * captured from real server output (`pnpm fixtures:capture` plays
 * `expeditions-scenario.ts` through the real routes, see `fixture-sets.ts`). These tests run the scenario again and compare the SHAPE of
 * every response (keys and types, not values), so a change in what the server sends fails here and points
 * at the fixtures and the client types in `apps/activity/src/expedition-types.ts`.
 */
const UPDATE =
  'the server shape changed: run `pnpm fixtures:capture`, review the diff of apps/activity/src/fixtures and update expedition-types.ts';

const sameShape = (live: unknown, fixture: unknown): void => expectSameShape(live, fixture, UPDATE);

describe('the expedition fixtures match what the server sends', () => {
  it('has the same responses and the same errors for the whole scenario', async () => {
    const captured = await fixtureSet('expeditions').run();
    const r = captured.responses;
    sameShape(r['expedition-send'], send);
    sameShape(r['expedition-send-2'], send2);
    sameShape(r['expedition-send-3'], send3);
    sameShape(r['expedition-state-offer'], stateOffer);
    sameShape(r['expedition-state-after'], stateAfter);
    sameShape(r['expedition-push-on'], pushOn);
    sameShape(r['expedition-claim-failed'], claimFailed);
    sameShape(r['expedition-claim-worked'], claimWorked);
    sameShape(r['expedition-claim-recall'], claimRecall);
    sameShape(r['expedition-profile'], profile);
    sameShape(r['expedition-destinations'], destinations);
    sameShape(r['workshop-start-supply'], startSupply);
    sameShape(r['workshop-claim-supply'], claimSupply);
    expect(captured.errors, UPDATE).toEqual(errors);
  });

  it('shows what each fixture is meant to show', () => {
    // A send carries the kit it took from stock, and costs nothing: supplies cannot be bought.
    expect(send.expedition.kit).toEqual(['lure-great', 'map-scrap-basic']);
    expect(send.expedition.cost).toBe(0);
    expect(send.expedition.offer).toBeNull();
    expect(send.state.slots.used).toBe(1);
    // The state of a trip that ended carries the offer, a safe and a risky goal, with exact odds.
    const offered = stateOffer.expeditions[0]?.offer?.goals ?? [];
    expect(offered.map((g) => g.risk).sort()).toEqual(['risky', 'safe']);
    for (const goal of offered) {
      expect(goal.oddsBp).toBeGreaterThan(0);
      expect(goal.oddsBp).toBeLessThanOrEqual(10_000);
      expect(goal.extraHours).toBeGreaterThan(0);
    }
    // Choosing a goal fixes its time from the end of the trip.
    expect(pushOn.expedition.pushOn?.startedAt).toBe(pushOn.expedition.endsAt);
    // A failed risky goal brings nothing home.
    expect(claimFailed.result.failed).toBe(true);
    expect(claimFailed.result.catches).toEqual([]);
    expect(claimFailed.result.pushOn.outcome).toBe('failed');
    // A safe goal that works comes with XP, familiarity, a journal page and a new slot.
    expect(claimWorked.result.pushOn.outcome).toBe('worked');
    expect(claimWorked.result.xp.gained).toBeGreaterThan(0);
    expect(claimWorked.result.journal).toHaveLength(1);
    expect(claimWorked.result.slotUnlocked).toEqual({ total: 2 });
    // ... and the one-time gift of the rank it reached.
    expect(claimWorked.result.xp.rank).toBe(claimWorked.result.xp.rankBefore + 1);
    expect(claimWorked.result.rankGifts).toHaveLength(1);
    expect(claimWorked.result.rankGifts[0]?.rank).toBe(claimWorked.result.xp.rank);
    expect(claimWorked.result.rankGifts[0]?.bait).toBeGreaterThan(0);
    expect(stateAfter.slots.total).toBe(2);
    // A recall has catches but no XP, journal or goal.
    expect(claimRecall.result.recalled).toBe(true);
    expect('xp' in claimRecall.result).toBe(false);
    // The profile has every account stat, the milestones and the journal.
    expect(Object.keys(profile.stats).length).toBeGreaterThan(8);
    expect(profile.milestones.length).toBeGreaterThan(5);
    expect(profile.journal.found).toHaveLength(1);
    // Destinations: all of them, with the weekly special.
    expect(destinations.destinations.length).toBeGreaterThanOrEqual(7);
    expect(destinations.special.destination.length).toBeGreaterThan(0);
    // The Workshop makes a supply.
    expect(startSupply.result.jobId.length).toBeGreaterThan(10);
    expect(claimSupply.state.supplies['lure-basic']).toBe(1);
    // The errors the client has to write text for.
    const codes = new Set(errors.map((e) => e.body.error));
    for (const code of [
      'creature_away',
      'slots_full',
      'invalid_body',
      'not_ready',
      'not_offered',
      'already_chosen',
      'destination_closed',
      'rank_too_low',
      'supply_missing',
      'invalid_supplies',
      'supplies_not_for_sale',
      'skill_too_low',
    ]) {
      expect(codes.has(code), code).toBe(true);
    }
  });
});

describe('the expedition request bodies the client sends', () => {
  const entry = (name: string) =>
    (requests as Record<string, { path: string; method: string; body: unknown }>)[name];

  it('pass the strict schemas, and no extra key gets through', () => {
    for (const name of ['expedition-send', 'expedition-send-2', 'expedition-send-3']) {
      const body = entry(name)?.body;
      expect(v.safeParse(StartExpeditionBodySchema, body).success, name).toBe(true);
      expect(
        v.safeParse(StartExpeditionBodySchema, { ...(body as object), extra: 1 }).success,
      ).toBe(false);
    }
    const choose = entry('expedition-push-on')?.body;
    expect(v.safeParse(PushOnBodySchema, choose).success).toBe(true);
    expect(v.safeParse(PushOnBodySchema, { ...(choose as object), extra: 1 }).success).toBe(false);
    expect(v.safeParse(StartJobBodySchema, entry('workshop-start-supply')?.body).success).toBe(
      true,
    );
    expect(entry('expedition-claim')?.body).toEqual({});
  });

  it('use the paths of the routes the server has', () => {
    const id = '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}';
    expect(entry('expedition-send')?.path).toBe('/api/expeditions');
    expect(entry('expedition-push-on')?.path).toMatch(
      new RegExp(`^/api/expeditions/${id}/push-on$`),
    );
    expect(entry('expedition-claim')?.path).toMatch(new RegExp(`^/api/expeditions/${id}/claim$`));
    expect(entry('workshop-claim-supply')?.path).toMatch(
      new RegExp(`^/api/workshop/jobs/${id}/claim$`),
    );
  });
});
