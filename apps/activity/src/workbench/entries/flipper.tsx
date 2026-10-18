import { useState } from 'preact/hooks';
import type { Creature } from '../../api';
import { CreaturePage, type CardActions } from '../../CreaturePage';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleRoster } from '../../creature-card-sample';
import { PageHeader } from '../../creature-page/PageHeader';
import { PAGE_SAMPLE_ID, pageScene } from '../../creature-page/sample';
import { creatureName } from '../../game';
import type { GearActions } from '../../gear-actions';
import { sortItems } from '../../gear-view';
import { Workshop } from '../../Workshop';
import { handleFlipKey } from '../../ui/flip-keys';
import { flipOver, type FlipProps, type FlipStep } from '../../ui/flip-logic';
import { FlipArea, FlipLive, FlipNav } from '../../ui/Flipper';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const SCENES = ['arrows', 'swipe pad', 'creature page', 'item drawer', 'item picker'] as const;

const NO_ACTIONS: CardActions = {
  onEquip: () => Promise.resolve(true),
  onRibbon: () => undefined,
  onEvolve: () => undefined,
  onRename: () => undefined,
  onLounge: () => undefined,
  onSlotTalent: () => undefined,
};

const NO_JOB_ACTIONS: GearActions = {
  equip: () => Promise.resolve(undefined),
  equipBest: () => Promise.resolve(undefined),
  dismissNotice: () => Promise.resolve(undefined),
  startJob: () => Promise.resolve(undefined),
  previewCraft: () => new Promise(() => undefined),
  previewDismantle: () => new Promise(() => undefined),
  claimJob: () => Promise.resolve(undefined),
};

/** Flip props for a bare count (the arrows scene): the names are numbers, and a flip does nothing. */
function staticFlip(position: number, count: number): FlipProps {
  const at = Math.min(Math.max(position, 1), count) - 1;
  return {
    index: at,
    count,
    noun: 'creature',
    name: `No. ${String(at + 1)}`,
    prevName: `No. ${String(at)}`,
    nextName: `No. ${String(at + 2)}`,
    onFlip: () => undefined,
  };
}

function Arrows({ p }: { p: Props }) {
  const count = num(p, 'count');
  const at = num(p, 'position');
  const rows: { label: string; flip: FlipProps }[] = [
    {
      label: 'In the middle, as on the creature page',
      flip: staticFlip(at, count),
    },
    { label: 'First: the previous arrow is dimmed', flip: staticFlip(1, count) },
    { label: 'Last: the next arrow is dimmed', flip: staticFlip(count, count) },
    { label: 'Two things only', flip: staticFlip(1, 2) },
  ];
  return (
    <div class="wb-flip-rows">
      {rows.map((row) => (
        <section key={row.label} class="wb-flip-row">
          <h3 class="muted small">{row.label}</h3>
          <FlipNav flip={row.flip} />
        </section>
      ))}
    </div>
  );
}

/** A creature's head in a swipe area: flip with the arrows, a swipe, a mouse drag (when on) or the keys. */
function SwipePad({ p }: { p: Props }) {
  const roster = sampleRoster(num(p, 'count'));
  const [index, setIndex] = useState(Math.min(num(p, 'position'), roster.length) - 1);
  const flip = flipOver({
    list: roster,
    at: index,
    noun: 'creature',
    nameOf: creatureName,
    extra: { pointers: bool(p, 'mouse') ? 'any' : 'touch' },
    pick: (_target, step) => {
      setIndex((i) => i + step);
    },
  });
  const creature = roster[index];
  if (creature === undefined || flip === undefined) return null;
  const state = { ...SAMPLE_STATE, creatures: roster, pending: [] };
  return (
    <section
      class="wb-flip-pad"
      tabIndex={0}
      aria-label="Swipe pad"
      onKeyDown={(event) => {
        handleFlipKey(event, flip);
      }}
    >
      <div class="wb-flip-top">
        <FlipNav flip={flip} />
      </div>
      <FlipArea flip={flip} class="wb-flip-card">
        <PageHeader creature={creature} state={state} nameId={`wb-flip-${creature.id}`} />
      </FlipArea>
      <FlipLive flip={flip} />
      <p class="muted small">
        Swipe the card left or right, or press Left and Right here.
        {bool(p, 'mouse') ? ' Mouse drag works in the workbench.' : ''}
      </p>
    </section>
  );
}

interface Shown {
  index: number;
  enter: FlipStep | null;
  focusButton: FlipStep | null;
}

