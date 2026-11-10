import { useEffect, useState } from 'preact/hooks';
import { Alert } from '../ui/Alert';
import type { HousePlaceProps } from './HousePlace';

type PlaceModule = typeof import('./HousePlace');

/**
 * The House place on the game screen. `HousePlace` and with it the furniture art (about 250 sprites) are loaded with a
 * dynamic `import()` the first time the place opens, so the first load of the game carries none of it; the main bundle only
 * has the House's glyphs. `load` is for tests.
 */
export function HouseHost({
  load = () => import('./HousePlace'),
  ...props
}: HousePlaceProps & { load?: () => Promise<PlaceModule> }) {
  const [place, setPlace] = useState<PlaceModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    load().then(
      (loaded) => {
        if (current) setPlace(loaded);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);
  if (place === null) {
    return failed ? (
      <Alert level="alert">
        Could not open the house.{' '}
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </Alert>
    ) : (
      <p class="muted">Opening the house...</p>
    );
  }
  const Place = place.HousePlace;
  return <Place {...props} />;
}
