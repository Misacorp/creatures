import { NEW_VALLEY_LOOKS, type NewValleyLook } from '../../reset/new-valley';
import { NewValleyCard } from '../../reset/NewValleyCard';
import { ResetDmPreview } from '../../reset/ResetDmPreview';
import { str } from '../props';
import type { Entry } from '../types';

const LOOK_NAMES: Readonly<Record<NewValleyLook, string>> = {
  notice: 'A: the level reset card as it is',
  scene: 'B: the card with the quiet bonfire',
  welcome: 'C: a full welcome before the starter choice',
};

const LOOK_OPTIONS = NEW_VALLEY_LOOKS.map((l) => LOOK_NAMES[l]);

function lookOf(name: string): NewValleyLook {
  return NEW_VALLEY_LOOKS.find((l) => LOOK_NAMES[l] === name) ?? 'notice';
}

const newValleyCard: Entry = {
  name: 'NewValleyCard',
  file: 'apps/activity/src/reset/NewValleyCard.tsx',
  group: 'Headings & banners',
  description:
    'The one-time card on the first open after the reset ("A new valley"), in three looks with the same words: the level reset card as it is, the same card with the valley bonfire gone quiet, and a full welcome with one button before the starter choice. Not shown to players yet.',
  controls: { look: { kind: 'select', options: LOOK_OPTIONS } },
  defaults: { look: LOOK_NAMES.notice },
  presets: NEW_VALLEY_LOOKS.map((l) => ({ name: LOOK_NAMES[l], props: { look: LOOK_NAMES[l] } })),
  render: (props) => (
    <NewValleyCard look={lookOf(str(props, 'look'))} onDismiss={() => undefined} />
  ),
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
