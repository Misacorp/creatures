/**
 * What a click in the Market's canvas opens (`MarketCanvas.tsx` holds the state; the side rule is `PlaceCanvas`'s):
 *
 * - `BrokerPanel` (right drawer, a page on a phone): the broker at its seat. With a creature posted the first step is the broker itself
 *   (the shared slot row: who trades, and what it trades toward; the line of what it is doing; its rates and next step as a table), and
 *   each slot opens a step of its own (the creature list, the choices of what to trade toward). With nobody posted it opens straight on
 *   the creature list. The broker has no store: its trades land on the Forge's shelf as they happen.
 * - `MarketHelperPanel` (right drawer): the helper's seat at the builders' table, who helps build the Market (the Bonfire's, for the Market).
 * - The stall's exchange is `Exchange` (its own wizard); the project board is the left drawer's `CommonsBoard host="panel"`.
 *
 * Every panel is a `PanelBody` holding a one-step-at-a-time `ui/Wizard` whose first step has no Back (the X is the way out). Nothing here
 * decides anything: every move is the game's action and the server answers.
 */
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { CountBadge, SayLine } from '../ui/CountBadge';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CreatureList } from '../ui/CreatureList';
import { DataTable } from '../ui/DataTable';
import { Slot, SlotRow } from '../ui/Slot';
import { useWizard, type WizardStep } from '../ui/use-wizard';
import { WizardView } from '../ui/Wizard';
import { shardMark } from '../resource-count';
import { REMOVE_ID, seatOptions, type CommonsActions } from './CommonsBoard';
import { commonsOf } from './commons-view';
import { PanelBody } from './PlaceCanvas';
import { SlotText } from './seat-parts';
import {
  BROKER_ELEMENTS,
  brokerLine,
  brokerRows,
  brokerSub,
  towardName,
  type Broker,
} from './market-view';

/** What the Market asks the game to do; each answers whether the server took it. */
export interface MarketActions {
  /** Posts a creature to the broker's seat (a creature that holds another seat swaps), or empties it (`null`). */
  post: (body: { seatId: string; creatureId: string | null }) => Promise<boolean>;
  /** Sets what the broker trades toward: an element it keeps a small stock of, or `null` (only what the orders wait on). */
  setToward: (seatId: string, toward: string | null) => Promise<boolean>;
  /** Trades shards for the element `to` (a keyed spend; Q64: only once the Market is built). */
  exchange: (request: { to: string; from: string | null; times: number }) => Promise<boolean>;
}

/** The step of the broker's panel to open on. */
export type BrokerStep = 'broker' | 'who' | 'toward';

