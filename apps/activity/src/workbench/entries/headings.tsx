import { useState } from 'preact/hooks';
import { Banner } from '../../Banner';
import { COACH_KEY, resetCoachSession } from '../../coach';
import { CoachMark } from '../../CoachMark';
import { Countdown } from '../../Countdown';
import { tierOf } from '../../countdown';
import { cssVars } from '../../css-vars';
import { Callout } from '../../ui/Callout';
import { PixelHeading } from '../../ui/PixelHeading';
import { TitlePlate } from '../../ui/TitlePlate';
import { DESTINATION_IDS, NONE, SPECIES_IDS, creatureInfoFor, speciesLabel } from '../data';
import { bool, num, str } from '../props';
import type { Entry } from '../types';

const ELEMENT_COLOURS: Readonly<Record<string, string>> = {
  tide: 'var(--tide)',
  ember: 'var(--ember)',
  grove: 'var(--grove)',
  spark: 'var(--spark)',
};

const pixelHeading: Entry = {
  name: 'PixelHeading',
  file: 'apps/activity/src/ui/PixelHeading.tsx',
  group: 'Headings & banners',
  description:
    "Big pixel lettering for a title that stands on its own: a boss's name, the room banner, the round intro. Gold or red, with an outline or drop shadow so it reads on any picture.",
  controls: {
    text: { kind: 'text', maxLength: 60 },
    tone: { kind: 'select', options: ['gold', 'bad'] },
    outline: { kind: 'select', options: ['ink', 'ink-drop', 'element-drop'] },
    size: { kind: 'select', options: [NONE, 'l', 'm'] },
    as: { kind: 'select', options: ['p', 'h3', 'span'] },
    element: { kind: 'select', options: ['tide', 'ember', 'grove', 'spark'] },
  },
  defaults: {
    text: 'Storm Sovereign',
    tone: 'gold',
    outline: 'ink-drop',
    size: 'm',
    as: 'p',
    element: 'spark',
  },
  presets: [
    { name: 'Boss name', props: {} },
    { name: 'Room banner (large)', props: { text: 'Room 2', size: 'l' } },
    { name: 'Defeat (red)', props: { text: 'Defeated', tone: 'bad', size: 'l' } },
    {
      name: 'Element glow',
      props: { outline: 'element-drop', element: 'ember', text: 'Cinder Wyrm' },
    },
    { name: 'Long name', props: { text: 'The Extremely Long Named Guardian of the Hollow' } },
  ],
  render: (p) => {
    const as = str(p, 'as');
    const size = str(p, 'size');
    const outline = str(p, 'outline');
    return (
      <div ref={cssVars({ '--elem': ELEMENT_COLOURS[str(p, 'element')] ?? 'var(--gold)' })}>
        <PixelHeading
          as={as === 'h3' || as === 'span' ? as : 'p'}
          tone={str(p, 'tone') === 'bad' ? 'bad' : 'gold'}
          outline={outline === 'ink' || outline === 'element-drop' ? outline : 'ink-drop'}
          {...(size === 'l' || size === 'm' ? { size } : {})}
        >
          {str(p, 'text')}
        </PixelHeading>
      </div>
    );
  },
};

const titlePlate: Entry = {
  name: 'TitlePlate',
  file: 'apps/activity/src/ui/TitlePlate.tsx',
  group: 'Headings & banners',
  description:
    'A name on a plate with a gold frame, like the title of a playing card, with an optional small count at its end ("2 / 7"); it names each destination in the catalogue.',
  controls: {
    title: { kind: 'text', maxLength: 80 },
    count: { kind: 'text', maxLength: 12 },
    as: { kind: 'select', options: ['h3', 'h4'] },
    live: { kind: 'toggle' },
  },
  defaults: { title: 'Moonlit Reef', count: '2 / 7', as: 'h4', live: false },
  presets: [
    { name: 'With count', props: {} },
    { name: 'No count', props: { count: '' } },
    {
      name: 'Very long name',
      props: { title: 'The Extraordinarily Long-Named Tidepools of Everlasting Echoes' },
    },
  ],
  render: (p) => (
    <TitlePlate
      title={str(p, 'title')}
      {...(str(p, 'count') === '' ? {} : { count: str(p, 'count') })}
      as={str(p, 'as') === 'h3' ? 'h3' : 'h4'}
      live={bool(p, 'live')}
    />
  ),
};

