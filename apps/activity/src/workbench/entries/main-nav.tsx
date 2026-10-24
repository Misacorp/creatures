import { LAYOUTS, MainNavMockups, OPTIONS, SCREENS } from '../nav-mockups/MainNavMockups';
import { str } from '../props';
import type { Entry } from '../types';

const mainNav: Entry = {
  name: 'MainNavMockups',
  file: 'apps/activity/src/workbench/nav-mockups/MainNavMockups.tsx',
  group: 'Controls',
  description:
    'Design mock-ups (dev only, not in the game) of a new main navigation for the six places: option 1 is a game dock at the bottom of a phone with a HUD on top and a left rail on desktop, option 2 makes the valley the menu (tap a landmark to go in, a Valley button comes back), and option 3 groups the places into four big tabs with an Adventure switch. Each shows a real screen behind it (Creatures, Games or Expeditions on fixture data) with the alert pips, at phone width and as the wide map-and-side-panel frame. Use the full width for the desktop presets and 360 or 390 for the phone.',
  controls: {
    option: { kind: 'select', options: OPTIONS },
    screen: { kind: 'select', options: SCREENS },
    layout: { kind: 'select', options: LAYOUTS },
  },
  defaults: { option: OPTIONS[0], screen: 'default', layout: 'auto' },
  presets: [
    { name: 'Option 1: dock and rail', props: { option: OPTIONS[0] } },
    { name: 'Option 1: on the Games screen', props: { option: OPTIONS[0], screen: 'games' } },
    { name: 'Option 2: the valley', props: { option: OPTIONS[1] } },
    { name: 'Option 2: inside Creatures', props: { option: OPTIONS[1], screen: 'creatures' } },
    { name: 'Option 3: four big tabs', props: { option: OPTIONS[2] } },
    { name: 'Option 3: Adventure', props: { option: OPTIONS[2], screen: 'expeditions' } },
  ],
  render: (p) => (
    <MainNavMockups
      key={JSON.stringify(p)}
      option={str(p, 'option')}
      screen={str(p, 'screen')}
      layout={str(p, 'layout')}
    />
  ),
};

export const mainNavEntries: readonly Entry[] = [mainNav];
