/**
 * The Places list: every place of the valley as a row (its glyph, its name, a short line), with the places that have something
 * waiting first, then the other open places, then the four not open yet, muted (each group in the map's order, west to east). It is the way to a place that is out of view on a phone, and the keyboard's and screen
 * reader's way round the valley. `PlaceRow` is the one row: the House uses it for its two entries (Journal and
 * Stats) too. The line is a few words: what happens next at the place (`place-state.ts`).
 */
import type { ComponentChildren } from 'preact';
import { Drawer } from '../ui/Drawer';
import { Glyph } from './parts';
import { placeOf, type PlaceId } from './valley-art';
import { bubbleAt, listOrder, placeFallback, placeSpoken, type PlaceBubble } from './place-state';
import { isOpenPlace } from './valley-nav';

export function PlaceRow({
  glyph,
  picture,
  name,
  line,
  aside,
  label,
  muted = false,
  pip = false,
  onClick,
}: {
  /** The row's glyph (a place's, or the house's). Give this or `picture`. */
  glyph?: string;
  /** A picture instead of a glyph (a part of the house, drawn small). */
  picture?: ComponentChildren;
  name: string;
  /** The few words under the name's side; left out when the row says its state with `aside`. */
  line?: string;
  /** What closes the row on the right: a few pips of progress. */
  aside?: ComponentChildren;
  /** The row's spoken name (default: the name and the line). */
  label?: string;
  /** A row for something not open yet: its words are muted (a tone of the row, not another look). */
  muted?: boolean;
  /** Something waits here: a small gold square after the line (the House's mailbox). Never the only cue: the line says it. */
  pip?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        class={muted ? 'vy-row vy-row-muted' : 'vy-row'}
        aria-label={label ?? (line === undefined ? name : `${name}, ${line}`)}
        onClick={onClick}
      >
        {picture ?? <Glyph id={glyph ?? 'unknown'} scale={3} />}
        <span class="vy-row-name pix">{name}</span>
        {line !== undefined && <span class="vy-row-line">{line}</span>}
        {aside !== undefined && <span class="vy-row-aside">{aside}</span>}
        {pip && <span class="vy-row-pip" aria-hidden="true" />}
      </button>
    </li>
  );
}

export function PlacesList({
  open,
  lines,
  bubbles,
  opened = [],
  onClose,
  onPlace,
}: {
  open: boolean;
  /** What each place is doing next (`placeStates`); a place missing from it says its page's name. */
  lines: Partial<Readonly<Record<PlaceId, string>>>;
  /** What waits at the places, for their spoken names. */
  bubbles: readonly PlaceBubble[];
  /** Places a flag has opened (the Bonfire with `VALLEY_SYSTEMS`): listed with the open places, not muted. */
  opened?: readonly PlaceId[];
  onClose: () => void;
  onPlace: (id: PlaceId) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Places">
      <ul class="vy-rows" aria-label="Places">
        {listOrder(bubbles, opened).map((id) => {
          const place = placeOf(id);
          const line = lines[id] ?? placeFallback(id);
          return (
            <PlaceRow
              key={id}
              glyph={place.glyph}
              name={place.name}
              line={line}
              muted={!isOpenPlace(id) && !opened.includes(id)}
              label={`${placeSpoken(id, bubbleAt(bubbles, id))}. ${line}`}
              onClick={() => {
                onPlace(id);
              }}
            />
          );
        })}
      </ul>
    </Drawer>
  );
}
