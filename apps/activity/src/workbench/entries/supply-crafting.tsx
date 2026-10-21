import { useState } from 'preact/hooks';
import { parseGameState } from '../../api';
import { parseDestinations } from '../../expedition-parse';
import destinationsFixture from '../../fixtures/expedition-destinations.json';
import stateOffer from '../../fixtures/expedition-state-offer.json';
import { SendTrip } from '../../SendTrip';
import { sampleRoster, SAMPLE_GEAR } from '../../creature-card-sample';
import type { GearState } from '../../gear-types';
import { supplyCraftViews } from '../../gear-view';
import type { SupplyPick } from '../../expedition-types';
import { SupplyCrafting } from '../../SupplyCrafting';
import { SupplyPicker } from '../../SupplyPicker';
import { SupplyGrid, type SupplyCell } from '../../ui/SupplyGrid';
import { num, str } from '../props';
import type { Entry, Props } from '../types';

const STOCKS = ['nothing', 'some', 'a lot'] as const;
const PARTS = ['plenty', 'missing'] as const;

const ROSTER = sampleRoster(3);

function stockOf(name: string): Record<string, number> {
  if (name === 'some') return { 'lure-basic': 2, 'map-scrap-good': 1, 'satchel-basic': 4 };
  if (name === 'a lot') {
    return Object.fromEntries(supplyCraftViews({}).map((v, i) => [v.id, (i % 5) + 1]));
  }
  return {};
}

/** The sample gear with the first creature at a Crafting level, and the parts plentiful or gone. */
function gearFor(p: Props): GearState {
  const id = ROSTER[0]?.id ?? 'sample-0';
  const level = num(p, 'craftingLevel');
  const parts =
    str(p, 'parts') === 'missing'
      ? Object.fromEntries(Object.keys(SAMPLE_GEAR.parts).map((k) => [k, 0]))
      : SAMPLE_GEAR.parts;
  return {
    ...SAMPLE_GEAR,
    parts: parts as GearState['parts'],
    skills: [{ creatureId: id, xp: 0, level, nextLevelXp: null }],
  };
}

function Demo({ p }: { p: Props }) {
  const [started, setStarted] = useState<string | null>(null);
  const say = (text: string) => async () => {
    setStarted(text);
    return Promise.resolve(true);
  };
  return (
    <>
      <SupplyCrafting
        gear={gearFor(p)}
        creatures={ROSTER}
        stock={stockOf(str(p, 'stock'))}
        busy={false}
        onCraft={async (id) => say(`Crafting ${id}`)()}
        onConvert={async (id) => say(`Converting ${id}`)()}
      />
      {started !== null && (
        <p class="muted" aria-live="polite">
          {started}
        </p>
      )}
    </>
  );
}

const CONTROLS = {
  stock: { kind: 'select', options: STOCKS },
  craftingLevel: { kind: 'number', min: 1, max: 6 },
  parts: { kind: 'select', options: PARTS },
} as const;

const supplyCrafting: Entry = {
  name: 'SupplyCrafting',
  file: 'apps/activity/src/SupplyCrafting.tsx',
  group: 'Creatures & game pieces',
  description:
    "The Workshop's supply section on one phone screen: a grid of the twelve supplies (kinds across, tiers down), one card for the chosen one with what it does, its cost, time and level, a Craft button and small Refine and Recycle buttons that open the creature picker.",
  controls: CONTROLS,
  defaults: { stock: 'nothing', craftingLevel: 3, parts: 'plenty' },
  presets: [
    { name: 'Nothing in stock', props: { stock: 'nothing', craftingLevel: 3, parts: 'plenty' } },
    { name: 'Some stock', props: { stock: 'some', craftingLevel: 3, parts: 'plenty' } },
    {
      name: 'Great tier locked by level',
      props: { stock: 'a lot', craftingLevel: 3, parts: 'plenty' },
    },
    { name: 'Missing parts', props: { stock: 'some', craftingLevel: 5, parts: 'missing' } },
    { name: 'Refine available', props: { stock: 'a lot', craftingLevel: 5, parts: 'plenty' } },
  ],
  render: (p) => <Demo p={p} />,
};

function GridDemo({ p }: { p: Props }) {
  const [selected, setSelected] = useState<string | null>('lure-basic');
  const stock = stockOf(str(p, 'stock'));
  const level = num(p, 'craftingLevel');
  const views = supplyCraftViews(stock);
  const cells: SupplyCell[] = views.map((v) => ({
    id: v.id,
    kind: v.kind,
    tier: v.tier as SupplyCell['tier'],
    owned: v.owned,
    muted: v.level > level,
    label: `${v.name}, ${String(v.owned)} in stock`,
  }));
  return (
    <SupplyGrid
      kinds={[...new Set(views.map((v) => v.kind))]}
      cells={cells}
      selected={selected}
      onSelect={setSelected}
    />
  );
}

