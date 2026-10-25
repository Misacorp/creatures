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
    'The Home page, the place the app opens on and the dock’s gold middle button: a notice board of papers pinned on cork. "Needs you" has a big button per place with something waiting (its picture, the reason, a pip); "Coming up" lists the next things on the clock with their real times (the raid week’s phases and finale included); "The valley today" is the sky and the Games lineup. With nothing waiting there is one calm line. Two options, kept in one small settings object (a future player setting). "Tilt": none (the default: every paper flush) or still (each paper leans a little, up to 1.5 degrees, a fixed lean per paper, neighbours lean different ways; an old saved "sway" loads as still). "Idle": hide (the default: a place with nothing going on and nothing waiting gets no notice) or show (it gets a slim one-line notice under "Quiet places"). On a phone the living room is drawn at the top of the page; on a wide window it is the band under the HUD and the board sits beside the rail. Drawn in the real HUD and dock or rail, on fixture data with a fixed clock (Saturday 10:00 Helsinki). The Creatures notice (the place of the same name in "Needs you") says what a creature can do now from the server’s facts: one creature by name ("Splashet can evolve", "... can earn its Bronze Ribbon", "... has a talent slot to fill"), a count ("3 creatures need you") for several, joined with the waiting catches when there are any; it opens Creatures with its "Needs you" filter on. A round pushpin badge in the board’s top right corner is the player’s starter creature (the oldest owned creature of a starter line; Sproutle when none), a 44 px button named "Your creatures" above the papers that opens Creatures. Left of it a second round pin with a "?" (the HUD help button’s mark), also 44 px at least, named "How to play", opens How to play; "Needs you" stops short of the two pins. The Journal and the Stats are places of the Collection group, not pins on the board. The board’s text is one step smaller than the pages’ so the notices stay short. "Raid schedule" off shows the page without the raid week’s times (the raid view did not load).',
  controls: {
    state: { kind: 'select', options: HOME_STATES },
    tilt: { kind: 'select', options: TILT_MODES },
    idle: { kind: 'select', options: IDLE_MODES },
    raid: { kind: 'toggle' },
    layout: { kind: 'select', options: LAYOUTS },
  },
  defaults: {
    state: 'busy',
    tilt: 'none',
    idle: 'hide',
    raid: true,
    layout: 'auto',
  },
  presets: [
    { name: 'Busy (flush, idle hidden; one creature can evolve)', props: {} },
    { name: 'Nothing waiting', props: { state: 'nothing waiting' } },
    { name: 'Nothing going on, idle hidden', props: { state: 'nothing going on' } },
    { name: 'Nothing going on, idle shown', props: { state: 'nothing going on', idle: 'show' } },
    { name: 'Nothing waiting, idle shown', props: { state: 'nothing waiting', idle: 'show' } },
    { name: 'Tilt none', props: { tilt: 'none' } },
    { name: 'Tilt still', props: { tilt: 'still' } },
    { name: 'Crowded (catches and 3 creatures need you)', props: { state: 'crowded' } },
    { name: 'Crowded, idle shown', props: { state: 'crowded', idle: 'show' } },
    { name: 'No raid schedule', props: { raid: false } },
  ],
  render: (p) => (
    <HomeDemo
      key={JSON.stringify(p)}
      state={str(p, 'state')}
      raid={bool(p, 'raid')}
      settings={{
        tilt: TILT_MODES.find((m) => m === str(p, 'tilt')) ?? DEFAULT_BOARD_SETTINGS.tilt,
        idle: IDLE_MODES.find((m) => m === str(p, 'idle')) ?? DEFAULT_BOARD_SETTINGS.idle,
      }}
      layout={str(p, 'layout')}
    />
  ),
};

export const homePageEntries: readonly Entry[] = [homePage];
