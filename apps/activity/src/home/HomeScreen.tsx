import type { ComponentChildren } from 'preact';
import { fetchProfile } from '../expedition-api';
import { useServerNow } from '../hooks';
import type { HomeInput } from '../home-view';
import { journalTeaser } from '../journal-view';
import { statsTeaser } from '../stats-view';
import type { HomePage as HomePageId, Tab } from '../tabs';
import { useLoaded } from '../use-loaded';
import type { BoardSettings } from './board';
import { HomePage } from './HomePage';

/**
 * The Home page inside the game screen: it gathers what the game screen already holds (trips, the Workshop's
 * jobs, the Games view, the attention block, the forecast, the creatures and the raid's week times) into the
 * page's input, and re-reads the server's clock every second so the times ("in 3 h 37 m") and the rows that
 * come due stay true while the page is open. It also loads the profile for the Journal and Stats pins' teasers.
 */
export function HomeScreen({
  offset,
  settings,
  onGo,
  onOpenPage,
  room,
  ...rest
}: Omit<HomeInput, 'now'> & {
  /** Server clock minus local clock. */
  offset: number;
  settings: BoardSettings;
  onGo: (place: Tab) => void;
  /** Opens the Journal or the Stats page (the pins). */
  onOpenPage: (page: HomePageId) => void;
  /** The living room, drawn at the top of the page on a phone. */
  room?: ComponentChildren;
}) {
  const now = useServerNow(offset, true);
  // The pins' teasers come from the profile; a failed load just leaves the pins without a teaser line.
  const profile = useLoaded(fetchProfile, [rest.trips.length, rest.creatures.length]).value;
  const teasers = {
    journal: profile === null ? null : journalTeaser(profile),
    stats: profile === null ? null : statsTeaser({ profile, creatures: rest.creatures }),
  };
  return (
    <HomePage
      input={{ ...rest, now }}
      settings={settings}
      onGo={onGo}
      onOpenPage={onOpenPage}
      teasers={teasers}
      room={room}
    />
  );
}
