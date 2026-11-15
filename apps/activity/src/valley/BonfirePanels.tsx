/**
 * What a click in the Bonfire's canvas opens (`BonfireCanvas.tsx` holds the state; the side rule is `PlaceCanvas`'s):
 *
 * - `RestingPanel` (right drawer, a page on a phone): one resting creature of the player's, as a row of the shared creature list (`show`
 *   mode) with what it gained this visit, and the one thing a creature at the fire can do: help build the hearth, or go back to resting
 *   when it already does. Nothing here decides anything: the post is the game's action and the server answers.
 * - `HelperPanel` (right drawer): the helper's seat, who helps at the builders' table: the creature list with a tap picking, or "Back to resting".
 * - `RestingList` (left drawer): everyone resting with the visit's gain, each row a tap that opens that creature's right drawer.
 *
 * Every panel is a `PanelBody`; the two right ones are a one-step `ui/Wizard` whose first step has no Back (the X is the way out).
 */
import { baseOption } from '../roster-picker';
import { creatureName } from '../game';
import type { Creature } from '../api';
import { CreatureList } from '../ui/CreatureList';
import { useWizard } from '../ui/use-wizard';
import { WizardFooter, WizardView } from '../ui/Wizard';
import { REMOVE_ID, seatOptions, type CommonsActions } from './CommonsBoard';
import type { Resting } from './bonfire-cast';
import { commonsOf } from './commons-view';
import { PanelBody } from './PlaceCanvas';
import type { ValleyVisit } from '../api';

/** One creature's line in the list of everyone resting: its XP this visit, and that it is warming up while it catches up. */
export function restingNote(gained: number, warm: boolean): string {
  const xp = gained > 0 ? `+${String(gained)} XP this visit` : 'Resting';
  return warm ? `${xp}, warming up` : xp;
}

/** The hearth's helper post: where it is, who holds it, and the game's action that moves a creature there. */
export interface HelperPost {
  /** The creature that helps now, or null. */
  creatureId: string | null;
  actions: CommonsActions;
}

export function RestingPanel({
  resting,
  helper,
  busy,
  onClose,
}: {
  resting: Resting;
  /** Absent: the hearth's project is not on offer (the flag's block has not come), so only the creature shows. */
  helper: HelperPost | undefined;
  busy: boolean;
  onClose: () => void;
}) {
  const wizard = useWizard(
    [{ id: 'hub', title: creatureName(resting.creature), backLabel: 'to the fire' }],
    {
      onExit: onClose,
    },
  );
  const helping = helper?.creatureId === resting.creature.id;
  return (
    <PanelBody
      footer={
        helper === undefined ? undefined : (
          <WizardFooter
            label={helping ? 'Back to resting' : 'Help build the hearth'}
            busy={busy}
            onFinish={() => {
              void helper.actions
                .post('bonfire', helping ? null : resting.creature.id)
                .then((ok) => {
                  if (ok) onClose();
                });
            }}
          />
        )
      }
    >
      <WizardView wizard={wizard}>
        <div class="dr-stack">
          <CreatureList
            options={[
              {
                ...baseOption(resting.creature),
                note: helping
                  ? 'Helping build the hearth'
                  : restingNote(resting.gained, resting.warm),
              },
            ]}
            selection={{ mode: 'show', label: 'Resting creature' }}
            chips={false}
            class="flat"
          />
          {helper !== undefined && (
            <p class="sp-note">A creature here helps build, a little each day.</p>
          )}
        </div>
      </WizardView>
    </PanelBody>
  );
}

export function HelperPanel({
  visit,
  creatures,
  helper,
  onClose,
  place = 'bonfire',
  title = 'Who helps build the hearth?',
  backLabel = 'to the fire',
}: {
  visit: ValleyVisit;
  creatures: readonly Creature[];
  helper: HelperPost;
  onClose: () => void;
  /** The place whose communal seat this is (the Bonfire's by default; the Paddock's builders' corner uses the same panel). */
  place?: string;
  title?: string;
  backLabel?: string;
}) {
  const wizard = useWizard([{ id: 'who', title, backLabel }], { onExit: onClose });
  const seat = commonsOf(visit)?.communal.find((c) => c.place === place);
  return (
    <PanelBody>
      <WizardView wizard={wizard}>
        <div class="dr-stack">
          <p class="sp-note">A creature at another post swaps places with this one.</p>
          <CreatureList
            options={seatOptions(creatures, visit, seat?.seatId ?? null, helper.creatureId)}
            selection={{
              mode: 'pick',
              label: title,
              onPick: (id) => {
                void helper.actions.post(place, id === REMOVE_ID ? null : id).then(() => {
                  onClose();
                });
              },
            }}
            placedNote="Posted · swaps here"
            showEffects={false}
            reasonSide
            class="flat"
          />
        </div>
      </WizardView>
    </PanelBody>
  );
}

export function RestingList({
  resting,
  onPick,
}: {
  resting: readonly Resting[];
  onPick: (creatureId: string) => void;
}) {
  return (
    <PanelBody>
      <CreatureList
        options={resting.map((r) => ({
          ...baseOption(r.creature),
          note: restingNote(r.gained, r.warm),
        }))}
        selection={{ mode: 'pick', label: 'Resting creatures', onPick }}
        chips={false}
        class="flat"
      />
    </PanelBody>
  );
}
