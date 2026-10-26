import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardActions } from './CreaturePage';
import { teamSample } from './creature-page/team-sample';
import { Placement } from './Placement';
import type { RaidView, RowSlotView } from './raid-api';
import type { Intent } from './raid-slots';
import { byClass, byName, createPage, find, visibleText, FakeElement, type Page } from './test-dom';

let page: Page | null = null;

beforeEach(() => {
  // The board scrolls itself to your lane; the fake DOM has no layout.
  Reflect.set(FakeElement.prototype, 'scrollTo', () => undefined);
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({
    top: 0,
    left: 0,
    width: 0,
  }));
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(FakeElement.prototype, 'scrollTo');
  Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
});

type Party = NonNullable<RaidView['party']>;

const tile = (
  slot: number,
  creature: NonNullable<RowSlotView['creature']> | null,
): RowSlotView => ({ slot, zone: slot < 1 ? 'front' : slot < 2 ? 'middle' : 'back', creature });

const party: Party = {
  party: 1,
  rowLength: 3,
  row: [
    tile(0, {
      ownerName: 'Misa',
      species: 'mossback',
      name: 'Mossback',
      level: 20,
      mine: true,
      creatureId: 'demo-moss',
    }),
    tile(1, {
      ownerName: 'Kim',
      species: 'splashet',
      name: 'Splashet',
      level: 5,
      mine: false,
    }),
    tile(2, null),
  ],
  guests: false,
  bossHp: null,
  adaptation: null,
  results: [],
  readiness: null,
};

const actions: CardActions = {
  onEquip: vi.fn(() => Promise.resolve(true)),
  onRibbon: vi.fn(),
  onEvolve: vi.fn(),
  onRename: vi.fn(),
  onLounge: vi.fn(),
  onSlotTalent: vi.fn(),
};

function draw(canEdit: boolean): {
  root: FakeElement;
  onIntent: ReturnType<typeof vi.fn>;
  onOpenPage: ReturnType<typeof vi.fn>;
} {
  page = createPage();
  const scene = teamSample();
  const onIntent = vi.fn<(intent: Intent) => void>();
  const onOpenPage = vi.fn<(id: string) => void>();
  page.draw(
    <Placement
      party={party}
      creatures={[]}
      canEdit={canEdit}
      busy={false}
      rosterNames={['Misa', 'Kim']}
      turnOrder="left_to_right"
      onIntent={onIntent}
      configure={{
        state: scene.state,
        gear: scene.gear,
        busy: false,
        actions,
        onAnswerCatch: vi.fn(),
      }}
      owned={scene.creatures}
      onOpenPage={onOpenPage}
    />,
  );
  return { root: page.root, onIntent, onOpenPage };
}

function slotButton(root: FakeElement, slot: number): FakeElement {
  const [el] = find(root, (e) => e.getAttribute('data-slot') === String(slot));
  if (el === undefined) throw new Error('no such slot');
  return el;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

describe('the Raid Roster: getting your creatures ready', () => {
  it("shows your creature's configurator under the board, and hides it on a second tap", () => {
    const { root } = draw(true);
    const p = page as Page;
    p.click(slotButton(root, 0));
    const shown = first(byClass(root, 'configurator'));
    expect(visibleText(first(byClass(shown, 'cc-name')))).toContain('Mossback');
    expect(byClass(shown, 'gear-list')).toHaveLength(1);
    expect(slotButton(root, 0).getAttribute('class')).toContain('selected');
    p.click(slotButton(root, 0));
    expect(byClass(root, 'configurator')).toHaveLength(0);
  });

  it("opens the creature's page and takes it off the board", () => {
    const { root, onIntent, onOpenPage } = draw(true);
    const p = page as Page;
    p.click(slotButton(root, 0));
    const shown = first(byClass(root, 'configurator'));
    p.click(first(byName(shown, 'button', /Creature page/)));
    expect(onOpenPage).toHaveBeenCalledWith('demo-moss');
    p.click(first(byName(shown, 'button', /Remove from board/)));
    expect(onIntent).toHaveBeenCalledWith({ type: 'unplace', creatureId: 'demo-moss' });
    expect(byClass(root, 'configurator')).toHaveLength(0);
  });

  it('shows only what it wears, locked, once the board is locked', () => {
    const { root } = draw(false);
    const p = page as Page;
    p.click(slotButton(root, 0));
    const shown = first(byClass(root, 'configurator'));
    expect(byName(shown, 'button', /Remove from board/)).toHaveLength(0);
    expect(byClass(shown, 'find-row-button')).toHaveLength(0);
    expect(byClass(shown, 'gear-list')).toHaveLength(1);
  });

  it("does not show a configurator for someone else's creature", () => {
    const { root } = draw(true);
    (page as Page).click(slotButton(root, 1));
    expect(byClass(root, 'configurator')).toHaveLength(0);
  });
});
