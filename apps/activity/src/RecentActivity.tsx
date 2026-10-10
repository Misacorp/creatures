import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchLedger, type LedgerEntry } from './api';
import { describeEntry } from './ledger-text';

/** The latest Bait movements, fetched each time the section is opened so it is never stale. */
export function RecentActivity({ refreshKey }: { refreshKey: number | null }) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const open = useRef(false);
  const load = (): void => {
    setFailed(false);
    fetchLedger(10).then(setEntries, () => {
      setFailed(true);
    });
  };
  // New leet credits arrive while the list is open: reload it when the last sync time changes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (open.current) load();
  }, [refreshKey]);
  return (
    <details
      class="recent-activity"
      onToggle={(event) => {
        open.current = event.currentTarget.open;
        if (open.current) load();
      }}
    >
      <summary>Recent Bait activity</summary>
      {failed ? (
        <p class="error">Could not load the history.</p>
      ) : entries === null ? (
        <p class="muted">Loading...</p>
      ) : entries.length === 0 ? (
        <p class="muted">Nothing yet.</p>
      ) : (
        <ul class="recent">
          {entries.map((entry) => (
            <li key={entry.id}>{describeEntry(entry)}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
