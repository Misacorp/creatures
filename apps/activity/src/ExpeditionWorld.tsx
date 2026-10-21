import type { ComponentChildren } from 'preact';
import type { GearState } from './gear-types';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { destinationCards } from './destination-view';
import type { SendRequest } from './expedition-api';
import type { DestinationsView, Slots, Trip } from './expedition-types';
import { centerOn, startingPlace } from './map-start';
import { mapPlaces } from './map-view';
import { OutStrip } from './OutStrip';
import { PlacePanel } from './PlacePanel';
import { PlaceSheet, type SheetMode } from './PlaceSheet';
import { markFreshReveal } from './reveal-arrive';
import type { SendStep } from './send-view';
import { SlotsLine } from './SlotsLine';
import { TripShelf } from './TripShelf';
import { destinationName } from './trip-view';
import { LiveRegion } from './ui/LiveRegion';
import type { Forecast } from './weather-types';
import { WorldMap } from './WorldMap';

/** The width from which the map has a side panel next to it (and the app card widens); below it a place opens a sheet. */
export const WIDE_QUERY = '(min-width: 60rem)';

export interface ExpeditionWorldProps {
  /** The trips that are out (running, home or waiting for a choice). */
  trips: readonly Trip[];
  creatures: readonly Creature[];
  slots: Slots;
  stock: Readonly<Record<string, number>>;
  /** The player's Bait: a treat costs some of it. */
  bait: number;
  /** The destinations the server listed; null while loading or when it failed. */
  view: DestinationsView | null;
  viewFailed: boolean;
  onRetry: () => void;
  /** The guild's timezone (always explicit; null when it is not known). */
  timezone: string | null;
  /** The valley sky, for the panel's "Where to?" and what a trip is affected by. */
  forecast: Forecast | null;
  /** Server time (ms), ticked by the caller. */
  serverNow: number;
  busy: boolean;
  /** The layout: true gives the map a side panel and a shelf, false a sheet and a strip. */
  wide: boolean;
  /** The claimed trip's reveal card, to show in the side panel (wide only); null for none. */
  reveal: ComponentChildren | null;
  /** Sends a trip; resolves true when it started. */
  onSend: (request: SendRequest) => Promise<boolean>;
  onClaim: (trip: Trip) => void;
  onPushOn: (trip: Trip, goalId: string) => void;
  onOpenWorkshop?: (() => void) | undefined;
  /** The bag's fill; a full bag warns, beside Send, that the trip's gear becomes parts. */
  bag?: GearState['inventory'] | null;
  /** Starts with this place chosen (the workbench and the tests; the game starts with none). */
  initialPlace?: string | undefined;
  /** With a place: starts in its send wizard on this step (a phone sheet). */
  initialWizard?: SendStep | undefined;
}

/** The nearest button at or above a click's target (the map marker or the chip that was pressed). */
function buttonAbove(target: EventTarget | null): HTMLElement | null {
  let node = target as Node | null;
  while (node !== null) {
    if (node.nodeName === 'BUTTON') return node as HTMLElement;
    node = node.parentNode;
  }
  return null;
}

/**
 * The Trips screen of the Expeditions tab: the world map with its places as buttons and the trips that
 * are out. Choosing a place (a marker, a chip of the strip or a card of the shelf) is controlled state here.
 * Narrow: the place opens as a bottom sheet over the map (with the send wizard and the push-on choice as
 * drill-ins) and the trips are chips under the map. Wide: the map and the "Out exploring" shelf sit left,
 * a side panel with the place and the whole send form sits right, and a claimed trip's reveal shows in
 * the panel. Every place is open on the map; the rank each explorer needs is in the explorer picker, and a
 * place's time rule is a line on its marker and in its sheet.
 */
