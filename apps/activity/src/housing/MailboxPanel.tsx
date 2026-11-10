import { type OwnHouseView } from '@creatures/game';
import { useState } from 'preact/hooks';
import { Alert } from '../ui/Alert';
import { acornCount } from '../resource-count';
import { ActionButton } from '../ui/ActionButton';
import { CountBadge } from '../ui/CountBadge';
import { GameIcon } from '../ui/GameIcon';
import { cut } from './house-names';

export interface MailboxPanelProps {
  mailbox: OwnHouseView['mailbox'];
  /** A request is running: Collect waits. */
  busy: boolean;
  /**
   * "Collect" was pressed: take every waiting gift. It may answer whether the server took them (a promise); the panel then
   * shows what came in. An answer of nothing counts as taken.
   */
  onCollect: () => void | Promise<boolean>;
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

/** "Anna", "Anna and Bo", "Anna, Bo and Cy" (long names cut). */
export function listNames(names: readonly string[]): string {
  const cutNames = names.map((n) => cut(n, NAME_MAX));
  if (cutNames.length <= 1) return cutNames[0] ?? 'a visitor';
  return `${cutNames.slice(0, -1).join(', ')} and ${cutNames[cutNames.length - 1] ?? ''}`;
}

/**
 * The mailbox: one row per waiting gift (the giver's name and its Acorns) and one button, Collect, that takes them all
 * and says the total. Nothing waiting: a short line, no button. Data in, callbacks out: it fetches nothing.
 */
export function MailboxPanel({ mailbox, busy, onCollect }: MailboxPanelProps) {
  const rows = giftRows(mailbox);
  // What the last Collect brought in: the total and who sent it.
  const [got, setGot] = useState<{ acorns: number; names: string[] } | null>(null);
  const collect = (): void => {
    const taken = { acorns: mailbox.acorns, names: [...new Set(rows.map((r) => r.name))] };
    const done = onCollect();
    if (done === undefined) {
      setGot(taken);
      return;
    }
    void done.then((ok) => {
      if (ok) setGot(taken);
    });
  };
  return (
    <div class="hp-panel hp-mailbox">
      {got !== null && (
        <Alert level="success" layout="stacked">
          <CountBadge
            icon={acornCount(got.acorns).icon}
            amount={`+${String(got.acorns)}`}
            label="Acorns"
            spokenAmount={`${String(got.acorns)} collected`}
          />{' '}
          from {listNames(got.names)}
        </Alert>
      )}
      {rows.length === 0 && got === null ? (
        <p class="hp-empty" role="status">
          The mailbox is empty. Gifts from visitors wait here.
        </p>
      ) : rows.length === 0 ? null : (
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
      {rows.length > 0 && (
        <ActionButton
          wide
          large
          label="Collect"
          cost={[acornCount(mailbox.acorns)]}
          disabled={busy || mailbox.acorns === 0}
          onClick={collect}
        />
      )}
    </div>
  );
}
