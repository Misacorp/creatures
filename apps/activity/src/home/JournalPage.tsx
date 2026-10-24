import type { Profile } from '../expedition-types';
import { Journal } from '../Journal';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';

/**
 * The Journal page, opened from the Journal pin on the Home board: "‹ Back" to Home, then the Journal as it
 * always was (every page by place, found ones with their words, blanks for the rest).
 */
export function JournalPage({
  profile,
  onBack,
}: {
  profile: Pick<Profile, 'journal'>;
  onBack: () => void;
}) {
  return (
    <section class="home-sub journal-page-view" aria-label="Journal" onKeyDown={onDrillKey(onBack)}>
      <DrillHead title="Journal" backLabel="to Home" onBack={onBack} scroll focus />
      <Journal profile={profile} />
    </section>
  );
}