const callout: Entry = {
  name: 'Callout',
  file: 'apps/activity/src/ui/Callout.tsx',
  group: 'Headings & banners',
  description:
    'A note in a gold frame for something good that just happened, such as a new expedition slot or a rank-up gift.',
  controls: {
    text: { kind: 'text', maxLength: 120 },
    as: { kind: 'select', options: ['div', 'p'] },
  },
  defaults: { text: 'You unlocked a third expedition slot!', as: 'div' },
  presets: [
    { name: 'Short', props: {} },
    {
      name: 'Long',
      props: {
        text: 'Rank up! Moonlit Reef is open, and a gift of 50 Bait is waiting for you in the Workshop.',
      },
    },
  ],
  render: (p) => <Callout as={str(p, 'as') === 'p' ? 'p' : 'div'}>{str(p, 'text')}</Callout>,
};

const banner: Entry = {
  name: 'Banner',
  file: 'apps/activity/src/Banner.tsx',
  group: 'Headings & banners',
  description:
    "A destination's pixel-art banner that fits the space, with an optional creature walking across it as an expedition progresses; it is on the catalogue and on a running trip.",
  controls: {
    destination: { kind: 'select', options: DESTINATION_IDS },
    walker: { kind: 'toggle' },
    progress: { kind: 'number', min: 0, max: 100 },
    species: { kind: 'select', options: SPECIES_IDS },
    shiny: { kind: 'toggle' },
    tappable: { kind: 'toggle' },
  },
  defaults: {
    destination: 'tidepools',
    walker: true,
    progress: 40,
    species: 'splashet',
    shiny: false,
    tappable: true,
  },
  presets: [
    { name: 'No walker', props: { walker: false } },
    { name: 'Just left', props: { progress: 0 } },
    { name: 'Halfway', props: { progress: 50 } },
    { name: 'Arrived', props: { progress: 100 } },
    { name: 'Shiny walker', props: { shiny: true } },
  ],
  render: (p) => (
    <Banner
      destination={str(p, 'destination')}
      {...(bool(p, 'walker')
        ? {
            walker: {
              species: str(p, 'species'),
              shiny: bool(p, 'shiny'),
              fraction: num(p, 'progress') / 100,
              info: bool(p, 'tappable')
                ? creatureInfoFor(str(p, 'species'), speciesLabel(str(p, 'species')), 8)
                : null,
              id: 'wb-walker',
            },
          }
        : {})}
    />
  ),
};

function CoachDemo() {
  const [again, setAgain] = useState(0);
  return (
    <>
      <CoachMark key={again} />
      <p>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.removeItem(COACH_KEY);
            } catch {
              // Storage can be blocked; the session flag below is enough here.
            }
            resetCoachSession();
            setAgain((n) => n + 1);
          }}
        >
          Show the hint again
        </button>
      </p>
    </>
  );
}

const coachMark: Entry = {
  name: 'CoachMark',
  file: 'apps/activity/src/CoachMark.tsx',
  group: 'Headings & banners',
  description:
    'The one-time "Tap any tag to learn what it means" hint at the top of the Raid tab, with two real tags to try; "Got it" hides it for good.',
  controls: {},
  defaults: {},
  presets: [],
  render: () => <CoachDemo />,
};

const countdown: Entry = {
  name: 'Countdown',
  file: 'apps/activity/src/Countdown.tsx',
  group: 'Headings & banners',
  description:
    'The big number that counts down over the fight stage in the last 30 seconds before a live finale starts, then says "FIGHT!"; it turns orange and then red and shakes near the end.',
  controls: {
    phase: { kind: 'select', options: ['count', 'fight'] },
    seconds: { kind: 'number', min: 1, max: 30 },
  },
  defaults: { phase: 'count', seconds: 20 },
  presets: [
    { name: '20 (calm)', props: { seconds: 20 } },
    { name: '8 (fast)', props: { seconds: 8 } },
    { name: '3 (final)', props: { seconds: 3 } },
    { name: 'FIGHT!', props: { phase: 'fight' } },
  ],
  render: (p) => {
    const n = num(p, 'seconds');
    return (
      <div class="wb-countdown-stage">
        <Countdown
          view={
            str(p, 'phase') === 'fight'
              ? { phase: 'fight' }
              : { phase: 'count', n, tier: tierOf(n) }
          }
        />
      </div>
    );
  },
};

export const headingEntries: readonly Entry[] = [
  pixelHeading,
  titlePlate,
  callout,
  banner,
  coachMark,
  countdown,
];
