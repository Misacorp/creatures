import type { Creature } from '../api';
import { fetchProfile } from '../expedition-api';
import { useLoaded } from '../use-loaded';
import { Alert } from '../ui/Alert';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { JournalPage } from './JournalPage';
import { StatsPage } from './StatsPage';

const NOTHING = (): void => undefined;

/** The two books: the Journal (a place of the Collection group) and the Stats (a page of Home). */
export type BookPage = 'journal' | 'stats';

const TITLES: Readonly<Record<BookPage, string>> = { journal: 'Journal', stats: 'Stats' };

/**
 * The Journal or the Stats: loads the profile when it opens (and
 * again when a trip finishes while it is open), says so when that fails, and keeps "‹ Back" at the top whenever there
 * is one (the Stats always has it; the Journal only when a pin opened it), so a failed load is never a dead end.
 */
export function HomeBook({
  page,
  creatures,
  tripsFinished,
  onBack,
  backLabel = 'to Home',
}: {
  page: BookPage;
  creatures: readonly Creature[];
  /** The finished-trip count of the state: a new one loads the profile again. */
  tripsFinished: number;
  /** Where Back goes; absent for the Journal opened from the dock (a place shows no Back). */
  onBack?: (() => void) | undefined;
  backLabel?: string;
}) {
  const loaded = useLoaded(fetchProfile, [tripsFinished]);
  const profile = loaded.value;
  if (profile !== null) {
    return page === 'journal' ? (
      <JournalPage
        profile={profile}
        {...(onBack === undefined ? {} : { onBack })}
        backLabel={backLabel}
      />
    ) : (
      <StatsPage profile={profile} creatures={creatures} onBack={onBack ?? NOTHING} />
    );
  }
  return (
    <section
      class="home-sub"
      aria-label={TITLES[page]}
      {...(onBack === undefined ? {} : { onKeyDown: onDrillKey(onBack) })}
    >
      {onBack !== undefined && (
        <DrillHead title={TITLES[page]} backLabel={backLabel} onBack={onBack} scroll focus />
      )}
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
