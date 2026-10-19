import { beforeEach, describe, expect, it, vi } from 'vitest';
import claim from './fixtures/branches-claim.json';
import branchErrors from './fixtures/branches-errors.json';
import keep from './fixtures/branches-keep.json';
import requestBodies from './fixtures/branches-request-bodies.json';
import stateAfter from './fixtures/branches-state-after.json';
import state from './fixtures/branches-state.json';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { ApiError, parseGameState } from './api';
import { parseClaimResponse } from './expedition-api';
import { evolveForms } from './evolve-view';
import { errorText } from './game';
import { chooseCatch } from './talent-api';
import { pendingFind } from './find-view';

/**
 * Branch evolutions and Keep, read the way the app reads them: the payloads are real server output (the
 * worker's `branches-fixtures.test.ts` fails when the server stops sending these shapes), and the requests
 * the client builds are checked against the bodies the server accepted.
 */
describe('a creature whose line grows two ways', () => {
  it('reads both forms from the real state, and the evolve screen draws them', () => {
    const parsed = parseGameState(state);
    const sproutle = parsed.creatures.find((c) => c.species === 'sproutle');
    expect(sproutle).toBeDefined();
    expect(sproutle?.evolution?.alt).toBeDefined();
    expect(evolveForms(sproutle ?? { level: 1, fusionCount: 0 }).map((f) => f.species)).toEqual([
      'thornbuck',
      'sunfawn',
    ]);
    // Every evolving line has two forms now: a Cindle can grow into Pyrelynx or Wickat.
    const cindle = parsed.creatures.find((c) => c.species === 'cindle');
    expect(cindle?.evolution?.alt).toBeDefined();
    expect(evolveForms(cindle ?? { level: 1, fusionCount: 0 }).map((f) => f.species)).toEqual([
      'pyrelynx',
      'wickat',
    ]);
  });

  it('reads the duplicate that offers Keep, as a find with a Keep row', () => {
    const parsed = parseClaimResponse(claim);
    const card = parsed.state.pending[0];
    expect(card?.offered.keep).toBe(true);
    const find = pendingFind(card ?? parsed.state.pending[0]!, parsed.state.creatures);
    const keys = find.choice?.options.map((o) => o.key) ?? [];
    expect(keys).toContain('keep');
  });

  it('reads a state where both creatures of the line evolved, with nothing left to choose', () => {
    const parsed = parseGameState(stateAfter);
    const line = parsed.creatures.filter((c) => c.line === 'sproutle');
    expect(line.map((c) => c.species)).toEqual(['sunfawn', 'thornbuck']);
    expect(line.map((c) => c.lineSlot)).toEqual([1, 2]);
    expect(line.every((c) => c.evolution === undefined)).toBe(true);
  });
});

describe('the requests the client sends', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  const lastRequest = (): { path: string; method: string; body: unknown } => {
    const call = apiFetch.mock.calls.at(-1) as [string, { method: string; body: string }];
    return { path: call[0], method: call[1].method, body: JSON.parse(call[1].body) as unknown };
  };

  it('keeps a duplicate with the body the server accepted', async () => {
    apiFetch.mockResolvedValue(keep);
    const sent = requestBodies['branches-keep'];
    const done = await chooseCatch(
      keep.result.pendingId,
      { choice: 'keep' },
      sent.body.idempotencyKey,
    );
    expect(done.result.choice).toBe('keep');
    expect(lastRequest().body).toEqual(sent.body);
  });
});

describe('the errors of the evolve screen', () => {
  it('has a friendly text for every error of the scenario', () => {
    for (const { route, status, body } of branchErrors) {
      const text = errorText(new ApiError(status, body.error, null));
      expect(text, `${route} ${body.error}`).not.toMatch(/^Something went wrong/);
    }
    expect(errorText(new ApiError(409, 'not_a_branch', null))).toBe(
      'That creature cannot grow into that form.',
    );
  });
});