export function BrokerPanel({
  visit,
  creatures,
  seat,
  busy,
  actions,
  initial,
  onClose,
}: {
  visit: ValleyVisit;
  creatures: readonly Creature[];
  seat: Broker;
  busy: boolean;
  actions: MarketActions;
  /** The step to start on (the workbench shows each); a seat with nobody posted starts on the list whatever this says. */
  initial?: BrokerStep;
  onClose: () => void;
}) {
  const broker = creatures.find((c) => c.id === seat.creatureId);
  const posted = broker !== undefined;
  const steps: readonly WizardStep<BrokerStep>[] = posted
    ? [
        { id: 'broker', title: creatureName(broker), backLabel: 'to the Market' },
        { id: 'who', title: 'Who trades at the Market?', backLabel: 'to the broker', back: 'broker' },
        { id: 'toward', title: 'Trade toward', backLabel: 'to the broker', back: 'broker' },
      ]
    : [{ id: 'who', title: 'Who trades at the Market?', backLabel: 'to the Market' }];
  const wizard = useWizard(steps, {
    onExit: onClose,
    ...(initial === undefined ? {} : { initial }),
  });
  return (
    <PanelBody>
      <WizardView wizard={wizard}>
        {wizard.step === 'who' && (
          <div class="dr-stack">
            <p class="sp-note">A creature at another post swaps places with this one.</p>
            <CreatureList
              options={seatOptions(creatures, visit, seat.id, seat.creatureId)}
              selection={{
                mode: 'pick',
                label: 'Who trades at the Market',
                onPick: (id) => {
                  void actions
                    .post({ seatId: seat.id, creatureId: id === REMOVE_ID ? null : id })
                    .then(() => {
                      onClose();
                    });
                },
              }}
              placedNote="Trading · swaps here"
              showEffects={false}
              reasonSide
              class="flat"
            />
          </div>
        )}
        {wizard.step === 'toward' && (
          <div class="dr-stack">
            <ChoiceList label="What the broker trades toward">
              <ChoiceButton
                label="What the orders need"
                line="Trades only for the shards your anvils wait on."
                selected={seat.toward === null}
                disabled={busy}
                onClick={() => {
                  wizard.goTo('broker');
                  if (seat.toward !== null) void actions.setToward(seat.id, null);
                }}
              />
              {BROKER_ELEMENTS.map((element) => (
                <ChoiceButton
                  key={element}
                  label={<CountBadge {...shardMark(element)} size="inline" />}
                  line="Also keeps a small stock of these on the shelf."
                  selected={seat.toward === element}
                  disabled={busy}
                  onClick={() => {
                    wizard.goTo('broker');
                    if (seat.toward !== element) void actions.setToward(seat.id, element);
                  }}
                />
              ))}
            </ChoiceList>
            <p class="muted sp-note">It never trades the few shards you keep for the Forge.</p>
          </div>
        )}
        {wizard.step === 'broker' && broker !== undefined && (
          <div class="dr-stack">
            <SlotRow
              label="Broker"
              slots={[
                <Slot
                  kind="talent"
                  state="filled"
                  label={`Broker: ${creatureName(broker)}, level ${String(broker.level)}. Change`}
                  disabled={busy}
                  onClick={() => {
                    wizard.goTo('who');
                  }}
                >
                  <SlotText name={creatureName(broker)} sub={brokerSub(seat, broker.level)} />
                </Slot>,
                <Slot
                  kind="talent"
                  state="filled"
                  label={`Trades toward: ${towardName(seat.toward)}. Change`}
                  disabled={busy}
                  onClick={() => {
                    wizard.goTo('toward');
                  }}
                >
                  <SlotText
                    name={
                      seat.toward === null ? (
                        'The orders'
                      ) : (
                        <CountBadge {...shardMark(seat.toward)} size="inline" />
                      )
                    }
                    sub="Trades toward"
                  />
                </Slot>,
              ]}
            />
            <p class="sp-note">
              <SayLine say={brokerLine(seat)} />
            </p>
            <DataTable
              rows={brokerRows(seat).map((r) => ({
                label: r.label,
                value: <SayLine say={r.value} />,
              }))}
            />
          </div>
        )}
      </WizardView>
    </PanelBody>
  );
}

/** The Market's helper post: who holds it and the game's action that moves a creature there. */
export interface MarketHelperPost {
  /** The creature that helps now, or null. */
  creatureId: string | null;
  actions: CommonsActions;
}

export function MarketHelperPanel({
  visit,
  creatures,
  helper,
  onClose,
}: {
  visit: ValleyVisit;
  creatures: readonly Creature[];
  helper: MarketHelperPost;
  onClose: () => void;
}) {
  const wizard = useWizard(
    [{ id: 'who', title: 'Who helps build the Market?', backLabel: 'to the Market' }],
    { onExit: onClose },
  );
  const seat = commonsOf(visit)?.communal.find((c) => c.place === 'market');
  return (
    <PanelBody>
      <WizardView wizard={wizard}>
        <div class="dr-stack">
          <p class="sp-note">A creature at another post swaps places with this one.</p>
          <CreatureList
            options={seatOptions(creatures, visit, seat?.seatId ?? null, helper.creatureId)}
            selection={{
              mode: 'pick',
              label: 'Who helps build the Market',
              onPick: (id) => {
                void helper.actions.post('market', id === REMOVE_ID ? null : id).then(() => {
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
