import { describe, expect, it, vi } from 'vitest';
import { createActionRunner } from './action-runner';
import { createKeyStore } from './actions';
import { ApiError, type GameState } from './api';
import { createCreatureActions } from './creature-actions';
import { SAMPLE_STATE, sampleCreature } from './creature-card-sample';
import { withV2 } from './creature-page/v2-sample';
import { errorText } from './game';
import type { Loaded } from './loaded-state';
import { sayText } from './resource-count';

/** The real runner (as `Game` uses it), with the answers going to plain recorders: combat v2's three actions. */
function setup() {
  const keys = createKeyStore(() => 'key-1');
  const errors: (string | null)[] = [];
  const runner = createActionRunner(() => ({
    keys,
    errorText,
    isStale: () => false,
    setBusy: () => undefined,
    setError: (text) => errors.push(text),
    setNotice: () => undefined,
    isMounted: () => true,
  }));
  const shown: Loaded[] = [];
  const notices: (string | null)[] = [];
  const v2Server = { saveKnack: vi.fn(), learnTalentV2: vi.fn(), slotTalentV2: vi.fn() };
  const actions = createCreatureActions({
    run: runner.run,
    runKeyed: runner.runKeyed,
    setCurrent: (next) => {
      const now: Loaded = { game: SAMPLE_STATE, offset: 0 };
      shown.push(typeof next === 'function' ? next(now) : next);
    },
    setNotice: (text) => notices.push(typeof text === 'string' ? text : sayText(text ?? [])),
    v2Server,
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { actions, v2Server, shown, notices, errors, settle };
}

const state = (marker: string): GameState => ({ ...SAMPLE_STATE, serverNow: marker.length });
const creature = withV2(sampleCreature('growing'), { knack: 0, learned: [0] });

describe('combat v2 creature actions', () => {
  it('saves a Knack, shows the answer and says it was saved', async () => {
    const { actions, v2Server, shown } = setup();
    v2Server.saveKnack.mockResolvedValue({ knack: 'x', state: state('a') });
    await expect(actions.onKnack?.(creature, 'x', 'page')).resolves.toBe('saved');
    expect(v2Server.saveKnack).toHaveBeenCalledWith(creature.id, 'x', 'page');
    expect(shown.map((s) => s.game.serverNow)).toEqual([1]);
  });

  it('saves "none" and says which screen it was saved from', async () => {
    const { actions, v2Server } = setup();
    v2Server.saveKnack.mockResolvedValue({ knack: null, state: state('a') });
    await expect(actions.onKnack?.(creature, null, 'raid')).resolves.toBe('saved');
    expect(v2Server.saveKnack).toHaveBeenCalledWith(creature.id, null, 'raid');
  });

  it('answers "locked" for a creature that has fought, with no error line and nothing shown', async () => {
    const { actions, v2Server, shown, errors } = setup();
    v2Server.saveKnack.mockRejectedValue(new ApiError(409, 'locked'));
    await expect(actions.onKnack?.(creature, 'x', 'page')).resolves.toBe('locked');
    expect(shown).toEqual([]);
    expect(errors.filter((e) => e !== null)).toEqual([]);
  });

  it('answers "failed" for any other refusal, with the error line saying why', async () => {
    const { actions, v2Server, errors } = setup();
    v2Server.saveKnack.mockRejectedValue(new ApiError(409, 'knack_not_known'));
    await expect(actions.onKnack?.(creature, 'x', 'page')).resolves.toBe('failed');
    expect(errors.filter((e) => e !== null)).toEqual(['That creature does not know that Knack.']);
    v2Server.saveKnack.mockRejectedValue(new ApiError(404, 'not_found'));
    await expect(actions.onKnack?.(creature, 'x', 'page')).resolves.toBe('failed');
  });

  it('learns a talent with the action key, shows the answer and names the talent', async () => {
    const { actions, v2Server, shown, notices, settle } = setup();
    const book = creature.talentsV2?.book.find((t) => !t.learned);
    if (book === undefined) throw new Error('the sample has a talent to learn');
    const after = {
      ...SAMPLE_STATE,
      creatures: [
        {
          ...creature,
          talentsV2: {
            ...(creature.talentsV2 as NonNullable<typeof creature.talentsV2>),
            book: (creature.talentsV2?.book ?? []).map((t) =>
              t.id === book.id ? { ...t, learned: true } : t,
            ),
          },
        },
      ],
    };
    v2Server.learnTalentV2.mockResolvedValue({
      creatureId: creature.id,
      talentId: book.id,
      slot: null,
      state: after,
    });
    actions.onLearnTalentV2?.(creature, book.id);
    await settle();
    expect(v2Server.learnTalentV2).toHaveBeenCalledWith(creature.id, book.id, 'key-1');
    expect(shown).toHaveLength(1);
    expect(notices.at(-1)).toContain(book.name);
  });

  it('reads a short Bait as the Bait error, and keeps one key for the same learning', async () => {
    const { actions, v2Server, errors, settle } = setup();
    v2Server.learnTalentV2.mockRejectedValue(new ApiError(409, 'insufficient_funds'));
    actions.onLearnTalentV2?.(creature, 'hardy');
    await settle();
    expect(errors.filter((e) => e !== null)).toEqual(['Not enough Bait.']);
    // A definite refusal drops the key: the next try gets a new one (the store is the real one).
    actions.onLearnTalentV2?.(creature, 'hardy');
    await settle();
    expect(v2Server.learnTalentV2).toHaveBeenCalledTimes(2);
  });

  it('slots and unslots with no key, and shows the answer', async () => {
    const { actions, v2Server, shown, settle } = setup();
    v2Server.slotTalentV2.mockResolvedValue({
      creatureId: creature.id,
      talentId: 'hardy',
      slot: 2,
      state: state('ab'),
    });
    actions.onSlotTalentV2?.(creature, 'hardy', 2);
    await settle();
    expect(v2Server.slotTalentV2).toHaveBeenCalledWith(creature.id, 'hardy', 2);
    actions.onSlotTalentV2?.(creature, 'hardy', null);
    await settle();
    expect(v2Server.slotTalentV2).toHaveBeenLastCalledWith(creature.id, 'hardy', null);
    expect(shown).toHaveLength(2);
  });
});
