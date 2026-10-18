import { useEffect, useRef, useState } from 'preact/hooks';
import type { IconRef } from '../../icon-ref';
import { Accordion, AccordionGroup } from '../../ui/Accordion';
import { ELEMENT_IDS, NONE, PARTS } from '../data';
import { bool, str } from '../props';
import type { Entry, Props } from '../types';

const SCENES = [
  'overview',
  'playground',
  'closed',
  'open',
  'meta',
  'icon',
  'compact',
  'group',
  'nested',
  'bait-activity',
  'item-details',
] as const;

const ICON_KINDS = [NONE, 'part', 'element', 'gear'] as const;

function iconOf(kind: string): IconRef | undefined {
  switch (kind) {
    case 'part':
      return { kind: 'part', part: PARTS[0] ?? 'scrap' };
    case 'element':
      return { kind: 'element', element: ELEMENT_IDS[0] ?? 'ember' };
    case 'gear':
      return { kind: 'gear', baseId: 'trail-cap' };
    default:
      return undefined;
  }
}

const LINES = [
  'Fox walks the same path every morning, so the grass stays flat.',
  'Short text: a body can hold anything the place needs.',
];

const LEDGER = [
  '+30 Bait · leet on 2026-10-16 with 3 players',
  '-12 Bait · gear upgrade',
  '+25 Bait · daily allowance',
];

