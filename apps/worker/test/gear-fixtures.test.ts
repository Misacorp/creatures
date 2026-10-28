import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import collectionState from '../../activity/src/fixtures/collection-state.json';
import expeditionClaimLoot from '../../activity/src/fixtures/expedition-claim-loot.json';
import gearEquip from '../../activity/src/fixtures/gear-equip.json';
import gearDismantle from '../../activity/src/fixtures/gear-dismantle.json';
import gearEquipBest from '../../activity/src/fixtures/gear-equip-best.json';
import gearDismantleCheck from '../../activity/src/fixtures/gear-dismantle-check.json';
import gearNotice from '../../activity/src/fixtures/gear-notice.json';
import gearNoticeDismissed from '../../activity/src/fixtures/gear-notice-dismissed.json';
import gearErrors from '../../activity/src/fixtures/gear-errors.json';
import gearReady from '../../activity/src/fixtures/gear-ready.json';
import gearRequests from '../../activity/src/fixtures/gear-request-bodies.json';
import gearRunning from '../../activity/src/fixtures/gear-running.json';
import gearState from '../../activity/src/fixtures/gear-state.json';
import gearUnequip from '../../activity/src/fixtures/gear-unequip.json';
import gearWelcome from '../../activity/src/fixtures/gear-welcome.json';
import claimCraft from '../../activity/src/fixtures/workshop-claim-craft.json';
import claimRetired from '../../activity/src/fixtures/workshop-claim-retired.json';
import claimDismantle from '../../activity/src/fixtures/workshop-claim-dismantle.json';
import previewCraft from '../../activity/src/fixtures/workshop-preview-craft.json';
import previewDismantle from '../../activity/src/fixtures/workshop-preview-dismantle.json';
import startCraft from '../../activity/src/fixtures/workshop-start-craft.json';
import {
  ClaimJobBodySchema,
  DismantleBodySchema,
  DismissNoticeBodySchema,
  EquipBestBodySchema,
  EquipBodySchema,
  DismantleCheckBodySchema,
  PreviewBodySchema,
  StartJobBodySchema,
} from '../src/gear-schemas';
import { expectSameShape } from './fixture-contract';
import { fixtureSet } from './fixture-sets';

/**
 * The contract with the client for gear, the workshop and expedition loot. The files in
 * `apps/activity/src/fixtures` were captured from real server output (`pnpm fixtures:capture` plays
 * `gear-scenario.ts` through the real routes, see `fixture-sets.ts`). These tests run that scenario again and compare the SHAPE of
 * every response (keys and types, not values: ids and tuned numbers may differ), so a change in what
 * the server sends fails here and points at the fixtures and the client parsers.
 */
const UPDATE =
  'the server shape changed: run `pnpm fixtures:capture`, review the diff of apps/activity/src/fixtures and update the client parsers';

const sameShape = (live: unknown, fixture: unknown): void => expectSameShape(live, fixture, UPDATE);

