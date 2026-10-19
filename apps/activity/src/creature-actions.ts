/**
 * What the buttons of a creature do (the ribbon, evolving, renaming, putting a talent in a slot,
 * the lounger). Each action asks the server (which decides) through the guarded runner and puts the
 * fresh state on screen; the notice line says what happened. Spends carry an idempotency key from the
 * runner (see `actions.ts`). The screen never changes a balance itself. Mirrors `gear-actions.ts`.
 */
import { ActionIds } from './actions';
import type { ActionRunner } from './action-runner';
import * as api from './api';
import type { Creature, GameState } from './api';
import type { CardActions } from './CreaturePage';
import { ribbonName } from './experience';
import { creatureName, speciesName } from './game';
import { loaded, type Loaded } from './loaded-state';
import * as talentApi from './talent-api';

/** What `Game` gives the actions: how to run a guarded action, and where the answer goes. */
export interface CreatureDeps {
  /** Runs one guarded action: one at a time, errors shown, state reloaded after a definite "no". */
  run: ActionRunner['run'];
  /** The same for an action with an idempotency key. */
  runKeyed: ActionRunner['runKeyed'];
  /** Replaces the state on screen. */
  setCurrent: (next: Loaded | ((now: Loaded) => Loaded)) => void;
  /** Writes the line under the tabs. */
  setNotice: (text: string | null) => void;
  /** The server calls, replaceable in tests. */
  server?: {
    earnRibbon: typeof api.earnRibbon;
    evolveCreature: typeof api.evolveCreature;
    renameCreature: typeof api.renameCreature;
    setLounger: typeof api.setLounger;
    slotTalent: typeof talentApi.slotTalent;
  };
}

/** The creature card's actions, except wearing gear (that is `createGearActions`). */
export type CreatureActions = Omit<CardActions, 'onEquip'>;

export function createCreatureActions(deps: CreatureDeps): CreatureActions {
  const server = deps.server ?? {
    earnRibbon: api.earnRibbon,
    evolveCreature: api.evolveCreature,
    renameCreature: api.renameCreature,
    setLounger: api.setLounger,
    slotTalent: talentApi.slotTalent,
  };

  /** Shows the collection of an action's answer, if it had one. */
  const showState = (next: GameState | undefined): void => {
    if (next !== undefined) deps.setCurrent(loaded(next));
  };

  return {
    onRibbon: (creature: Creature) => {
      void deps
        .runKeyed(ActionIds.ribbon(creature.id), (key) => server.earnRibbon(creature.id, key))
        .then((done) => {
          if (done === undefined) return;
          deps.setCurrent(loaded(done.state));
          const level = done.result.experience?.level;
          deps.setNotice(
            `${creatureName(creature)} earned the ${ribbonName(done.result.ribbon)}${level === undefined ? '' : ` and is level ${String(level)}`}!`,
          );
        });
    },
    onEvolve: (creature, chosen) => {
      // A line with one form names no form on the screen: it grows into its only one.
      const species = chosen ?? creature.evolution?.toSpecies;
      if (species === undefined) return;
      void deps
        .runKeyed(
          ActionIds.evolve(creature.id, species),
          (key) => server.evolveCreature(creature.id, species, key),
          { currency: 'Essence' },
        )
        .then((done) => {
          if (done === undefined) return;
          deps.setCurrent(loaded(done.state));
          deps.setNotice(
            `${creatureName(creature)} evolved into ${speciesName(done.species)}!${done.firstOnServer ? ' First on server!' : ''}${done.unequipped > 0 ? ' A Charm for its old role went back to the bag.' : ''}`,
          );
        });
    },
    onRename: (creature, nickname) => {
      void deps.run(() => server.renameCreature(creature.id, nickname)).then(showState);
    },
    onSlotTalent: (creature, talentId, golden, slot) => {
      void deps
        .runKeyed(ActionIds.talentSlot(creature.id, talentId, golden, slot), (key) =>
          server.slotTalent(creature.id, { talentId, golden, slot }, key),
        )
        .then((done) => {
          if (done === undefined) return;
          deps.setCurrent(loaded(done.state));
          deps.setNotice(`Put the talent in slot ${String(done.result.slot)}.`);
        });
    },
    onLounge: (creature) => {
      // Not a spend, and a repeat is harmless (the server just says the same thing).
      void deps
        .run(() => server.setLounger(creature.id))
        .then((loungerId) => {
          if (loungerId === undefined) return;
          deps.setCurrent((now) => ({ ...now, game: { ...now.game, loungerId } }));
        });
    },
  };
}
