import { type GuestbookEntry } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { formatRelative } from '../time-format';
import { ScrollHint } from '../ui/ScrollHint';
import { HouseThumb } from './HouseThumb';
import { cut } from './house-names';

export interface GuestbookProps {
  /** Newest first. */
  entries: readonly GuestbookEntry[];
  /** The clock, in epoch ms (the times read against it). */
  now: number;
}

const NAME_MAX = 28;

function stampName(id: string): string {
  return housing.stamps.find((s) => s.id === id)?.name ?? id;
}

/**
 * The guestbook: the latest stamps as plain rows (the stamp's picture, the visitor's name, how long ago), newest first,
 * in a box that scrolls with a hint when it is long. Nothing signed yet: one line.
 */
export function Guestbook({ entries, now }: GuestbookProps) {
  if (entries.length === 0) {
    return (
      <p class="hp-empty" role="status">
        Nobody has signed the guestbook yet.
      </p>
    );
  }
  return (
    <ScrollHint contentKey={entries.length} class="hp-guest-scroll" label="Guestbook">
      <ul class="hp-guestbook">
        {entries.map((entry) => (
          <li key={`${entry.visitor.userId}:${String(entry.at)}`} class="hp-guest">
            <span class="hp-guest-stamp" aria-hidden="true">
              <HouseThumb id={entry.stampId} box={32} max={2} />
            </span>
            <span class="hp-guest-name" title={entry.visitor.name}>
              <span class="visually-hidden">{stampName(entry.stampId)} stamp from </span>
              {cut(entry.visitor.name, NAME_MAX)}
            </span>
            <span class="hp-guest-time">{formatRelative(entry.at, now)}</span>
          </li>
        ))}
      </ul>
    </ScrollHint>
  );
}
