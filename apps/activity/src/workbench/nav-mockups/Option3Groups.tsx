import { useState } from 'preact/hooks';
import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import type { Tab } from '../../tabs';
import { WideLayout } from '../../ui/WideLayout';
import { ADVENTURE, MOCK_ALERTS, tabLabel } from './nav-data';
import { HudTools, NavIcon, NavPip } from './NavParts';
import { NavPanel, NavScreen, ownsPanel } from './NavScreens';

/**
 * Option 3, "Four big tabs": the six places are grouped into four. Creatures, Workshop and Games stay
 * as they are; Expeditions, Dungeon and Raid, the three places where creatures go out, become one
 * "Adventure" tab with a small switch under it. Four tabs fit a 360 px phone with their words, at a
 * comfortable size, and the bar stays at the top as it is today. On a wide window the same bar becomes
 * the top frame (title, tabs, currencies in one row), as the roadmap's app-wide frame describes.
 */

type Group = 'collection' | 'workshop' | 'adventure' | 'games';

interface GroupDef {
  id: Group;
  label: string;
  /** The glyph of the tab (Adventure borrows the compass of Expeditions). */
  tab: Tab;
}

const GROUPS: readonly GroupDef[] = [
  { id: 'collection', label: 'Creatures', tab: 'collection' },
  { id: 'workshop', label: 'Workshop', tab: 'workshop' },
  { id: 'adventure', label: 'Adventure', tab: 'expeditions' },
  { id: 'games', label: 'Games', tab: 'games' },
];

/** A group has a pip when any of its places has one. */
function groupHasPip(group: Group): boolean {
  if (group === 'adventure') return ADVENTURE.some((t) => MOCK_ALERTS[t] !== null);
  return MOCK_ALERTS[group] !== null;
}

function groupOf(tab: Tab): Group {
  return ADVENTURE.includes(tab) ? 'adventure' : (tab as Group);
}

function PrimaryTabs({ current, onPick }: { current: Group; onPick: (g: Group) => void }) {
  return (
    <nav class="nm-primary" aria-label="Sections">
      {GROUPS.map((g) => {
        const active = g.id === current;
        return (
          <button
            key={g.id}
            type="button"
            class={active ? 'nm-ptab active' : 'nm-ptab'}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              onPick(g.id);
            }}
          >
            <NavIcon tab={g.tab} active={active} scale={3} />
            <span class="nm-ptab-word">{g.label}</span>
            {groupHasPip(g.id) && <span class="tab-pip" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}

/** The switch under the Adventure tab: the three places where creatures go out. */
function AdventureSwitch({ current, onPick }: { current: Tab; onPick: (t: Tab) => void }) {
  return (
    <div class="nm-sub" role="tablist" aria-label="Adventure">
      {ADVENTURE.map((t) => {
        const active = t === current;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            class={active ? 'nm-sub-btn active' : 'nm-sub-btn'}
            onClick={() => {
              onPick(t);
            }}
          >
            <Sprite
              sprite={glyphOrUnknown(
                t === 'expeditions' ? 'compass' : t === 'dungeon' ? 'door' : 'blade',
              )}
              scale={2}
              class="nm-icon"
              {...(active ? { palette: { w: '#0d0a1a', m: '#0d0a1a' } } : {})}
            />
            <span>{tabLabel(t)}</span>
            <NavPip alerts={MOCK_ALERTS} tab={t} />
          </button>
        );
      })}
    </div>
  );
}

export function Option3Groups({ wide, start }: { wide: boolean; start: Tab }) {
  const [tab, setTab] = useState<Tab>(start);
  const group = groupOf(tab);
  const pick = (g: Group): void => {
    setTab(g === 'adventure' ? (ADVENTURE.includes(tab) ? tab : 'expeditions') : g);
  };
  const sub = group === 'adventure' && <AdventureSwitch current={tab} onPick={setTab} />;
  if (wide) {
    return (
      <div class="nm nm-wide-top nm-o3">
        <header class="nm-topbar">
          <h1 class="nm-topbar-title pix">Leet Creatures</h1>
          <PrimaryTabs current={group} onPick={pick} />
          <HudTools />
        </header>
        {sub}
        <div class="nm-scroll">
          {ownsPanel(tab) ? (
            <NavScreen tab={tab} wide />
          ) : (
            <WideLayout wide main={<NavScreen tab={tab} wide />} panel={<NavPanel tab={tab} />} />
          )}
        </div>
      </div>
    );
  }
  return (
    <div class="nm nm-phone-top nm-o3">
      <header class="nm-hud">
        <h1 class="nm-hud-title pix">Leet Creatures</h1>
        <HudTools />
      </header>
      <PrimaryTabs current={group} onPick={pick} />
      {sub}
      <div class="nm-scroll">
        <NavScreen tab={tab} wide={false} />
      </div>
    </div>
  );
}