const supplyGrid: Entry = {
  name: 'SupplyGrid',
  file: 'apps/activity/src/ui/SupplyGrid.tsx',
  group: 'Controls',
  description:
    'The picture grid of the supply picker: four kinds across and three tiers down (Basic grey, Good blue, Great pink), a stock count in a corner, supplies nobody can craft yet dimmed and one selected with the ring.',
  controls: { stock: CONTROLS.stock, craftingLevel: CONTROLS.craftingLevel },
  defaults: { stock: 'some', craftingLevel: 3 },
  presets: [
    { name: 'Nothing in stock', props: { stock: 'nothing', craftingLevel: 3 } },
    { name: 'Some stock', props: { stock: 'some', craftingLevel: 3 } },
    { name: 'Great tier locked by level', props: { stock: 'a lot', craftingLevel: 3 } },
    { name: 'Everything unlocked', props: { stock: 'a lot', craftingLevel: 6 } },
  ],
  render: (p) => <GridDemo p={p} />,
};

const KITS: Record<string, string[]> = {
  empty: [],
  'one packed': ['map-scrap-good'],
  'full kit': ['lure-basic', 'satchel-basic'],
};

function PickerDemo({ p }: { p: Props }) {
  const [picks, setPicks] = useState<SupplyPick[]>(
    (KITS[str(p, 'kit')] ?? []).map((id) => ({ id, source: 'owned' as const })),
  );
  return <SupplyPicker picks={picks} stock={stockOf(str(p, 'stock'))} onChange={setPicks} />;
}

const supplyPicker: Entry = {
  name: 'SupplyPicker',
  file: 'apps/activity/src/SupplyPicker.tsx',
  group: 'Creatures & game pieces',
  description:
    'The supply step of the send screen: the same grid as the Workshop, but tapping packs a supply (a tick) for the trip. At most two kinds; one tier per kind; once the kit is full the other kinds are dimmed; supplies you have none of cannot be tapped. One card shows the last tapped one while it is packed (taking it out hides the card).',
  controls: {
    stock: CONTROLS.stock,
    kit: { kind: 'select', options: Object.keys(KITS) },
  },
  defaults: { stock: 'some', kit: 'empty' },
  presets: [
    { name: 'Empty kit', props: { stock: 'some', kit: 'empty' } },
    { name: 'One packed', props: { stock: 'a lot', kit: 'one packed' } },
    { name: 'Full kit', props: { stock: 'a lot', kit: 'full kit' } },
    { name: 'Nothing in stock', props: { stock: 'nothing', kit: 'empty' } },
  ],
  // Keyed on the props so a preset starts from its own kit.
  render: (p) => <PickerDemo key={`${str(p, 'kit')}-${str(p, 'stock')}`} p={p} />,
};

const SEND_VIEW = parseDestinations(destinationsFixture);
const SEND_CREATURES = parseGameState(stateOffer).creatures.map((c) => ({
  ...c,
  away: false,
  busy: null,
}));

function SendDemo({ p }: { p: Props }) {
  return (
    <SendTrip
      creatures={SEND_CREATURES}
      slots={{ total: 2, used: 0, rankSum: 2, tripsFinished: 3, next: null }}
      stock={stockOf(str(p, 'stock'))}
      bait={100}
      busy={false}
      view={SEND_VIEW}
      viewFailed={false}
      timezone="Europe/Helsinki"
      onRetry={() => undefined}
      onSend={() => {
        return Promise.resolve(true);
      }}
      onOpenWorkshop={() => undefined}
    />
  );
}

const sendTrip: Entry = {
  name: 'SendTrip',
  file: 'apps/activity/src/SendTrip.tsx',
  group: 'Creatures & game pieces',
  description:
    'The whole send screen on fixture places and creatures. Step 4 (Supplies) has a "?" help tag and a Craft button at the right of its title row; a packed supply shows the pixel tick, deselecting hides its card, and the expected haul starts with a one-line summary (duration, place, explorer, each supply as a button for its card, a treat, and when the trip is back).',
  controls: { stock: CONTROLS.stock },
  defaults: { stock: 'some' },
  presets: [
    { name: 'Some stock', props: { stock: 'some' } },
    { name: 'A lot of stock', props: { stock: 'a lot' } },
    { name: 'Nothing in stock', props: { stock: 'nothing' } },
  ],
  render: (p) => <SendDemo key={str(p, 'stock')} p={p} />,
};

export const supplyCraftingEntries: readonly Entry[] = [
  supplyCrafting,
  supplyGrid,
  supplyPicker,
  sendTrip,
];
