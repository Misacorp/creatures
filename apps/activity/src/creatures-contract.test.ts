import { beforeEach, describe, expect, it, vi } from 'vitest';
import chooseFuse from './fixtures/creatures-choose-fuse.json';
import chooseRecommended from './fixtures/creatures-choose-recommended.json';
import chooseRelease from './fixtures/creatures-choose-release.json';
import chooseTeach from './fixtures/creatures-choose-teach.json';
import claim from './fixtures/creatures-claim.json';
import creaturesErrors from './fixtures/creatures-errors.json';
import recommendedAll from './fixtures/creatures-recommended-all.json';
import requestBodies from './fixtures/creatures-request-bodies.json';
import slot from './fixtures/creatures-slot.json';
import stateAfter from './fixtures/creatures-state-after.json';
import state from './fixtures/creatures-state.json';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch,
}));

import { ApiError, parseGameState } from './api';
import { parseClaimResponse } from './expedition-api';
import { isTripResult } from './expedition-parse';
import { errorText } from './game';
import { chooseAllRecommended, chooseCatch, slotTalent } from './talent-api';
import {
  isChoiceResult,
  isCreatureTalents,
  isPendingCatch,
  isSlotResult,
  isTalentView,
} from './talent-parse';

/**
 * The talent payloads are real server output (the worker's `creatures-fixtures.test.ts` fails when the
 * server stops sending these shapes). These tests read them with the client's own checks, and check the
 * requests the client builds against the bodies the server accepted.
 */
const bodyOf = (name: keyof typeof requestBodies) =>
  requestBodies[name] as unknown as {
    path: string;
    method: string;
    body: {
      idempotencyKey: string;
      creatureId: string;
      slot: number;
      talentId: string;
      golden: boolean;
    };
  };

describe('the state with waiting duplicates and talents', () => {
  it('reads the waiting cards, the creatures talents and the book price', () => {
    const parsed = parseGameState(state);
    expect(parsed.pending).toHaveLength(4);
    expect(parsed.bookSlotBait).toBe(10);
    for (const card of parsed.pending) {
      expect(isPendingCatch(card)).toBe(true);
      expect(card.offered.release).toBe(true);
    }
    expect(parsed.pending.some((c) => c.talent.golden)).toBe(true);
    for (const creature of parsed.creatures) {
      expect(creature.lineSlot).toBe(1);
      expect(isCreatureTalents(creature.talents)).toBe(true);
      expect(creature.talents.slots[0]?.talent).not.toBeNull();
    }
  });

  it('reads a book with a golden talent and a closed slot', () => {
    const splashet = parseGameState(stateAfter).creatures.find((c) => c.species === 'splashet');
    expect(splashet?.talents.slots.map((s) => s.open)).toEqual([true, false]);
    expect(splashet?.talents.slots[1]?.opensAt).toBe(20);
    expect(splashet?.talents.book.some((t) => t.golden && t.slot === null)).toBe(true);
  });

  it('refuses a state without the cards, or with a bad card or creature talents', () => {
    const base = state as unknown as Record<string, unknown>;
    expect(() => parseGameState({ ...base, pending: undefined })).toThrow();
    expect(() => parseGameState({ ...base, bookSlotBait: 'ten' })).toThrow();
    expect(() => parseGameState({ ...base, pending: [{ ...state.pending[0], id: 4 }] })).toThrow();
    expect(() =>
      parseGameState({ ...base, pending: [{ ...state.pending[0], recommended: { choice: 'x' } }] }),
    ).toThrow();
    const creature = state.creatures[0] as Record<string, unknown>;
    expect(() =>
      parseGameState({ ...base, creatures: [{ ...creature, talents: null }] }),
    ).toThrow();
    expect(() =>
      parseGameState({ ...base, creatures: [{ ...creature, lineSlot: 'a' }] }),
    ).toThrow();
  });

  it('checks a talent: every field, and a golden flag that is a boolean', () => {
    const talent = state.pending[0]?.talent;
    expect(isTalentView(talent)).toBe(true);
    expect(isTalentView({ ...talent, golden: 'yes' })).toBe(false);
    expect(isTalentView({ ...talent, name: undefined })).toBe(false);
    expect(isTalentView(null)).toBe(false);
  });
});

