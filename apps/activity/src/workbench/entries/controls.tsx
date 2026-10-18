import { useEffect, useState } from 'preact/hooks';
import { CurrencyPile } from '../../CurrencyPile';
import { TabBar } from '../../TabBar';
import { ALERT_TEXT, NO_ALERTS, type TabAlerts } from '../../tab-alerts';
import { TABS, type Tab } from '../../tabs';
import { LiveRegion } from '../../ui/LiveRegion';
import { PlaybackControls } from '../../ui/PlaybackControls';
import { ScrollHint } from '../../ui/ScrollHint';
import { Switch } from '../../ui/Switch';
import { ToggleButton } from '../../ui/ToggleButton';
import type { Speed } from '../../replay';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

function ToggleDemo({ p }: { p: Props }) {
  const initial = bool(p, 'pressed');
  const [pressed, setPressed] = useState(initial);
  useEffect(() => {
    setPressed(initial);
  }, [initial]);
  return (
    <>
      <ToggleButton
        pressed={pressed}
        onToggle={() => {
          setPressed((v) => !v);
        }}
        {...(bool(p, 'controlsRegion') ? { controls: 'wb-region' } : {})}
      >
        {str(p, 'text')}
      </ToggleButton>
      {bool(p, 'controlsRegion') && pressed && (
        <p id="wb-region" class="muted">
          The region this button shows.
        </p>
      )}
    </>
  );
}

const toggleButton: Entry = {
  name: 'ToggleButton',
  file: 'apps/activity/src/ui/ToggleButton.tsx',
  group: 'Controls',
  description:
    'A button that is on or off, gold when on; it is the 2x speed button of replays and the show/hide buttons of lists. Tap it in the preview.',
  controls: {
    pressed: { kind: 'toggle' },
    text: { kind: 'text', maxLength: 30 },
    controlsRegion: { kind: 'toggle' },
  },
  defaults: { pressed: false, text: '2×', controlsRegion: false },
  presets: [
    { name: 'Off', props: { pressed: false } },
    { name: 'On', props: { pressed: true } },
    { name: 'Shows a region', props: { text: 'Show details', controlsRegion: true } },
  ],
  render: (p) => <ToggleDemo p={p} />,
};

function SwitchDemo({ p }: { p: Props }) {
  const initial = bool(p, 'on');
  const [on, setOn] = useState(initial);
  useEffect(() => {
    setOn(initial);
  }, [initial]);
  const label = str(p, 'label');
  return (
    <>
      <Switch on={on} onChange={setOn} label={label} disabled={bool(p, 'disabled')} />
      <p class="muted small">
        Both states and a disabled one side by side (the knob has the same gap to the edge in each):
      </p>
      <div class="action-row">
        <Switch on={false} onChange={() => undefined} label="Off" />
        <Switch on onChange={() => undefined} label="On" />
        <Switch on onChange={() => undefined} label="Disabled" disabled />
      </div>
    </>
  );
}

const switchEntry: Entry = {
  name: 'Switch',
  file: 'apps/activity/src/ui/Switch.tsx',
  group: 'Controls',
  description:
    'A small pixel switch with a label (a real button, role switch): the Compare switch of the item picker. The knob sits at the left when off and at the right when on, with the same gap to the edge in both. Tap it in the preview.',
  controls: {
    on: { kind: 'toggle' },
    disabled: { kind: 'toggle' },
    label: { kind: 'text', maxLength: 30 },
  },
  defaults: { on: false, disabled: false, label: 'Compare' },
  presets: [
    { name: 'Off', props: { on: false } },
    { name: 'On', props: { on: true } },
    { name: 'Disabled', props: { on: true, disabled: true } },
  ],
  render: (p) => <SwitchDemo p={p} />,
};

