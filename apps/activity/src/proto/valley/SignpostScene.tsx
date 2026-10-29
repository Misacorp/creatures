/**
 * The signpost (Expeditions): going in zooms out to the road view, the game's own world map (`WorldMap`,
 * whole), with the trips out on its markers. Pick a place: on the floor under the map the free creatures line
 * up, the supplies stand ready to pack (tap to pack, tap again to leave it), and one gold button sends the
 * trip. Then the view goes back to the valley at the signpost and the explorer steps off along the road.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { mapPlaces, mapScaleWide } from '../../map-view';
import { creatureName } from '../../game';
import { destinationName, supplyKindOf, supplyName } from '../../trip-view';
import { ActionButton } from '../../ui/ActionButton';
import { GameIcon } from '../../ui/GameIcon';
import { WorldMap } from '../../WorldMap';
import { TOUR, freeCreatures, type ProtoWorld, type SendTripChoice } from '../world';
import { LineUp } from './LineUp';
import { LeaveDoor, useSize } from './parts';

export interface SendPicks {
  place: string | null;
  creatureId: string | null;
  supply: string | null;
}

export function SignpostScene({
  world,
  picks,
  onSend,
  onLeave,
}: {
  world: ProtoWorld;
  /** What is picked at first (the step's moment). */
  picks: SendPicks;
  onSend: (choice: SendTripChoice) => void;
  onLeave: () => void;
}) {
  const [place, setPlace] = useState<string | null>(picks.place);
  const [who, setWho] = useState<string | null>(picks.creatureId);
  const [supply, setSupply] = useState<string | null>(picks.supply);
  const places = mapPlaces({
    trips: world.trips,
    creatures: world.creatures,
    now: world.now,
    selected: place,
  });
  const dest = world.destinations.destinations.find((d) => d.id === place);
  const closed = dest === undefined ? [] : dest.closed.filter((c) => c !== 'rank');
  const free = freeCreatures(world);
  const full = world.slots.used >= world.slots.total;
  const stock = Object.entries(world.supplies).filter(([, n]) => n > 0);
  const name = who === null ? null : free.find((c) => c.id === who);
  const floorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const size = useSize(rootRef);
  // A desktop draws the map as big as the window allows (`mapScaleWide`), as the Expeditions tab does; the
  // send panel takes 26rem beside it and the HUD 3.5rem above.
  const wide = size.width >= 900;
  const mapSize = { width: size.width - 416, height: size.height - 56 };
  // A place picked on a phone: the floor (the line-up and Send) scrolls into view under the map.
  useEffect(() => {
    if (place === null) return undefined;
    const el = floorRef.current;
    const box = el?.parentElement;
    if (el == null || box == null) return undefined;
    if (window.matchMedia('(min-width: 900px)').matches) return undefined;
    // Once more after the map has measured itself and settled its scale.
    el.scrollIntoView({ block: 'end' });
    const id = window.setTimeout(() => {
      el.scrollIntoView({ block: 'end' });
    }, 80);
    return () => {
      window.clearTimeout(id);
    };
  }, [place]);

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
          {...(wide ? { scale: mapScaleWide(mapSize.width, mapSize.height) } : {})}
        />
      </div>
      <LeaveDoor onLeave={onLeave} />
      <div class="pv-floor" ref={floorRef}>
        {place !== null && dest !== undefined && (
          <div class="pv-setup">
            <p class="pv-dest pix">{destinationName(place)}</p>
            {closed.length > 0 ? (
              <p class="pv-floor-note">Closed now ({closed.join(', ')}).</p>
            ) : full ? (
              <p class="pv-floor-note">Every explorer slot is out.</p>
            ) : (
              <>
                <LineUp
                  label={`Who goes to ${destinationName(place)}?`}
                  creatures={free}
                  picked={who}
                  onPick={setWho}
                />
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
                <ActionButton
                  label={
                    name == null
                      ? 'Pick an explorer'
                      : `Send ${creatureName(name)} to ${destinationName(place)}`
                  }
                  detail="6 h"
                  wide
                  large
                  disabled={name == null}
                  onClick={() => {
                    if (who === null) return;
                    onSend({
                      creatureId: who,
                      destination: place,
                      length: TOUR.send.length,
                      supply,
                    });
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
