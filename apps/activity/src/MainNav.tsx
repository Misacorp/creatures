import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { glyphOrUnknown } from './glyphs';
import {
  dockItems,
  navGroups,
  navHome,
  type NavGroup,
  type NavHome,
  type NavPlace,
} from './nav-places';
import { Sprite } from './sprites/Sprite';
import { tabPalette } from './tabs';
import { instantPress } from './ui/instant-press';

/**
 * The main navigation (decisions.md 2026-10-24, reworked three times the same day): one list of places
 * (`navPlaces`), each in a group (`NAV_GROUPS`), drawn two ways. On a phone it is the dock, three wide
 * buttons (a picture over a word) fixed to the bottom edge, in thumb reach: a group, Home (the primary
 * button, the only gold one, raised; it opens the Home page) and a group; the group you are in
 * has a gold underline and gold word. A group with several places opens
 * a sub-menu above the dock, a tray of big buttons (picture, word and why it has a pip), one per place; a
 * group with one place is a direct button. A group's pip is the roll-up of its places' pips. On a wide window
 * (`wide`) it is a rail down the left: Home first, then every place under its group's heading, no sub-menus.
 * In between (`bar`, a tablet, a phone on its side, a narrow Discord panel) it is one bar fixed to the bottom
 * edge with every place in a row, Home first (gold, not raised), no sub-menus.
 * Home has no pip: the Home page itself says what needs you. It is a `nav` landmark of plain buttons (Tab
 * moves between them, `aria-current` marks the place you are in, a group button says `aria-expanded`). A
 * pip's reason is in the button's name for screen readers.
 */
