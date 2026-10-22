import type { RoomMark } from '../dungeon-types';

/**
 * A small badge a room of the dungeon map wears when an effect has changed it (the Sealed Vault's "x2"), drawn from
 * the server's mark data: `text` in the pixel font, `label` for a screen reader. It is the generic room
 * modifier badge: any effect that marks a room sends `{ kind, text, label }` and this draws it, so a new
 * effect needs no new component. On the map it sits on the lower right of the room's button (`RoomMarks`, hidden from
 * a screen reader because the room's own label already says it); in the drawer it stands before the line that
 * explains it (`inline`; the line is the spoken label, so the badge is hidden there too).
 */
export function RoomMarkBadge({
  mark,
  inline = false,
}: {
  mark: RoomMark;
  /** In running text (the drawer): in the flow, not on a room's corner. */
  inline?: boolean;
}) {
  return (
    <span
      class={`room-mark pix${inline ? ' inline' : ''}`}
      data-mark={mark.kind}
      aria-hidden="true"
    >
      {mark.text}
    </span>
  );
}

/** The badges on a room's corner of the map. Decorative: the room's accessible label carries their labels. */
export function RoomMarks({ marks }: { marks: readonly RoomMark[] | undefined }) {
  if (marks === undefined || marks.length === 0) return null;
  return (
    <span class="room-marks" aria-hidden="true">
      {marks.map((mark) => (
        <RoomMarkBadge key={mark.kind} mark={mark} />
      ))}
    </span>
  );
}
