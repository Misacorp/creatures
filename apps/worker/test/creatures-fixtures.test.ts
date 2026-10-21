import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { RULES } from '@creatures/game';
import chooseFuse from '../../activity/src/fixtures/creatures-choose-fuse.json';
import chooseRecommended from '../../activity/src/fixtures/creatures-choose-recommended.json';
import chooseRelease from '../../activity/src/fixtures/creatures-choose-release.json';
import chooseTeach from '../../activity/src/fixtures/creatures-choose-teach.json';
import claim from '../../activity/src/fixtures/creatures-claim.json';
import errors from '../../activity/src/fixtures/creatures-errors.json';
import recommendedAll from '../../activity/src/fixtures/creatures-recommended-all.json';
import requests from '../../activity/src/fixtures/creatures-request-bodies.json';
import slot from '../../activity/src/fixtures/creatures-slot.json';
import stateAfter from '../../activity/src/fixtures/creatures-state-after.json';
import state from '../../activity/src/fixtures/creatures-state.json';
import {
  CatchChoiceBodySchema,
  CatchRecommendedBodySchema,
  TalentSlotBodySchema,
} from '../src/collection-schemas';
import { expectSameShape } from './fixture-contract';
import { fixtureSet } from './fixture-sets';

/**
 * The contract with the client for the duplicate choice and the Talent Book. The files in
 * `apps/activity/src/fixtures` were captured from real server output (`pnpm fixtures:capture` plays
 * `creatures-scenario.ts` through the real routes, see `fixture-sets.ts`). These tests run that scenario again and compare the SHAPE of every
 * response (keys and types, not values), so a change in what the server sends fails here and points at the
 * fixtures and the client parsers (`apps/activity/src/talent-parse.ts`).
 */
const UPDATE =
  'the server shape changed: run `pnpm fixtures:capture`, review the diff of apps/activity/src/fixtures and update the client parsers (apps/activity/src/talent-parse.ts)';

const sameShape = (live: unknown, fixture: unknown): void => expectSameShape(live, fixture, UPDATE);

describe('the creatures fixtures match what the server sends', () => {
  it('has the same responses for the whole scenario', async () => {
    const captured = await fixtureSet('creatures').run();
    const r = captured.responses;
    sameShape(r['creatures-claim'], claim);
    sameShape(r['creatures-state'], state);
    sameShape(r['creatures-choose-teach'], chooseTeach);
    sameShape(r['creatures-choose-fuse'], chooseFuse);
    sameShape(r['creatures-choose-release'], chooseRelease);
    sameShape(r['creatures-choose-recommended'], chooseRecommended);
    sameShape(r['creatures-recommended-all'], recommendedAll);
    sameShape(r['creatures-slot'], slot);
    sameShape(r['creatures-state-after'], stateAfter);
    // The errors are the real ones, code for code.
    expect(captured.errors, UPDATE).toEqual(errors);
  });

  it('shows what each fixture is meant to show', () => {
    // Four cards wait, one of them golden, each with the choices the server offers.
    expect(state.pending).toHaveLength(4);
    expect(state.pending.filter((p) => p.talent.golden)).toHaveLength(1);
    for (const card of state.pending) {
      expect(card.offered.release).toBe(true);
      expect(card.offered.keep).toBe(false);
      expect(card.offered.fuse.length).toBeGreaterThan(0);
      expect(card.releases).toEqual({ scrap: 3 });
    }
    // The first card is Recommended as a teach, the one the book already has as a fusion.
    expect(state.pending[0]?.recommended.choice).toBe('teach');
    expect(state.pending[3]?.recommended.choice).toBe('fuse');
    // The claim brought a duplicate as a card, never a Bait conversion.
    expect(claim.result.catches[0]?.outcome).toBe('duplicate');
    expect(claim.result.catches[0]?.talent.name).toBe('Wet Footprints');
    // Every answer is a different kind and the state it returns has one card less.
    expect(chooseTeach.result.choice).toBe('teach');
    expect(chooseTeach.result.talent.golden).toBe(true);
    expect(chooseFuse.result.choice).toBe('fuse');
    expect(chooseRelease.result.choice).toBe('release');
    expect(chooseRelease.result.parts).toEqual({ scrap: 3 });
    expect(chooseRecommended.result.choice).toBe('fuse');
    expect(chooseTeach.state.pending).toHaveLength(3);
    expect(chooseFuse.state.pending).toHaveLength(2);
    expect(chooseRelease.state.pending).toHaveLength(1);
    expect(chooseRecommended.state.pending).toHaveLength(0);
    // Apply Recommended to all settles every waiting card and says so.
    expect(recommendedAll.results.length).toBeGreaterThan(1);
    expect(recommendedAll.results.every((x) => x.auto)).toBe(true);
    expect(recommendedAll.state.pending).toHaveLength(0);
    // Slotting from the book costs the 10 Bait the rules say, and fills the slot (the scenario slots twice).
    // (The explorer's trips in between reach rank 2, whose one-time gift adds its Bait.)
    const gift = RULES.expeditions.rank.gifts[0]?.bait ?? 0;
    expect(slot.state.balances.bait).toBe(chooseTeach.state.balances.bait - 20 + gift);
    expect(slot.result.slot).toBe(1);
    // Creatures carry slots, the book and a golden entry; the Bigger Splash stayed in the book.
    const splashet = stateAfter.creatures.find((c) => c.species === 'splashet');
    expect(splashet?.talents.book.some((t) => t.golden && t.slot === null)).toBe(true);
    expect(splashet?.talents.slots[0]?.talent?.id).toBe('splashes-first');
    expect(splashet?.talents.slots[1]?.open).toBe(false);
    // Every creature has a talent in slot 1 (the seeded ones were rolled once on first load).
    for (const creature of stateAfter.creatures) {
      expect(creature.talents.slots[0]?.talent).not.toBeNull();
    }
    // Every error the scenario hits is there.
    expect(new Set(errors.map((e) => e.body.error))).toEqual(
      new Set([
        'teach_not_offered',
        'keep_not_offered',
        'not_found',
        'invalid_body',
        'already_slotted',
        'slot_closed',
        'not_in_book',
        'insufficient_funds',
      ]),
    );
  });
});

