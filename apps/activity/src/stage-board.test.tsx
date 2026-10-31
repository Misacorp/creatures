import { afterEach, describe, expect, it } from 'vitest';
import type { EventNames } from '@creatures/engine';
import { Stage } from './Stage';
import { byClass, createPage, type FakeElement, type Page } from './test-dom';
import { creatureAtSlot } from './stage';
import { strikeLabel } from './telegraph';
import live from './fixtures/live-mid.json';
import type { ReplayRowEntry } from './raid-api';
import { gearContent } from '@creatures/game';
import { itemLookId } from './gear-sprites';
import { unitSprite } from './stage/StageUnit';
import { creatureSprite, creatureSpriteOrFallback } from './sprites/creature-sprites';
import { LOOK_CLASS, classSlot } from './sprites/data/worn-sprites';
import { wornSprite } from './worn-gear';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const NAMES = live.names as unknown as EventNames;
const ROW = live.row.slice(0, 4) as ReplayRowEntry[];
/** A board of 9 (rows of 3): four creatures at slots 1, 2, 4 and 8, so every row has gaps. */
const BOARD = { length: 9, slots: [1, 2, 4, 8] };

function draw(board?: { length: number; slots: number[] }) {
  page = createPage();
  page.draw(
    <Stage
      boss={{ id: 'storm-sovereign', name: 'Storm Sovereign', element: 'spark' }}
      hpMax={100}
      hpStart={100}
      rounds={12}
      row={ROW}
      {...(board === undefined ? {} : { board })}
      mineIds={new Set<string>()}
      names={NAMES}
      events={[]}
      index={0}
      anim={null}
    />,
  );
  return page.root;
}

/** One character per cell of a zone's row: "x" a creature, "." an empty cell. */
const cells = (root: FakeElement, zone: string): string[] =>
  byClass(root, `zone-${zone}`)
    .flatMap((el) => byClass(el, 'zone-units'))
    .flatMap((ul) => ul.childNodes)
    .map((li) => ((li as FakeElement).getAttribute('class')?.includes('stage-gap') ? '.' : 'x'));

describe('the stage draws the placement board', () => {
  it('shows an empty cell where the board has a gap, in the creature’s own lane', () => {
    const root = draw(BOARD);
    // Front slots 0-2: gap, creature, creature. Middle 3-5: gap, creature, gap. Back 6-8: gap, gap, creature.
    expect(cells(root, 'front')).toEqual(['.', 'x', 'x']);
    expect(cells(root, 'middle')).toEqual(['.', 'x', '.']);
    expect(cells(root, 'back')).toEqual(['.', '.', 'x']);
  });

  it('without a board the row is dense, with no gaps', () => {
    const root = draw();
    expect(byClass(root, 'stage-gap')).toHaveLength(0);
  });

  it('finds the creature of a board slot, and marks a lance on the board’s lane', () => {
    expect(creatureAtSlot(ROW, BOARD, 4)).toBe(ROW[2]);
    expect(creatureAtSlot(ROW, BOARD, 3)).toBeUndefined();
    expect(creatureAtSlot(ROW, undefined, 3)).toBe(ROW[3]);
    // The engine reports the lance's lane as the board column; the label says it from 1.
    const lance = { action: 'lance' as const, targets: ['b'], lane: 1 };
    expect(strikeLabel(lance as never, NAMES).area).toBe('lane 2');
  });
});

describe('a unit wears its gear', () => {
  it('draws the worn sprite (a knocked-out unit draws it too: it takes the same path)', () => {
    const hat = gearContent.bases.find((b) => {
      const cls = LOOK_CLASS[itemLookId(b.id)];
      return cls !== undefined && classSlot(cls) === 'hat';
    });
    if (hat === undefined) throw new Error('no hat base');
    const bare = { species: 'splashet' };
    const dressed = { species: 'splashet', worn: [hat.id] };
    expect(unitSprite(bare)).toBe(creatureSprite('splashet'));
    expect(unitSprite(dressed)).toBe(wornSprite('splashet', [{ baseId: hat.id }]));
    expect(unitSprite(dressed)).not.toBe(unitSprite(bare));
    expect(unitSprite({ species: 'splashet', worn: ['nope'] })).toBe(creatureSprite('splashet'));
    expect(unitSprite({ species: 'no-such' })).toBe(creatureSpriteOrFallback('no-such'));
  });
});
