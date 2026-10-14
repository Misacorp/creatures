import type { ComponentChildren } from 'preact';

interface StageHeadProps {
  /**
   * Where in the run the fight is, top left: "Room 1 / 3" in the dungeon, "Phase 1 / 3" or "Finale"
   * in the raid. Without it the left side holds only `children`.
   */
  place?: string;
  /** The round, top right: "Round 2 / 12". */
  round: string;
  /** Extra controls after the place on the left (the live finale's "?" button). */
  children?: ComponentChildren;
}

/**
 * The head of the fight stage, one piece for the dungeon and the raid: the room or phase at the top
 * left and the round at the top right (Misa, 2026-10-14). Both are plain text; each count is written
 * "1 / 3".
 */
export function StageHead({ place, round, children }: StageHeadProps) {
  return (
    <div class="stage-head">
      <span class="stage-head-left">
        {place !== undefined && <span class="pix stage-place">{place}</span>}
        {children}
      </span>
      <span class="pix stage-round">{round}</span>
    </div>
  );
}
