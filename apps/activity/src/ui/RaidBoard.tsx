import type { Zone } from '@creatures/engine';
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { usePrefersReducedMotion } from '../hooks';
import { laneStates, ownLaneSpan, pipLabel, scrollToSpan } from '../raid-board';
import { SlotButton, type SlotModel, type SlotRowProps } from './SlotRow';
import { CueRail, type CueRailProps } from './CueRail';
import { slotState } from './slot-state';

/** One row of the board: its zone, its name (for assistive technology), its label and its slots. */
export interface BoardRowModel {
  zone: Zone;
  name: string;
  label: ComponentChildren;
  slots: readonly SlotModel[];
}

interface RaidBoardProps extends Pick<
  SlotRowProps,
  | 'stripRef'
  | 'emptyLabel'
  | 'disabled'
  | 'selected'
  | 'drag'
  | 'statuses'
  | 'cues'
  | 'onHoverSlot'
  | 'onTap'
> {
  /** Front, Middle and Back (those that have slots), each with its slots left to right. */
  rows: readonly BoardRowModel[];
  /** What the rail under the board says (the "no reaction" mark, the effect line). Absent: no rail. */
  rail?: CueRailProps;
  /** The row that gets the "no reaction" mark on its name, when the creature in focus sets off nothing. */
  noneRow?: Zone | null;
}

/** The sprite scale of a tile: small, so about four lanes fit on a 360 px phone. */
const TILE_SCALE = 2;

/** Scrolls the board sideways to show lanes `first` to `last` (from 0). */
function showLanes(scroller: HTMLElement | null, first: number, last: number, smooth: boolean) {
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
    behavior: smooth ? 'smooth' : 'auto',
  });
}

/**
 * The raid's party as a grid: Front, Middle and Back are three lines that never wrap, and a lane is the
 * same position in every line, so column k is slot k of each row. All three rows sit in one sideways
 * scroller, so a lane stays a vertical line. Above it, a strip of pips shows every lane (yours lit,
 * empty ones hollow); tapping one scrolls to that lane. On open the board scrolls to your creatures.
 * The tiles are the shared `SlotButton`, so tap, drag and the keyboard work as on the dungeon team.
 */
export function RaidBoard(props: RaidBoardProps) {
  const { rows, stripRef } = props;
  const reduced = usePrefersReducedMotion();
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
  const first = useRef(own);
  useLayoutEffect(() => {
    if (first.current !== null)
      showLanes(stripRef.current, first.current.first, first.current.last, false);
  }, []);

  const dragging = props.drag.drag?.creatureId ?? null;
  const classes =
    dragging === null ? 'party-strip board-scroller' : 'party-strip board-scroller dragging';
  return (
    <div class="raid-board">
      <div class="board-pips" role="group" aria-label="Lanes: tap one to jump to it">
        {states.map((state, lane) => (
          <button
            key={lane}
            type="button"
            class={`board-pip ${state}`}
            aria-label={pipLabel(lane + 1, state)}
            onClick={() => {
              showLanes(stripRef.current, lane, lane, !reduced);
            }}
          >
            <i />
          </button>
        ))}
      </div>
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
