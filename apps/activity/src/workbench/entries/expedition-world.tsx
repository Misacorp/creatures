import { parseGameState, type Creature } from '../../api';
import { ExpeditionWorld } from '../../ExpeditionWorld';
import { WIDE_QUERY } from '../../ui/wide-layout';
import { parseDestinations } from '../../expedition-parse';
import type { Slots } from '../../expedition-types';
import destinationsFixture from '../../fixtures/expedition-destinations.json';
import stateOffer from '../../fixtures/expedition-state-offer.json';
import { useMediaQuery } from '../../hooks';
import { PopoverHost } from '../../PopoverHost';
import { TripResult } from '../../TripResult';
import { DESTINATION_IDS, NONE } from '../data';
import { str } from '../props';
import type { Entry, Props } from '../types';
import { SCENES } from './trip-result';
import { NOW, tripIn } from './trips';

const NOTHING = () => undefined;
const VIEW = parseDestinations(destinationsFixture);
const SEND_CREATURES: Creature[] = parseGameState(stateOffer).creatures.map((c) => ({
  ...c,
  away: false,
  busy: null,
}));

const LAYOUTS = ['auto', 'phone', 'desktop'] as const;
const WIZARD = [NONE, 'who', 'pack', 'ready'] as const;
const TRIPS = ['none', 'three out', 'every slot out'] as const;

/** The trips of a scenario: running, home and waiting for a push-on choice, at three places. */
function tripsOf(name: string) {
  if (name === 'none') return [];
  const all = [
    tripIn('running', 0, 'tidepools'),
    tripIn('home', 1, 'ember-caves'),
    tripIn('push-on pending', 2, 'old-crossroads'),
  ];
  return name === 'every slot out' ? all.slice(0, 2) : all;
}

function Demo({ p }: { p: Props }) {
  const auto = useMediaQuery(WIDE_QUERY);
  const layout = str(p, 'layout');
  const wide = layout === 'desktop' || (layout === 'auto' && auto);
  const name = str(p, 'trips');
  const trips = tripsOf(name);
  const slots: Slots = {
    total: name === 'every slot out' ? 2 : 3,
    used: trips.length,
    rankSum: 5,
    tripsFinished: 6,
    next: { kind: 'trips', at: 12 },
  };
  const place = str(p, 'place');
  const wizard = str(p, 'wizard');
  const scene = SCENES['one new creature'];
  return (
    <PopoverHost onOpenHowTo={NOTHING}>
      <ExpeditionWorld
        trips={trips}
        creatures={SEND_CREATURES}
        slots={slots}
        stock={{ 'lure-basic': 2, 'lure-good': 1, 'map-scrap-basic': 1, 'satchel-basic': 3 }}
        bait={100}
        view={VIEW}
        viewFailed={false}
        onRetry={NOTHING}
        timezone="Europe/Helsinki"
        forecast={null}
        serverNow={NOW}
        busy={false}
        wide={wide}
        reveal={
          str(p, 'reveal') === 'shown' && scene !== undefined ? (
            <TripResult view={scene} busy={false} onClaim={NOTHING} />
          ) : null
        }
        onSend={() => Promise.resolve(false)}
        onClaim={NOTHING}
        onPushOn={NOTHING}
        onOpenWorkshop={NOTHING}
        {...(place === NONE ? {} : { initialPlace: place })}
        {...(place === NONE || wizard === NONE
          ? {}
          : { initialWizard: wizard === 'pack' || wizard === 'ready' ? wizard : 'who' })}
      />
    </PopoverHost>
  );
}

const expeditionWorld: Entry = {
  name: 'ExpeditionWorld',
  file: 'apps/activity/src/ExpeditionWorld.tsx',
  group: 'Creatures & game pieces',
  description:
    'The Trips screen of the Expeditions tab: the world map with a marker per place. On a phone (under 60 rem) the trips are chips under the map and a tapped place opens a sheet (its banner and what it says, the explorers there, a gold "Send an explorer here" that opens the three send steps in the same sheet; "Decide" opens the push-on choice). On a wide screen the map is full width with the "Out exploring" shelf under it; picking a place opens a side panel on the right with the same flow as the phone sheet (the place, then the three send steps), the map glides to keep the place in its middle, and the X on the panel closes it. A claimed trip shows in the panel. A mouse can drag the map. Sends do nothing here (the server decides). Use the full width for the desktop presets.',
  controls: {
    layout: { kind: 'select', options: LAYOUTS },
    trips: { kind: 'select', options: TRIPS },
    place: { kind: 'select', options: [NONE, ...DESTINATION_IDS] },
    wizard: { kind: 'select', options: WIZARD },
    reveal: { kind: 'select', options: ['none', 'shown'] },
  },
  defaults: { layout: 'auto', trips: 'three out', place: NONE, wizard: NONE, reveal: 'none' },
  presets: [
    { name: 'Phone: map with trips (390 px)', props: { layout: 'phone' } },
    { name: 'Phone: nobody out', props: { layout: 'phone', trips: 'none' } },
    { name: 'Phone: place sheet open', props: { layout: 'phone', place: 'ember-caves' } },
    {
      name: 'Phone: sheet, every slot out',
      props: { layout: 'phone', place: 'tidepools', trips: 'every slot out' },
    },
    {
      name: 'Phone: wizard, who goes',
      props: { layout: 'phone', place: 'tidepools', wizard: 'who', trips: 'none' },
    },
    {
      name: 'Phone: wizard, pack up',
      props: { layout: 'phone', place: 'tidepools', wizard: 'pack', trips: 'none' },
    },
    {
      name: 'Phone: wizard, ready',
      props: { layout: 'phone', place: 'tidepools', wizard: 'ready', trips: 'none' },
    },
    { name: 'Desktop: nothing selected', props: { layout: 'desktop' } },
    { name: 'Desktop: a place selected', props: { layout: 'desktop', place: 'old-crossroads' } },
    {
      name: 'Desktop: wizard, pack up',
      props: { layout: 'desktop', place: 'ember-caves', wizard: 'pack', trips: 'none' },
    },
    {
      name: 'Desktop: claim reveal in the panel',
      props: { layout: 'desktop', place: 'ember-caves', reveal: 'shown' },
    },
  ],
  render: (p) => <Demo key={JSON.stringify(p)} p={p} />,
};

export const expeditionWorldEntries: readonly Entry[] = [expeditionWorld];
