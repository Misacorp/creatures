/**
 * What a click in the Paddock's canvas opens (`PaddockCanvas.tsx` holds the state; the side rule is `PlaceCanvas`'s):
 *
 * - `CreatureHub` (right drawer, a page on a phone): one creature of the yard as a row of the shared creature list (`show` mode) with where it
 *   is, "Help build the Paddock" (or back to the meadow) when the project is on offer, and the gold "Open its page", which opens the creature's
 *   own page as the next step of the same panel (`CreatureStep`: the Creatures page's page, with the evolve screen it opens).
 * - `GatePanel` (right drawer): the newcomers waiting at the gate, the same cards and the one Confirm as the Creatures page had: keep, release,
 *   fuse or teach, and the gate's auto-answer line on each.
 * - `HelperPanel` (`BonfirePanels`, right drawer): the builders' corner's helper seat.
 *
 * Nothing here decides anything: every choice is the game's action and the server answers.
 */
import { useState } from 'preact/hooks';
import type { Creature, GameState } from '../api';
import { creatureName } from '../game';
import type { GearState } from '../gear-types';
import { baseOption } from '../roster-picker';
import { CreatureList } from '../ui/CreatureList';
import { WizardFooter } from '../ui/Wizard';
import { EvolveDrawer } from '../EvolveDrawer';
import { CreaturePage, type CardActions } from '../CreaturePage';
import type { CreatureGames } from '../games-types';
import { PendingCatches } from '../PendingCatches';
import type { CatchChoiceActions } from '../find-view';
import { PanelBody } from './PlaceCanvas';
import type { HelperPost } from './BonfirePanels';

/** The one thing a creature of the yard can do besides open its page: help build, or go back to the meadow. */
export function CreatureHub({
  creature,
  where,
  helper,
  busy,
  onPage,
  onClose,
}: {
  creature: Creature;
  /** Where it is, in a few words ("At home in the Paddock"). */
  where: string;
  /** Absent: the Paddock's project is not on offer (the commons block has not come), so only the creature shows. */
  helper: HelperPost | undefined;
  busy: boolean;
  onPage: () => void;
  onClose: () => void;
}) {
  const helping = helper?.creatureId === creature.id;
  return (
    <PanelBody footer={<WizardFooter label="Open its page" onFinish={onPage} />}>
      <div class="dr-stack">
        <CreatureList
          options={[{ ...baseOption(creature), note: where }]}
          selection={{ mode: 'show', label: 'Creature' }}
          chips={false}
          class="flat"
        />
        {helper !== undefined && (
          <>
            <p class="sp-note">A creature here helps build, a little each day.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void helper.actions.post('paddock', helping ? null : creature.id).then((ok) => {
                  if (ok) onClose();
                });
              }}
            >
              {helping ? 'Back to the meadow' : 'Help build the Paddock'}
            </button>
          </>
        )}
      </div>
    </PanelBody>
  );
}

/** A creature's own page inside the right drawer, with the evolve screen it opens; Back returns to the hub (or closes when it was opened as the first step). */
export function CreatureStep({
  creature,
  state,
  gear,
  busy,
  actions,
  loadGames,
  onBack,
  onAnswerCatch,
}: {
  creature: Creature;
  state: GameState;
  gear: GearState | null;
  busy: boolean;
  actions: CardActions;
  loadGames?: ((creatureId: string) => Promise<CreatureGames>) | undefined;
  onBack: () => void;
  /** "Answer a waiting catch" on the page: the gate. */
  onAnswerCatch: () => void;
}) {
  const [evolving, setEvolving] = useState(false);
  return (
    <PanelBody>
      <CreaturePage
        key={creature.id}
        creature={creature}
        state={state}
        gear={gear}
        busy={busy}
        actions={{
          ...actions,
          onEvolve: () => {
            setEvolving(true);
          },
        }}
        focus={null}
        backLabel={`to ${creatureName(creature)}`}
        onBack={onBack}
        onAnswerCatch={onAnswerCatch}
        loadGames={loadGames}
      />
      {evolving && (
        <EvolveDrawer
          open
          creature={creature}
          busy={busy}
          onClose={() => {
            setEvolving(false);
          }}
          onEvolve={(c, species) => {
            setEvolving(false);
            actions.onEvolve(c, species);
          }}
        />
      )}
    </PanelBody>
  );
}

/** The gate's drawer: the waiting catches, as the Creatures page showed them. */
export function GatePanel({
  state,
  busy,
  actions,
}: {
  state: GameState;
  busy: boolean;
  actions: CatchChoiceActions;
}) {
  return (
    <PanelBody>
      {state.pending.length === 0 && <p class="muted">Nobody is waiting at the gate.</p>}
      <PendingCatches
        cards={state.pending}
        creatures={state.creatures}
        busy={busy}
        actions={actions}
      />
    </PanelBody>
  );
}
