import { useState } from 'preact/hooks';
import { WorldMap } from '../../WorldMap';
import { SAMPLE_EXPLORERS, sampleMapTrips, type MapSample } from '../../map-sample';
import { mapPlaces } from '../../map-view';
import { DESTINATION_IDS, NONE } from '../data';
import { bool, str } from '../props';
import type { Entry, Props } from '../types';

const SAMPLES: readonly MapSample[] = ['empty', 'four-out', 'crowded'];
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const RULES = { 'moonlit-reef': 'Night only', 'festival-grounds': 'Festival weeks' };

function Demo({ p }: { p: Props }) {
  const [picked, setPicked] = useState<string | null>(null);
  const preset = str(p, 'selected');
  const selected = picked ?? (preset === NONE ? null : preset);
  const places = mapPlaces({
    trips: sampleMapTrips(str(p, 'trips') as MapSample, NOW),
    creatures: SAMPLE_EXPLORERS,
    now: NOW,
    selected,
    ...(bool(p, 'rules') ? { rules: RULES } : {}),
  });
  return (
    <WorldMap
      key={preset}
      places={places}
      selected={selected}
      night={bool(p, 'night')}
      onPick={(id) => {
        setPicked(id === selected ? NONE : id);
      }}
    />
  );
}

const worldMap: Entry = {
  name: 'WorldMap',
  file: 'apps/activity/src/WorldMap.tsx',
  group: 'Creatures & game pieces',
  description:
    'The Expeditions world map: a pixel-art world with a sea on the left, a landmark for each of the eight places and a dashed trail through them in order. Each place is a button with its name; the explorers out there show as up to two faces above it with "+N" for more, a gold HOME flag when a trip is ready to claim and a "!" when a trip waits for its push-on choice. The chosen place has a gold plate and ring. It scrolls sideways at phone width (Left and Right arrows move along the trail); night tints it blue. Every place is open on the map; Moonlit Reef and the Festival Grounds only show their time rule as a small line.',
  controls: {
    trips: { kind: 'select', options: SAMPLES },
    selected: { kind: 'select', options: [NONE, ...DESTINATION_IDS] },
    night: { kind: 'toggle' },
    rules: { kind: 'toggle' },
  },
  defaults: { trips: 'four-out', selected: NONE, night: false, rules: true },
  presets: [
    { name: 'Empty: nobody out', props: { trips: 'empty' } },
    { name: '4 out: 1 home, 1 waiting for a push-on choice', props: { trips: 'four-out' } },
    { name: 'Crowded: +N, several home', props: { trips: 'crowded' } },
    { name: 'Night', props: { trips: 'four-out', night: true } },
    { name: 'A place selected', props: { trips: 'four-out', selected: 'ember-caves' } },
  ],
  render: (p) => <Demo p={p} />,
};

export const worldMapEntries: readonly Entry[] = [worldMap];
