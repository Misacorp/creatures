import type { PreviewStatusName } from '../use-job-preview';
import { Alert } from './Alert';

/**
 * The line a server preview shows while it is not here: a quiet "Loading..." and, when it failed, the error
 * with how to retry (pick again). Nothing for a ready preview or when there is no creature to ask for.
 * `what` is what failed to load ("the odds"); `loading` is the loading line.
 */
export function PreviewStatus({
  status,
  what,
  loading = `Loading ${what}...`,
}: {
  status: PreviewStatusName;
  what: string;
  loading?: string;
}) {
  if (status === 'loading') {
    return (
      <p class="muted" role="status">
        {loading}
      </p>
    );
  }
  if (status === 'failed') {
    return <Alert level="alert">Could not load {what}. Pick again to retry.</Alert>;
  }
  return null;
}
