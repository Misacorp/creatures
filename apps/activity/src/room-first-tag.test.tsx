import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LivingRoom, sceneOf } from './LivingRoom';
import { PopoverHost } from './PopoverHost';
import type { Resident } from './room-data';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from './test-dom';

let page: Page | null = null;

beforeEach(() => {
  // The popover places itself against the window.
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    innerWidth: 400,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

const SELF = '100000000000000001';

function resident(firstOnServer: boolean): Resident {
  return {
    userId: '100000000000000002',
    name: 'Misa',
    spot: null,
    creature: {
      id: 'c-misa',
      species: 'splashet',
      shiny: false,
      level: 12,
      nickname: null,
      quirk: null,
      craftingLevel: 2,
      explorerRank: 1,
      firstOnServer,
      gear: [],
    },
  };
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

/** Draws a room with one creature, taps it, and returns the page. */
function tapCreature(firstFlag: boolean): Page {
  const drawn = createPage();
  page = drawn;
  drawn.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <LivingRoom
        residents={[resident(firstFlag)]}
        selfId={SELF}
        instanceId="test"
        scene={sceneOf('day')}
      />
    </PopoverHost>,
  );
  drawn.click(first(byClass(drawn.root, 'room-creature')));
  return drawn;
}

describe('tapping a creature in the living room', () => {
  it('shows the "First on server" tag, the same tag as on a creature card, when its owner holds the record', () => {
    const drawn = tapCreature(true);
    const tag = first(byName(drawn.root, 'button', 'First on server'));
    expect(tag.getAttribute('class')).toContain('badge first');
    expect(visibleText(drawn.root)).toContain('Misa');
  });

  it('shows no such tag when the server did not say so', () => {
    const drawn = tapCreature(false);
    expect(visibleText(drawn.root)).not.toContain('First on server');
  });
});
