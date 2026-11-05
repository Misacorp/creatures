import type { RefObject } from 'preact';
import { useRef } from 'preact/hooks';
import { cssVars } from './css-vars';
import { HelpButton } from './Hud';
import { LivingRoom } from './LivingRoom';
import { useBleed } from './use-bleed';

type RoomProps = Parameters<typeof LivingRoom>[0];

/**
 * The title row ("Leet Creatures" with its sigma mark and the "?" that opens How to play), which shows
 * until a game is on screen (loading, an error, outside Discord, choosing a starter). With the game
 * loaded the `Hud` takes its place and the living room's `RoomBand` sits under it.
 */
export function AppHead({
  helpRef,
  onHelp,
}: {
  helpRef: RefObject<HTMLButtonElement | null>;
  onHelp: () => void;
}) {
  return (
    <header class="app-head">
      <h1>
        Leet Creatures
        <sup class="sigma pix">sigma</sup>
      </h1>
      <div class="app-head-tools">
        <HelpButton helpRef={helpRef} onHelp={onHelp} />
      </div>
    </header>
  );
}

/**
 * The living room as a full-width band under the HUD: it breaks out of the card to the window's edges
 * (measured, so a scrollbar never makes the page scroll sideways). `hero`: Home's taller room (`room` mode `home`).
 */
export function RoomBand({ room, hero = false }: { room: RoomProps; hero?: boolean }) {
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
              },
        )}
      >
        <LivingRoom {...room} hero={hero} />
      </div>
    </div>
  );
}
