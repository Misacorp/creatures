import { bool, str } from '../props';
import type { Entry } from '../types';
import { VALLEY_STARTS, ValleyDemo } from '../valley-demo/ValleyDemo';

const valleyShell: Entry = {
  name: 'ValleyShell',
  file: 'apps/activity/src/valley/ValleyFrame.tsx',
  group: 'Controls',
  description:
    'The valley shell (the `VALLEY` flag, phase 4 step 1): the real HUD with the valley in place of the dock and the tab pages. The map of eleven places (west to east: Cave, Fairground, School, House, Paddock, Market, Forge, Bonfire, Arena, Visitor, Signpost) with the creature tray under it and the Places button (a flag, top left); a phone pans the map sideways and shows edge chips for places out of view. The seven open places (Cave, Fairground, House, Paddock, Forge, Arena, Signpost) open one of today\'s pages under "‹ Valley"; the four new ones (School, Bonfire, Visitor, Market) show their scene and one line of what they will be. `start` picks where it opens; tap around as in the game. Forge shows the Workshop on fixture data; the other pages are drawn by their own workbench pages, so they stay empty here.',
  controls: {
    start: { kind: 'select', options: VALLEY_STARTS },
    away: { kind: 'toggle' },
  },
  defaults: { start: 'valley', away: false },
  presets: [
    { name: 'The valley', props: {} },
    { name: 'The valley, with the away paper', props: { away: true } },
    { name: 'Forge, the Workshop inside', props: { start: 'forge' } },
    { name: 'House, the living room', props: { start: 'house' } },
    { name: 'School, not open yet', props: { start: 'school' } },
    { name: 'Bonfire, not open yet', props: { start: 'bonfire' } },
  ],
  render: (p) => (
    <ValleyDemo key={JSON.stringify(p)} start={str(p, 'start')} away={bool(p, 'away')} />
  ),
};

export const valleyShellEntries: readonly Entry[] = [valleyShell];
