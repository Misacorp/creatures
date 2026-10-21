import { parseGameState, type Creature } from '../../api';
import type { Slots, Trip } from '../../expedition-types';
import stateOffer from '../../fixtures/expedition-state-offer.json';
import { OutStrip } from '../../OutStrip';
import { TripActions } from '../../TripActions';
import { TripRow } from '../../TripRow';
import { TripShelf } from '../../TripShelf';
import { DESTINATION_IDS } from '../data';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

/** Real server output: one trip with a push-on offer, and three explorers. */
const FIXTURE = parseGameState(stateOffer);
const FIRST = FIXTURE.expeditions[0];
if (FIRST === undefined) throw new Error('the fixture has no trip');
const BASE_TRIP: Trip = FIRST;
export const CREATURES: readonly Creature[] = FIXTURE.creatures;

const HOUR = 3_600_000;
/** A fixed "now" so every state reads the same on every visit. */
export const NOW = 1_800_000_000_000;
const NOTHING = () => undefined;

/** The states the strip and the shelf show, in order: a mix, so every kind of chip and button is seen. */
const STRIP_STATES = ['running', 'home', 'push-on pending', 'pushing on'] as const;
const STATES = ['running', 'home', 'push-on pending', 'pushing on'] as const;
const LENGTHS = ['short', 'medium', 'long', 'day'] as const;
const LENGTH_HOURS = { short: 2, medium: 6, long: 12, day: 24 } as const;

/** A trip in one of the four states, at a place, for the n-th explorer. */
export function tripIn(state: string, n: number, place?: string): Trip {
  const creature = CREATURES[n % CREATURES.length];
  const duration = LENGTHS[n % LENGTHS.length] ?? 'medium';
  const hours = LENGTH_HOURS[duration];
  const length = hours * HOUR;
  const base: Trip = {
    ...BASE_TRIP,
    id: `trip-${String(n)}`,
    creatureId: creature?.id ?? BASE_TRIP.creatureId,
    destination: place ?? DESTINATION_IDS[n % DESTINATION_IDS.length] ?? 'tidepools',
    duration,
    kit: [],
    offer: null,
    pushOn: null,
  };
  const over = (ago: number): Trip => ({
    ...base,
    startedAt: NOW - ago - length,
    endsAt: NOW - ago,
    readyAt: NOW - ago,
  });
  switch (state) {
    case 'home':
      return over(HOUR);
    case 'push-on pending':
      return { ...over(0), offer: BASE_TRIP.offer };
    case 'pushing on': {
      const pushStart = NOW - HOUR;
      return {
        ...over(HOUR),
        pushOn: {
          goalId: 'forage',
          startedAt: pushStart,
          endsAt: pushStart + 3 * HOUR,
          oddsBp: 10_000,
        },
        readyAt: pushStart + 3 * HOUR,
      };
    }
    default: {
      // Out for a third of its length, a little more for each next explorer.
      const done = length / 3 + n * HOUR * 0.4;
      return {
        ...base,
        startedAt: NOW - done,
        endsAt: NOW - done + length,
        readyAt: NOW - done + length,
      };
    }
  }
}

/** The slots: `total` open, `used` out, and the next one to earn (unless `locked` is off). */
function slotsOf(total: number, used: number, locked: boolean): Slots {
  return {
    total,
    used,
    rankSum: 2,
    tripsFinished: 2,
    next: locked ? { kind: 'trips', at: 5 } : null,
  };
}

const COMMON_CONTROLS = {
  state: { kind: 'select', options: STATES },
  busy: { kind: 'toggle' },
} as const;

const COMMON_DEFAULTS = { state: 'running', busy: false } as const;

const FIRST_TRIP = (p: Props): Trip => tripIn(str(p, 'state'), 0);

