import type { HouseListView } from '@creatures/game';
import { Alert } from '../ui/Alert';
import { PlaceRow } from '../valley/PlacesList';
import { cut } from './house-names';

export interface VisitListProps {
  /** The houses of the server, or null while they load. */
  list: HouseListView | null;
  /** The last load failed: say so and offer a retry. */
  failed: boolean;
  onRetry: () => void;
  /** A house was tapped: open it. */
  onOpen: (userId: string) => void;
}

/** A name longer than this is cut with an ellipsis in the row (the spoken name keeps all of it). */
const NAME_MAX = 22;

/** What the row says about today: "Gift given · Stamped", or nothing. */
export function todayLine(today: { gifted: boolean; stamped: boolean }): string {
  return [today.gifted ? 'Gift given' : null, today.stamped ? 'Stamped' : null]
    .filter((part) => part !== null)
    .join(' · ');
}

/**
 * The houses of the server as rows (the house's picture, the owner's name, what you did there today), every one
 * listed, the caller's own left out by the server. Data in, callbacks out: it fetches nothing.
 */
export function VisitList({ list, failed, onRetry, onOpen }: VisitListProps) {
  if (list === null) {
    return (
      <div class="hp-panel hp-visit">
        {failed ? (
          <Alert level="alert">
            The houses would not load.{' '}
            <button type="button" class="ghost" onClick={onRetry}>
              Try again
            </button>
          </Alert>
        ) : (
          <p class="hp-empty" role="status">
            Looking for houses…
          </p>
        )}
      </div>
    );
  }
  return (
    <div class="hp-panel hp-visit">
      {failed && (
        <Alert level="alert">
          The houses did not refresh.{' '}
          <button type="button" class="ghost" onClick={onRetry}>
            Try again
          </button>
        </Alert>
      )}
      {list.houses.length === 0 ? (
        <p class="hp-empty" role="status">
          No other houses yet.
        </p>
      ) : (
        <ul class="vy-rows" aria-label="Houses">
          {list.houses.map((house) => {
            const line = todayLine(house.today);
            return (
              <PlaceRow
                key={house.userId}
                glyph="house-nav"
                name={cut(house.name, NAME_MAX)}
                line={line}
                label={line === '' ? house.name : `${house.name}, ${line}`}
                onClick={() => {
                  onOpen(house.userId);
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
