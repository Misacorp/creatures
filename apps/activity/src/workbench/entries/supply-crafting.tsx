import { useState } from 'preact/hooks';
import { sampleRoster, SAMPLE_GEAR } from '../../creature-card-sample';
import type { GearState } from '../../gear-types';
import { supplyCraftViews } from '../../gear-view';
import type { SupplyPick } from '../../expedition-types';
import { craftJob } from '../../craft-job';
import { samplePreview } from '../../craft-sample';
import type { CraftPreview } from '../../gear-types';
import { blueprintViews } from '../../gear-view';
import { JobDrawer } from '../../JobWizard';
import { supplyActions, supplyJob, type SupplyAction } from '../../supply-job';
import { SupplyCrafting } from '../../SupplyCrafting';
import { SupplyPicker } from '../../SupplyPicker';
import { SupplyGrid, type SupplyCell } from '../../ui/SupplyGrid';
import { bool, num, str } from '../props';
import type { Creature } from '../../api';
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

const JOBS = [
  'Craft Sweet Lure',
  'Refine Plain Lure',
  'Recycle Sweet Lure',
  'Craft Kelp Cap',
  'Craft Brine Hood',
] as const;
const ODDS = ['loaded', 'loading', 'failed'] as const;
const WORLDS = [
  'some under the level (folded)',
  'a busy one at the level',
  'nobody free at the level',
  'both job slots busy',
  'the bag is full',
] as const;

/** Five creatures: the first at Crafting level 5, the second at 3, the rest at 1; some busy for the case. */
function jobWorld(name: string): { gear: GearState; creatures: Creature[] } {
  const roster = sampleRoster(5);
  const busyAt =
    name === 'a busy one at the level' ? [1] : name === 'nobody free at the level' ? [0, 1] : [];
  const levels = [5, 3, 1, 1, 1];
  return {
    creatures: roster.map((c, i) =>
      busyAt.includes(i) ? { ...c, busy: { kind: 'job' as const, id: `job-${String(i)}` } } : c,
    ),
    gear: {
      ...SAMPLE_GEAR,
      slots: { total: 2, used: name === 'both job slots busy' ? 2 : 0 },
      inventory:
        name === 'the bag is full' ? { cap: 60, used: 59, reserved: 1 } : SAMPLE_GEAR.inventory,
      skills: roster.map((c, i) => ({
        creatureId: c.id,
        xp: 0,
        level: levels[i] ?? 1,
        nextLevelXp: null,
      })),
    },
  };
}

const JOB_SUPPLY: Record<string, { id: string; action: SupplyAction }> = {
  'Craft Sweet Lure': { id: 'lure-good', action: 'craft' },
  'Refine Plain Lure': { id: 'lure-basic', action: 'refine' },
  'Recycle Sweet Lure': { id: 'lure-good', action: 'recycle' },
};

/** The gear craft's drawer: the blueprint's job over the sample roster, with the odds loaded, loading or failed. */
function craftDemoJob(p: Props, world: { gear: GearState; creatures: Creature[] }, say: StartSay) {
  const baseId = str(p, 'job') === 'Craft Brine Hood' ? 'brine-hood' : 'kelp-cap';
  const bp = blueprintViews(world.gear.blueprints, world.gear.skills).find(
    (b) => b.baseId === baseId,
  );
  if (bp === undefined) return null;
  const odds = str(p, 'odds');
  const levels = new Map(world.gear.skills.map((s) => [s.creatureId, s.level]));
  const load = (creatureId: string, blueprintId: string): Promise<CraftPreview> =>
    odds === 'loading'
      ? new Promise(() => undefined)
      : odds === 'failed'
        ? Promise.reject(new Error('no'))
        : Promise.resolve(samplePreview(blueprintId, creatureId, levels.get(creatureId) ?? 1));
  return craftJob(bp, world.gear, { load }, (id, who, reach, treat) =>
    say(`Craft ${id} (${reach})`, who, treat),
  );
}

type StartSay = (what: string, who: string, treat: boolean) => Promise<boolean>;

