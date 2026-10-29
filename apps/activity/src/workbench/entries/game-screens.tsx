import { LOOKS } from '../../looks';
// The looks' stylesheets are not in the game's index.css; the workbench loads them here (after it).
import '../../looks-styles';
import { DUNGEON_STATES, GameScreens, SCREENS } from '../game-screens/GameScreens';
import { str } from '../props';
import type { Entry } from '../types';

const gameScreens: Entry = {
  name: 'GameScreens',
  file: 'apps/activity/src/workbench/game-screens/GameScreens.tsx',
  group: 'Controls',
  description:
    "Every main screen of the game in the game's real frame (the HUD, the living room band on a wide window, the dock, bar or rail, and the screen), on fixture data, under a chosen look (an app-wide visual style: `data-look` on the page). For screenshots: `node scripts/screens.mjs` shoots every screen at phone and desktop sizes; open `workbench.html?frame=1&bare=1#c=GameScreens` in a window of the size you want to see it as the game sees it. The Raid tab is composed by hand from its parts (the timeline, the boss, the roster) because the real one loads from the server; the Dungeon shows a run in progress or the setup card.",
  controls: {
    screen: { kind: 'select', options: SCREENS },
    look: { kind: 'select', options: LOOKS },
    dungeonState: { kind: 'select', options: DUNGEON_STATES },
  },
  defaults: { screen: 'home', look: 'current', dungeonState: 'mid-run' },
  presets: [
    ...SCREENS.map((screen) => ({ name: screen, props: { screen } })),
    { name: 'dungeon setup', props: { screen: 'dungeon', dungeonState: 'setup' } },
  ],
  render: (p) => (
    <GameScreens
      key={`${str(p, 'screen')}-${str(p, 'dungeonState')}`}
      screen={str(p, 'screen')}
      look={str(p, 'look')}
      dungeon={str(p, 'dungeonState')}
    />
  ),
};

export const gameScreensEntries: readonly Entry[] = [gameScreens];
