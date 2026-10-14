import { useEffect, useState } from 'preact/hooks';
import { CurrencyPile } from '../../CurrencyPile';
import { LiveRegion } from '../../ui/LiveRegion';
import { PlaybackControls } from '../../ui/PlaybackControls';
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

export const controlEntries: readonly Entry[] = [
  toggleButton,
  playbackControls,
  liveRegion,
  currencyPile,
];