describe('the request bodies the client sends', () => {
  type Entry = { path: string; method: string; body: unknown };
  const entries = requests as unknown as Record<string, Entry>;
  const schemaOf: Record<string, v.GenericSchema> = {
    'creatures-choose-teach': CatchChoiceBodySchema,
    'creatures-choose-fuse': CatchChoiceBodySchema,
    'creatures-choose-release': CatchChoiceBodySchema,
    'creatures-choose-recommended': CatchChoiceBodySchema,
    'creatures-recommended-all': CatchRecommendedBodySchema,
    'creatures-slot': TalentSlotBodySchema,
  };

  it('pass the strict schemas, and no extra key gets through', () => {
    for (const [name, schema] of Object.entries(schemaOf)) {
      const entry = entries[name];
      expect(entry, name).toBeDefined();
      expect(entry?.method).toBe('POST');
      expect(v.safeParse(schema, entry?.body).success, name).toBe(true);
      expect(
        v.safeParse(schema, { ...(entry?.body as object), extra: 1 }).success,
        `${name} with an extra key`,
      ).toBe(false);
    }
    expect(entries['creatures-claim']?.body).toEqual({});
  });

  it('use paths of the routes the server has', () => {
    const uuid = '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}';
    const templates: Record<string, RegExp> = {
      'creatures-claim': new RegExp(`^/api/expeditions/${uuid}/claim$`),
      'creatures-choose-teach': new RegExp(`^/api/catches/${uuid}/choose$`),
      'creatures-choose-fuse': new RegExp(`^/api/catches/${uuid}/choose$`),
      'creatures-choose-release': new RegExp(`^/api/catches/${uuid}/choose$`),
      'creatures-choose-recommended': new RegExp(`^/api/catches/${uuid}/choose$`),
      'creatures-recommended-all': /^\/api\/catches\/recommended$/,
      'creatures-slot': new RegExp(`^/api/creatures/${uuid}/talents/slot$`),
    };
    for (const [name, pattern] of Object.entries(templates)) {
      expect(entries[name]?.path ?? '', name).toMatch(pattern);
    }
  });
});
