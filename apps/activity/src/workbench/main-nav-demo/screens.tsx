import { useMemo } from 'preact/hooks';
import { Collection } from '../../Collection';
import type { CardActions } from '../../CreaturePage';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleRoster } from '../../creature-card-sample';
import { GamesTab, type GamesApi } from '../../games/GamesTab';
import { PopoverHost } from '../../PopoverHost';
import { expeditionWorldEntries } from '../entries/expedition-world';
import { GAMES_SELF_ID, gamesRoster, gamesView } from '../games-tab-sample';

/**
 * The real screens the main navigation's workbench page sits in front of: Creatures, Games and Expeditions,
 * all on fixture data (the same samples as their own workbench pages). Other places show a plain stand-in:
 * the page is about the frame, not those screens.
 */

const NOTHING = () => undefined;

const CARD_ACTIONS: CardActions = {
  onEquip: () => Promise.resolve(true),
  onRibbon: NOTHING,
  onEvolve: NOTHING,
  onRename: NOTHING,
  onLounge: NOTHING,
  onSlotTalent: NOTHING,
};

const CATCH_ACTIONS = { chooseMany: () => Promise.resolve(true) };

const GAMES_API: GamesApi = {
  setEntry: () => Promise.reject(new Error('Workbench: nothing is sent.')),
  buy: () => Promise.reject(new Error('Workbench: nothing is sent.')),
};

function CreaturesScreen() {
  const state = useMemo(() => ({ ...SAMPLE_STATE, creatures: sampleRoster(9), pending: [] }), []);
  return (
    <PopoverHost onOpenHowTo={NOTHING}>
      <Collection
        state={state}
        gear={SAMPLE_GEAR}
        busy={false}
        catchActions={CATCH_ACTIONS}
        {...CARD_ACTIONS}
      />
    </PopoverHost>
  );
}

function GamesScreen() {
  const start = useMemo(() => gamesView('entries: one entered'), []);
  const roster = useMemo(gamesRoster, []);
  return (
    <PopoverHost onOpenHowTo={NOTHING}>
      <GamesTab
        view={start.view}
        failed={false}
        creatures={roster}
        selfId={GAMES_SELF_ID}
        offset={start.offset}
        onView={NOTHING}
        onReload={NOTHING}
        onPurchased={NOTHING}
        api={GAMES_API}
      />
    </PopoverHost>
  );
}

/** The Expeditions screen is drawn by its workbench page (a world map with its own side panel on a wide window). */
function ExpeditionsScreen({ wide }: { wide: boolean }) {
  const page = expeditionWorldEntries[0];
  if (page === undefined) return null;
  return <>{page.render({ ...page.defaults, layout: wide ? 'desktop' : 'phone' })}</>;
}

/** The screen of a place: the real ones, or a stand-in for the rest. */
export function DemoScreen({
  place,
  label,
  wide,
}: {
  place: string;
  label: string;
  wide: boolean;
}) {
  if (place === 'collection') return <CreaturesScreen />;
  if (place === 'games') return <GamesScreen />;
  if (place === 'expeditions') return <ExpeditionsScreen wide={wide} />;
  return (
    <div class="nd-standin pix-panel">
      <h2>{label}</h2>
      <p class="muted">This screen is not drawn on this page.</p>
    </div>
  );
}
