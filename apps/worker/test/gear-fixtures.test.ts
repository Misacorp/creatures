import { createSeededRng } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import collectionState from '../../activity/src/fixtures/collection-state.json';
import expeditionClaimLoot from '../../activity/src/fixtures/expedition-claim-loot.json';
import gearDismantle from '../../activity/src/fixtures/gear-dismantle.json';
import gearEquip from '../../activity/src/fixtures/gear-equip.json';
import gearErrors from '../../activity/src/fixtures/gear-errors.json';
import gearReady from '../../activity/src/fixtures/gear-ready.json';
import gearRequests from '../../activity/src/fixtures/gear-request-bodies.json';
import gearRunning from '../../activity/src/fixtures/gear-running.json';
import gearState from '../../activity/src/fixtures/gear-state.json';
import gearUnequip from '../../activity/src/fixtures/gear-unequip.json';
import gearUpgrade from '../../activity/src/fixtures/gear-upgrade.json';
import gearWelcome from '../../activity/src/fixtures/gear-welcome.json';
import claimCraft from '../../activity/src/fixtures/workshop-claim-craft.json';
import claimEnchant from '../../activity/src/fixtures/workshop-claim-enchant.json';
import claimImprove from '../../activity/src/fixtures/workshop-claim-improve.json';
import startCraft from '../../activity/src/fixtures/workshop-start-craft.json';
import startEnchant from '../../activity/src/fixtures/workshop-start-enchant.json';
import startImprove from '../../activity/src/fixtures/workshop-start-improve.json';
import {
  ClaimJobBodySchema,
  DismantleBodySchema,
  EquipBodySchema,
  StartJobBodySchema,
  UpgradeBodySchema,
} from '../src/gear-schemas';
import { runCore } from './helpers';
import { runExpeditionScenario, runGearScenario } from './gear-scenario';
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
    sameShape(r['gear-upgrade'], gearUpgrade);
    sameShape(r['gear-dismantle'], gearDismantle);
    sameShape(r['job-start-craft'], startCraft);
    sameShape(r['job-start-improve'], startImprove);
    sameShape(r['job-start-enchant'], startEnchant);
    sameShape(r['job-claim-craft'], claimCraft);
    sameShape(r['job-claim-improve'], claimImprove);
    sameShape(r['job-claim-enchant'], claimEnchant);
    // The collection view of the same game: the creature cards carry the gear and the busy state.
    sameShape(r['collection-state'], collectionState);
    // And the errors are the real ones, code for code.
    expect(captured.errors, UPDATE).toEqual(gearErrors);
  });

  it('has the expedition claim with its loot', async () => {
    const script = [0, 0, 0, 0, 0];
    let i = 0;
    const rest = createSeededRng('fixture-exp');
    const captured = await runCore(nextGuild(), (ctx) => runExpeditionScenario(ctx), {
      rng: createSeededRng('fixture-catch'),
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
    expect(gearState.items.some((i) => i.enchantId !== null)).toBe(true);
    expect(gearState.items.some((i) => i.equippedOn !== null)).toBe(true);
    expect(gearState.skills.some((s) => s.xp > 0)).toBe(true);
    // The three kinds of job result.
    expect(claimCraft.result.kind).toBe('craft');
    expect(claimImprove.result.kind).toBe('improve');
    expect(claimEnchant.result.kind).toBe('enchant');
    // The collection card shows the worn item and the busy job.
    const creatures = collectionState.creatures;
    expect(creatures.some((c) => c.gear !== null)).toBe(true);
    expect(creatures.some((c) => c.busy?.kind === 'job')).toBe(true);
    // The expedition loot has a blueprint and every kind of extra.
    expect(expeditionClaimLoot.result.loot.blueprints).toHaveLength(1);
    expect(Object.keys(expeditionClaimLoot.result.loot.parts).sort()).toEqual(
      ['ember-shard', 'glimmer', 'scrap'].sort(),
    );
    // Errors the client has to write text for.
    const codes = new Set(gearErrors.map((e) => e.body.error));
    for (const code of [
      'insufficient_funds',
      'insufficient_parts',
      'creature_on_job',
      'creature_away',
      'workshop_full',
      'inventory_full',
      'item_busy',
      'not_ready',
      'key_conflict',
      'max_level',
      'same_enchant',
      'blueprint_unknown',
      'nothing_to_improve',
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
    upgrade: UpgradeBodySchema,
    dismantle: DismantleBodySchema,
    'job-craft': StartJobBodySchema,
    'job-improve': StartJobBodySchema,
    'job-enchant': StartJobBodySchema,
    'job-claim': ClaimJobBodySchema,
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
      upgrade: /^\/api\/gear\/ID\/upgrade$/,
      dismantle: /^\/api\/gear\/ID\/dismantle$/,
      'job-craft': /^\/api\/workshop\/jobs$/,
      'job-improve': /^\/api\/workshop\/jobs$/,
      'job-enchant': /^\/api\/workshop\/jobs$/,
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