describe('the claim of a trip that brought a duplicate', () => {
  it('reads the catch with its talent and card, and the old outcomes still read', () => {
    expect(isTripResult(claim.result)).toBe(true);
    const parsed = parseClaimResponse(claim);
    const first = parsed.result.catches[0];
    expect(first?.outcome).toBe('duplicate');
    expect(first?.pendingId).toBe(claim.result.catches[0]?.pendingId);
    expect(first?.talent?.name).toBe('Wet Footprints');
    // The pending card of the catch is in the fresh state.
    expect(parsed.state.pending.some((c) => c.id === first?.pendingId)).toBe(true);
    const old = {
      ...claim.result,
      catches: [
        {
          species: 'splashet',
          shiny: false,
          firstOnServer: false,
          outcome: 'fused',
          fusionCount: 2,
        },
        { species: 'splashet', shiny: false, firstOnServer: false, outcome: 'converted', bait: 7 },
      ],
    };
    expect(isTripResult(old)).toBe(true);
  });

  it('reads the empty rolls and the cards the server settled itself, and refuses bad ones', () => {
    expect(isTripResult({ ...claim.result, noCatch: 2 })).toBe(true);
    expect(isTripResult({ ...claim.result, noCatch: -1 })).toBe(false);
    expect(isTripResult({ ...claim.result, noCatch: 'two' })).toBe(false);
    expect(isTripResult({ ...claim.result, autoSettled: [chooseFuse.result] })).toBe(true);
    expect(isTripResult({ ...claim.result, autoSettled: [{ choice: 'fuse' }] })).toBe(false);
    expect(
      isTripResult({
        ...claim.result,
        catches: [{ ...claim.result.catches[0], outcome: 'eaten' }],
      }),
    ).toBe(false);
    expect(
      isTripResult({
        ...claim.result,
        catches: [{ ...claim.result.catches[0], talent: { id: 1 } }],
      }),
    ).toBe(false);
  });
});

describe('the answers of the choice and Talent Book routes', () => {
  it('reads every choice result', () => {
    for (const fixture of [chooseTeach, chooseFuse, chooseRelease, chooseRecommended]) {
      expect(isChoiceResult(fixture.result)).toBe(true);
      expect(parseGameState(fixture.state).pending.length).toBeLessThan(4);
    }
    expect(chooseTeach.result.talent).toEqual({ talentId: 'bigger-splash', golden: true });
    expect(chooseRelease.result.parts).toEqual({ scrap: 3 });
    expect(isChoiceResult({ ...chooseFuse.result, choice: 'eat' })).toBe(false);
    expect(isChoiceResult({ ...chooseFuse.result, auto: 'no' })).toBe(false);
    expect(isChoiceResult({ ...chooseRelease.result, parts: { gold: 3 } })).toBe(false);
    expect(isSlotResult(slot.result)).toBe(true);
    expect(isSlotResult({ ...slot.result, slot: 1.5 })).toBe(false);
  });
});

