/**
 * The welcome-back popup (`systems/return.md`, V-RET-0): a sheet over the valley (`ui/Drawer`, the app's one
 * sheet) holding the Valley Gazette, two or three highlights of what happened while the player was away, and
 * one button at the end, "...and 13 more things", that closes it onto the valley, where the rest waits as
 * markers at their places. Nothing needs a tap before that; closing loses nothing, and closing in any way
 * is the coming-home moment (`ComingHome`, V-RET-4a). The pieces in it open
 * their item cards from the sample bag (`GearItemsContext`), as pieces do in the game.
 */
import { GearItemsContext } from '../../gear-items-context';
import type { GearItem } from '../../gear-types';
import { ActionButton } from '../../ui/ActionButton';
import { Drawer } from '../../ui/Drawer';
import { Gazette } from './Gazette';
import { originOf, type Point } from './coming-home';
import { moreLabel, type Cast, type Welcome } from './highlights';

export function WelcomeSheet({
  welcome,
  cast,
  items,
  open,
  onClose,
}: {
  welcome: Welcome;
  cast: Cast;
  /** The sample bag: what a piece's tap opens. */
  items: readonly GearItem[];
  open: boolean;
  /** Closed, however (the button, the X, a swipe, Escape), with where the paper was: the coming-home moment starts there. */
  onClose: (paperAt: Point) => void;
}) {
  const close = (): void => {
    const paper = document.body.querySelector('.wb-paper');
    onClose(paper === null ? { x: 195, y: 520 } : originOf(paper.getBoundingClientRect()));
  };
  return (
    <Drawer
      open={open}
      onClose={close}
      title="Welcome back"
      titleHidden
      class="wb-sheet"
      footer={<ActionButton label={moreLabel(welcome.more)} wide large onClick={close} />}
    >
      <GearItemsContext.Provider value={items}>
        <Gazette stories={welcome.highlights} cast={cast} date={welcome.date} />
      </GearItemsContext.Provider>
    </Drawer>
  );
}
