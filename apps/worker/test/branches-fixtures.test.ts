import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import claim from '../../activity/src/fixtures/branches-claim.json';
import errors from '../../activity/src/fixtures/branches-errors.json';
import evolveOther from '../../activity/src/fixtures/branches-evolve-other.json';
import evolve from '../../activity/src/fixtures/branches-evolve.json';
import keep from '../../activity/src/fixtures/branches-keep.json';
import requests from '../../activity/src/fixtures/branches-request-bodies.json';
import stateAfter from '../../activity/src/fixtures/branches-state-after.json';
import state from '../../activity/src/fixtures/branches-state.json';
import { CatchChoiceBodySchema, EvolveBodySchema } from '../src/collection-schemas';
import { expectSameShape } from './fixture-contract';
import { fixtureSet } from './fixture-sets';

/**
 * The contract with the client for branch evolutions and Keep. The files `branches-*` in
 * `apps/activity/src/fixtures` were captured from real server output (`pnpm fixtures:capture` plays
 * `branches-scenario.ts` through the real routes, see `fixture-sets.ts`). These tests run that scenario again and compare the SHAPE of every
 * response (keys and types, not values), so a change in what the server sends fails here and points at the
 * fixtures and the client parsers.
 */
const UPDATE =
  'the server shape changed: run `pnpm fixtures:capture`, review the diff of apps/activity/src/fixtures and update the client parsers';

const sameShape = (live: unknown, fixture: unknown): void => expectSameShape(live, fixture, UPDATE);

describe('the branches fixtures match what the server sends', () => {
  it('has the same responses for the whole scenario', async () => {
    const captured = await fixtureSet('branches').run();
    const r = captured.responses;
    sameShape(r['branches-state'], state);
    sameShape(r['branches-claim'], claim);
    sameShape(r['branches-keep'], keep);
    sameShape(r['branches-evolve'], evolve);
    sameShape(r['branches-evolve-other'], evolveOther);
    sameShape(r['branches-state-after'], stateAfter);
    // The errors are the real ones, code for code.
    expect(captured.errors, UPDATE).toEqual(errors);
  });

  it('shows what each fixture is meant to show', () => {
    // Before: the Sproutle is ready and its line grows two ways.
    const ready = state.creatures.find((c) => c.species === 'sproutle');
    expect(ready?.evolution).toMatchObject({
      toSpecies: 'thornbuck',
      essence: 20,
      available: true,
      alt: { toSpecies: 'sunfawn' },
    });
    // The trip brought a duplicate Sproutle as a card that offers Keep.
    expect(claim.result.catches[0]).toMatchObject({ species: 'sproutle', outcome: 'duplicate' });
    const card = claim.state.pending[0];
    expect(card?.offered.keep).toBe(true);
    // Keep made a second Sproutle (line slot 2), and the card is gone.
    expect(keep.result.choice).toBe('keep');
    expect(keep.state.pending).toHaveLength(0);
    const sproutles = keep.state.creatures.filter((c) => c.line === 'sproutle');
    expect(sproutles.map((c) => c.lineSlot)).toEqual([1, 2]);
    // Each evolved into the form named, and the answer says how many Charms came off.
    expect(evolve.species).toBe('sunfawn');
    expect(evolveOther.species).toBe('thornbuck');
    expect(typeof evolve.unequipped).toBe('number');
    expect(stateAfter.creatures.filter((c) => c.line === 'sproutle').map((c) => c.species)).toEqual(
      ['sunfawn', 'thornbuck'],
    );
    for (const creature of stateAfter.creatures.filter((c) => c.line === 'sproutle')) {
      expect(creature.evolution).toBeUndefined();
    }
    // The errors of the evolve screen.
    expect(errors.map((e) => e.body.error)).toEqual([
      'level_too_low',
      'not_a_branch',
      'not_evolvable',
    ]);
  });
});

describe('the request bodies the client sends', () => {
  type Entry = { path: string; method: string; body: unknown };
  const entries = requests as unknown as Record<string, Entry>;
  const schemaOf: Record<string, v.GenericSchema> = {
    'branches-keep': CatchChoiceBodySchema,
    'branches-evolve': EvolveBodySchema,
    'branches-evolve-other': EvolveBodySchema,
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
    // An older client sends no form: still a valid body.
    expect(
      v.safeParse(EvolveBodySchema, { idempotencyKey: 'branches-fixture-00000009-key' }).success,
    ).toBe(true);
    expect(
      v.safeParse(EvolveBodySchema, {
        species: 'nobody',
        idempotencyKey: 'branches-fixture-00000009-key',
      }).success,
    ).toBe(false);
  });

  it('use paths of the routes the server has', () => {
    const uuid = '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}';
    expect(entries['branches-claim']?.path ?? '').toMatch(
      new RegExp(`^/api/expeditions/${uuid}/claim$`),
    );
    expect(entries['branches-keep']?.path ?? '').toMatch(
      new RegExp(`^/api/catches/${uuid}/choose$`),
    );
    for (const name of ['branches-evolve', 'branches-evolve-other']) {
      expect(entries[name]?.path ?? '', name).toMatch(
        new RegExp(`^/api/creatures/${uuid}/evolve$`),
      );
    }
  });
});
