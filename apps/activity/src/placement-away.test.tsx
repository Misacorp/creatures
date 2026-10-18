import { afterEach, describe, expect, it } from 'vitest';
import { Placement } from './Placement';
import type { RaidView, RowSlotView } from './raid-api';
import { byClass, createPage, visibleText, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
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
      ownerName: 'Kim',
      species: 'splashet',
      name: 'Splashet',
      level: 5,
      mine: false,
      auto: true,
      movable: false,
    }),
    tile(1, {
      ownerName: 'Jun <b>',
      species: 'cindle',
      name: 'Cindle',
      level: 4,
      mine: false,
      auto: false,
      movable: true,
      movedBy: 'Misa',
      creatureId: 'j1',
    }),
    tile(2, null),
  ],
  away: [
    {
      ownerName: 'Jun <b>',
      creatures: [
        { creatureId: 'j1', species: 'cindle', name: 'Cindle', level: 4, joining: true },
        { creatureId: 'j2', species: 'sproutle', name: 'Sproutle', level: 2, joining: false },
      ],
    },
  ],
  guests: false,
  bossHp: null,
  adaptation: null,
  results: [],
  readiness: null,
};

function draw(canEdit: boolean): Page {
  page = createPage();
  page.draw(
    <Placement
      party={party}
      creatures={[]}
      canEdit={canEdit}
      busy={false}
      rosterNames={['Misa', 'Jun <b>']}
      turnOrder="left_to_right"
      next={null}
      onIntent={() => undefined}
    />,
  );
  return page;
}

describe('the Raid Roster with auto tiles and an away teammate', () => {
  it('draws the auto tile marked, the away hint and who moved a creature, all as plain text', () => {
    const { root } = draw(true);
    expect(byClass(root, 'slot-auto')).toHaveLength(1);
    expect(
      byClass(root, 'party-slot').filter((b) => b.getAttribute('class')?.includes('auto')),
    ).toHaveLength(1);
    const text = visibleText(root);
    expect(text).toContain('Jun <b> is away — teammates can move these.');
    expect(text).toContain('Cindle (Jun <b>) moved by Misa.');
    expect(text).toContain('0 / 3 placed');
  });

  it('lets the viewer drag the away teammate’s tile, and nothing else', () => {
    const { root } = draw(true);
    const draggable = byClass(root, 'party-slot').filter((b) =>
      b.getAttribute('class')?.includes('draggable'),
    );
    expect(draggable.map((b) => b.getAttribute('data-slot'))).toEqual(['1']);
  });

  it('drops the movable marks once the board is locked', () => {
    const { root } = draw(false);
    expect(
      byClass(root, 'party-slot').filter((b) => b.getAttribute('class')?.includes('draggable')),
    ).toHaveLength(0);
  });
});
