import type { Zone } from '@creatures/engine';
import type { ComponentChildren, RefObject } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { laneStates, ownLaneSpan, scrollToSpan } from '../raid-board';
import { SlotButton, type SlotModel, type SlotStripProps } from './SlotButton';
import { CueRail, type CueRailProps } from './CueRail';
import { slotState } from './slot-state';

/** One row of the board: its zone, its name (for assistive technology), its label and its slots. */
export interface BoardRowModel {
  zone: Zone;
  name: string;
  label: ComponentChildren;
  slots: readonly SlotModel[];
}

interface RaidBoardProps extends SlotStripProps {
  /** The strip holding the tiles: the drag, the keyboard and the focus look the slots up in it. */
  stripRef: RefObject<HTMLDivElement | null>;
  /**
   * Front, Middle and Back (those that have slots), each with its slots left to right. With
   * `single` exactly one row.
   */
  rows: readonly BoardRowModel[];
  /**
   * One plain row of tiles, as many as `rows[0]` has slots (the dungeon team's three places): no row
   * labels, no lane header and no sideways scroller, centred. `label` names the group for assistive
   * technology.
   */
  single?: { label: string };
  /**
   * The size of the tiles of a `single` row. Absent (the default): the raid's own size. `large`: about
   * halfway back to the bigger tiles the dungeon used before it shared the raid's (the dungeon's
   * team, where only three have to fit). The same component and the same tile either way.
   */
  size?: 'large';
  /** What the rail under the board says (the "no reaction" mark, the effect line). Absent: no rail. */
  rail?: CueRailProps;
  /** The row that gets the "no reaction" mark on its name, when the creature in focus sets off nothing. */
  noneRow?: Zone | null;
}

/** The sprite scale of a tile: small, so about four lanes fit on a 360 px phone. The raid's, and the default. */
const TILE_SCALE = 2;

/**
 * The sprite scale of a `large` tile. Sprites only scale by whole pixels, so there is no halfway
 * between 2 and the 3 the larger tiles used; the tile's box (raid-board.css) is what lands halfway.
 */
const LARGE_TILE_SCALE = 3;

/** Scrolls the board sideways to show lanes `first` to `last` (from 0). */
function showLanes(scroller: HTMLElement | null, first: number, last: number) {
  if (scroller === null) return;
  const lanes = scroller.querySelectorAll<HTMLElement>('[data-lane]');
  const a = lanes[first];
  const b = lanes[last];
  if (a === undefined || b === undefined) return;
  const box = scroller.getBoundingClientRect();
  const left = a.getBoundingClientRect().left - box.left + scroller.scrollLeft;
  const right = b.getBoundingClientRect().right - box.left + scroller.scrollLeft;
  scroller.scrollTo({
    left: scrollToSpan(left, right, scroller.clientWidth, scroller.scrollWidth),
    behavior: 'auto',
  });
}

/**
 * The raid's party as a grid: Front, Middle and Back are three lines that never wrap, and a lane is the
 * same position in every line, so column k is slot k of each row. All three rows sit in one sideways
 * scroller, so a lane stays a vertical line. On open the board scrolls to your creatures. The tiles
 * are the shared `SlotButton`. The dungeon team uses the same board in its `single` mode: one centred
 * row (any number of slots, three there) of the same tiles with nothing around it, so the two screens
 * look and behave alike; `size="large"` makes those tiles bigger (the dungeon team asks for it).
 */
export function RaidBoard(props: RaidBoardProps) {
  const { rows, stripRef } = props;
  const occupants = new Map(
    rows.flatMap((r) => r.slots.map((s) => [s.index, s.occupant] as const)),
  );
  const states = laneStates(
    rows.map((r) => ({ zone: r.zone, slots: r.slots.map((s) => s.index) })),
    (slot) => {
      const who = occupants.get(slot);
      return who === null || who === undefined ? null : who.mine ? 'mine' : 'other';
    },
  );
  const own = ownLaneSpan(states);

  // Start at your own creatures (once, when the board opens).
  const first = useRef(props.single === undefined ? own : null);
  useLayoutEffect(() => {
    if (first.current !== null)
      showLanes(stripRef.current, first.current.first, first.current.last);
  }, []);

  const dragging = props.drag.drag?.creatureId ?? null;
  if (props.single !== undefined) {
    const large = props.size === 'large';
    // Tiles that carry an HP line (the camp's row) are wider and taller, so the words fit.
    const withHp = (rows[0]?.slots ?? []).some((s) => s.occupant?.hp !== undefined);
    const classes = ['raid-board', 'single'];
    if (large) classes.push('large');
    if (large && withHp) classes.push('with-hp');
    return (
      <div class={classes.join(' ')}>
        <div
          ref={stripRef}
          class={dragging === null ? 'party-strip' : 'party-strip dragging'}
          role="group"
          aria-label={props.single.label}
        >
          <div class="board-row">
            {(rows[0]?.slots ?? []).map((slot) => (
              <SlotButton
                key={slot.index}
                slot={slot}
                scale={large ? LARGE_TILE_SCALE : TILE_SCALE}
                {...slotState(props, slot)}
              />
            ))}
          </div>
        </div>
        {props.rail !== undefined && <CueRail {...props.rail} />}
      </div>
    );
  }
  const classes =
    dragging === null ? 'party-strip board-scroller' : 'party-strip board-scroller dragging';
  return (
    <div class="raid-board">
      <div class="board-grid">
        <div class="board-labels">
          <p class="board-lane-head" aria-hidden="true">
            Lane
          </p>
          {rows.map((row) => (
            <p
              key={row.zone}
              class={
                props.noneRow === row.zone
                  ? 'zone-label board-label no-reaction'
                  : 'zone-label board-label'
              }
            >
              {row.label}
              {props.noneRow === row.zone && (
                <i class="cue-none-glyph" role="img" aria-label="No reaction" />
              )}
            </p>
          ))}
        </div>
        <div
          ref={stripRef}
          class={classes}
          role="group"
          aria-label="Party board: rows front to back, lanes left to right"
        >
          <div class="board-lanes" aria-hidden="true">
            {states.map((_, lane) => (
              <span key={lane} class="board-lane" data-lane={lane}>
                {lane + 1}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.zone} class="board-row" role="group" aria-label={row.name}>
              {row.slots.map((slot) => (
                <SlotButton
                  key={slot.index}
                  slot={slot}
                  scale={TILE_SCALE}
                  {...slotState(props, slot)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {props.rail !== undefined && <CueRail {...props.rail} />}
    </div>
  );
}