describe('the requests the client sends', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  const lastRequest = () => {
    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    return { path, method: init.method, body: JSON.parse(init.body as string) as unknown };
  };

  it('answers a card with the body and path the server accepted', async () => {
    apiFetch.mockResolvedValue(chooseTeach);
    const teach = bodyOf('creatures-choose-teach');
    const { idempotencyKey } = teach.body;
    const done = await chooseCatch(
      chooseTeach.result.pendingId,
      { choice: 'teach', creatureId: teach.body.creatureId },
      idempotencyKey,
    );
    expect(done.result.choice).toBe('teach');
    expect(done.state.pending).toHaveLength(3);
    const sent = lastRequest();
    expect(sent.method).toBe('POST');
    expect(sent.path).toBe(`/api/catches/${chooseTeach.result.pendingId}/choose`);
    expect(sent.body).toEqual(teach.body);
  });

  it('sends release, fuse and recommended with a key and nothing else', async () => {
    for (const [fixture, name, request] of [
      [chooseRelease, 'creatures-choose-release', { choice: 'release' }],
      [chooseRecommended, 'creatures-choose-recommended', { choice: 'recommended' }],
    ] as const) {
      apiFetch.mockReset();
      apiFetch.mockResolvedValue(fixture);
      const body = bodyOf(name).body;
      await chooseCatch(fixture.result.pendingId, request, body.idempotencyKey);
      expect(lastRequest().body).toEqual(body);
    }
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(chooseFuse);
    const fuse = bodyOf('creatures-choose-fuse').body;
    await chooseCatch(
      chooseFuse.result.pendingId,
      { choice: 'fuse', creatureId: fuse.creatureId },
      fuse.idempotencyKey,
    );
    expect(lastRequest().body).toEqual(fuse);
  });

  it('applies Recommended to all, and slots a talent from the book', async () => {
    apiFetch.mockResolvedValue(recommendedAll);
    const all = bodyOf('creatures-recommended-all');
    const done = await chooseAllRecommended(all.body.idempotencyKey);
    expect(done.results.length).toBeGreaterThan(1);
    expect(done.results.every((r) => r.auto)).toBe(true);
    expect(lastRequest()).toEqual({ path: all.path, method: 'POST', body: all.body });

    apiFetch.mockReset();
    apiFetch.mockResolvedValue(slot);
    const put = bodyOf('creatures-slot');
    const slotted = await slotTalent(
      slot.result.creatureId,
      { talentId: put.body.talentId, golden: put.body.golden, slot: put.body.slot },
      put.body.idempotencyKey,
    );
    expect(slotted.result.slot).toBe(1);
    expect(slotted.state.balances.bait).toBe(chooseTeach.state.balances.bait - 10);
    expect(lastRequest()).toEqual({ path: put.path, method: 'POST', body: put.body });
  });

  it('refuses answers of the wrong shape', async () => {
    apiFetch.mockResolvedValue({ result: { choice: 'teach' }, state });
    await expect(chooseCatch('x', { choice: 'release' }, 'k')).rejects.toThrow();
    apiFetch.mockResolvedValue({ results: 'none', state });
    await expect(chooseAllRecommended('k')).rejects.toThrow();
    apiFetch.mockResolvedValue({ result: { slot: 1 }, state });
    await expect(slotTalent('c', { talentId: 't', golden: false, slot: 1 }, 'k')).rejects.toThrow();
  });
});

describe('the errors of the choice and Talent Book routes', () => {
  const GENERIC = /^Something went wrong/;

  it('has a friendly text for every error of the scenario, with its reason', () => {
    expect(creaturesErrors.length).toBeGreaterThan(8);
    for (const { route, status, body } of creaturesErrors) {
      const reason = 'reason' in body ? body.reason : null;
      const text = errorText(new ApiError(status, body.error, reason));
      expect(text, `${route} ${String(status)} ${body.error}`).not.toMatch(GENERIC);
      expect(text.length).toBeGreaterThan(10);
    }
  });

  it('says at which level a closed slot opens', () => {
    expect(errorText(new ApiError(409, 'slot_closed', 'needs_level_20'))).toContain('level 20');
    expect(errorText(new ApiError(409, 'slot_closed', 'needs_level_25'))).toContain('level 25');
    expect(errorText(new ApiError(409, 'slot_closed', 'no_such_slot'))).toContain('no such');
    expect(errorText(new ApiError(409, 'slot_closed'))).toContain('no such');
  });

  it('has a text for the codes beyond the fixtures', () => {
    for (const code of ['max_fusions', 'key_conflict', 'not_found', 'insufficient_funds']) {
      expect(errorText(new ApiError(409, code)), code).not.toMatch(GENERIC);
    }
  });
});
