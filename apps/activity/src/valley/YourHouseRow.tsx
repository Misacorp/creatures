/**
 * The valley House's "Your house" row. It lives here, not with the house page's rows (`housing/HouseRows`), because the valley
 * is in the first load and must not pull in the housing content (`docs/design/housing.md` 4.5).
 */
import { PlaceRow } from './PlacesList';

/** The line under the row (the house itself is not loaded there). */
export const YOUR_HOUSE_LINE = 'rooms, guests and gifts';

/** The valley House's third row: it opens the same page. */
export function YourHouseRow({ onClick }: { onClick: () => void }) {
  return <PlaceRow glyph="house-nav" name="Your house" line={YOUR_HOUSE_LINE} onClick={onClick} />;
}