function PlaybackDemo({ p }: { p: Props }) {
  const [playing, setPlaying] = useState(bool(p, 'playing'));
  const [speed, setSpeed] = useState<Speed>(1);
  const wanted = bool(p, 'playing');
  useEffect(() => {
    setPlaying(wanted);
  }, [wanted]);
  return (
    <PlaybackControls
      label="Replay controls"
      playing={playing}
      finished={bool(p, 'finished')}
      speed={speed}
      skipLabel={str(p, 'skipLabel')}
      skipDisabled={bool(p, 'skipDisabled')}
      onPlayPause={() => {
        setPlaying((v) => !v);
      }}
      onSpeed={setSpeed}
      onSkip={() => undefined}
    />
  );
}

const playbackControls: Entry = {
  name: 'PlaybackControls',
  file: 'apps/activity/src/ui/PlaybackControls.tsx',
  group: 'Controls',
  description:
    'Play or pause, 2x speed and a skip button, under the raid replay and the dungeon playback. The buttons work in the preview.',
  controls: {
    playing: { kind: 'toggle' },
    finished: { kind: 'toggle' },
    skipLabel: { kind: 'text', maxLength: 30 },
    skipDisabled: { kind: 'toggle' },
  },
  defaults: { playing: false, finished: false, skipLabel: 'Skip to the end', skipDisabled: false },
  presets: [
    { name: 'Paused', props: {} },
    { name: 'Playing', props: { playing: true } },
    { name: 'Finished (Replay)', props: { finished: true } },
    { name: 'Skip disabled', props: { skipDisabled: true } },
  ],
  render: (p) => <PlaybackDemo p={p} />,
};

const liveRegion: Entry = {
  name: 'LiveRegion',
  file: 'apps/activity/src/ui/LiveRegion.tsx',
  group: 'Controls',
  description:
    'Text only a screen reader hears, announced politely when it changes (for example "Cindle picked up"). It is invisible, so the preview prints the text below it.',
  controls: { text: { kind: 'text', maxLength: 120 } },
  defaults: { text: 'Cindle picked up. Use the arrow keys to choose a slot.' },
  presets: [
    { name: 'Pick-up', props: {} },
    { name: 'Empty', props: { text: '' } },
  ],
  render: (p) => (
    <>
      <LiveRegion>{str(p, 'text')}</LiveRegion>
      <p class="muted small">Announced (invisible in the game): {str(p, 'text') || '(nothing)'}</p>
    </>
  ),
};

const currencyPile: Entry = {
  name: 'CurrencyPile',
  file: 'apps/activity/src/CurrencyPile.tsx',
  group: 'Controls',
  description:
    'The small coin-pile button in the title row, left of "?": tap it for a compact popover with the Bait and Essence balances and their glossary tags. Its spoken label carries both amounts.',
  controls: {
    bait: { kind: 'number', min: 0, max: 999999 },
    essence: { kind: 'number', min: 0, max: 999999 },
  },
  defaults: { bait: 52, essence: 52 },
  presets: [
    { name: 'Typical', props: {} },
    { name: 'Nothing yet', props: { bait: 0, essence: 0 } },
    { name: 'Rich', props: { bait: 123456, essence: 9876 } },
  ],
  render: (p) => (
    <div class="wb-pop-stage">
      <CurrencyPile balances={{ bait: num(p, 'bait'), essence: num(p, 'essence') }} />
    </div>
  ),
};

const TAB_IDS = TABS.map((t) => t.id);

function tabOf(value: string): Tab {
  return TAB_IDS.find((id) => id === value) ?? 'collection';
}

function TabBarDemo({ p }: { p: Props }) {
  const [current, setCurrent] = useState<Tab>(tabOf(str(p, 'current')));
  const wanted = str(p, 'current');
  useEffect(() => {
    setCurrent(tabOf(wanted));
  }, [wanted]);
  const alerts: TabAlerts = {
    ...NO_ALERTS,
    workshop: bool(p, 'workshop') ? ALERT_TEXT.jobReady : null,
    expeditions: bool(p, 'expeditions') ? ALERT_TEXT.tripHome : null,
    dungeon: bool(p, 'dungeon') ? ALERT_TEXT.dungeonOpen : null,
    raid: bool(p, 'raid') ? ALERT_TEXT.raidPlace : null,
  };
  return <TabBar current={current} alerts={alerts} onSelect={setCurrent} />;
}