export const tripEntries: readonly Entry[] = [
  {
    name: 'TripActions',
    file: 'apps/activity/src/TripActions.tsx',
    group: 'Creatures & game pieces',
    description:
      'The one button of a trip that is out: Claim, Recall (with the hours it keeps), Come home now during a push-on, or Decide when a push-on is on offer; shown full size (the old card) or compact (a row or a shelf card).',
    controls: { ...COMMON_CONTROLS, compact: { kind: 'toggle' } },
    defaults: { ...COMMON_DEFAULTS, compact: true },
    presets: [
      { name: 'Recall', props: { state: 'running' } },
      { name: 'Claim', props: { state: 'home' } },
      { name: 'Decide', props: { state: 'push-on pending' } },
      { name: 'Come home now', props: { state: 'pushing on' } },
      { name: 'Full size', props: { state: 'running', compact: false } },
    ],
    render: (p) => (
      <div class="pix-panel">
        <TripActions
          trip={FIRST_TRIP(p)}
          serverNow={NOW}
          busy={bool(p, 'busy')}
          onClaim={NOTHING}
          onDecide={NOTHING}
          compact={bool(p, 'compact')}
        />
      </div>
    ),
  },
  {
    name: 'TripRow',
    file: 'apps/activity/src/TripRow.tsx',
    group: 'Creatures & game pieces',
    description:
      'One trip at a place, in the place sheet of the map: the explorer, the trip length, a status line, a thin timer bar and one button.',
    controls: COMMON_CONTROLS,
    defaults: COMMON_DEFAULTS,
    presets: STATES.map((state) => ({ name: state, props: { state } })),
    render: (p) => (
      <ul class="cards pix-panel">
        <TripRow
          trip={FIRST_TRIP(p)}
          creature={CREATURES[0]}
          serverNow={NOW}
          busy={bool(p, 'busy')}
          onClaim={NOTHING}
          onDecide={NOTHING}
        />
      </ul>
    ),
  },
  {
    name: 'OutStrip',
    file: 'apps/activity/src/OutStrip.tsx',
    group: 'Creatures & game pieces',
    description:
      'The "out now" strip at the bottom of the phone map: a chip per trip with the explorer and a short status; tapping one opens that place.',
    controls: { count: { kind: 'number', min: 0, max: 4 } },
    defaults: { count: 4 },
    presets: [
      { name: 'Four trips at 390 px', props: { count: 4 } },
      { name: 'One trip', props: { count: 1 } },
      { name: 'None', props: { count: 0 } },
    ],
    render: (p) => (
      <OutStrip
        trips={STRIP_STATES.slice(0, num(p, 'count')).map((state, n) => tripIn(state, n))}
        creatures={CREATURES}
        serverNow={NOW}
        onOpen={NOTHING}
      />
    ),
  },
  {
    name: 'TripShelf',
    file: 'apps/activity/src/TripShelf.tsx',
    group: 'Creatures & game pieces',
    description:
      'The "Out exploring" shelf under the desktop map: a card per slot with the running trips first, then free slots; the header says what opens the next slot.',
    controls: {
      out: { kind: 'number', min: 0, max: 4 },
      slots: { kind: 'number', min: 1, max: 4 },
      locked: { kind: 'toggle' },
      busy: { kind: 'toggle' },
    },
    defaults: { out: 3, slots: 4, locked: true, busy: false },
    presets: [
      {
        name: '3 out, 1 free, next slot in the header (880 px)',
        props: { out: 3, slots: 4, locked: true },
      },
      { name: 'All four out', props: { out: 4, slots: 4, locked: false } },
      { name: 'One slot, one out', props: { out: 1, slots: 1, locked: true } },
      { name: 'Nobody out', props: { out: 0, slots: 2, locked: true } },
    ],
    render: (p) => {
      const out = Math.min(num(p, 'out'), num(p, 'slots'));
      return (
        <TripShelf
          trips={STRIP_STATES.slice(0, out).map((state, n) => tripIn(state, n))}
          creatures={CREATURES}
          slots={slotsOf(num(p, 'slots'), out, bool(p, 'locked'))}
          serverNow={NOW}
          busy={bool(p, 'busy')}
          onClaim={NOTHING}
          onDecide={NOTHING}
          onOpen={NOTHING}
        />
      );
    },
  },
];
