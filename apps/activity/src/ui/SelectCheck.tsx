import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { CHECK_PALETTE } from './PlacedCount';

/**
 * The checkbox in the top left corner of a tile in a selectable list (decisions.md, 2026-10-27, "Bulk selection
 * replaces marking", and its 2026-10-28 revision; the bag's `ItemTile` is the first user). A small square box (24 px,
 * square corners, a pixel edge) with the game's pixel check when chosen, in a button only a little larger (32 px), so
 * the rest of the tile stays easy to tap. The button never shows itself: no press sink, outline flash, hover glow or
 * tap highlight (Misa, 2026-10-28); only the box says chosen or not.
 *
 * Put it in the tile's cell (a `position: relative` box), beside the tile's own button and never inside it. It is out
 * of the tab order: keyboard users select with Space on the tile. It shows on hover or focus for a mouse and on every
 * tile while the list is selecting (`select-grid.css`, keyed on the list's `select-grid` and `selecting` classes that
 * `useSelectGrid` gives it). Nothing else may sit in that corner of a tile.
 */
export function SelectCheck({
  chosen,
  label,
  onCheck,
}: {
  /** The thing is in the selection: the box shows the check and a gold edge. */
  chosen: boolean;
  /** The spoken name ("Select Kelp Cap, item level 2"). */
  label: string;
  /** Tapped or clicked: toggles the thing (the first one starts the selection). */
  onCheck: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      class={chosen ? 'select-check on' : 'select-check'}
      aria-checked={chosen}
      aria-label={label}
      tabIndex={-1}
      onClick={onCheck}
    >
      <span class="select-box" aria-hidden="true">
        {chosen && <Sprite sprite={glyphOrUnknown('check')} palette={CHECK_PALETTE} scale={2} />}
      </span>
    </button>
  );
}
