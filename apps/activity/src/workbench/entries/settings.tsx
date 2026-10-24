import { useState } from 'preact/hooks';
import {
  DEFAULT_BOARD_SETTINGS,
  IDLE_MODES,
  TILT_MODES,
  type BoardSettings,
} from '../../home/board';
import { SettingsPage } from '../../settings/SettingsPage';
import { Segmented } from '../../ui/Segmented';
import { str } from '../props';
import type { Entry, Props } from '../types';

const NOTHING = () => undefined;

const TILT_LABELS = ['Flat', 'Leaning', 'Swaying'] as const;

function SettingsDemo({ p }: { p: Props }) {
  const [settings, setSettings] = useState<BoardSettings>({
    tilt: TILT_MODES.find((m) => m === str(p, 'tilt')) ?? DEFAULT_BOARD_SETTINGS.tilt,
    idle: IDLE_MODES.find((m) => m === str(p, 'idle')) ?? DEFAULT_BOARD_SETTINGS.idle,
  });
  return <SettingsPage settings={settings} onChange={setSettings} onBack={NOTHING} />;
}

const settingsPage: Entry = {
  name: 'SettingsPage',
  file: 'apps/activity/src/settings/SettingsPage.tsx',
  group: 'Creatures & game pieces',
  description:
    'The Settings page, opened from the cog in the HUD: a drill-in ("‹ Back" at the top left, Escape) with sections, one row per setting (its name, a line about it and its control). Today one section, "The notice board": "Notices" (Flat, Leaning, Swaying) and "Quiet places" (Hide, Show), the Home board’s two display options. They are kept on this device (the browser’s storage, with the defaults as the fallback), never sent to the server. The choices work in the preview. A new setting is one more row; a new group of settings is one more section.',
  controls: {
    tilt: { kind: 'select', options: TILT_MODES },
    idle: { kind: 'select', options: IDLE_MODES },
  },
  defaults: { tilt: 'still', idle: 'hide' },
  presets: [
    { name: 'Defaults (Leaning, quiet places hidden)', props: {} },
    { name: 'Flat, quiet places shown', props: { tilt: 'none', idle: 'show' } },
    { name: 'Swaying', props: { tilt: 'sway' } },
  ],
  render: (p) => <SettingsDemo key={JSON.stringify(p)} p={p} />,
};

function SegmentedDemo({ p }: { p: Props }) {
  const options = TILT_MODES.map((id, i) => ({ id, label: TILT_LABELS[i] ?? id }));
  const [value, setValue] = useState(TILT_MODES.find((m) => m === str(p, 'value')) ?? 'still');
  return <Segmented label="Notices" options={options} value={value} onChange={setValue} />;
}

const segmented: Entry = {
  name: 'Segmented',
  file: 'apps/activity/src/ui/Segmented.tsx',
  group: 'Controls',
  description:
    'A short row of exclusive choices (Flat, Leaning, Swaying): one toggle button each, the chosen one gold and spoken as pressed, inside a named group; each at least 44 px tall. Tapping the chosen one again changes nothing. It is the control of the Settings page’s rows. Tap a choice in the preview.',
  controls: { value: { kind: 'select', options: TILT_MODES } },
  defaults: { value: 'still' },
  presets: [
    { name: 'Leaning', props: {} },
    { name: 'Flat', props: { value: 'none' } },
  ],
  render: (p) => <SegmentedDemo key={JSON.stringify(p)} p={p} />,
};

export const settingsEntries: readonly Entry[] = [settingsPage, segmented];
