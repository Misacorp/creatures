import { NewValleyCard } from '../../reset/NewValleyCard';
import { ResetDmPreview } from '../../reset/ResetDmPreview';
import type { Entry } from '../types';

const newValleyCard: Entry = {
  name: 'NewValleyCard',
  file: 'apps/activity/src/reset/NewValleyCard.tsx',
  group: 'Headings & banners',
  description:
    'The one-time card on the first open after the reset ("A new valley"): the level reset card with the valley bonfire gone quiet above the words. Not shown to players yet.',
  controls: {},
  defaults: {},
  presets: [],
  render: () => <NewValleyCard onDismiss={() => undefined} />,
};

const resetDmPreview: Entry = {
  name: 'ResetDmPreview',
  file: 'apps/activity/src/reset/ResetDmPreview.tsx',
  group: 'Headings & banners',
  description:
    "The goodbye DM each player gets before the reset, drawn the way Discord draws an embed (a colour bar, the title, the description, inline fields in a grid, the creature field below) with a sample player. The worker builds the real embed within Discord's limits.",
  controls: {},
  defaults: {},
  presets: [],
  render: () => <ResetDmPreview />,
};

export const resetEntries: readonly Entry[] = [newValleyCard, resetDmPreview];
