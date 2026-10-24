import { useMemo } from 'preact/hooks';
import type { Creature } from '../../api';
import { Collection } from '../../Collection';
import { CreatureIcon } from '../../CreatureIcon';
import type { CardActions } from '../../CreaturePage';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleRoster } from '../../creature-card-sample';
import { creatureName } from '../../game';
import { GamesTab, type GamesApi } from '../../games/GamesTab';
import { PopoverHost } from '../../PopoverHost';
import type { Tab } from '../../tabs';
import { DataTable } from '../../ui/DataTable';
import { SidePanel } from '../../ui/SidePanel';
import { expeditionWorldEntries } from '../entries/expedition-world';
import { GAMES_SELF_ID, gamesRoster, gamesView } from '../games-tab-sample';
import { tabLabel } from './nav-data';

/**
 * The real screens the navigation mock-ups sit in front of: the Creatures tab and the Games tab, both on
 * fixture data (the same samples as their workbench pages), and a side panel for each. Other tabs show a
 * plain stand-in; the mock-ups are about the frame, not those screens.
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
  setEntry: () => Promise.reject(new Error('Mock-up: nothing is sent.')),
  buy: () => Promise.reject(new Error('Mock-up: nothing is sent.')),
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

/** Whether a screen brings its own side panel (so the frame must not add a second one). */
export function ownsPanel(tab: Tab): boolean {
  return tab === 'expeditions';
}

/** The screen of a tab: the real ones, or a stand-in for the rest. */
export function NavScreen({ tab, wide }: { tab: Tab; wide: boolean }) {
  if (tab === 'collection') return <CreaturesScreen />;
  if (tab === 'games') return <GamesScreen />;
  if (tab === 'expeditions') return <ExpeditionsScreen wide={wide} />;
  return (
    <div class="nm-standin pix-panel">
      <h2>{tabLabel(tab)}</h2>
      <p class="muted">This screen is not drawn in the mock-up.</p>
    </div>
  );
}

/** The creature the Creatures side panel shows (the first of the sample roster). */
function PanelCreature() {
  const creature: Creature | undefined = sampleRoster(1)[0];
  if (creature === undefined) return null;
  return (
    <>
      <p class="nm-panel-who">
        <CreatureIcon creature={creature} />
        <span class="pix">{creatureName(creature)}</span>
        <span class="lvl">Lv {creature.level}</span>
      </p>
      <DataTable
        rows={[
          { label: 'HP', value: String(creature.stats.hp) },
          { label: 'Attack', value: String(creature.stats.atk) },
          { label: 'Speed', value: String(creature.stats.spd) },
          { label: 'Explorer rank', value: '3' },
        ]}
      />
    </>
  );
}

/** What the side panel shows beside a tab's screen on a wide window. */
export function NavPanel({ tab }: { tab: Tab }) {
  if (tab === 'collection') {
    return (
      <SidePanel
        title="Selected creature"
        titleId="nm-panel-title"
        footer={
          <button type="button" class="primary">
            Open the creature page
          </button>
        }
      >
        <PanelCreature />
      </SidePanel>
    );
  }
  if (tab === 'games') {
    return (
      <SidePanel title="Today's show" titleId="nm-panel-title">
        <DataTable
          rows={[
            { label: 'Events entered', value: '1 / 4' },
            { label: 'Show starts in', value: '3h 12m' },
            { label: 'Medals', value: '7' },
            { label: 'Best place', value: '2nd', total: true },
          ]}
        />
      </SidePanel>
    );
  }
  return (
    <SidePanel title={tabLabel(tab)} titleId="nm-panel-title">
      <p class="muted">Details of the thing you picked appear here.</p>
    </SidePanel>
  );
}
