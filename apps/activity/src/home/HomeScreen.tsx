import type { ComponentChildren, RefObject } from 'preact';
import { useServerNow } from '../hooks';
import type { HomeInput } from '../home-view';
import type { Tab } from '../tabs';
import type { BoardSettings } from './board';
import { HomePage } from './HomePage';

/**
 * The Home page inside the game screen: it gathers what the game screen already holds (trips, the Workshop's
 * jobs, the Games view, the attention block, the forecast, the creatures and the raid's week times) into the
 * page's input, and re-reads the server's clock every second so the times ("in 3 h 37 m") and the rows that
 * come due stay true while the page is open. It loads nothing of its own (a late load made the board jump).
 */
export function HomeScreen({
  offset,
  settings,
  onGo,
  onHowTo,
  howToRef,
  room,
  ...rest
}: Omit<HomeInput, 'now'> & {
  /** Server clock minus local clock. */
  offset: number;
  settings: BoardSettings;
  onGo: (place: Tab, needsFilter?: boolean) => void;
  /** Opens How to play (the "?" pin). */
  onHowTo?: () => void;
  /** The "?" pin, where the focus returns when How to play closes. */
  howToRef?: RefObject<HTMLButtonElement | null>;
  /** The living room, drawn at the top of the page on a phone. */
  room?: ComponentChildren;
}) {
  const now = useServerNow(offset, true);
  return (
    <HomePage
      input={{ ...rest, now }}
      settings={settings}
      onGo={onGo}
      {...(onHowTo === undefined ? {} : { onHowTo })}
      {...(howToRef === undefined ? {} : { howToRef })}
      room={room}
    />
  );
}
