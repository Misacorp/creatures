import { useEffect, useState } from 'preact/hooks';
import { browserSettingsStorage, loadBoardSettings, onKnackNamesSaved } from './board-settings';

/**
 * Whether a combat v2 fight shows each Knack's name when its creature acts: the player's "Show Knack names in fights" option (Settings,
 * kept on the device, off by default). The stage reads it here instead of being handed it by every screen that plays a fight; a change
 * made in Settings reaches a stage that is open.
 */
export function useKnackNames(): boolean {
  const [on, setOn] = useState(() => loadBoardSettings(browserSettingsStorage()).knackNames);
  useEffect(() => onKnackNamesSaved(setOn), []);
  return on;
}
