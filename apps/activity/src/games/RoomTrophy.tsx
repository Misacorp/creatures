import { cssVars } from '../css-vars';
import type { BoardRow } from '../games-types';
import { usePopoverTrigger } from '../PopoverHost';
import { TROPHY_SPOT } from '../sprites/room-art';
import { Sprite } from '../sprites/Sprite';
import type { SpriteDef } from '../sprites/sprite-data';
import { popupProps } from '../ui/Popover';
import { MedalCountsRow } from './GamesParts';

/** How many players the shelf's popover lists. */
export const SHELF_TOP = 3;

/** The shelf's popover: the top three of the server's medal table, then a button to the Games tab. */
export function TrophyBoard({
  board,
  selfId,
  onOpen,
}: {
  board: readonly BoardRow[];
  selfId: string;
  onOpen: () => void;
}) {
  const top = board.slice(0, SHELF_TOP);
  return (
    <div class="gm-shelf-pop pix-panel">
      {top.length > 0 && (
        <ol class="gm-top">
          {top.map((row, i) => (
            <li key={row.userId} class={row.userId === selfId ? 'is-mine' : undefined}>
              <span class="gm-rank">{i + 1}</span>
              <span class="gm-player">{row.name}</span>
              <MedalCountsRow medals={row} pins={false} scale={1} tags={false} />
            </li>
          ))}
        </ol>
      )}
      <button type="button" class="primary gm-to-games" onClick={onOpen}>
        Games
      </button>
    </div>
  );
}

/**
 * The trophy on its wall shelf in the living room: it lifts off the wall on hover and focus, like the
 * calendar, and a tap opens the top three of the medal table with a button to the Games tab.
 */
export function RoomTrophy({
  sprite,
  scale,
  originX,
  board,
  selfId,
  onOpen,
}: {
  sprite: SpriteDef;
  scale: number;
  originX: number;
  board: readonly BoardRow[];
  selfId: string;
  onOpen: () => void;
}) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  return (
    <div
      class="room-trophy"
      ref={cssVars({
        '--x': `${String(originX + TROPHY_SPOT.x * scale)}px`,
        '--y': `${String(TROPHY_SPOT.y * scale)}px`,
      })}
    >
      <button
        ref={ref}
        type="button"
        class="trophy-button"
        {...popupProps(open)}
        aria-label="Medal table"
        onClick={() => {
          if (ref.current === null) return;
          host?.openCustom('room-trophy', ref.current, {
            label: 'Medal table',
            body: (
              <TrophyBoard
                board={board}
                selfId={selfId}
                onOpen={() => {
                  host.close();
                  onOpen();
                }}
              />
            ),
          });
        }}
      >
        <Sprite sprite={sprite} scale={scale} class="trophy-art" />
      </button>
    </div>
  );
}
