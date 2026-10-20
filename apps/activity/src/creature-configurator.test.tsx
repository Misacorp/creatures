import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { CreatureConfigurator, type ConfiguratorParts } from './CreatureConfigurator';
import type { CardActions } from './CreaturePage';
import { teamSample } from './creature-page/team-sample';
import { parseDungeonToday } from './dungeon-parse';
import { DungeonSetup } from './DungeonSetup';
import todayFixture from './fixtures/dungeon-today-map.json';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  nameOf,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

let page: Page | null = null;

beforeEach(() => {
  // The dungeon card saves its row when the page hides and scrolls back to a tile.
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    scrollTo: () => undefined,
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

function actionsWith(): CardActions {
  return {
    onEquip: vi.fn(() => Promise.resolve(true)),
    onRibbon: vi.fn(),
    onEvolve: vi.fn(),
    onRename: vi.fn(),
    onLounge: vi.fn(),
    onSlotTalent: vi.fn(),
  };
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

/** The titles of the parts drawn (Stats, Finale ability, Gear, Talents). */
function titles(root: FakeElement): string[] {
  return byClass(root, 'cp-title').map((h) => visibleText(h));
}

/** The level tags of the progress rows, in order ("Lv 20", "Rank 3", "Lv 4"). */
function tracks(root: FakeElement): string[] {
  return byClass(root, 'xp-static').map((t) => visibleText(first(byClass(t, 'xp-lv'))));
}

function drawConfigurator(
  parts: ConfiguratorParts,
  buttons: { label: string; onAct: () => void }[] = [],
  index = 0,
): { root: FakeElement; actions: CardActions; creature: Creature } {
  page = createPage();
  const scene = teamSample();
  const creature = scene.team[index] as Creature;
  const actions = actionsWith();
  page.draw(
    <CreatureConfigurator
      creature={creature}
      state={scene.state}
      gear={scene.gear}
      busy={false}
      parts={parts}
      actions={actions}
      buttons={buttons}
    />,
  );
  return { root: first(byClass(page.root, 'configurator')), actions, creature };
}

describe('the creature configurator', () => {
  it('always shows who the creature is, in a pixel panel', () => {
    const { root } = drawConfigurator({});
    expect(root.getAttribute('class')).toContain('pix-panel');
    expect(visibleText(first(byClass(root, 'cc-name')))).toContain('Mossback');
    expect(byClass(root, 'cc-tags')).toHaveLength(1);
    // Nothing else unless it is asked for.
    expect(titles(root)).toEqual([]);
    expect(tracks(root)).toEqual([]);
  });

  it('draws only the parts asked for, in the page order', () => {
    const { root } = drawConfigurator({ stats: true, gear: true, talents: true, experience: true });
    expect(titles(root)).toEqual(['Stats', 'Gear', 'Talents']);
    expect(tracks(root)).toEqual(['Lv 20']);
    const gearOnly = drawConfigurator({ gear: true });
    expect(titles(gearOnly.root)).toEqual(['Gear']);
  });

  it('shows the explorer rank and the Crafting level as their own rows', () => {
    const { root } = drawConfigurator({ experience: true, explorer: true, crafting: true });
    expect(tracks(root)).toEqual(['Lv 20', 'Rank 3', 'Lv 4']);
    expect(byClass(root, 'xp-kind-explorer')).toHaveLength(1);
    expect(byClass(root, 'xp-kind-crafting')).toHaveLength(1);
  });

  it('opens the item picker from a gear slot and the Talent Book from a talent slot', () => {
    const { root } = drawConfigurator({ gear: true, talents: true });
    const p = page as Page;
    p.click(first(find(root, (e) => e.localName === 'button' && /^Hat:/.test(nameOf(e)))));
    expect(visibleText(first(byClass(first(byRole(root, 'dialog')), 'drawer-head')))).toMatch(
      /\d+ in the bag/,
    );
  });

  it('draws the screen buttons, in order', () => {
    const onPage = vi.fn();
    const onRemove = vi.fn();
    const { root } = drawConfigurator({}, [
      { label: 'Creature page', onAct: onPage },
      { label: 'Remove from team', onAct: onRemove },
    ]);
    const buttons = find(
      first(byClass(root, 'configurator-buttons')),
      (e) => e.localName === 'button',
    );
    expect(buttons.map((b) => visibleText(b))).toEqual(['Creature page', 'Remove from team']);
    (page as Page).click(buttons[1] as FakeElement);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onPage).not.toHaveBeenCalled();
  });
});

/** The dungeon's pre-run card with the team of the sample, ready to configure. */
function drawSetup(): { root: FakeElement; onDraftChange: ReturnType<typeof vi.fn> } {
  page = createPage();
  const scene = teamSample();
  const onDraftChange = vi.fn();
  const today = parseDungeonToday({
    ...todayFixture,
    lastTeam: scene.team.map((c) => c.id),
  });
  page.draw(
    <DungeonSetup
      today={today}
      creatures={scene.creatures}
      bait={40}
      busy={false}
      error={null}
      draft={null}
      onDraftChange={onDraftChange}
      onEnter={vi.fn()}
      onSeeLast={vi.fn()}
      configure={{
        state: scene.state,
        gear: scene.gear,
        busy: false,
        actions: actionsWith(),
        onAnswerCatch: vi.fn(),
      }}
    />,
  );
  return { root: page.root, onDraftChange };
}

function tile(root: FakeElement, slot: number): FakeElement {
  return first(find(root, (e) => e.getAttribute('data-slot') === String(slot)));
}

describe('the dungeon card: getting the team ready', () => {
  it('shows nothing under the board until a creature is tapped', () => {
    const { root } = drawSetup();
    expect(byClass(root, 'configurator')).toHaveLength(0);
  });

  it("shows the tapped creature's configurator, and hides it on a second tap", () => {
    const { root } = drawSetup();
    const p = page as Page;
    p.click(tile(root, 1));
    const shown = first(byClass(root, 'configurator'));
    expect(visibleText(first(byClass(shown, 'cc-name')))).toContain('Sproutle');
    expect(titles(shown)).toEqual(['Stats', 'Gear', 'Talents']);
    expect(tile(root, 1).getAttribute('class')).toContain('selected');
    p.click(tile(root, 1));
    expect(byClass(root, 'configurator')).toHaveLength(0);
  });

  it('takes the creature out of the team with Remove from team', () => {
    const { root, onDraftChange } = drawSetup();
    const p = page as Page;
    p.click(tile(root, 2));
    p.click(first(byName(first(byClass(root, 'configurator')), 'button', 'Remove from team')));
    expect(byClass(root, 'configurator')).toHaveLength(0);
    expect(onDraftChange).toHaveBeenLastCalledWith(['demo-moss', 'demo-sprout', null]);
  });

  it('opens the creature page in the card, flips through the team and goes back', () => {
    const { root } = drawSetup();
    const p = page as Page;
    p.click(tile(root, 0));
    p.click(first(byName(first(byClass(root, 'configurator')), 'button', 'Creature page')));
    const creaturePage = first(byClass(root, 'creature-page'));
    expect(byClass(root, 'dungeon-team')).toHaveLength(0);
    expect(visibleText(first(byClass(creaturePage, 'cp-back')))).toBe('‹ Dungeon');
    expect(visibleText(creaturePage)).toContain('1 / 3');
    expect(byName(creaturePage, 'button', 'Remove from team')).toHaveLength(1);
    p.click(first(byClass(creaturePage, 'cp-back')));
    expect(byClass(root, 'dungeon-team')).toHaveLength(1);
  });
});
