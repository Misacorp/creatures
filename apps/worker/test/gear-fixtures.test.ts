import { createSeededRng } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import collectionState from '../../activity/src/fixtures/collection-state.json';
import expeditionClaimLoot from '../../activity/src/fixtures/expedition-claim-loot.json';
import gearEquip from '../../activity/src/fixtures/gear-equip.json';
import gearEquipBest from '../../activity/src/fixtures/gear-equip-best.json';
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
import startDismantle from '../../activity/src/fixtures/workshop-start-dismantle.json';
import {
  ClaimJobBodySchema,
  DismissNoticeBodySchema,
  EquipBestBodySchema,
  EquipBodySchema,
  PreviewBodySchema,
  StartJobBodySchema,
} from '../src/gear-schemas';
import { runCore } from './helpers';
import { runConversionScenario, runExpeditionScenario, runGearScenario } from './gear-scenario';
import { nextGuild } from './raid-helpers';

/**
 * The contract with the client for gear, the workshop and expedition loot. The files in
 * `apps/activity/src/fixtures` were captured from real server output (`gear-scenario.ts` plays the
 * same game through the real routes). These tests run that scenario again and compare the SHAPE of
 * every response (keys and types, not values: ids and tuned numbers may differ), so a change in what
 * the server sends fails here and points at the fixtures and the client parsers.
 */
const UPDATE =
  'the server shape changed: re-capture apps/activity/src/fixtures with test/gear-scenario.ts and update the client parsers';

/** Keys and value types, recursively; arrays are the set of their elements' shapes. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) {
    const shapes = new Set(value.map((x) => JSON.stringify(shape(x))));
    return [...shapes].sort().map((s) => JSON.parse(s) as unknown);
  }
  if (value === null) return 'null';
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, x]) => [k, shape(x)]),
    );
  }
  return typeof value;
}

/** Shape with the keys of free-form maps (parts by kind) folded in: parts keys are content, not shape. */
const sameShape = (live: unknown, fixture: unknown): void => {
  expect(shape(live), UPDATE).toEqual(shape(fixture));
};

describe('the gear fixtures match what the server sends', () => {
  it('has the same responses for the whole scenario', async () => {
    const captured = await runCore(nextGuild(), (ctx) => runGearScenario(ctx), {
      gearRng: createSeededRng('fixture-gear'),
    });
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
    sameShape(r['job-start-dismantle'], startDismantle);
    sameShape(r['job-claim-dismantle'], claimDismantle);
    sameShape(r['preview-craft'], previewCraft);
    sameShape(r['preview-dismantle'], previewDismantle);
    // The collection view of the same game: the creature cards carry the gear and the busy state.
    sameShape(r['collection-state'], collectionState);
    // And the errors are the real ones, code for code.
    expect(captured.errors, UPDATE).toEqual(gearErrors);
  });

  it('has the one-time conversion notice and its dismissal', async () => {
    const captured = await runCore(nextGuild(), (ctx) => runConversionScenario(ctx), {
      gearRng: createSeededRng('fixture-gear'),
    });
    sameShape(captured.responses['gear-notice'], gearNotice);
    sameShape(captured.responses['gear-notice-dismissed'], gearNoticeDismissed);
    // The notice says what happened to the old gear, and is gone once dismissed.
    expect(gearNotice.notice).not.toBeNull();
    expect(gearNoticeDismissed.gear.notice).toBeNull();
  });

  it('has the expedition claim with its loot', async () => {
    // Shard, glimmer, blueprint (and its rarity and base), then a found supply (and its kind).
    const script = [0, 0, 0, 0, 0, 0, 0];
    let i = 0;
    const rest = createSeededRng('fixture-exp');
    const captured = await runCore(nextGuild(), (ctx) => runExpeditionScenario(ctx), {
      rng: createSeededRng('fixture-catch'),
      tripRng: createSeededRng('fixture-trip'),
      gearRng: { nextU32: () => script[i++] ?? rest.nextU32() },
    });
    sameShape(captured.responses['expedition-claim-loot'], expeditionClaimLoot);
  });

  it('shows what each fixture is meant to show', () => {
    // Welcome kit: one common item, one blueprint, the welcome scrap.
    expect(gearWelcome.items).toHaveLength(1);
    expect(gearWelcome.blueprints).toHaveLength(1);
    expect(gearWelcome.grants.map((g) => g.key)).toEqual(['welcome']);
    // The state has every job status and every part kind.
    expect(new Set(gearState.jobs.map((j) => j.status))).toEqual(new Set(['running', 'claimed']));
    expect(new Set(gearReady.jobs.map((j) => j.status))).toContain('ready');
    expect(Object.keys(gearState.parts)).toHaveLength(6);
    expect(gearState.items.some((i) => i.equippedOn !== null)).toBe(true);
    expect(gearState.items.some((i) => i.madeBy !== null)).toBe(true);
    expect(gearState.skills.some((s) => s.xp > 0)).toBe(true);
    // Every slot and the Festival rarity are on show, with tier pips.
    expect(new Set(gearState.items.map((i) => i.slot))).toEqual(new Set(['hat', 'scarf', 'charm']));
    expect(gearState.items.some((i) => i.lines.some((l) => l.tier !== null))).toBe(true);
    // The job results the client has to draw.
    expect(claimCraft.result.kind).toBe('craft');
    expect(claimRetired.result.kind).toBe('retired');
    expect(claimDismantle.result.kind).toBe('dismantle');
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
    expect(expeditionClaimLoot.result.loot.blueprints).toHaveLength(1);
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
      'invalid_bundle',
      'skill_too_low',
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
    'job-dismantle': StartJobBodySchema,
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
      'job-dismantle': /^\/api\/workshop\/jobs$/,
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
