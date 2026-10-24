import type { Profile } from '../expedition-types';
import { Journal } from '../Journal';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';

/**
 * The Journal, a place of the Collection group (also opened from the Journal pin on the Home board): the
 * Journal as it always was (every page by place, found ones with their words, blanks for the rest). Opened from
 * the dock it has no Back (the navigation is on screen, as on every place); opened from a pin it has "‹ Back" to
 * where it came from (`onBack`, with `backLabel` saying where for screen readers).
 */
export function JournalPage({
  profile,
  onBack,
  backLabel = 'to Home',
}: {
  profile: Pick<Profile, 'journal'>;
  onBack?: (() => void) | undefined;
  backLabel?: string;
}) {
  return (
    <section
      class="home-sub journal-page-view"
      aria-label="Journal"
      {...(onBack === undefined ? {} : { onKeyDown: onDrillKey(onBack) })}
    >
      {onBack !== undefined && (
        <DrillHead title="Journal" backLabel={backLabel} onBack={onBack} scroll focus />
      )}
      <Journal profile={profile} />
    </section>
  );
}
