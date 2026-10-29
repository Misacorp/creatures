/**
 * The signpost (Expeditions), full screen: going in zooms out to the road view, the game's own world map
 * (`WorldMap`, whole), filling the space under the HUD (a phone pans it sideways; a wide window draws it a
 * scale up and scrolls it to the chosen place). The chosen destination wears a cursor on the map itself. The
 * explorer comes from the tray; the supplies to pack float over the map's bottom edge with Go beside them,
 * always in view.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { creatureName } from '../../game';
import { mapPlaces } from '../../map-view';
import { MAP_SPOTS } from '../../sprites/world-map-art';
import { destinationName, supplyKindOf, supplyName } from '../../trip-view';
import { ActionButton } from '../../ui/ActionButton';
import { GameIcon } from '../../ui/GameIcon';
import { WorldMap } from '../../WorldMap';
import { TOUR, isFree, type ProtoWorld, type SendTripChoice } from '../world';
import { useSize } from './parts';
import { HUD_HEIGHT } from './SceneFrame';

export interface SendPicks {
  place: string | null;
  supply: string | null;
}

/** The map's scale: 2 on a phone (it pans), 3 on a wide window (it scrolls to the chosen place). */
export function mapScaleFor(width: number): number {
  return width >= 900 ? 3 : 2;
}

export function SignpostScene({
  world,
  picks,
  held,
  onSend,
  onLeave,
}: {
  world: ProtoWorld;
  picks: SendPicks;
  /** The explorer, picked in the tray. */
  held: string | null;
  onSend: (choice: SendTripChoice) => void;
  onLeave: () => void;
}) {
  const [place, setPlace] = useState<string | null>(picks.place);
  const [supply, setSupply] = useState<string | null>(picks.supply);
  const rootRef = useRef<HTMLElement | null>(null);
  const size = useSize(rootRef);
  const scale = mapScaleFor(size.width);
  const places = mapPlaces({
    trips: world.trips,
    creatures: world.creatures,
    now: world.now,
    selected: place,
  });
  const dest = world.destinations.destinations.find((d) => d.id === place);
  const closed = dest === undefined ? [] : dest.closed.filter((c) => c !== 'rank');
  const full = world.slots.used >= world.slots.total;
  const stock = Object.entries(world.supplies).filter(([, n]) => n > 0);
  const who =
    held === null ? undefined : world.creatures.find((c) => c.id === held && isFree(world, c));

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && document.querySelector('[role="dialog"]') === null) onLeave();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onLeave]);

  // A map taller than its space scrolls down to the chosen place.
  useEffect(() => {
    const el = rootRef.current?.querySelector<HTMLElement>('.pv-map');
    const spot = place === null ? undefined : MAP_SPOTS[place];
    if (el == null || spot === undefined) return;
    el.scrollTop = Math.max(0, spot.y * scale - el.clientHeight / 2);
  }, [place, scale, size.height]);

  let label = 'Pick a place on the map';
  let ready = false;
  if (place !== null) {
    if (closed.length > 0) label = `${destinationName(place)} is closed now`;
    else if (full) label = 'Every explorer is out';
    else if (who === undefined) label = 'Pick an explorer below';
    else {
      label = `Go: ${creatureName(who)} → ${destinationName(place)}`;
      ready = true;
    }
  }

  return (
    <section
      ref={(el) => {
        rootRef.current = el;
      }}
      class="pv-interior pv-in-signpost"
      aria-label="Signpost, Expeditions"
    >
      <div class="pv-map">
        <WorldMap
          places={places}
          selected={place}
          night={false}
          onPick={setPlace}
          width={size.width}
          scale={scale}
        />
      </div>
      <div class="pv-act pv-act-map">
        {place !== null && closed.length === 0 && !full && (
          <ul class="pv-packs" aria-label="Pack a supply">
            {stock.map(([id, n]) => (
              <li key={id}>
                <button
                  type="button"
                  class={`pv-pack${supply === id ? ' on' : ''}`}
                  aria-pressed={supply === id}
                  aria-label={`Pack ${supplyName(id)}, ${String(n)} in stock`}
                  onClick={() => {
                    setSupply(supply === id ? null : id);
                  }}
                >
                  <GameIcon
                    icon={{ kind: 'supply', id: supplyKindOf(id) ?? 'unknown' }}
                    scale={3}
                  />
                  <span class="pv-pack-n pix" aria-hidden="true">
                    {n}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ActionButton
          label={label}
          detail={ready ? '6 h' : undefined}
          wide
          large
          disabled={!ready}
          onClick={() => {
            if (who === undefined || place === null) return;
            onSend({ creatureId: who.id, destination: place, length: TOUR.send.length, supply });
          }}
        />
      </div>
    </section>
  );
}

export { HUD_HEIGHT };
