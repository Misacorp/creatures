import { DEFAULT_BOARD_SETTINGS, IDLE_MODES, TILT_MODES } from '../../home/board';
import { HomeDemo, LAYOUTS } from '../home-demo/HomeDemo';
import { HOME_STATES } from '../home-sample';
import { bool, str } from '../props';
import type { Entry } from '../types';

const homePage: Entry = {
  name: 'HomePage',
  file: 'apps/activity/src/home/HomePage.tsx',
  group: 'Creatures & game pieces',
  description:
    'The Home page, the place the app opens on and the dock’s gold middle button: a notice board of papers pinned on cork. "Needs you" has a big button per place with something waiting (its picture, the reason, a pip); "Coming up" lists the next things on the clock with their real times (the raid week’s phases and finale included); "The valley today" is the sky and the Games lineup. With nothing waiting there is one calm line. Two options, kept in one small settings object (a future player setting). "Tilt": none (flush), still (the default: each paper leans a little, up to 1.5 degrees, a fixed lean per paper, neighbours lean different ways) or sway (the same lean, slowly rocking; still under reduced motion). "Idle": hide (the default: a place with nothing going on and nothing waiting gets no notice) or show (it gets a slim one-line notice under "Quiet places"). On a phone the living room is drawn at the top of the page; on a wide window it is the band under the HUD and the board sits beside the rail. Drawn in the real HUD and dock or rail, on fixture data with a fixed clock (Saturday 10:00 Helsinki). Two pins hang on the board between the notices and Coming up: the Journal as a small booklet and the Stats as a ruled ledger card, each with a one-line teaser; tapping one opens its page ("Teasers" off shows them as before the profile has loaded). "Raid schedule" off shows the page without the raid week’s times (the raid view did not load).',
  controls: {
    state: { kind: 'select', options: HOME_STATES },
    tilt: { kind: 'select', options: TILT_MODES },
    idle: { kind: 'select', options: IDLE_MODES },
    raid: { kind: 'toggle' },
    teasers: { kind: 'toggle' },
    layout: { kind: 'select', options: LAYOUTS },
  },
  defaults: {
    state: 'busy',
    tilt: 'still',
    idle: 'hide',
    raid: true,
    teasers: true,
    layout: 'auto',
  },
  presets: [
    { name: 'Busy (tilt still, idle hidden)', props: {} },
    { name: 'Nothing waiting', props: { state: 'nothing waiting' } },
    { name: 'Nothing going on, idle hidden', props: { state: 'nothing going on' } },
    { name: 'Nothing going on, idle shown', props: { state: 'nothing going on', idle: 'show' } },
    { name: 'Nothing waiting, idle shown', props: { state: 'nothing waiting', idle: 'show' } },
    { name: 'Tilt none', props: { tilt: 'none' } },
    { name: 'Tilt still', props: { tilt: 'still' } },
    { name: 'Tilt sway', props: { tilt: 'sway' } },
    { name: 'Crowded', props: { state: 'crowded' } },
    { name: 'Crowded, idle shown', props: { state: 'crowded', idle: 'show' } },
    { name: 'No raid schedule', props: { raid: false } },
    { name: 'Pins without teasers (profile not loaded)', props: { teasers: false } },
    { name: 'Pins, nothing waiting', props: { state: 'nothing waiting' } },
  ],
  render: (p) => (
    <HomeDemo
      key={JSON.stringify(p)}
      state={str(p, 'state')}
      raid={bool(p, 'raid')}
      teasers={
        bool(p, 'teasers')
          ? { journal: '12 / 45 pages found', stats: '48 trips, 9 dungeon clears' }
          : { journal: null, stats: null }
      }
      settings={{
        tilt: TILT_MODES.find((m) => m === str(p, 'tilt')) ?? DEFAULT_BOARD_SETTINGS.tilt,
        idle: IDLE_MODES.find((m) => m === str(p, 'idle')) ?? DEFAULT_BOARD_SETTINGS.idle,
      }}
      layout={str(p, 'layout')}
    />
  ),
};

export const homePageEntries: readonly Entry[] = [homePage];
