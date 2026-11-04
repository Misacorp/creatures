/**
 * The Places list: every place of the valley as a row (its glyph, its name, a short line), in the order of the
 * map (west to east). It is the way to a place that is out of view on a phone, and the keyboard's and screen
 * reader's way round the valley. `PlaceRow` is the one row: the House uses it for its two entries (Journal and
 * Stats) too. The line is a few words; step 2 of the valley fills it with what each place is doing now.
 */
import { Drawer } from '../ui/Drawer';
import { Glyph } from './parts';
import { placeOf, type PlaceId } from './valley-art';
import { isOpenPlace, PAGE_TITLES } from './valley-nav';
import { placeLabel, readingOrder } from './valley-logic';

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

/** What a place's row says for now: the page it holds, or that it is not open yet. */
export function placeLine(id: PlaceId): string {
  return isOpenPlace(id) ? PAGE_TITLES[id] : 'not open yet';
}

export function PlacesList({
  open,
  onClose,
  onPlace,
}: {
  open: boolean;
  onClose: () => void;
  onPlace: (id: PlaceId) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Places">
      <ul class="vy-rows" aria-label="Places">
        {readingOrder().map((id) => {
          const place = placeOf(id);
          return (
            <PlaceRow
              key={id}
              glyph={place.glyph}
              name={place.name}
              line={placeLine(id)}
              label={placeLabel(id)}
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
