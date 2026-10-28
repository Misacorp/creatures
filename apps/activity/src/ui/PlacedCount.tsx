import type { ComponentChildren } from 'preact';
import { glyphOrUnknown } from '../glyphs';
import { allPlaced, placedLine } from '../roster-picker';
import { Sprite } from '../sprites/Sprite';

/** The check mark's colour: the same green as the `--good` token (canvas sprites take colours, not CSS variables). */
export const CHECK_PALETTE = { h: '#6fdc8c' } as const;

interface PlacedCountProps {
  /** How many of the player's creatures are placed. */
  placed: number;
  /** More on the same line, quieter than the count (the raid's board total). */
  children?: ComponentChildren;
}

/**
 * The count line of the Raid Roster and the dungeon team: "1 / 3 placed", with a green check (and the
 * spoken "Done:") at 3 / 3. Anything after the count rides on the same line.
 */
export function PlacedCount(props: PlacedCountProps) {
  return (
    <p class="roster-count">
      {allPlaced(props.placed) && (
        <span class="count-check">
          <Sprite sprite={glyphOrUnknown('check')} palette={CHECK_PALETTE} scale={2} />
          <span class="visually-hidden">Done: </span>
        </span>
      )}
      {placedLine(props.placed)}
      {props.children}
    </p>
  );
}
