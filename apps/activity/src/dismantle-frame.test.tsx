import { afterEach, describe, expect, it, vi } from 'vitest';
import { GEAR_STATE, SAMPLE_GEAR } from './creature-card-sample';
import type { GearActions } from './gear-actions';
import type { DismantlePreview, JobResult } from './gear-types';
import { gearName } from './gear-view';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';
import { Workshop } from './Workshop';

/**
 * One flow, one frame (ux-patterns.md, "A flow reachable from several places"). Dismantling starts from the bag's bulk
 * bar and from an item card's red button; both must draw the same component in the same frame: a drawer with the
 * flow's head in its content and the wizard footer pinned in the drawer's footer slot. This is the test that failed
 * before the card's own copy (`DismantleInline`, footer inside the scrolling card) was removed.
 */

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const previewed: DismantlePreview = {
  kind: 'dismantle',
  creatureId: 'x',
  items: [],
  range: {
    scrap: { min: 1, max: 2 },
    shards: { min: 0, max: 0, element: null },
    glimmer: { min: 0, max: 0 },
    essence: { min: 0, max: 0 },
  },
  xp: 6,
  learnBp: null,
  teachers: 0,
  boosted: 0,
  tinkersLuckBp: 0,
};

const actions = {
  equip: () => Promise.resolve(undefined),
  equipBest: () => Promise.resolve(undefined),
  checkDismantle: () => Promise.resolve({ locked: [] }),
  dismantlePile: () => Promise.resolve({ kind: 'dismantle' } as JobResult),
  dismissNotice: () => Promise.resolve(undefined),
  startJob: () => Promise.resolve(undefined),
  previewCraft: () => new Promise(() => undefined),
  previewDismantle: vi.fn(() => Promise.resolve(previewed)),
  claimJob: () => Promise.resolve(undefined),
} as unknown as GearActions;

function draw(): Page {
  page = createPage();
  page.draw(
    <Workshop
      state={GEAR_STATE}
      gear={SAMPLE_GEAR}
      failed={false}
      offset={0}
      busy={false}
      reveal={null}
      actions={actions}
      onRetry={() => undefined}
      onClaimed={() => undefined}
      onDismissReveal={() => undefined}
    />,
  );
  return page;
}

const kelp = SAMPLE_GEAR.items.find((i) => i.baseId === 'kelp-cap');
if (kelp === undefined) throw new Error('no kelp cap in the sample bag');

const tile = (p: Page): FakeElement =>
  first(
    find(
      p.root,
      (e) =>
        e.localName === 'button' &&
        e.getAttribute('role') === 'option' &&
        (e.getAttribute('aria-label') ?? '').startsWith(gearName(kelp.baseId)),
    ),
  );

/** True when `node` has an ancestor (or is) with the class. */
function within(node: FakeElement, className: string): boolean {
  for (let n: FakeElement | null = node; n !== null; n = n.parentNode) {
    if (
      typeof n.getAttribute === 'function' &&
      (n.getAttribute('class') ?? '').split(' ').includes(className)
    ) {
      return true;
    }
  }
  return false;
}

/** What the frame looks like from outside: the drawer, where the head and the footer sit, and what they say. */
function frameOf(p: Page): {
  dialogs: number;
  panelClass: string;
  head: string;
  footerInDrawerFooter: boolean;
  footerInBody: boolean;
  footerText: string;
  wizards: number;
} {
  const dialog = first(byRole(p.root, 'dialog'));
  const footer = first(byClass(p.root, 'send-button'));
  return {
    dialogs: byRole(p.root, 'dialog').length,
    panelClass: (dialog.getAttribute('class') ?? '').replace(' drawer-swap', ''),
    head: visibleText(first(byClass(dialog, 'drill-head'))).replace(
      /^‹ Back( to the (bag|item))?/,
      '',
    ),
    footerInDrawerFooter: within(footer, 'drawer-footer'),
    footerInBody: within(footer, 'drawer-body'),
    footerText: visibleText(footer),
    wizards: byClass(p.root, 'dismantle-wizard').length,
  };
}

describe('dismantling is one component in one frame, whichever way it is opened', () => {
  it('draws the same drawer, head and pinned footer from the bag bar and from the item card', () => {
    // From the bulk bar: select an item by its checkbox, then Dismantle.
    const bulk = draw();
    bulk.click(first(byClass(tile(bulk).parentNode as FakeElement, 'select-check')));
    bulk.click(first(byName(first(byClass(bulk.root, 'bulk-bar')), 'button', 'Dismantle')));
    const fromBar = frameOf(bulk);
    bulk.unmount();
    page = null;

    // From the card: open it, press the red Dismantle.
    const card = draw();
    card.click(tile(card));
    card.click(
      first(
        find(
          first(byRole(card.root, 'dialog')),
          (e) =>
            e.localName === 'button' &&
            (e.getAttribute('class') ?? '').includes('danger') &&
            visibleText(e) === 'Dismantle',
        ),
      ),
    );
    const fromCard = frameOf(card);

    expect(fromCard).toEqual(fromBar);
    expect(fromCard.dialogs).toBe(1);
    expect(fromCard.wizards).toBe(1);
    expect(fromCard.panelClass).toContain('dismantle-drawer');
    expect(fromCard.head).toContain('Who dismantles');
    // The creature step's button is in the drawer's pinned footer, never in the scrolling body.
    expect(fromCard.footerInDrawerFooter).toBe(true);
    expect(fromCard.footerInBody).toBe(false);
    expect(fromCard.footerText).toBe('Next');
  });
});