function JobDemo({ p }: { p: Props }) {
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState('');
  const baseWorld = jobWorld(str(p, 'creatures'));
  const world = {
    ...baseWorld,
    gear: {
      ...baseWorld.gear,
      balances: {
        ...baseWorld.gear.balances,
        ...(str(p, 'essence') === 'short' ? { essence: 10 } : {}),
      },
    },
  };
  const stock = { 'lure-basic': 3, 'lure-good': 1 };
  const isGear = str(p, 'job') === 'Craft Kelp Cap' || str(p, 'job') === 'Craft Brine Hood';
  const choice = JOB_SUPPLY[str(p, 'job')] ?? { id: 'lure-good', action: 'craft' as const };
  const view = supplyCraftViews(stock).find((v) => v.id === choice.id);
  const actions =
    view === undefined ? null : supplyActions(view, stock, world.gear, world.creatures);
  const start = (what: string, who: string, treat: boolean): Promise<boolean> => {
    if (bool(p, 'failStart')) return Promise.resolve(false);
    setNote(`${what} with ${who}${treat ? ' and a treat' : ''}.`);
    return Promise.resolve(true);
  };
  const job = isGear
    ? craftDemoJob(p, world, start)
    : view === undefined || actions === null
      ? null
      : supplyJob(choice.action, view, actions, world.gear, {
          onCraft: (id, who, treat) => start(`Craft ${id}`, who, treat),
          onConvert: (id, who, treat) => start(`Convert ${id}`, who, treat),
        });
  return (
    <div class="v3-phone">
      {!open && (
        <p>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Open the job again
          </button>
        </p>
      )}
      {job !== null && open && (
        <JobDrawer
          {...job}
          gear={world.gear}
          creatures={world.creatures}
          busy={false}
          error={bool(p, 'failStart') ? 'Not enough Bait.' : null}
          start={{
            step:
              str(p, 'step') === 'ready' ? 'ready' : str(p, 'step') === 'reach' ? 'reach' : 'who',
            treat: bool(p, 'treat'),
            reach:
              str(p, 'reach') === 'rare' ? 'rare' : str(p, 'reach') === 'epic' ? 'epic' : 'none',
            foldOpen: bool(p, 'unfold'),
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
      <p class="muted" role="status">
        {note}
      </p>
    </div>
  );
}

const jobDrawer: Entry = {
  name: 'JobDrawer',
  file: 'apps/activity/src/JobWizard.tsx',
  group: 'Creatures & game pieces',
  description:
    "The Workshop's job as a wizard in a drawer (Craft, Refine, Recycle a supply, or Craft a piece of gear from a blueprint): the recipe once at the top, then Who crafts (creatures who can do it first with their time, busy ones greyed with their reason, the ones under the level folded into one tappable summary row) how hard to reach for a gear craft (Plain, Rare, Epic with the server's odds, time and cost) and Ready (who, the reach, the treat), with the gold start button pinned below and the reason it is off always shown. Back on Who closes it; Escape goes one step back. Built on the shared Wizard. Press the start with 'The server refuses the start' on to see the error in the footer.",
  controls: {
    job: { kind: 'select', options: JOBS },
    creatures: { kind: 'select', options: WORLDS },
    step: { kind: 'select', options: ['who', 'reach', 'ready'] },
    reach: { kind: 'select', options: ['none', 'rare', 'epic'] },
    odds: { kind: 'select', options: ODDS },
    essence: { kind: 'select', options: ['plenty', 'short'] },
    unfold: { kind: 'toggle' },
    treat: { kind: 'toggle' },
    failStart: { kind: 'toggle' },
  },
  defaults: {
    job: 'Refine Plain Lure',
    creatures: 'some under the level (folded)',
    step: 'who',
    reach: 'none',
    odds: 'loaded',
    essence: 'plenty',
    unfold: false,
    treat: false,
    failStart: false,
  },
  presets: [
    { name: 'Refine, some creatures folded', props: {} },
    { name: 'Refine, the folded row open', props: { unfold: true } },
    { name: 'Refine, ready', props: { step: 'ready' } },
    { name: 'Refine, ready with a treat packed', props: { step: 'ready', treat: true } },
    { name: 'Recycle, who crafts', props: { job: 'Recycle Sweet Lure' } },
    { name: 'Recycle, ready', props: { job: 'Recycle Sweet Lure', step: 'ready' } },
    { name: 'Craft a supply, who crafts', props: { job: 'Craft Sweet Lure' } },
    { name: 'Craft a supply, ready', props: { job: 'Craft Sweet Lure', step: 'ready' } },
    { name: 'Craft gear, who crafts', props: { job: 'Craft Kelp Cap' } },
    { name: 'Craft gear, some creatures folded', props: { job: 'Craft Brine Hood' } },
    {
      name: 'Craft gear, folded row open',
      props: { job: 'Craft Brine Hood', unfold: true },
    },
    { name: 'Craft gear, how hard to reach', props: { job: 'Craft Kelp Cap', step: 'reach' } },
    {
      name: 'Craft gear, reach for Rare',
      props: { job: 'Craft Kelp Cap', step: 'reach', reach: 'rare' },
    },
    {
      name: 'Craft gear, the odds are loading',
      props: { job: 'Craft Kelp Cap', step: 'reach', odds: 'loading' },
    },
    {
      name: 'Craft gear, the odds failed to load',
      props: { job: 'Craft Kelp Cap', step: 'reach', odds: 'failed' },
    },
    {
      name: 'Craft gear, reach costs more Essence than held',
      props: { job: 'Craft Kelp Cap', step: 'reach', reach: 'rare', essence: 'short' },
    },
    {
      name: 'Craft gear, ready',
      props: { job: 'Craft Kelp Cap', step: 'ready', reach: 'rare' },
    },
    {
      name: 'Craft gear, ready with a treat packed',
      props: { job: 'Craft Kelp Cap', step: 'ready', reach: 'rare', treat: true },
    },
    {
      name: 'Craft gear, the bag is full',
      props: { job: 'Craft Kelp Cap', creatures: 'the bag is full' },
    },
    {
      name: 'Craft gear, a start the server refused (press the button)',
      props: { job: 'Craft Kelp Cap', step: 'ready', failStart: true },
    },
    { name: 'A busy creature at the level', props: { creatures: 'a busy one at the level' } },
    { name: 'Nobody free at the level', props: { creatures: 'nobody free at the level' } },
    { name: 'Both job slots busy', props: { creatures: 'both job slots busy' } },
    {
      name: 'A start the server refused (press the button)',
      props: { step: 'ready', failStart: true },
    },
  ],
  render: (p) => <JobDemo key={JSON.stringify(p)} p={p} />,
};

export const supplyCraftingEntries: readonly Entry[] = [
  supplyCrafting,
  jobDrawer,
  supplyGrid,
  supplyPicker,
];
