import { useEffect, useState } from 'preact/hooks';
import { loadDevPanel, type DevPanelModule, type DevPanelProps } from './dev-gate';

/**
 * Shows the staging-only debug panel once its code has loaded. Renders nothing, and loads nothing, in a
 * production build or when the server did not turn the dev tools on (see `dev-gate.ts`).
 */
export function DevPanelHost({ enabled, ...props }: DevPanelProps & { enabled: boolean }) {
  const [panel, setPanel] = useState<DevPanelModule | null>(null);
  useEffect(() => {
    let current = true;
    loadDevPanel(enabled)?.then(
      (loaded) => {
        if (current) setPanel(loaded);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [enabled]);
  if (panel === null) return null;
  const Panel = panel.default;
  return <Panel {...props} />;
}
