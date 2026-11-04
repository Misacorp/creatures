/**
 * The Places list: every place of the valley as a row (its glyph, its name, a short line), in the order of the
 * map (west to east). It is the way to a place that is out of view on a phone, and the keyboard's and screen
 * reader's way round the valley. `PlaceRow` is the one row: the House uses it for its two entries (Journal and
 * Stats) too. The line is a few words: what happens next at the place (`place-state.ts`).
 */
import { Drawer } from '../ui/Drawer';
import { Glyph } from './parts';
import { placeOf, type PlaceId } from './valley-art';
import { bubbleAt, placeFallback, placeSpoken, type PlaceBubble } from './place-state';
import { readingOrder } from './valley-logic';

export function PlaceRow({
  glyph,
  name,
  line,
  label,
  onClick,
}: {
  glyph: string;
  name: string;
  line: string;
  /** The row's spoken name (default: the name and the line). */
  label?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        class="vy-row"
        aria-label={label ?? `${name}, ${line}`}
        onClick={onClick}
      >
        <Glyph id={glyph} scale={3} />
        <span class="vy-row-name pix">{name}</span>
        <span class="vy-row-line">{line}</span>
      </button>
    </li>
  );
}

export function PlacesList({
  open,
  lines,
  bubbles,
  onClose,
  onPlace,
}: {
  open: boolean;
  /** What each place is doing next (`placeStates`); a place missing from it says its page's name. */
  lines: Partial<Readonly<Record<PlaceId, string>>>;
  /** What waits at the places, for their spoken names. */
  bubbles: readonly PlaceBubble[];
  onClose: () => void;
  onPlace: (id: PlaceId) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Places">
      <ul class="vy-rows" aria-label="Places">
        {readingOrder().map((id) => {
          const place = placeOf(id);
          const line = lines[id] ?? placeFallback(id);
          return (
            <PlaceRow
              key={id}
              glyph={place.glyph}
              name={place.name}
              line={line}
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
