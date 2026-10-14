import type { RefObject } from 'preact';
import { useRef } from 'preact/hooks';
import type { Balances } from './api';
import { CurrencyPile } from './CurrencyPile';
import { cssVars } from './css-vars';
import { LivingRoom } from './LivingRoom';
import { useBleed } from './use-bleed';

type RoomProps = Parameters<typeof LivingRoom>[0];

/**
 * The top of the app: the title row ("Leet Creatures" with its sigma mark, the currency pile and the
 * "?" that opens How to play). When the game is loaded it is laid over the living room's top wall
 * band and does not scroll with the room; otherwise (loading, an error, outside Discord) it shows
 * on its own, as before. `balances` gives the title row its currency pile.
 */
export function AppHead({
  helpRef,
  onHelp,
  balances,
  room,
}: {
  helpRef: RefObject<HTMLButtonElement>;
  onHelp: () => void;
  balances?: Balances;
  room?: Omit<RoomProps, 'children'>;
}) {
  const title = (
    <TitleRow helpRef={helpRef} onHelp={onHelp} {...(balances === undefined ? {} : { balances })} />
  );
  if (room === undefined) return title;
  return <RoomHead room={room}>{title}</RoomHead>;
}

/**
 * The living room as a full-width band: it breaks out of the card to the window's edges (measured, so
 * a scrollbar never makes the page scroll sideways), while the title row stays in the card's own
 * column (`--head-left` and `--head-right` are the room's side padding, see `living-room.css`).
 */
function RoomHead({
  room,
  children,
}: {
  room: Omit<RoomProps, 'children'>;
  children: RoomProps['children'];
}) {
  const probe = useRef<HTMLDivElement>(null);
  const bleed = useBleed(probe);
  return (
    <div class="app-top" ref={probe}>
      <div
        class={bleed === null ? 'app-bleed' : 'app-bleed measured'}
        ref={cssVars(
          bleed === null
            ? {}
            : {
                '--bleed-width': `${String(bleed.width)}px`,
                '--bleed-left': `${String(-bleed.left)}px`,
                '--head-left': `${String(bleed.left)}px`,
                '--head-right': `${String(bleed.right)}px`,
              },
        )}
      >
        <LivingRoom {...room}>{children}</LivingRoom>
      </div>
    </div>
  );
}

/** The title row alone: the title, the currency pile (with `balances`) and the "?" button. */
export function TitleRow({
  helpRef,
  onHelp,
  balances,
}: {
  helpRef: RefObject<HTMLButtonElement>;
  onHelp: () => void;
  balances?: Balances;
}) {
  return (
    <header class="app-head">
      <h1>
        Leet Creatures
        <sup class="sigma pix">sigma</sup>
      </h1>
      <div class="app-head-tools">
        {balances !== undefined && <CurrencyPile balances={balances} />}
        <button
          type="button"
          ref={helpRef}
          class="howto-open pix"
          aria-haspopup="dialog"
          aria-label="How to play"
          onClick={onHelp}
        >
          ?
        </button>
      </div>
    </header>
  );
}
