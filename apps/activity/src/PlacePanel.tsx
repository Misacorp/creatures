import type { ComponentChildren } from 'preact';
import type { Creature } from './api';
import type { DestinationCard } from './destination-view';
import type { SendRequest } from './expedition-api';
import type { DestinationsView, Slots, Trip } from './expedition-types';
import { PlaceHead, PlaceLoading, PlaceTrips } from './PlaceCard';
import { PushOnChoice } from './PushOnChoice';
import { SendForm } from './SendForm';
import { SkyLine } from './SkyLine';
import { destinationName } from './trip-view';
import { DrillHead } from './ui/DrillHead';
import { onDrillKey } from './ui/drill-keys';
import { useSendForm } from './use-send-form';
import type { Forecast } from './weather-types';

const TITLE_ID = 'place-panel-title';
/** The id of the trip result's heading (it names the panel while the result shows). */
const RESULT_ID = 'trip-result-heading';

export interface PlacePanelProps {
  /** The chosen place's id; null while nothing is chosen. */
  destination: string | null;
  card: DestinationCard | undefined;
  view: DestinationsView | null;
  viewFailed: boolean;
  onRetry: () => void;
  /** The trip whose push-on choice shows in the panel; null for the place. */
  deciding: Trip | null;
  /** Leaves the push-on choice (Back and Escape). */
  onBackFromDecide: () => void;
  trips: readonly Trip[];
  creatures: readonly Creature[];
  slots: Slots;
  stock: Readonly<Record<string, number>>;
  bait: number;
  timezone: string | null;
  forecast: Forecast | null;
  serverNow: number;
  busy: boolean;
  /** The claimed trip's reveal card; it replaces everything else in the panel while it shows. */
  reveal: ComponentChildren | null;
  onSend: (request: SendRequest) => Promise<boolean>;
  onClaim: (trip: Trip) => void;
  onDecide: (trip: Trip) => void;
  onPushOn: (trip: Trip, goalId: string) => void;
  onOpenWorkshop?: (() => void) | undefined;
}

/** The send form of the chosen place, all at once; its state is dropped when another place is chosen. */
function PanelForm(props: PlacePanelProps & { view: DestinationsView; destination: string }) {
  const form = useSendForm({
    creatures: props.creatures,
    view: props.view,
    destination: props.destination,
    slots: props.slots,
    stock: props.stock,
    bait: props.bait,
    timezone: props.timezone,
  });
  return (
    <SendForm
      form={form}
      layout="panel"
      busy={props.busy}
      forecast={props.forecast}
      onSend={props.onSend}
      {...(props.onOpenWorkshop === undefined ? {} : { onOpenWorkshop: props.onOpenWorkshop })}
    />
  );
}

/**
 * The desktop side panel of the world map (about 24 rem, next to the map). Nothing chosen: "Where to?" and
 * the sky. A place chosen: its banner and what it says, the explorers out there as rows and the whole send
 * form with one Send button. "Decide" shows the push-on choice here with a Back. A claimed trip's reveal
 * card replaces it all until it is closed. It never takes the focus by itself: choosing a place on the map
 * is announced by the page's live region.
 */
export function PlacePanel(props: PlacePanelProps) {
  const { destination, card, deciding } = props;
  if (props.reveal !== null) {
    return (
      <aside class="place-panel reveal" aria-labelledby={RESULT_ID}>
        {props.reveal}
      </aside>
    );
  }
  if (destination === null) {
    return (
      <aside class="place-panel" aria-labelledby={TITLE_ID}>
        <h3 id={TITLE_ID} class="place-panel-title">
          Where to?
        </h3>
        <p class="place-panel-prompt">
          Pick a place on the map to see who lives there and send an explorer.
        </p>
        <SkyLine forecast={props.forecast} />
      </aside>
    );
  }
  const name = card?.name ?? destinationName(destination);
  if (deciding !== null && deciding.offer !== null) {
    const trip = deciding;
    const offer = deciding.offer;
    return (
      <aside
        class="place-panel"
        aria-labelledby={TITLE_ID}
        onKeyDown={onDrillKey(props.onBackFromDecide)}
      >
        <h3 id={TITLE_ID} class="place-panel-title">
          {name}
        </h3>
        <DrillHead
          title="Push on?"
          backLabel="to the place"
          level={4}
          focus
          onBack={props.onBackFromDecide}
        />
        <PushOnChoice
          goals={offer.goals}
          busy={props.busy}
          onPick={(goalId) => {
            props.onPushOn(trip, goalId);
            props.onBackFromDecide();
          }}
          onHome={() => {
            props.onClaim(trip);
          }}
        />
      </aside>
    );
  }
  return (
    <aside class="place-panel" aria-labelledby={TITLE_ID}>
      <h3 id={TITLE_ID} class="place-panel-title">
        {name}
      </h3>
      {card === undefined ? (
        <PlaceLoading failed={props.viewFailed} onRetry={props.onRetry} />
      ) : (
        <PlaceHead card={card} />
      )}
      <PlaceTrips
        trips={props.trips}
        creatures={props.creatures}
        serverNow={props.serverNow}
        busy={props.busy}
        onClaim={props.onClaim}
        onDecide={props.onDecide}
      />
      {props.view !== null && (
        <PanelForm key={destination} {...props} view={props.view} destination={destination} />
      )}
    </aside>
  );
}
