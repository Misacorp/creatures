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
    'The Expeditions world map: a pixel-art world with the sea on the west edge, Tidepools and Moonlit Reef on the shore, Ember Caves and Storm Ridge up north, Old Crossroads at the centre where the paths meet, Verdant Hollow and Sunken Fen in the south and the Festival Grounds in the east, joined by dashed paths. Each place is a button shown as its pixel-art title logo over its landmark (the real name is the button label) with a pin at the landmark foot. Under the pin: up to two explorer faces there with "+N" for more, a gold HOME flag when a trip is ready to claim, a "!" when a trip waits for its push-on choice, and a small muted line for a time rule (Night only, Festival weeks). The chosen place has a gold outline round its logo and a gold ring on its pin. Every place is open on the map. Whole-number scale: 2 (the whole map fits a desktop card, 736 px; at 390 px it pans sideways) or 3 at 1104 px and up; Left and Right arrows move through the places west to east. Night tints it blue. Use the width switcher: 360, 390 and full.',
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
    {
      name: 'Crowded, Storm Ridge selected, night',
      props: { trips: 'crowded', selected: 'storm-ridge', night: true },
    },
  ],
  render: (p) => <Demo p={p} />,
};

export const worldMapEntries: readonly Entry[] = [worldMap];
