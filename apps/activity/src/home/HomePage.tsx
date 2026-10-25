import type { ComponentChildren, RefObject } from 'preact';
import type { HomeInput } from '../home-view';
import type { Tab } from '../tabs';
import type { BoardSettings } from './board';
import { NoticeBoard } from './NoticeBoard';

/**
 * The Home page, the place the app opens on: the Today board, and on a phone the living room above it
 * (`room`, the shared `RoomBand`; on a wide window the room is the band above every screen, so none is passed
 * here). It only draws what `HomeInput` and the board's settings say; `HomeScreen` fills those in from the game
 * screen's own data.
 */
export function HomePage({
  input,
  settings,
  onGo,
  room,
  onHowTo,
  howToRef,
}: {
  input: HomeInput;
  settings: BoardSettings;
  onGo: (place: Tab, needsFilter?: boolean) => void;
  room?: ComponentChildren;
  /** Opens How to play (the "?" pin); without it the pin is not drawn. */
  onHowTo?: () => void;
  /** The "?" pin, where the focus returns when How to play closes. */
  howToRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div class="home-page">
      {room}
      <NoticeBoard
        input={input}
        settings={settings}
        onGo={onGo}
        {...(onHowTo === undefined ? {} : { onHowTo })}
        {...(howToRef === undefined ? {} : { howToRef })}
      />
    </div>
  );
}
