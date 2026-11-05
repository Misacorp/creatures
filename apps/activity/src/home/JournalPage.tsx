import type { Profile } from '../expedition-types';
import { Journal } from '../Journal';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';

/**
 * The Journal, a place of the Collection group (no Back: the navigation is on screen, as on every place): the
 * Journal as it always was (every page by place, found ones with their words, blanks for the rest). With an `onBack` it
 * has "‹ Back" (and `backLabel` says where, for screen readers); the game passes none.
 */
export function JournalPage({
  profile,
  onBack,
  backLabel = 'to Home',
  bare = false,
}: {
  profile: Pick<Profile, 'journal'>;
  onBack?: (() => void) | undefined;
  backLabel?: string;
  /** The way back is drawn elsewhere (the valley's HUD): Escape still goes back, but no head is drawn. */
  bare?: boolean;
}) {
  return (
    <section
      class="home-sub journal-page-view"
      aria-label="Journal"
      {...(onBack === undefined ? {} : { onKeyDown: onDrillKey(onBack) })}
    >
      {onBack !== undefined && !bare && (
        <DrillHead title="Journal" backLabel={backLabel} onBack={onBack} scroll focus />
      )}
      <Journal profile={profile} />
    </section>
  );
}
