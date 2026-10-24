import type { Creature } from '../api';
import { fetchProfile } from '../expedition-api';
import type { HomePage } from '../tabs';
import { useLoaded } from '../use-loaded';
import { Alert } from '../ui/Alert';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { JournalPage } from './JournalPage';
import { StatsPage } from './StatsPage';

const TITLES: Readonly<Record<HomePage, string>> = { journal: 'Journal', stats: 'Stats' };

/**
 * A page that opens from the Home board (the Journal or the Stats): loads the profile when it opens (and
 * again when a trip finishes while it is open), says so when that fails, and always has "‹ Back" to Home at the
 * top, so a failed load is never a dead end.
 */
export function HomeBook({
  page,
  creatures,
  tripsFinished,
  onBack,
}: {
  page: HomePage;
  creatures: readonly Creature[];
  /** The finished-trip count of the state: a new one loads the profile again. */
  tripsFinished: number;
  onBack: () => void;
}) {
  const loaded = useLoaded(fetchProfile, [tripsFinished]);
  const profile = loaded.value;
  if (profile !== null) {
    return page === 'journal' ? (
      <JournalPage profile={profile} onBack={onBack} />
    ) : (
      <StatsPage profile={profile} creatures={creatures} onBack={onBack} />
    );
  }
  return (
    <section class="home-sub" aria-label={TITLES[page]} onKeyDown={onDrillKey(onBack)}>
      <DrillHead title={TITLES[page]} backLabel="to Home" onBack={onBack} scroll focus />
      {loaded.failed ? (
        <Alert level="alert">
          Could not load it.{' '}
          <button type="button" onClick={loaded.reload}>
            Try again
          </button>
        </Alert>
      ) : (
        <p class="muted">Opening the book...</p>
      )}
    </section>
  );
}
