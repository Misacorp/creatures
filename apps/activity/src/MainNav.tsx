import { useRef, useState } from 'preact/hooks';
import { glyphOrUnknown } from './glyphs';
import { moreAlert, splitDock, type NavPlace } from './nav-places';
import { Sprite } from './sprites/Sprite';
import { tabPalette } from './tabs';
import { useDockFit } from './use-dock-fit';
import { Drawer } from './ui/Drawer';

/**
 * The main navigation (decisions.md 2026-10-24): one list of places (`navPlaces`) drawn two ways. On a
 * phone it is the dock, a game-style bar of pixel buttons fixed to the bottom edge, in thumb reach; a place
 * that has something waiting for the player carries a small square pip, and the reason is in the button's
 * name for screen readers ("Expeditions, a trip is home"). When more places exist than the dock's width
 * holds, the last button is More: it opens a drawer listing the rest with their pips, carries a roll-up pip
 * of its own, and the place you are in is always in the dock. On a wide window (`wide`) it is a rail down
 * the left, every place with its word beside the picture, and More never shows. It is a `nav` landmark of
 * plain buttons (Tab moves between them, `aria-current` marks the place you are in).
 */
export function MainNav({
  places,
  current,
  wide,
  onSelect,
  slots,
}: {
  places: readonly NavPlace[];
  /** The id of the place you are in. */
  current: string;
  /** From the wide breakpoint (`useWide`): the left rail; below it the bottom dock. */
  wide: boolean;
  onSelect: (id: string) => void;
  /** Dock only: force how many buttons fit (the workbench's width control); absent: measured. */
  slots?: number | undefined;
}) {
  return wide ? (
    <Rail places={places} current={current} onSelect={onSelect} />
  ) : (
    <Dock places={places} current={current} onSelect={onSelect} slots={slots} />
  );
}

/** The alert pip of a place (a small square at the button's top right corner) and its reason, spoken. */
function Pip({ reason }: { reason: string | null }) {
  if (reason === null) return null;
  return (
    <>
      <span class="nav-pip" aria-hidden="true" />
      <span class="visually-hidden">, {reason}</span>
    </>
  );
}

/** A place's picture: dark on the gold of the active button, its own colours otherwise. */
function PlaceIcon({ glyph, active }: { glyph: string; active: boolean }) {
  const palette = tabPalette(active);
  return (
    <Sprite
      sprite={glyphOrUnknown(glyph)}
      scale={3}
      class="nav-icon"
      {...(palette === undefined ? {} : { palette })}
    />
  );
}

function PlaceButton({
  place,
  active,
  onSelect,
}: {
  place: NavPlace;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li data-measure={place.id}>
      <button
        type="button"
        class={active ? 'nav-btn active' : 'nav-btn'}
        aria-current={active ? 'page' : undefined}
        data-place={place.id}
        onClick={() => {
          onSelect(place.id);
        }}
      >
        <PlaceIcon glyph={place.glyph} active={active} />
        <span class="nav-label">{place.label}</span>
        <Pip reason={place.pip} />
      </button>
    </li>
  );
}

/** The wide window's rail: every place, picture and word side by side. It scrolls inside itself if the window is short. */
function Rail({
  places,
  current,
  onSelect,
}: {
  places: readonly NavPlace[];
  current: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav class="main-nav rail" aria-label="Places">
      <ul>
        {places.map((place) => (
          <PlaceButton
            key={place.id}
            place={place}
            active={place.id === current}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </nav>
  );
}

function Dock({
  places,
  current,
  onSelect,
  slots,
}: {
  places: readonly NavPlace[];
  current: string;
  onSelect: (id: string) => void;
  slots: number | undefined;
}) {
  const { listRef, capacity, measuring } = useDockFit(places, current, slots);
  const moreButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { dock, more } = splitDock(places, current, capacity ?? places.length);
  const rollUp = moreAlert(more);
  return (
    <>
      <nav class="main-nav dock" aria-label="Places">
        <ul ref={listRef} class={measuring ? 'measuring' : undefined}>
          {dock.map((place) => (
            <PlaceButton
              key={place.id}
              place={place}
              active={place.id === current}
              onSelect={onSelect}
            />
          ))}
          {(more.length > 0 || measuring) && (
            <li data-measure="more" aria-hidden={more.length > 0 ? undefined : 'true'}>
              <button
                type="button"
                ref={moreButton}
                class="nav-btn"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => {
                  setOpen(true);
                }}
              >
                <PlaceIcon glyph="more" active={false} />
                <span class="nav-label">More</span>
                <Pip reason={rollUp} />
              </button>
            </li>
          )}
        </ul>
      </nav>
      <Drawer
        open={open && more.length > 0}
        title="More places"
        returnFocusTo={moreButton.current}
        onClose={() => {
          setOpen(false);
        }}
      >
        <ul class="nav-more">
          {more.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                class="nav-more-row"
                data-place={place.id}
                onClick={() => {
                  setOpen(false);
                  onSelect(place.id);
                }}
              >
                <PlaceIcon glyph={place.glyph} active={false} />
                <span class="nav-more-name pix">{place.label}</span>
                {place.pip !== null && (
                  <span class="nav-more-pip">
                    <span class="nav-pip inline" aria-hidden="true" />
                    <span class="small">{place.pip}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}
