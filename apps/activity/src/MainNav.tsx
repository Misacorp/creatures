import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { glyphOrUnknown } from './glyphs';
import { navGroups, type NavGroup, type NavPlace } from './nav-places';
import { Sprite } from './sprites/Sprite';
import { tabPalette } from './tabs';

/**
 * The main navigation (decisions.md 2026-10-24, reworked the same day): one list of places (`navPlaces`),
 * each in a group (`NAV_GROUPS`), drawn two ways. On a phone it is the dock, three wide group buttons (a
 * picture over a word) fixed to the bottom edge, in thumb reach. A group with several places opens a
 * sub-menu above the dock, a tray of big buttons (picture, word and why it has a pip), one per place; a group
 * with one place is a direct button. A group's pip is the roll-up of its places' pips. On a wide window
 * (`wide`) it is a rail down the left, every place under its group's heading, no sub-menus. It is a `nav`
 * landmark of plain buttons (Tab moves between them, `aria-current` marks the place you are in, a group
 * button says `aria-expanded`). A pip's reason is in the button's name for screen readers.
 */
export function MainNav({
  places,
  current,
  wide,
  onSelect,
  openGroup,
}: {
  places: readonly NavPlace[];
  /** The id of the place you are in. */
  current: string;
  /** From the wide breakpoint (`useWide`): the left rail; below it the bottom dock. */
  wide: boolean;
  onSelect: (id: string) => void;
  /** Dock only: start with this group's sub-menu open (the workbench's presets). */
  openGroup?: string | undefined;
}) {
  const groups = navGroups(places);
  return wide ? (
    <Rail groups={groups} current={current} onSelect={onSelect} />
  ) : (
    <Dock groups={groups} current={current} onSelect={onSelect} openGroup={openGroup} />
  );
}

/** The alert pip of a button (a small square at its top right corner) and its reason, spoken. */
function Pip({ reason }: { reason: string | null }) {
  if (reason === null) return null;
  return (
    <>
      <span class="nav-pip" aria-hidden="true" />
      <span class="visually-hidden">, {reason}</span>
    </>
  );
}

/** A picture: dark on the gold of the active button, its own colours otherwise. */
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

/** The rail's button for one place, and the dock's direct button of a group with one place. */
function PlaceButton({
  place,
  active,
  onSelect,
  extra,
}: {
  place: NavPlace;
  active: boolean;
  onSelect: (id: string) => void;
  extra?: string;
}) {
  return (
    <button
      type="button"
      class={`nav-btn${active ? ' active' : ''}${extra === undefined ? '' : ` ${extra}`}`}
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
  );
}

/** The wide window's rail: every place under its group's heading, picture and word side by side. It scrolls inside itself if the window is short. */
function Rail({
  groups,
  current,
  onSelect,
}: {
  groups: readonly NavGroup[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const prefix = useId();
  return (
    <nav class="main-nav rail" aria-label="Places">
      {groups.map((group) => (
        <div key={group.id} class="nav-group">
          <p class="nav-heading pix" id={`${prefix}-${group.id}`}>
            {group.label}
          </p>
          <ul aria-labelledby={`${prefix}-${group.id}`}>
            {group.places.map((place) => (
              <li key={place.id}>
                <PlaceButton place={place} active={place.id === current} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Dock({
  groups,
  current,
  onSelect,
  openGroup,
}: {
  groups: readonly NavGroup[];
  current: string;
  onSelect: (id: string) => void;
  openGroup: string | undefined;
}) {
  const [open, setOpen] = useState<string | null>(openGroup ?? null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const prefix = useId();

  /** Closes the sub-menu; with the keyboard (or a pick) the focus goes back to the group's button. */
  function close(refocus: boolean): void {
    const was = open;
    setOpen(null);
    if (refocus && was !== null) buttons.current.get(was)?.focus({ preventScroll: true });
  }

  return (
    <>
      {open !== null && (
        <div
          class="nav-scrim"
          aria-hidden="true"
          onPointerDown={() => {
            close(false);
          }}
        />
      )}
      <nav
        class="main-nav dock"
        aria-label="Places"
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== 'Escape' || open === null) return;
          event.stopPropagation();
          event.preventDefault();
          close(true);
        }}
      >
        <ul>
          {groups.map((group, index) => {
            const active = group.places.some((p) => p.id === current);
            const [only] = group.places;
            if (group.direct && only !== undefined) {
              return (
                <li key={group.id}>
                  <PlaceButton
                    place={only}
                    active={only.id === current}
                    onSelect={(id) => {
                      setOpen(null);
                      onSelect(id);
                    }}
                    extra="group"
                  />
                </li>
              );
            }
            const isOpen = open === group.id;
            const trayId = `${prefix}-${group.id}`;
            return (
              <li key={group.id}>
                <button
                  type="button"
                  class={`nav-btn group${active ? ' active' : ''}${isOpen ? ' open' : ''}`}
                  data-group={group.id}
                  aria-expanded={isOpen}
                  aria-controls={trayId}
                  ref={(el: HTMLButtonElement | null) => {
                    if (el === null) buttons.current.delete(group.id);
                    else buttons.current.set(group.id, el);
                  }}
                  onClick={() => {
                    if (isOpen) close(true);
                    else setOpen(group.id);
                  }}
                >
                  <PlaceIcon glyph={group.glyph} active={active} />
                  <span class="nav-label">{group.label}</span>
                  <Pip reason={group.pip} />
                </button>
                {isOpen && (
                  <Tray
                    id={trayId}
                    group={group}
                    current={current}
                    side={index === 0 ? 'start' : index === groups.length - 1 ? 'end' : 'mid'}
                    onPick={(id) => {
                      close(true);
                      onSelect(id);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** The sub-menu of a group: a tray above the dock, one big button per place; the focus moves in when it opens. */
function Tray({
  id,
  group,
  current,
  side,
  onPick,
}: {
  id: string;
  group: NavGroup;
  current: string;
  side: 'start' | 'mid' | 'end';
  onPick: (id: string) => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);
  const start = (group.places.find((p) => p.id === current) ?? group.places[0])?.id;
  return (
    <ul class={`nav-tray ${side}`} id={id} aria-label={group.label}>
      {group.places.map((place) => {
        const here = place.id === current;
        return (
          <li key={place.id}>
            <button
              type="button"
              {...(place.id === start ? { ref: first } : {})}
              class={here ? 'nav-tray-item active' : 'nav-tray-item'}
              aria-current={here ? 'page' : undefined}
              data-place={place.id}
              onClick={() => {
                onPick(place.id);
              }}
            >
              <PlaceIcon glyph={place.glyph} active={here} />
              <span class="nav-tray-name pix">{place.label}</span>
              {place.pip !== null && (
                <span class="nav-tray-pip">
                  <span class="nav-pip inline" aria-hidden="true" />
                  <span class="small">
                    <span class="visually-hidden">, </span>
                    {place.pip}
                  </span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
