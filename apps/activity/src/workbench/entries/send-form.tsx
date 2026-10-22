import { parseGameState, type Creature } from '../../api';
import { parseDestinations } from '../../expedition-parse';
import destinationsFixture from '../../fixtures/expedition-destinations.json';
import stateOffer from '../../fixtures/expedition-state-offer.json';
import { SendFooter, SendForm } from '../../SendForm';
import { Drawer } from '../../ui/Drawer';
import { WizardView } from '../../ui/Wizard';
import { useSendForm } from '../../use-send-form';
import { bool, str } from '../props';
import type { Entry, Props } from '../types';

const NOTHING = () => undefined;
const VIEW = parseDestinations(destinationsFixture);
const SLOTS = { total: 2, used: 0, rankSum: 2, tripsFinished: 3, next: null };
const STOCK = { 'lure-basic': 2, 'lure-good': 1, 'map-scrap-basic': 1, 'satchel-basic': 3 };

/** The fixture's creatures, all at home; with `veteran` the first is rank 4 (the rest are below the Reef). */
function creatures(veteran: boolean): Creature[] {
  return parseGameState(stateOffer).creatures.map((c, i) => ({
    ...c,
    away: false,
    busy: null,
    ...(veteran && i === 0 ? { explorer: { ...c.explorer, rank: 4 } } : {}),
  }));
}

const PLACES: Record<string, string> = {
  Tidepools: 'tidepools',
  'Old Crossroads (rank 2)': 'old-crossroads',
  'Moonlit Reef (night only, by day)': 'moonlit-reef',
  'Festival Grounds (Festival weeks)': 'festival-grounds',
};
const STEPS = ['who', 'pack', 'ready'] as const;

/** The form as the map's sheet draws it (the desktop panel draws the same steps). */
function SendFormDemo({ p }: { p: Props }) {
  const form = useSendForm({
    creatures: creatures(bool(p, 'veteran')),
    view: VIEW,
    destination: PLACES[str(p, 'place')] ?? 'tidepools',
    slots: SLOTS,
    stock: STOCK,
    bait: 100,
    timezone: 'Europe/Helsinki',
    initialStep: STEPS.find((s) => s === str(p, 'step')) ?? 'who',
  });
  return (
    <div class="v3-phone">
      <Drawer
        open
        onClose={NOTHING}
        title={form.place?.name ?? 'Send an explorer'}
        footer={<SendFooter form={form} busy={false} onSend={() => Promise.resolve(true)} />}
      >
        <WizardView wizard={form.wizard}>
          <SendForm form={form} busy={false} />
        </WizardView>
      </Drawer>
    </div>
  );
}

export const sendFormEntries: Entry[] = [
  {
    name: 'SendForm',
    file: 'apps/activity/src/SendForm.tsx',
    group: 'Creatures & game pieces',
    covers: ['SendFooter'],
    description:
      "The form that sends an explorer to the place chosen on the map. On a phone it is three steps in the place's sheet (Who goes, Pack up, Ready) with a pinned gold Next / Send button that says why it is disabled; on desktop the same steps run in the map's side panel. A place the clock shuts (Moonlit Reef by day) shows when it opens next to Send and disables it. A creature below the place's explorer rank is greyed with the reason. The Send button does nothing here.",
    controls: {
      step: { kind: 'select', options: STEPS },
      place: { kind: 'select', options: Object.keys(PLACES) },
      veteran: { kind: 'toggle' },
    },
    defaults: { step: 'who', place: 'Tidepools', veteran: false },
    presets: [
      { name: 'Phone: who goes', props: {} },
      { name: 'Phone: pack up', props: { step: 'pack' } },
      { name: 'Phone: ready', props: { step: 'ready' } },
      {
        name: 'Moonlit Reef by day, ready step',
        props: { step: 'ready', place: 'Moonlit Reef (night only, by day)', veteran: true },
      },
      {
        name: 'Rank too low (Old Crossroads)',
        props: { place: 'Old Crossroads (rank 2)' },
      },
    ],
    render: (p) => <SendFormDemo key={JSON.stringify(p)} p={p} />,
  },
];