/** Loads its lines the first time it opens, as the real one does (the wait is a timer here). */
function BaitActivityExample() {
  const [lines, setLines] = useState<readonly string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Accordion
      title="Recent Bait activity"
      meta={lines === null ? undefined : String(lines.length)}
      onToggle={(open) => {
        if (open && lines === null && timer.current === null) {
          timer.current = setTimeout(() => {
            setLines(LEDGER);
          }, 600);
        }
      }}
    >
      {lines === null ? (
        <p class="muted">Loading...</p>
      ) : (
        <ul class="recent">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </Accordion>
  );
}

function ItemDetailsExample() {
  return (
    <div class="card-item">
      <p class="pix">Trail Cap +3</p>
      <Accordion title="Details" variant="compact">
        <p class="muted flavor">A plain cap that has seen a lot of meadows.</p>
        <ul class="detail-list">
          <li class="muted">Found on a Meadow trip</li>
          <li class="muted">Got it on 12 Oct 2026</li>
        </ul>
      </Accordion>
    </div>
  );
}

function Scene({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <section class="wb-acc-scene">
      <h3 class="muted small">{title}</h3>
      {children}
    </section>
  );
}

function ClosedExample() {
  return (
    <Accordion title="Workshop">
      <p class="muted">Two job slots, the bag and your blueprints.</p>
    </Accordion>
  );
}

function OpenExample() {
  return (
    <Accordion title="Workshop" defaultOpen>
      <p class="muted">Two job slots, the bag and your blueprints.</p>
    </Accordion>
  );
}

function MetaExample() {
  return (
    <AccordionGroup>
      <Accordion title="Talent Book" meta="3">
        <p class="muted">A count on the right.</p>
      </Accordion>
      <Accordion title="Waiting catches" meta="2 new" metaTone="gold">
        <p class="muted">Gold says something is new.</p>
      </Accordion>
      <Accordion title="Ribbon" meta="Ready" metaTone="gold">
        <p class="muted">Ready to claim.</p>
      </Accordion>
    </AccordionGroup>
  );
}

function IconExample() {
  return (
    <AccordionGroup>
      <Accordion title="Parts" icon={{ kind: 'part', part: PARTS[0] ?? 'scrap' }} meta="12">
        <p class="muted">An icon before the title.</p>
      </Accordion>
      <Accordion
        title="Ember"
        icon={{ kind: 'element', element: ELEMENT_IDS[0] ?? 'ember' }}
        defaultOpen
      >
        <p class="muted">Icons are decoration; the title says it.</p>
      </Accordion>
    </AccordionGroup>
  );
}

function CompactExample() {
  return (
    <div class="card-item">
      <p class="pix">Cindle</p>
      <p class="muted small">Level 7, Ember</p>
      <Accordion title="More" variant="compact" label="More about Cindle">
        {LINES.map((line) => (
          <p key={line} class="muted">
            {line}
          </p>
        ))}
      </Accordion>
    </div>
  );
}

function GroupExample() {
  return (
    <AccordionGroup exclusive defaultOpen="growth" label="Creature details">
      <Accordion name="growth" title="Growth" meta="Lv 7">
        <p class="muted">Opening another closes this one.</p>
      </Accordion>
      <Accordion name="gear" title="Gear" meta="2 / 3">
        <p class="muted">Three slots: hat, scarf, charm.</p>
      </Accordion>
      <Accordion name="about" title="About">
        <p class="muted">Only one is open at a time, which keeps the page short.</p>
      </Accordion>
    </AccordionGroup>
  );
}

function NestedExample() {
  return (
    <Accordion title="Workshop" defaultOpen meta="2 jobs">
      <p class="muted">The outer one is a section.</p>
      <Accordion title="Why some items are in the bag" defaultOpen>
        <p class="muted">The inner one is lighter, one level deep.</p>
      </Accordion>
      <Accordion title="Blueprints" meta="4">
        <p class="muted">A second inner one, closed.</p>
      </Accordion>
    </Accordion>
  );
}

function Playground({ p }: { p: Props }) {
  const meta = str(p, 'meta');
  const icon = iconOf(str(p, 'icon'));
  const variant = str(p, 'variant') === 'compact' ? 'compact' : 'default';
  return (
    <Accordion
      key={String(bool(p, 'open'))}
      title={str(p, 'title')}
      {...(meta === '' ? {} : { meta })}
      metaTone={bool(p, 'metaGold') ? 'gold' : 'quiet'}
      {...(icon === undefined ? {} : { icon })}
      variant={variant}
      defaultOpen={bool(p, 'open')}
    >
      <p class="muted">{str(p, 'body')}</p>
    </Accordion>
  );
}

function Overview() {
  return (
    <div class="wb-acc-scenes">
      <Scene title="Closed">
        <ClosedExample />
      </Scene>
      <Scene title="Open">
        <OpenExample />
      </Scene>
      <Scene title="With a count or a note">
        <MetaExample />
      </Scene>
      <Scene title="With an icon">
        <IconExample />
      </Scene>
      <Scene title="Compact, inside a card">
        <CompactExample />
      </Scene>
      <Scene title="Group, one open at a time">
        <GroupExample />
      </Scene>
      <Scene title="Nested (one level)">
        <NestedExample />
      </Scene>
      <Scene title="Example: Recent Bait activity (loads on first open)">
        <BaitActivityExample />
      </Scene>
      <Scene title="Example: item Details">
        <ItemDetailsExample />
      </Scene>
    </div>
  );
}

function renderScene(p: Props) {
  switch (str(p, 'scene')) {
    case 'playground':
      return <Playground p={p} />;
    case 'closed':
      return <ClosedExample />;
    case 'open':
      return <OpenExample />;
    case 'meta':
      return <MetaExample />;
    case 'icon':
      return <IconExample />;
    case 'compact':
      return <CompactExample />;
    case 'group':
      return <GroupExample />;
    case 'nested':
      return <NestedExample />;
    case 'bait-activity':
      return <BaitActivityExample />;
    case 'item-details':
      return <ItemDetailsExample />;
    default:
      return <Overview />;
  }
}

const accordion: Entry = {
  name: 'Accordion',
  file: 'apps/activity/src/ui/Accordion.tsx',
  group: 'Controls',
  description:
    'The one expand and collapse of the game: a raised header button with a chevron, a title and an optional count on the right (the open one is lit, with the chevron turned down, and no line under it), and a body that hangs under it, with dividers only between its items (also AccordionGroup, for a stack with one open at a time). Tap a header in the preview.',
  covers: ['AccordionGroup'],
  controls: {
    scene: { kind: 'select', options: SCENES },
    title: { kind: 'text', maxLength: 40 },
    meta: { kind: 'text', maxLength: 12 },
    metaGold: { kind: 'toggle' },
    icon: { kind: 'select', options: ICON_KINDS },
    variant: { kind: 'select', options: ['default', 'compact'] },
    open: { kind: 'toggle' },
    body: { kind: 'text', maxLength: 120 },
  },
  defaults: {
    scene: 'overview',
    title: 'Talent Book',
    meta: '3',
    metaGold: false,
    icon: NONE,
    variant: 'default',
    open: false,
    body: 'Whatever the section holds goes here.',
  },
  presets: [
    { name: 'All the looks', props: {} },
    { name: 'Closed', props: { scene: 'closed' } },
    { name: 'Open', props: { scene: 'open' } },
    { name: 'With a count', props: { scene: 'meta' } },
    { name: 'With an icon', props: { scene: 'icon' } },
    { name: 'Compact in a card', props: { scene: 'compact' } },
    { name: 'One open at a time', props: { scene: 'group' } },
    { name: 'Nested', props: { scene: 'nested' } },
    { name: 'Recent Bait activity', props: { scene: 'bait-activity' } },
    { name: 'Item details', props: { scene: 'item-details' } },
    { name: 'Try your own', props: { scene: 'playground', open: true } },
  ],
  render: (p) => renderScene(p),
};

export const accordionEntries: readonly Entry[] = [accordion];
