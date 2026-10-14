import type { ComponentChildren, RefObject } from 'preact';
import { getSpecies } from '../game';
import type { Selection } from '../slot-outcome';
import { ElementChip } from '../sprites/ElementChip';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import type { DragDrop } from '../use-drag-drop';

/** One creature of the tray. */
export interface TrayItem {
  id: string;
  species: string;
  name: string;
  /** The small line under the name ("Lv 4", "Lv 4 · slot 2"). */
  detail: ComponentChildren;
  /** Already standing in a slot (the raid tints those chips). */
  placed?: boolean;
}

interface CreatureTrayProps {
  items: readonly TrayItem[];
  trayRef: RefObject<HTMLUListElement>;
  /** Extra class on the list (the dungeon's wider chips). */
  class?: string;
  /** The id of the element that names the list, if it has a heading. */
  labelledBy?: string;
  disabled: boolean;
  selected: Selection;
  drag: DragDrop;
  /** The carried creature is in the row, so dropping it on the tray takes it out: show that. */
  accepts: boolean;
  onTap: (id: string) => void;
  /** Extra list items after the chips (a note when the tray is empty). */
  children?: ComponentChildren;
}

/**
 * The creatures that can be picked up: a chip for each, as a drop target for taking a creature out
 * of the row. A chip takes a tap or a press (the drag starts from it); the element and role tags sit
 * under it, never inside, because a tag must not start a drag.
 */
export function CreatureTray(props: CreatureTrayProps) {
  const { selected, drag } = props;
  const dragging = drag.drag?.creatureId ?? null;
  const classes = ['team-list'];
  if (props.class !== undefined) classes.push(props.class);
  if (props.accepts) classes.push('tray-target');
  if (drag.drag?.over?.kind === 'tray') classes.push('drop-over');
  return (
    <ul
      ref={props.trayRef}
      class={classes.join(' ')}
      {...(props.labelledBy === undefined ? {} : { 'aria-labelledby': props.labelledBy })}
    >
      {props.items.map((c) => {
        const chip = ['team-chip', 'draggable'];
        if (selected === c.id) chip.push('selected');
        if (dragging === c.id) chip.push('dragging-source');
        if (c.placed === true) chip.push('placed');
        const species = getSpecies(c.species);
        return (
          <li key={c.id}>
            <button
              type="button"
              class={chip.join(' ')}
              aria-pressed={selected === c.id}
              disabled={props.disabled}
              onPointerDown={(event) => {
                drag.startDrag(c.id, event);
              }}
              onClick={() => {
                props.onTap(c.id);
              }}
            >
              <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} />
              <span class="chip-name">{c.name}</span>
              <span class="muted">{c.detail}</span>
            </button>
            {/* Tags sit under the button, never inside it: a tag must not start a drag. */}
            {species !== undefined && (
              <p class="tags team-tags">
                <ElementChip element={species.element} role={species.role} />
              </p>
            )}
          </li>
        );
      })}
      {props.children}
    </ul>
  );
}
