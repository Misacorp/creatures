import { type OwnHouseView } from '@creatures/game';
import { acornCount } from '../resource-count';
import { ActionButton } from '../ui/ActionButton';
import { CountBadge } from '../ui/CountBadge';
import { GameIcon } from '../ui/GameIcon';
import { cut } from './house-names';

export interface MailboxPanelProps {
  mailbox: OwnHouseView['mailbox'];
  /** A request is running: Collect waits. */
  busy: boolean;
  /** "Collect" was pressed: take every waiting gift. */
  onCollect: () => void;
}

/** How long a giver's name may be before it is cut with an ellipsis (the row also cuts it by width). */
const NAME_MAX = 28;

/** The gifts as rows: who sent each and how many Acorns it holds (the total spread evenly when the givers are fewer than the gifts). */
export function giftRows(
  mailbox: OwnHouseView['mailbox'],
): { key: string; name: string; acorns: number }[] {
  if (mailbox.gifts === 0) return [];
  const each = Math.floor(mailbox.acorns / mailbox.gifts);
  const rows = mailbox.from.map((giver, i) => ({
    key: `${giver.userId}:${String(i)}`,
    name: giver.name,
    acorns: each,
  }));
  for (let i = rows.length; i < mailbox.gifts; i += 1) {
    rows.push({ key: `visitor:${String(i)}`, name: 'A visitor', acorns: each });
  }
  return rows;
}

/**
 * The mailbox: one row per waiting gift (the giver's name and its Acorns) and one button, Collect, that takes them all
 * and says the total. Nothing waiting: a short line and a button that is off. Data in, callbacks out: it fetches nothing.
 */
export function MailboxPanel({ mailbox, busy, onCollect }: MailboxPanelProps) {
  const rows = giftRows(mailbox);
  return (
    <div class="hp-panel hp-mailbox">
      {rows.length === 0 ? (
        <p class="hp-empty" role="status">
          The mailbox is empty. Gifts from visitors wait here.
        </p>
      ) : (
        <ul class="hp-gifts" aria-label="Gifts waiting">
          {rows.map((row) => (
            <li key={row.key} class="hp-gift">
              <GameIcon icon={{ kind: 'glyph', id: 'mail' }} scale={3} />
              <span class="hp-gift-name" title={row.name}>
                <span class="visually-hidden">Gift from </span>
                {cut(row.name, NAME_MAX)}
              </span>
              <CountBadge icon={acornCount(row.acorns).icon} amount={row.acorns} label="Acorns" />
            </li>
          ))}
        </ul>
      )}
      <ActionButton
        wide
        large
        label="Collect"
        cost={rows.length === 0 ? undefined : [acornCount(mailbox.acorns)]}
        disabled={busy || mailbox.acorns === 0}
        onClick={onCollect}
      />
    </div>
  );
}
