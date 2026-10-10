import { useState } from 'preact/hooks';
import { fetchLedger, type LedgerEntry } from './api';
import { describeEntry } from './ledger-text';

/** The latest Bait movements, fetched each time the section is opened so it is never stale. */
export function RecentActivity() {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <details
      class="recent-activity"
      onToggle={(event) => {
        if (!event.currentTarget.open) return;
        setFailed(false);
        fetchLedger(10).then(setEntries, () => {
          setFailed(true);
        });
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