const tabBar: Entry = {
  name: 'TabBar',
  file: 'apps/activity/src/TabBar.tsx',
  group: 'Controls',
  description:
    'The five main tabs of the game (Creatures, Workshop, Expeditions, Dungeon, Raid); a tab with something waiting for the player has a small orange square pip at its top right corner. Tap a tab or use the arrow keys.',
  controls: {
    current: { kind: 'select', options: TAB_IDS },
    workshop: { kind: 'toggle' },
    expeditions: { kind: 'toggle' },
    dungeon: { kind: 'toggle' },
    raid: { kind: 'toggle' },
  },
  defaults: {
    current: 'collection',
    workshop: false,
    expeditions: false,
    dungeon: false,
    raid: false,
  },
  presets: [
    { name: 'No pips', props: {} },
    {
      name: 'All pips',
      props: { workshop: true, expeditions: true, dungeon: true, raid: true },
    },
    {
      name: 'Expeditions open, two pips',
      props: { current: 'expeditions', expeditions: true, dungeon: true },
    },
    {
      name: 'Pip on the gold tab',
      props: { current: 'raid', raid: true, workshop: true },
    },
  ],
  render: (p) => <TabBarDemo p={p} />,
};

function ScrollHintDemo({ p }: { p: Props }) {
  // Each press of "New content" is a new content key: the box goes back to the top and the hint starts again.
  const [version, setVersion] = useState(0);
  const lines = num(p, 'lines');
  return (
    <div class="wb-scroll-hint">
      <ScrollHint
        class="wb-scroll-hint-box"
        contentKey={`${String(version)}:${String(lines)}`}
        label="Sample content"
        focusable
        delayMs={num(p, 'delayMs')}
        speed={num(p, 'speed')}
        reducedMotion={bool(p, 'reducedMotion')}
      >
        <ul class="wb-scroll-hint-list">
          {Array.from({ length: lines }, (_, i) => (
            <li key={i}>
              Sample line {i + 1} / {lines}
            </li>
          ))}
        </ul>
      </ScrollHint>
      <button
        type="button"
        onClick={() => {
          setVersion((v) => v + 1);
        }}
      >
        New content
      </button>
    </div>
  );
}

const scrollHint: Entry = {
  name: 'ScrollHint',
  file: 'apps/activity/src/ui/ScrollHint.tsx',
  group: 'Controls',
  description:
    'A box that scrolls with no scrollbar and shows it does: after a rest (2.5 s) the content moves down very slowly to the bottom, any touch, wheel, key or focus stops it for good, and a soft fade shows while there is more below. Under reduced motion only the fade shows. It is used by the item picker\'s detail panel; "New content" starts it again from the top.',
  controls: {
    lines: { kind: 'number', min: 2, max: 60 },
    delayMs: { kind: 'number', min: 0, max: 10000, step: 100 },
    speed: { kind: 'number', min: 1, max: 200 },
    reducedMotion: { kind: 'toggle' },
  },
  defaults: { lines: 24, delayMs: 2500, speed: 12, reducedMotion: false },
  presets: [
    { name: 'Long content (the hint runs)', props: { lines: 24 } },
    { name: 'Fits (nothing happens)', props: { lines: 4 } },
    { name: 'Reduced motion (fade only)', props: { lines: 24, reducedMotion: true } },
    { name: 'Quick and fast', props: { lines: 40, delayMs: 500, speed: 60 } },
  ],
  render: (p) => <ScrollHintDemo p={p} />,
};

export const controlEntries: readonly Entry[] = [
  toggleButton,
  switchEntry,
  playbackControls,
  liveRegion,
  currencyPile,
  tabBar,
  scrollHint,
];