export function MainNav({
  places,
  current,
  wide,
  onSelect,
  openGroup,
  home = false,
  bar = false,
}: {
  places: readonly NavPlace[];
  /** The id of the place you are in. */
  current: string;
  /** From the wide breakpoint (`useWide`): the left rail; below it the bottom dock. */
  wide: boolean;
  onSelect: (id: string) => void;
  /** Dock only: start with this group's sub-menu open (the workbench's presets). */
  openGroup?: string | undefined;
  /** Draw Home: the dock's middle button, the rail's first item. Choosing it calls `onSelect('home')`. */
  home?: boolean;
  /** Below `wide`, from the bar breakpoint (`useBar`): one bottom bar with every place instead of the dock. */
  bar?: boolean;
}) {
  const groups = navGroups(places);
  if (wide) return <Rail groups={groups} current={current} onSelect={onSelect} home={home} />;
  return bar ? (
    <Bar groups={groups} current={current} onSelect={onSelect} home={home} />
  ) : (
    <Dock groups={groups} current={current} onSelect={onSelect} openGroup={openGroup} home={home} />
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
function PlaceIcon({
  glyph,
  active,
  scale = 2,
}: {
  glyph: string;
  active: boolean;
  /** Pixels per sprite pixel: 2 for the dock, the rail and the trays, 3 for Home (the primary button). */
  scale?: number;
}) {
  const palette = tabPalette(active);
  return (
    <Sprite
      sprite={glyphOrUnknown(glyph)}
      scale={scale}
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
  flatIcon = false,
}: {
  place: NavPlace;
  active: boolean;
  onSelect: (id: string) => void;
  extra?: string;
  /** Draw the picture in its own colours even when active (the dock's active button is not gold, see `main-nav.css`). */
  flatIcon?: boolean;
}) {
  return (
    <button
      type="button"
      class={`nav-btn${active ? ' active' : ''}${extra === undefined ? '' : ` ${extra}`}`}
      aria-current={active ? 'page' : undefined}
      data-place={place.id}
      {...instantPress(() => {
        onSelect(place.id);
      })}
    >
      <PlaceIcon glyph={place.glyph} active={active && !flatIcon} />
      <span class="nav-label">{place.label}</span>
      <Pip reason={place.pip} />
    </button>
  );
}

/** The wide window's rail: Home, then every place under its group's heading, picture and word side by side. The nav is the column's full height (so a look can paint it); its list sticks to the window and scrolls inside itself if the window is short. */
function Rail({
  groups,
  current,
  onSelect,
  home,
}: {
  groups: readonly NavGroup[];
  current: string;
  onSelect: (id: string) => void;
  home: boolean;
}) {
  const prefix = useId();
  const entry = navHome();
  return (
    <nav class="main-nav rail" aria-label="Places">
      <div class="rail-stick">
        {home && (
          <div class="nav-group nav-home">
            <ul>
              <li>
                <PlaceButton
                  place={{ ...entry, group: '', pip: null }}
                  active={current === entry.id}
                  onSelect={onSelect}
                  extra="home"
                />
              </li>
            </ul>
          </div>
        )}
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
      </div>
    </nav>
  );
}

/** The in-between width's bottom bar: every place in one row, Home first. Plain buttons, no sub-menus. */
function Bar({
  groups,
  current,
  onSelect,
  home,
}: {
  groups: readonly NavGroup[];
  current: string;
  onSelect: (id: string) => void;
  home: boolean;
}) {
  const entry = navHome();
  return (
    <nav class="main-nav dock bar" aria-label="Places">
      <ul>
        {home && (
          <li class="nav-home">
            <HomeNavButton
              entry={entry}
              current={current === entry.id}
              onOpen={() => {
                onSelect(entry.id);
              }}
              scale={2}
            />
          </li>
        )}
        {groups.flatMap((group) =>
          group.places.map((place) => (
            <li key={place.id}>
              <PlaceButton
                place={place}
                active={place.id === current}
                onSelect={onSelect}
                flatIcon
              />
            </li>
          )),
        )}
      </ul>
    </nav>
  );
}

function Dock({
  groups,
  current,
  onSelect,
  openGroup,
  home,
}: {
  groups: readonly NavGroup[];
  current: string;
  onSelect: (id: string) => void;
  openGroup: string | undefined;
  home: boolean;
}) {
  const items = dockItems(groups, home ? navHome() : null);
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
          {items.map((item, index) => {
            if (item.kind === 'home') {
              return (
                <li key={item.home.id} class="nav-home">
                  <HomeNavButton
                    entry={item.home}
                    current={current === item.home.id}
                    onOpen={() => {
                      setOpen(null);
                      onSelect(item.home.id);
                    }}
                  />
                </li>
              );
            }
            if (item.kind !== 'group') return null;
            const { group } = item;
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
                    flatIcon
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
                  {...instantPress(() => {
                    if (isOpen) close(true);
                    else setOpen(group.id);
                  })}
                >
                  <PlaceIcon glyph={group.glyph} active={false} />
                  <span class="nav-label">{group.label}</span>
                  <Pip reason={group.pip} />
                </button>
                {isOpen && (
                  <Tray
                    id={trayId}
                    group={group}
                    current={current}
                    side={index === 0 ? 'start' : index === items.length - 1 ? 'end' : 'mid'}
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

/** Home: the primary button of the dock. It is a place like the others (`aria-current` while you are on it), drawn gold and raised. */
function HomeNavButton({
  entry,
  current,
  onOpen,
  scale = 3,
}: {
  entry: NavHome;
  current: boolean;
  onOpen: () => void;
  /** The picture's size: 3 on the dock (the primary button), 2 in the bar (one place among the others). */
  scale?: number;
}) {
  return (
    <button
      type="button"
      class={`nav-btn home${current ? ' current' : ''}`}
      aria-current={current ? 'page' : undefined}
      data-place={entry.id}
      {...instantPress(onOpen)}
    >
      <PlaceIcon glyph={entry.glyph} active scale={scale} />
      <span class="nav-label">{entry.label}</span>
    </button>
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
              {...instantPress(() => {
                onPick(place.id);
              })}
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
