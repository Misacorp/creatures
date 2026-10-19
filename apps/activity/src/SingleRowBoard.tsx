import type { ComponentChildren } from 'preact';
import { ROW, type SingleRowBoardState } from './use-single-row-board';
import { DragGhost } from './ui/DragGhost';
import { LiveRegion } from './ui/LiveRegion';
import { RaidBoard, type BoardRowModel } from './ui/RaidBoard';
import type { SlotModel } from './ui/SlotButton';

interface Props {
  /** The row's state, from `useSingleRowBoard`. */
  row: SingleRowBoardState;
  /** The wrapper's class after `placement`. */
  class: string;
  /** Names the group of tiles for assistive technology. */
  label: string;
  /** What an empty tile says. */
  emptyLabel: string;
  disabled: boolean;
  /** The tile of a place. */
  model: (index: number) => SlotModel;
  /** A tap on a tile (the screen decides what it does). */
  onTap: (slot: number, button: HTMLElement) => void;
  /** Drawn right under the board, before the hint (the dungeon's count). */
  underBoard?: ComponentChildren;
  /** Drawn after the hint, before what a screen reader hears. */
  children?: ComponentChildren;
  /** Drawn last, inside the wrapper (the picker). */
  after?: ComponentChildren;
}

/**
 * The single row of the board with what goes with it: the hint of the last drop, what a screen reader
 * hears (the last move and what the order sets off) and the creature that follows the pointer. The
 * dungeon's team and the camp's row both draw it.
 */
export function SingleRowBoard(props: Props) {
  const { row } = props;
  const rows: BoardRowModel[] = [
    { zone: ROW.zone, name: 'Team', label: null, slots: ROW.slots.map(props.model) },
  ];
  return (
    <div class={`placement ${props.class}`} onKeyDown={row.onKeyDown}>
      <RaidBoard
        single={{ label: props.label }}
        size="large"
        rows={rows}
        stripRef={row.stripRef}
        emptyLabel={props.emptyLabel}
        disabled={props.disabled}
        drag={row.dragDrop}
        statuses={row.statuses}
        cues={row.cues.slots}
        onHoverSlot={row.setHovered}
        rail={{ none: row.cues.none, effect: row.effect }}
        onTap={props.onTap}
      />
      {props.underBoard}
      {row.hint !== null && (
        <p class="muted" role="status">
          {row.hint}
        </p>
      )}
      {props.children}

      <LiveRegion>{row.announcement}</LiveRegion>
      {/* What the order sets off, for a screen reader: the cues are only visual. */}
      <LiveRegion>{row.reactionHint}</LiveRegion>
      <DragGhost ghostRef={row.dragDrop.ghostRef} creature={row.ghost} />
      {props.after}
    </div>
  );
}
