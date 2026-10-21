import { parseGameState, type Creature } from '../../api';
import { parseDestinations } from '../../expedition-parse';
import destinationsFixture from '../../fixtures/expedition-destinations.json';
import stateOffer from '../../fixtures/expedition-state-offer.json';
import { SEND_STEP_HEAD, SendFooter, SendForm } from '../../SendForm';
import type { SendStep } from '../../send-view';
import { DrillHead } from '../../ui/DrillHead';
import { Drawer } from '../../ui/Drawer';
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

/** The form as the map's sheet or side panel will draw it. */
function SendFormDemo({ p }: { p: Props }) {
  const layout = str(p, 'layout') === 'panel' ? 'panel' : 'steps';
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
  const step: SendStep = form.step;
  if (layout === 'panel') {
    return (
      <div class="send-panel-frame" style={{ maxWidth: '25rem' }}>
        <SendForm form={form} layout="panel" busy={false} onSend={() => Promise.resolve(true)} />
      </div>
    );
  }
  const head = SEND_STEP_HEAD[step];
  return (
    <div class="v3-phone">
      <Drawer
        open
        onClose={NOTHING}
        title={form.place?.name ?? 'Send an explorer'}
        footer={
          <SendFooter
            form={form}
            mode={step === 'ready' ? 'send' : 'next'}
            busy={false}
            onSend={() => Promise.resolve(true)}
          />
        }
      >
        {step !== 'who' && (
          <DrillHead title={head.title} backLabel={head.backLabel} onBack={form.back} />
        )}
        <SendForm form={form} layout="steps" busy={false} onSend={() => Promise.resolve(true)} />
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
      "The form that sends an explorer to the place chosen on the map. On a phone it is three steps in the place's sheet (Who goes, Pack up, Ready) with a pinned gold Next / Send button that says why it is disabled; on desktop the same sections are stacked in a side panel with one Send button at the bottom. A place the clock shuts (Moonlit Reef by day) shows when it opens next to Send and disables it. A creature below the place's explorer rank is greyed with the reason. The Send button does nothing here.",
    controls: {
      layout: { kind: 'select', options: ['steps', 'panel'] },
      step: { kind: 'select', options: STEPS },
      place: { kind: 'select', options: Object.keys(PLACES) },
      veteran: { kind: 'toggle' },
    },
    defaults: { layout: 'steps', step: 'who', place: 'Tidepools', veteran: false },
    presets: [
      { name: 'Phone: who goes', props: {} },
      { name: 'Phone: pack up', props: { step: 'pack' } },
      { name: 'Phone: ready', props: { step: 'ready' } },
      { name: 'Desktop panel', props: { layout: 'panel' } },
      {
        name: 'Moonlit Reef by day, panel (an explorer who can go)',
        props: { layout: 'panel', place: 'Moonlit Reef (night only, by day)', veteran: true },
      },
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