/** The real creature page, flipping through a sample roster the way the Creatures tab does. */
function PageDemo({ p }: { p: Props }) {
  const roster = sampleRoster(num(p, 'count'));
  const [shown, setShown] = useState<Shown>({
    index: Math.min(num(p, 'position'), roster.length) - 1,
    enter: null,
    focusButton: null,
  });
  const creature = roster[shown.index];
  const state = { ...SAMPLE_STATE, creatures: roster, pending: [] };
  const flip = flipOver({
    list: roster,
    at: shown.index,
    noun: 'creature',
    nameOf: creatureName,
    extra: {
      pointers: bool(p, 'mouse') ? 'any' : 'touch',
      enter: shown.enter,
      focusButton: shown.focusButton,
    },
    pick: (target: Creature, step, via) => {
      setShown({
        index: roster.indexOf(target),
        enter: step,
        focusButton: via === 'button' ? step : null,
      });
    },
  });
  if (creature === undefined) return null;
  return (
    <div class="v3-bleed">
      {flip !== undefined && <FlipLive flip={flip} />}
      <CreaturePage
        key={creature.id}
        creature={creature}
        state={state}
        gear={SAMPLE_GEAR}
        busy={false}
        actions={NO_ACTIONS}
        focus={null}
        flip={flip}
        onBack={() => undefined}
        onAnswerCatch={() => undefined}
      />
    </div>
  );
}

/** The Workshop with the drawer of one bag item up: its arrows flip through the bag in the grid's order. */
function ItemDrawerDemo({ p }: { p: Props }) {
  const { gear, state } = pageScene('level 15');
  const items = sortItems(gear.items);
  const first = items[Math.min(num(p, 'position'), items.length) - 1];
  return (
    <div class="v3-phone">
      <Workshop
        state={state}
        gear={gear}
        failed={false}
        offset={0}
        busy={false}
        reveal={null}
        actions={NO_JOB_ACTIONS}
        onRetry={() => undefined}
        onClaimed={() => undefined}
        onDismissReveal={() => undefined}
        {...(first === undefined ? {} : { initialSelectedId: first.id })}
      />
    </div>
  );
}

/** The creature page with the Hat picker up: the arrows flip through the slot's grid. */
function PickerDemo() {
  const { creature, state, gear } = pageScene('level 15');
  return (
    <div class="v3-phone">
      <CreaturePage
        key={PAGE_SAMPLE_ID}
        creature={creature}
        state={state}
        gear={gear}
        busy={false}
        actions={NO_ACTIONS}
        focus={null}
        initialOpen={{ kind: 'gear', slot: 'hat' }}
        onBack={() => undefined}
        onAnswerCatch={() => undefined}
      />
    </div>
  );
}

function renderScene(p: Props) {
  // A scene is drawn anew when its numbers change (the pages hold their own state).
  const key = `${str(p, 'scene')}|${String(num(p, 'count'))}|${String(num(p, 'position'))}|${String(bool(p, 'mouse'))}`;
  switch (str(p, 'scene')) {
    case 'swipe pad':
      return <SwipePad key={key} p={p} />;
    case 'creature page':
      return <PageDemo key={key} p={p} />;
    case 'item drawer':
      return <ItemDrawerDemo key={key} p={p} />;
    case 'item picker':
      return <PickerDemo key={key} />;
    default:
      return <Arrows p={p} />;
  }
}

const flipper: Entry = {
  name: 'FlipNav',
  file: 'apps/activity/src/ui/Flipper.tsx',
  group: 'Controls',
  description:
    'How you flip between things in a detail view: the creature page (through the list you came from) and the item drawers (through the bag, or a slot\'s grid) share it. Previous and next arrows with the position ("3 / 12") sit in the header; a swipe left or right on the detail, or the Left and Right keys, do the same; the first and last thing stop gently (no wrap-around). A finger or pen swipes, and here the mouse can too (the "mouse" switch).',
  covers: ['FlipArea', 'FlipLive'],
  controls: {
    scene: { kind: 'select', options: SCENES },
    count: { kind: 'number', min: 2, max: 14 },
    position: { kind: 'number', min: 1, max: 14 },
    mouse: { kind: 'toggle' },
  },
  defaults: { scene: 'arrows', count: 12, position: 3, mouse: true },
  presets: [
    { name: 'Arrows and count', props: {} },
    { name: 'Swipe pad', props: { scene: 'swipe pad' } },
    { name: 'Creature page', props: { scene: 'creature page', count: 8, position: 3 } },
    {
      name: 'Creature page, first of eight',
      props: { scene: 'creature page', count: 8, position: 1 },
    },
    { name: 'Item drawer (Workshop bag)', props: { scene: 'item drawer', position: 4 } },
    { name: 'Item picker (creature page slot)', props: { scene: 'item picker' } },
  ],
  render: (p) => renderScene(p),
};

export const flipperEntries: readonly Entry[] = [flipper];
