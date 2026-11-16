/**
 * What the client holds back while a stage plays out (docs/design/combat/raid-screen.md, section 6.1): "Out this weekend" marks, the
 * result of the stage being played, and the Essence in the HUD. Until `endsAt` a view is shown without them; the server does not write a
 * second time, so this is the whole of the hold. Pure.
 */
import type { RaidView } from '../raid-api';
import { isHeld, phaseOfStage, type Playing } from './playing';

/** The view as it may be shown at `now`: while the stage plays, no knocked-out marks, no result for it and no unseen reveal. */
export function heldView(view: RaidView, playing: Playing | null, now: number): RaidView {
  if (!isHeld(playing, now) || playing === null) return view;
  const phase = phaseOfStage(playing.stage);
  return {
    ...view,
    ...(view.v2 === undefined ? {} : { v2: { ...view.v2, out: [] } }),
    ...(view.party === null
      ? {}
      : { party: { ...view.party, results: view.party.results.filter((r) => r.phase !== phase) } }),
    you: { ...view.you, reveal: playing.stage >= 3 ? null : view.you.reveal },
  };
}

/** Whether the HUD may show the Essence the stage paid (it may not while the stage plays; the check is made again at `endsAt`). */
export const balanceMayMove = (playing: Playing | null, now: number): boolean =>
  !isHeld(playing, now);
