import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { DataTable } from '../ui/DataTable';
import { fetchDryRun, featRows, summaryRows, tableRows, type DryRunView } from './reset-dry-run';

/**
 * The reset's dry run: one button, and what a reset of this server would do as tables (`ui/DataTable`, as the Clock and Build sections
 * show theirs). It only reads; nothing here starts a reset. Names and nicknames are player text and render as text.
 */
export function ResetDryRun(): JSX.Element {
  const [view, setView] = useState<DryRunView | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const run = (): void => {
    setState('busy');
    void fetchDryRun().then((found) => {
      setView(found);
      setState(found === null ? 'failed' : 'idle');
    });
  };
  return (
    <div class="dev-reset-dry-run">
      <button type="button" class="dev-btn" disabled={state === 'busy'} onClick={run}>
        Reset dry run
      </button>
      <p class="dev-hint">
        What a reset of this server would record, send and delete. Reads only: nothing is changed.
      </p>
      {state === 'failed' && <p class="dev-hint">Could not run the dry run.</p>}
      {view !== null && (
        <>
          <DataTable class="dev-clock" rows={summaryRows(view)} />
          <h4 class="dev-block-title">Feats</h4>
          <DataTable class="dev-clock" rows={featRows(view)} />
          <h4 class="dev-block-title">Rows the wipe deletes</h4>
          <DataTable class="dev-clock" rows={tableRows(view)} />
          <h4 class="dev-block-title">Leet</h4>
          <p class="dev-hint">{view.leet}</p>
          <h4 class="dev-block-title">DM previews</h4>
          {view.dms.previews.map((p, i) => (
            <div key={i}>
              <DataTable
                class="dev-clock"
                rows={[{ label: p.name, value: `${String(p.length)} chars` }]}
              />
              <pre class="dev-preview">{p.content}</pre>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
