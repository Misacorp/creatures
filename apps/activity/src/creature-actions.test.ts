import { describe, expect, it, vi } from 'vitest';
import { createKeyStore } from './actions';
import { createActionRunner } from './action-runner';
import { SAMPLE_STATE, sampleCreature } from './creature-card-sample';
import { createCreatureActions } from './creature-actions';
import { creatureName, errorText, speciesName } from './game';
import type { Loaded } from './loaded-state';
import type { GameState } from './api';

/** The real runner (as `Game` uses it), with the answer going to plain recorders. */
function setup() {
  const keys = createKeyStore(() => 'key-1');
  const runner = createActionRunner(() => ({
    keys,
    errorText,
    isStale: () => false,
    setBusy: () => undefined,
    setError: () => undefined,
    setNotice: () => undefined,
    isMounted: () => true,
  }));
  const shown: Loaded[] = [];
  const notices: (string | null)[] = [];
  let current: Loaded = { game: SAMPLE_STATE, offset: 0 };
  const server = {
    earnRibbon: vi.fn(),
    evolveCreature: vi.fn(),
    renameCreature: vi.fn(),
    setLounger: vi.fn(),
    slotTalent: vi.fn(),
  };
  const actions = createCreatureActions({
    run: runner.run,
    runKeyed: runner.runKeyed,
    setCurrent: (next) => {
      current = typeof next === 'function' ? next(current) : next;
      shown.push(current);
    },
    setNotice: (text) => notices.push(text),
    server,
  });
  /** Lets the guarded action and its `then` settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { actions, server, shown, notices, settle, now: () => current };
}

const state = (marker: string): GameState => ({ ...SAMPLE_STATE, serverNow: marker.length });

describe('creature actions', () => {
  it('earns a ribbon with the creature key, shows the answer and says what it did', async () => {
    const { actions, server, shown, notices, settle } = setup();
    const creature = sampleCreature('ribbon ready');
    server.earnRibbon.mockResolvedValue({
      result: { creatureId: creature.id, ribbon: 'bronze', experience: null },
      state: state('a'),
    });
    actions.onRibbon(creature);
    await settle();
    expect(server.earnRibbon).toHaveBeenCalledWith(creature.id, 'key-1');
    expect(shown.map((s) => s.game.serverNow)).toEqual([1]);
    expect(notices).toEqual([`${creatureName(creature)} earned the Bronze Ribbon!`]);
  });

  it('evolves into the chosen form, or into the only one when none is named', async () => {
    const { actions, server, notices, settle } = setup();
    const creature = sampleCreature('evolve ready');
    const only = creature.evolution?.toSpecies;
    if (only === undefined) throw new Error('the sample has an evolution');
    server.evolveCreature.mockResolvedValue({
      species: only,
      firstOnServer: true,
      unequipped: 1,
      state: state('a'),
    });
    actions.onEvolve(creature);
    await settle();
    expect(server.evolveCreature).toHaveBeenCalledWith(creature.id, only, 'key-1');
    expect(notices).toEqual([
      `${creatureName(creature)} evolved into ${speciesName(only)}! First on server! A Charm for its old role went back to the bag.`,
    ]);
    actions.onEvolve(creature, 'other-form');
    await settle();
    expect(server.evolveCreature).toHaveBeenLastCalledWith(creature.id, 'other-form', 'key-1');
  });

  it('does nothing when a line has no form to grow into and none was chosen', async () => {
    const { actions, server, settle } = setup();
    const creature = { ...sampleCreature('growing') };
    delete creature.evolution;
    actions.onEvolve(creature);
    await settle();
    expect(server.evolveCreature).not.toHaveBeenCalled();
  });

  it('renames and shows the answer', async () => {
    const { actions, server, shown, settle } = setup();
    const creature = sampleCreature('growing');
    server.renameCreature.mockResolvedValue(state('ab'));
    actions.onRename(creature, 'Fern');
    await settle();
    expect(server.renameCreature).toHaveBeenCalledWith(creature.id, 'Fern');
    expect(shown.map((s) => s.game.serverNow)).toEqual([2]);
  });

  it('puts a talent in a slot and says which', async () => {
    const { actions, server, shown, notices, settle } = setup();
    const creature = sampleCreature('talent to fill');
    server.slotTalent.mockResolvedValue({ result: { slot: 2 }, state: state('abc') });
    actions.onSlotTalent(creature, 'quick', true, 2);
    await settle();
    expect(server.slotTalent).toHaveBeenCalledWith(
      creature.id,
      { talentId: 'quick', golden: true, slot: 2 },
      'key-1',
    );
    expect(shown.map((s) => s.game.serverNow)).toEqual([3]);
    expect(notices).toEqual(['Put the talent in slot 2.']);
  });

  it('makes a creature the lounger without touching the rest of the state', async () => {
    const { actions, server, now, settle } = setup();
    const creature = sampleCreature('growing');
    server.setLounger.mockResolvedValue('c-lounge');
    actions.onLounge(creature);
    await settle();
    expect(server.setLounger).toHaveBeenCalledWith(creature.id);
    expect(now().game).toEqual({ ...SAMPLE_STATE, loungerId: 'c-lounge' });
  });

  it('leaves the screen alone when the server says no', async () => {
    const { actions, server, shown, notices, settle } = setup();
    server.earnRibbon.mockRejectedValue(new Error('no'));
    actions.onRibbon(sampleCreature('ribbon ready'));
    await settle();
    expect(shown).toEqual([]);
    expect(notices).toEqual([]);
  });
});
