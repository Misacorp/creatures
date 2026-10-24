import { ACCOUNT_STATS } from '@creatures/game';
import { parseGameState } from '../../api';
import { parseProfile } from '../../expedition-parse';
import type { Profile } from '../../expedition-types';
import profileFixture from '../../fixtures/expedition-profile.json';
import stateOffer from '../../fixtures/expedition-state-offer.json';
import { JournalPage } from '../../home/JournalPage';
import { StatsPage } from '../../home/StatsPage';
import { PopoverHost } from '../../PopoverHost';
import { bool, str } from '../props';
import type { Entry } from '../types';

const NOTHING = () => undefined;
const MID = parseProfile(profileFixture);
const CREATURES = parseGameState(stateOffer).creatures;

const ACCOUNTS = ['new account', 'mid game', 'veteran'] as const;

/** A profile for each stage of a player: nothing yet, the fixture's early game, and a long-time player. */
function profileOf(account: string): Profile {
  if (account === 'new account') {
    return {
      ...MID,
      stats: Object.fromEntries(ACCOUNT_STATS.map((k) => [k, 0])),
      milestones: MID.milestones.map((m) => ({ ...m, value: 0, reached: false })),
      bonuses: { rarityBp: 0, partsBp: 0, offerBp: 0, xpBp: 0 },
      journal: {
        found: [],
        total: MID.journal.total,
        sets: MID.journal.sets.map((s) => ({ ...s, found: 0 })),
      },
      dungeon: { runs: 0, clears: 0, depth: 1, streak: 0 },
    };
  }
  if (account === 'veteran') {
    return {
      ...MID,
      stats: Object.fromEntries(ACCOUNT_STATS.map((k, i) => [k, 40 + i * 37])),
      milestones: MID.milestones.map((m) => ({ ...m, value: m.at, reached: true })),
      bonuses: { rarityBp: 100, partsBp: 100, offerBp: 100, xpBp: 100 },
      dungeon: { runs: 128, clears: 64, depth: 31, streak: 12 },
    };
  }
  return MID;
}

const statsPage: Entry = {
  name: 'StatsPage',
  file: 'apps/activity/src/home/StatsPage.tsx',
  group: 'Creatures & game pieces',
  description:
    'The Stats page, opened from the Stats pin on the Home board: "‹ Back" to Home at the top, then the player’s own numbers as a stat sheet grouped by area (Expeditions, Dungeon, Collection, Raid; a table each, in columns when there is room), then the milestones with their tiny permanent bonuses. No list of explorers (a creature’s expedition count is on its own page). A new stat is one row in `stats-view.ts`. The account control shows a new player (all zeros), the fixture’s early game and a long-time player.',
  controls: { account: { kind: 'select', options: ACCOUNTS } },
  defaults: { account: 'mid game' },
  presets: [
    { name: 'Mid game', props: {} },
    { name: 'New account', props: { account: 'new account' } },
    { name: 'Veteran', props: { account: 'veteran' } },
  ],
  render: (p) => (
    <PopoverHost onOpenHowTo={NOTHING}>
      <StatsPage
        key={str(p, 'account')}
        profile={profileOf(str(p, 'account'))}
        creatures={CREATURES}
        onBack={NOTHING}
      />
    </PopoverHost>
  ),
};

const journalPage: Entry = {
  name: 'JournalPage',
  file: 'apps/activity/src/home/JournalPage.tsx',
  group: 'Creatures & game pieces',
  description:
    'The Journal, a place of the Collection group (dock tray and rail). Opened from the dock it has no Back (the navigation is on screen, as on every place) and the HUD names it; opened from the Journal pin on the Home board it has "‹ Back" to Home at the top. The page is every page by place, found ones with their words, blanks for the rest. The account control shows a new player (no page found), the fixture’s early game and a long-time player; "Back" shows the pin’s way in.',
  controls: {
    account: { kind: 'select', options: ACCOUNTS },
    back: { kind: 'toggle' },
  },
  defaults: { account: 'mid game', back: false },
  presets: [
    { name: 'Mid game, from the dock (no Back)', props: {} },
    { name: 'Opened from the Home pin (Back to Home)', props: { back: true } },
    { name: 'New account', props: { account: 'new account' } },
  ],
  render: (p) => (
    <PopoverHost onOpenHowTo={NOTHING}>
      <JournalPage
        key={str(p, 'account')}
        profile={profileOf(str(p, 'account'))}
        {...(bool(p, 'back') ? { onBack: NOTHING } : {})}
      />
    </PopoverHost>
  ),
};

export const homePagesEntries: readonly Entry[] = [statsPage, journalPage];