export function ExpeditionWorld(props: ExpeditionWorldProps) {
  const { trips, creatures, view, timezone, serverNow, wide } = props;
  const [selected, setSelected] = useState<string | null>(props.initialPlace ?? null);
  const [step, setStep] = useState<'place' | 'send' | 'decide'>(
    props.initialPlace !== undefined && props.initialWizard !== undefined ? 'send' : 'place',
  );
  const [decideId, setDecideId] = useState<string | null>(null);
  // The control that opened the sheet, which the sheet gives the focus back to.
  const opener = useRef<HTMLElement | null>(null);

  // The cards (and so the time rules) are as of the moment the places were loaded.
  const cards = useMemo(
    () => (view === null ? [] : destinationCards(view, undefined, timezone)),
    [view, timezone],
  );
  const rules = useMemo(
    () =>
      Object.fromEntries(
        cards.flatMap((card) => (card.timeRule === null ? [] : [[card.id, card.timeRule.text]])),
      ),
    [cards],
  );
  const places = mapPlaces({ trips, creatures, now: serverNow, selected, rules });
  // A map that scrolls starts on the place that matters most (once, without a glide).
  const mapBox = useRef<HTMLDivElement>(null);
  const start = useRef(startingPlace(places, trips));
  useEffect(() => {
    const frame =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => {
            const scroller = mapBox.current?.querySelector<HTMLElement>('.world-map');
            const target = mapBox.current?.querySelector<HTMLElement>(
              `[data-place="${start.current}"]`,
            );
            if (
              scroller !== null &&
              scroller !== undefined &&
              target !== null &&
              target !== undefined
            ) {
              centerOn(scroller, target);
            }
          })
        : null;
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);
  const card = cards.find((c) => c.id === selected);
  const here = trips.filter((t) => t.destination === selected);
  const deciding = decideId === null ? null : (trips.find((t) => t.id === decideId) ?? null);

  const close = (): void => {
    setSelected(null);
    setStep('place');
    setDecideId(null);
  };
  const open = (id: string): void => {
    setSelected(id);
    setStep('place');
    setDecideId(null);
  };
  const pick = (id: string): void => {
    if (wide && id === selected) close();
    else open(id);
  };
  const decide = (trip: Trip): void => {
    setSelected(trip.destination);
    setDecideId(trip.id);
    setStep('decide');
  };
  const claim = (trip: Trip): void => {
    if (wide) {
      // The reveal arrives in the side panel, which is on screen: the page moves only if it is not.
      setStep('place');
      setDecideId(null);
    } else {
      close();
      markFreshReveal();
    }
    props.onClaim(trip);
  };

  const mode: SheetMode =
    step === 'decide' && deciding !== null
      ? { kind: 'decide', trip: deciding }
      : step === 'send'
        ? { kind: 'send' }
        : { kind: 'place' };
  const shared = {
    view,
    viewFailed: props.viewFailed,
    onRetry: props.onRetry,
    trips: here,
    creatures,
    slots: props.slots,
    stock: props.stock,
    bait: props.bait,
    timezone,
    forecast: props.forecast,
    serverNow,
    busy: props.busy,
    onClaim: claim,
    onPushOn: props.onPushOn,
    onOpenWorkshop: props.onOpenWorkshop,
    bag: props.bag ?? null,
  };

  return (
    <div class={wide ? 'exp-world wide' : 'exp-world'}>
      <div class="exp-world-main">
        <div
          class="exp-world-map"
          ref={mapBox}
          onClickCapture={(event) => {
            opener.current = buttonAbove(event.target);
          }}
        >
          <WorldMap
            places={places}
            selected={selected}
            night={view?.night ?? false}
            onPick={pick}
          />
          {!wide && <SlotsLine slots={props.slots} />}
          {!wide && (
            <OutStrip trips={trips} creatures={creatures} serverNow={serverNow} onOpen={open} />
          )}
        </div>
        {wide && (
          <TripShelf
            trips={trips}
            creatures={creatures}
            slots={props.slots}
            serverNow={serverNow}
            busy={props.busy}
            onClaim={claim}
            onDecide={decide}
            onOpen={open}
          />
        )}
      </div>
      {wide && (
        <PlacePanel
          {...shared}
          destination={selected}
          card={card}
          deciding={step === 'decide' ? deciding : null}
          onBackFromDecide={() => {
            setStep('place');
            setDecideId(null);
          }}
          reveal={props.reveal}
          onSend={props.onSend}
          onDecide={decide}
        />
      )}
      {!wide && selected !== null && (
        <PlaceSheet
          {...shared}
          destination={selected}
          card={card}
          mode={mode}
          onMode={(next) => {
            setStep(next.kind);
            setDecideId(next.kind === 'decide' ? next.trip.id : null);
          }}
          initialStep={props.initialWizard}
          returnFocusTo={opener.current}
          onClose={close}
          onSend={async (request) => {
            const started = await props.onSend(request);
            if (started) close();
            return started;
          }}
        />
      )}
      {wide && (
        <LiveRegion>{selected === null ? '' : `${destinationName(selected)} chosen`}</LiveRegion>
      )}
    </div>
  );
}
