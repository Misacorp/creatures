import { useState } from 'preact/hooks';
import { Banner } from '../../Banner';
import { COACH_KEY, resetCoachSession } from '../../coach';
import { CoachMark } from '../../CoachMark';
import { Countdown } from '../../Countdown';
import { tierOf } from '../../countdown';
import { cssVars } from '../../css-vars';
import { Alert, type AlertLevel } from '../../ui/Alert';
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
  mire: 'var(--mire)',
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
    element: { kind: 'select', options: ['tide', 'ember', 'grove', 'spark', 'mire'] },
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
    'The one-time "Tap any tag to learn what it means" hint, with two real tags to try; "Got it" hides it for good. No screen shows it for now (the SHOW_COACH_MARK flag in coach.ts is off); this page still draws it.',
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

const LEVELS: readonly AlertLevel[] = ['info', 'success', 'warning', 'alert'];

const alert: Entry = {
  name: 'Alert',
  file: 'apps/activity/src/ui/Alert.tsx',
  group: 'Headings & banners',
  covers: ['ALERT_ICONS', 'ALERT_DISMISS_MS'],
  description:
    "A note in four levels (info, success, warning, alert): the level's icon on the left, an optional bold title, then the message on one line or several, inline after the title or under it. With an X it can be dismissed: it slides out in pixel steps and folds away. The X is centred on a single line of text and stays in the top right corner when there are more. The game's notice line, its errors and the full bag warning are alerts.",
  controls: {
    level: { kind: 'select', options: LEVELS },
    title: { kind: 'text', maxLength: 60 },
    text: { kind: 'text', maxLength: 300 },
    layout: { kind: 'select', options: ['inline', 'stacked'] },
    dismissible: { kind: 'toggle' },
    all: { kind: 'toggle' },
  },
  defaults: {
    level: 'success',
    title: '',
    text: 'You got your daily 20 Bait.',
    layout: 'inline',
    dismissible: true,
    all: false,
  },
  presets: [
    { name: 'One line, with an X', props: {} },
    {
      name: 'Several lines, with an X',
      props: {
        level: 'warning',
        title: 'Your bag is full.',
        text: '62 / 60. Gear you find on a dungeon run, an expedition or in the raid becomes parts until you dismiss or dismantle a few items in the Workshop.',
      },
    },
    {
      name: 'Title on its own line',
      props: {
        level: 'info',
        title: 'The raid starts on Sunday',
        text: 'Place your creatures on the board before the finale locks it.',
        layout: 'stacked',
        dismissible: false,
      },
    },
    { name: 'An error', props: { level: 'alert', text: 'The Workshop could not be loaded.' } },
    { name: 'All four levels', props: { all: true, title: 'Title.' } },
  ],
  render: (p) => {
    const one = (level: AlertLevel, key?: string) => {
      const title = str(p, 'title');
      return (
        <Alert
          key={key ?? `${level}-${str(p, 'text')}`}
          level={level}
          title={title === '' ? undefined : title}
          layout={str(p, 'layout') === 'stacked' ? 'stacked' : 'inline'}
          onDismiss={bool(p, 'dismissible') ? () => undefined : undefined}
        >
          {str(p, 'text')}
        </Alert>
      );
    };
    if (bool(p, 'all')) return <div>{LEVELS.map((level) => one(level, level))}</div>;
    const level = str(p, 'level');
    return one(LEVELS.find((l) => l === level) ?? 'info');
  },
};

export const headingEntries: readonly Entry[] = [
  pixelHeading,
  titlePlate,
  callout,
  alert,
  banner,
  coachMark,
  countdown,
];