describe('the gear fixtures match what the server sends', () => {
  it('has the same responses for the whole scenario', async () => {
    const captured = await fixtureSet('gear').run();
    const r = captured.responses;
    // The first load, before any item is given, carries the welcome kit.
    sameShape(r['gear-welcome'], gearWelcome);
    sameShape(r['gear-ready'], gearReady);
    sameShape(r['gear-running'], gearRunning);
    sameShape(r['gear-final'], gearState);
    sameShape(r['gear-equip'], gearEquip);
    sameShape(r['gear-unequip'], gearUnequip);
    sameShape(r['gear-equip-best'], gearEquipBest);
    sameShape(r['job-start-craft'], startCraft);
    sameShape(r['job-claim-craft'], claimCraft);
    sameShape(r['job-claim-retired'], claimRetired);
    sameShape(r['gear-dismantle-check'], gearDismantleCheck);
    sameShape(r['dismantle-pile'], gearDismantle);
    sameShape(r['job-claim-dismantle'], claimDismantle);
    sameShape(r['preview-craft'], previewCraft);
    sameShape(r['preview-dismantle'], previewDismantle);
    // The collection view of the same game: the creature cards carry the gear and the busy state.
    sameShape(r['collection-state'], collectionState);
    // The one-time conversion notice and its dismissal, and the expedition claim with its loot.
    sameShape(r['gear-notice'], gearNotice);
    sameShape(r['gear-notice-dismissed'], gearNoticeDismissed);
    sameShape(r['expedition-claim-loot'], expeditionClaimLoot);
    // And the errors are the real ones, code for code.
    expect(captured.errors, UPDATE).toEqual(gearErrors);
  });

  it('shows what each fixture is meant to show', () => {
    // The conversion notice says what happened to the old gear, and is gone once dismissed.
    expect(gearNotice.notice).not.toBeNull();
    expect(gearNoticeDismissed.gear.notice).toBeNull();
    // Welcome kit: one common item, one blueprint, the welcome scrap.
    expect(gearWelcome.items).toHaveLength(1);
    expect(gearWelcome.blueprints).toHaveLength(1);
    expect(gearWelcome.grants.map((g) => g.key)).toEqual(['welcome']);
    // The state has every job status and every part kind.
    expect(new Set(gearState.jobs.map((j) => j.status))).toEqual(new Set(['running', 'claimed']));
    expect(new Set(gearReady.jobs.map((j) => j.status))).toContain('ready');
    expect(Object.keys(gearState.parts)).toHaveLength(7);
    expect(gearState.items.some((i) => i.equippedOn !== null)).toBe(true);
    expect(gearState.items.some((i) => i.madeBy !== null)).toBe(true);
    expect(gearState.skills.some((s) => s.xp > 0)).toBe(true);
    // Every slot and a Festival piece are on show, with their stats and tier pips; a local line says so.
    expect(new Set(gearState.items.map((i) => i.slot))).toEqual(new Set(['hat', 'scarf', 'charm']));
    expect(gearReady.items.some((i) => i.festival)).toBe(true);
    expect(gearState.items.some((i) => i.stats.length >= 3)).toBe(true);
    expect(gearState.items.every((i) => (i.slot === 'charm') === (i.stats.length === 0))).toBe(
      true,
    );
    expect(gearState.items.some((i) => i.lines.some((l) => l.local))).toBe(true);
    // A better base asks for a Crafting level.
    expect(gearState.blueprints.some((b) => b.needsCraftingLevel > 1)).toBe(true);
    expect(gearState.items.some((i) => i.lines.some((l) => l.tier !== null))).toBe(true);
    // The job results the client has to draw.
    expect(claimCraft.result.kind).toBe('craft');
    expect(claimRetired.result.kind).toBe('retired');
    expect(claimDismantle.result.kind).toBe('dismantle');
    // A pile dismantle answers with the same result shape, plus who did it and how many Market Day boosted.
    expect(gearDismantle.result.kind).toBe('dismantle');
    expect(gearDismantle.result.creatureId).toBeTruthy();
    // The check names the items that cannot go now (none for a free item).
    expect(gearDismantleCheck.result.locked).toEqual([]);
    // The previews carry every way to craft, each with exact odds that add up, and the refund as a range.
    expect(previewCraft.result.options.map((o) => o.reach)).toEqual(['none', 'rare', 'epic']);
    for (const o of previewCraft.result.options) {
      expect(o.oddsBp.common + o.oddsBp.rare + o.oddsBp.epic).toBe(10_000);
    }
    expect(previewDismantle.result.range.scrap.max).toBeGreaterThan(0);
    // Equip best moved things.
    expect(gearEquipBest.result.changes.length).toBeGreaterThan(0);
    // The collection card shows the worn items and the busy job.
    const creatures = collectionState.creatures;
    expect(creatures.some((c) => c.gear.length > 0)).toBe(true);
    expect(creatures.some((c) => c.busy?.kind === 'job')).toBe(true);
    // The expedition loot has a blueprint and every kind of extra.
    expect(expeditionClaimLoot.result.loot.blueprints.length).toBeGreaterThan(0);
    expect(Object.keys(expeditionClaimLoot.result.loot.parts).sort()).toEqual(
      ['ember-shard', 'glimmer', 'scrap'].sort(),
    );
    // Errors the client has to write text for.
    const codes = new Set(gearErrors.map((e) => e.body.error));
    for (const code of [
      'insufficient_parts',
      'creature_on_job',
      'creature_away',
      'workshop_full',
      'inventory_full',
      'not_ready',
      'key_conflict',
      'blueprint_unknown',
      'item_level_too_high',
      'slot_locked',
      'wrong_role',
      'gear_upgrade_removed',
      'dismantle_is_a_job',
      'item_locked',
      'dismantle_job_removed',
      'skill_too_low',
      'base_locked',
      'job_kind_removed',
      'invalid_body',
      'not_found',
    ]) {
      expect(codes.has(code), code).toBe(true);
    }
  });
});

describe('the request bodies the client sends', () => {
  const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  const schemaOf: Record<string, v.GenericSchema> = {
    equip: EquipBodySchema,
    unequip: EquipBodySchema,
    'equip-best': EquipBestBodySchema,
    'job-craft': StartJobBodySchema,
    'job-craft-reach': StartJobBodySchema,
    'dismantle-check': DismantleCheckBodySchema,
    'dismantle-pile': DismantleBodySchema,
    'preview-craft': PreviewBodySchema,
    'preview-dismantle': PreviewBodySchema,
    'job-claim': ClaimJobBodySchema,
    'notice-dismiss': DismissNoticeBodySchema,
  };

  it('pass the strict schemas, and no extra key gets through', () => {
    for (const [name, schema] of Object.entries(schemaOf)) {
      const entry = (
        gearRequests as Record<string, { path: string; method: string; body: unknown }>
      )[name];
      expect(entry, name).toBeDefined();
      expect(entry?.method).toBe('POST');
      expect(v.safeParse(schema, entry?.body).success, name).toBe(true);
      expect(
        v.safeParse(schema, { ...(entry?.body as object), extra: 1 }).success,
        `${name} with an extra key`,
      ).toBe(false);
    }
    expect(gearRequests['expedition-claim'].body).toEqual({});
  });

  it('use paths of the routes the server has, with real-looking ids', () => {
    const templates: Record<string, RegExp> = {
      equip: /^\/api\/gear\/ID\/equip$/,
      unequip: /^\/api\/gear\/ID\/equip$/,
      'equip-best': /^\/api\/gear\/equip-best$/,
      'job-craft': /^\/api\/workshop\/jobs$/,
      'job-craft-reach': /^\/api\/workshop\/jobs$/,
      'dismantle-check': /^\/api\/gear\/dismantle-check$/,
      'dismantle-pile': /^\/api\/gear\/dismantle$/,
      'preview-craft': /^\/api\/workshop\/preview$/,
      'preview-dismantle': /^\/api\/workshop\/preview$/,
      'notice-dismiss': /^\/api\/gear\/conversion\/dismiss$/,
      'job-claim': /^\/api\/workshop\/jobs\/ID\/claim$/,
      'expedition-claim': /^\/api\/expeditions\/ID\/claim$/,
    };
    for (const [name, pattern] of Object.entries(templates)) {
      const entry = (gearRequests as Record<string, { path: string }>)[name];
      const path = (entry?.path ?? '').replace(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/g, (m) =>
        ID.test(m) ? 'ID' : m,
      );
      expect(path, name).toMatch(pattern);
    }
  });
});
