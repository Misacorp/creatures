import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { GearState } from './gear-types';
import type { Creature } from './api';
import { Banner } from './Banner';
import type { DestinationCard } from './destination-view';
import type { SendRequest } from './expedition-api';
import type { DestinationsView, Slots, Trip } from './expedition-types';
import { PlaceHead, PlaceLoading, PlaceTrips } from './PlaceCard';
import { PushOnChoice } from './PushOnChoice';
import { SendFooter, SendForm } from './SendForm';
import { slotsFullReason, type SendStep } from './send-view';
import { destinationName } from './trip-view';
import { onDrillKey } from './ui/drill-keys';
import { DrillHead } from './ui/DrillHead';
import { WizardView } from './ui/Wizard';
import { useSendForm, type SendForm as SendFormState } from './use-send-form';
import type { Forecast } from './weather-types';

/** What a place shows: the place, the send wizard, or a trip's push-on choice (both drill-ins). */
export type PlaceMode = { kind: 'place' } | { kind: 'send' } | { kind: 'decide'; trip: Trip };

/** What the flow hands its frame: the heading, the body (it scrolls) and what is pinned under it. */
export interface PlaceFrameParts {
  title: string;
  body: ComponentChildren;
  footer?: ComponentChildren;
}

export interface PlaceFlowProps {
  /** The destination's id. */
  destination: string;
  /** The place's card; undefined while the places have not loaded. */
  card: DestinationCard | undefined;
  /** The destinations the server listed; null while loading or when it failed. */
  view: DestinationsView | null;
  viewFailed: boolean;
  onRetry: () => void;
  mode: PlaceMode;
  onMode: (mode: PlaceMode) => void;
  /** Trips that are out at this place. */
  trips: readonly Trip[];
  creatures: readonly Creature[];
  slots: Slots;
  stock: Readonly<Record<string, number>>;
  bait: number;
  timezone: string | null;
  forecast: Forecast | null;
  serverNow: number;
  busy: boolean;
  /** Sends the trip; resolves true when it started (the caller then closes the place). */
  onSend: (request: SendRequest) => Promise<boolean>;
  onClaim: (trip: Trip) => void;
  onPushOn: (trip: Trip, goalId: string) => void;
  onOpenWorkshop?: (() => void) | undefined;
  /** The bag's fill; a full bag warns, beside Send, that the trip's gear becomes parts. */
  bag?: GearState['inventory'] | null;
  /** The wizard step the form starts on (Who by default; the workbench opens it on a later one). */
  initialStep?: SendStep | undefined;
  /** Draws the frame around the parts: the phone's bottom sheet or the desktop's side panel. */
  frame: (parts: PlaceFrameParts) => VNode;
}

/**
 * A place chosen on the map, in whatever frame the caller draws (`frame`): the place's banner and what it
 * says (name, element, flavour, who lives there, this week's twist, the time rule), the explorers out there
 * as rows, and a gold "Send an explorer here" button pinned at the bottom. That button, and "Decide" on a
 * trip that waits for its push-on choice, open drill-ins in the same frame (never a second layer): the send
 * wizard (Who goes, Pack up, Ready) and the push-on choice. Back and Escape go one step back; from Who, back
 * to the place. The phone draws it as a bottom sheet (`PlaceSheet`), desktop as a side panel
 * (`PlacePanel`). The server decides every send, claim and choice.
 */
export function PlaceFlow(props: PlaceFlowProps) {
  return props.view === null ? (
    <FlowFrame {...props} form={null} />
  ) : (
    <FlowWithForm {...props} view={props.view} />
  );
}

/** Holds the wizard's state for as long as the place is up, so Back from Who and in again keeps the picks. */
function FlowWithForm(props: PlaceFlowProps & { view: DestinationsView }) {
  const form = useSendForm({
    creatures: props.creatures,
    view: props.view,
    destination: props.destination,
    slots: props.slots,
    stock: props.stock,
    bait: props.bait,
    timezone: props.timezone,
    // Back from Who goes back to the place view.
    onExit: () => {
      props.onMode({ kind: 'place' });
    },
    ...(props.initialStep === undefined ? {} : { initialStep: props.initialStep }),
  });
  return <FlowFrame {...props} form={form} />;
}

function FlowFrame({ form, ...props }: PlaceFlowProps & { form: SendFormState | null }) {
  const { mode, onMode, card, destination } = props;
  const title = card?.name ?? destinationName(destination);
  const sendButton = useRef<HTMLButtonElement>(null);
  const before = useRef(mode.kind);

  // Back to the place from a drill-in: the button that opened it is back, give it the focus.
  useEffect(() => {
    if (mode.kind === 'place' && before.current !== 'place') {
      sendButton.current?.focus({ preventScroll: true });
    }
    before.current = mode.kind;
  }, [mode.kind]);

  const toPlace = (): void => {
    onMode({ kind: 'place' });
  };
  const goBack = (): void => {
    if (mode.kind === 'send' && form !== null) form.wizard.back();
    else toPlace();
  };
  const keys = onDrillKey(goBack);

  if (mode.kind === 'send' && form !== null) {
    return props.frame({
      title,
      footer: (
        <SendFooter
          form={form}
          busy={props.busy}
          onSend={props.onSend}
          bag={props.bag ?? null}
          onOpenWorkshop={props.onOpenWorkshop}
        />
      ),
      body: (
        <WizardView wizard={form.wizard} class="place-drill" focus>
          <SendForm
            form={form}
            busy={props.busy}
            forecast={props.forecast}
            onOpenWorkshop={props.onOpenWorkshop}
          />
        </WizardView>
      ),
    });
  }

  if (mode.kind === 'decide' && mode.trip.offer !== null) {
    const trip = mode.trip;
    return props.frame({
      title,
      body: (
        <div class="place-drill" onKeyDown={keys}>
          <DrillHead title="Push on?" backLabel="to the place" onBack={toPlace} focus />
          <PushOnChoice
            goals={mode.trip.offer.goals}
            busy={props.busy}
            onPick={(goalId) => {
              props.onPushOn(trip, goalId);
              toPlace();
            }}
            onHome={() => {
              props.onClaim(trip);
            }}
          />
        </div>
      ),
    });
  }

  const reason = slotsFullReason(props.slots);
  return props.frame({
    title,
    footer: (
      <div class="send-footer">
        {reason !== null && (
          <p class="reason" role="status">
            {reason}
          </p>
        )}
        <button
          ref={sendButton}
          type="button"
          class="primary send-button"
          disabled={form === null || card === undefined || reason !== null || props.busy}
          onClick={() => {
            form?.wizard.goTo('who');
            onMode({ kind: 'send' });
          }}
        >
          <span>Send an explorer here</span>
        </button>
      </div>
    ),
    body: (
      <>
        {card === undefined ? (
          <>
            <Banner destination={destination} />
            <PlaceLoading failed={props.viewFailed} onRetry={props.onRetry} />
          </>
        ) : (
          <PlaceHead card={card} />
        )}
        <PlaceTrips
          trips={props.trips}
          creatures={props.creatures}
          serverNow={props.serverNow}
          busy={props.busy}
          onClaim={props.onClaim}
          onDecide={(trip) => {
            onMode({ kind: 'decide', trip });
          }}
        />
      </>
    ),
  });
}
