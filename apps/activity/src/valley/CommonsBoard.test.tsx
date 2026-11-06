import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValleyCommonsPlace } from '@creatures/game';
import { PopoverHost } from '../PopoverHost';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { homeInput } from '../workbench/home-sample';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import {
  buildingPlace,
  openPlace,
  sampleCommons,
  waitingPlace,
  withCommons,
} from './commons-sample';
import type { GiveRow } from './commons-view';
import { sampleValley } from './signpost-sample';

let page: Page | null = null;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  page?.unmount();
  page = null;
});

const base = homeInput('busy', true);
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));
const a = free[0];
if (a === undefined) throw new Error('fixture');
const helperId = a.id;

interface Calls {
  gives: { place: string; row: GiveRow; units: number }[];
  posts: { place: string; creatureId: string | null }[];
}

function draw(
  place: string,
  places: ValleyCommonsPlace[],
  options: {
    host?: 'page' | 'sheet';
    acorns?: number;
    scrap?: number;
    helper?: boolean;
    start?: CommonsStart;
    dropId?: string;
  } = {},
): { page: Page; calls: Calls } {
  const calls: Calls = { gives: [], posts: [] };
  const visit0 = sampleValley(free, []);
  const visit = withCommons(
    {
      ...visit0,
      forge: {
        ...visit0.forge,
        shelf: {
          ...visit0.forge.shelf,
          scrap: options.scrap ?? 80,
          shards: { tide: 4, ember: 4, grove: 1, spark: 0, mire: 7 },
        },
      },
    },
    sampleCommons({ places }),
    options.helper === true ? { place, creatureId: helperId } : undefined,
  );
  const actions: CommonsActions = {
    give: (p, row, units) => {
      calls.gives.push({ place: p, row, units });
      return Promise.resolve(true);
    },
    post: (p, creatureId) => {
      calls.posts.push({ place: p, creatureId });
      return Promise.resolve(true);
    },
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <CommonsBoard
        place={place}
        visit={visit}
        creatures={free}
        acorns={options.acorns ?? 1000}
        busy={false}
        actions={actions}
        {...(options.host === undefined ? {} : { host: options.host })}
        {...(options.start === undefined ? {} : { start: options.start })}
        {...(options.dropId === undefined ? {} : { dropId: options.dropId })}
      />
    </PopoverHost>,
  );
  return { page: p, calls };
}

const button = (p: Page, name: RegExp): FakeElement => {
  const el = byName(p.root, 'button', name)[0];
  if (el === undefined) throw new Error(`no button ${String(name)}`);
  return el;
};

describe('CommonsBoard: an open project', () => {
  const signpost = openPlace('signpost', 2, 900, 0.28, {
    plaque: ['Ada', 'Mia', 'Tobias'],
    mine: { given: 60, shareBp: 3100 },
  });

  it('shows the level, the bar, what is still needed and only your own part', () => {
    const { page: p } = draw('signpost', [signpost]);
    const text = visibleText(p.root);
    expect(text).toMatch(/Level 2 \/ 5/);
    expect(text).toMatch(/28%/);
    expect(text).toMatch(/Still needed: 260 Acorns, 519 scrap, 65 Grove shards/);
    expect(text).toMatch(/You gave 31% of this/);
    expect(byRole(p.root, 'progressbar').length).toBeGreaterThan(0);
    expect(button(p, /^Give/)).toBeDefined();
  });

  it('a card another place can drop a creature on carries its id', () => {
    const { page: p } = draw('signpost', [signpost], { dropId: 'communal:signpost' });
    expect(find(p.root, (el) => el.getAttribute('data-seat') === 'communal:signpost')).toHaveLength(
      1,
    );
    const { page: q } = draw('signpost', [signpost]);
    expect(find(q.root, (el) => el.getAttribute('data-seat') !== null)).toHaveLength(0);
  });

  it('give: the list, the amount (all the project takes, at most), one confirm, one keyed gift', () => {
    const { page: p, calls } = draw('signpost', [signpost]);
    p.click(button(p, /^Give/));
    expect(visibleText(p.root)).toMatch(/Give to the project/);
    p.click(button(p, /^Acorns/));
    // 260 Acorns are needed and 1000 are held: the stepper starts at what the project takes.
    expect(visibleText(p.root)).toMatch(/260 Acorns/);
    p.click(button(p, /One fewer/));
    p.click(button(p, /^Give \d+ Acorns/));
    expect(calls.gives).toHaveLength(1);
    expect(calls.gives[0]?.place).toBe('signpost');
    expect(calls.gives[0]?.row.id).toBe('acorns');
    expect(calls.gives[0]?.units).toBe(259);
  });

  it('shards of another element pay at the exchange rate, three for one', () => {
    const { page: p, calls } = draw('signpost', [signpost]);
    p.click(button(p, /^Give/));
    p.click(button(p, /^Mire shards, 3 for 1/));
    // 7 Mire shards pay for 2 units; the price line says what the player spends.
    expect(visibleText(p.root)).toMatch(/6 Mire shards/);
    p.click(button(p, /^Give \d+ Mire shards/));
    expect(calls.gives[0]?.row.per).toBe(3);
    expect(calls.gives[0]?.units).toBe(2);
  });

  it('a part the player cannot pay is listed with its reason and cannot be opened', () => {
    const { page: p } = draw('signpost', [signpost], { scrap: 0 });
    p.click(button(p, /^Give/));
    const scrap = button(p, /^Scrap/);
    expect(scrap.getAttribute('disabled')).not.toBeNull();
    expect(visibleText(p.root)).toMatch(/You have none/);
  });

  it('the plaque lists names and no amounts', () => {
    const { page: p } = draw('signpost', [signpost]);
    p.click(button(p, /plaque of level 2/i));
    const names = byClass(p.root, 'cm-names')[0];
    if (names === undefined) throw new Error('no names');
    expect(visibleText(names)).toMatch(/Ada/);
    expect(visibleText(names)).toMatch(/Tobias/);
    expect(visibleText(names)).not.toMatch(/\d/);
  });

  it('the collection board has five sockets; a set one names its finder', () => {
    const { page: p } = draw('forge', [openPlace('forge', 2, 900, 0.1)], {
      start: { view: 'collection' },
    });
    expect(byClass(p.root, 'cm-socket')).toHaveLength(5);
    expect(visibleText(p.root)).toMatch(/Found by Mia/);
    expect(visibleText(p.root)).toMatch(/2 \/ 5 set/);
  });

  it('a helper is posted from the shared picker; the slot shows the creature once it stands there', () => {
    const { page: p, calls } = draw('signpost', [signpost]);
    p.click(button(p, /nobody helps/));
    const options = byRole(p.root, 'option');
    expect(options.length).toBeGreaterThan(1);
    // The first row empties the seat and is disabled while nobody stands there.
    const second = options[1];
    if (second === undefined) throw new Error('no creature row');
    p.click(second);
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]?.place).toBe('signpost');
    expect(typeof calls.posts[0]?.creatureId).toBe('string');
  });

  it('a creature that already helps shows in the slot as helping', () => {
    const { page: p } = draw('signpost', [signpost], { helper: true });
    expect(visibleText(p.root)).toMatch(/Helping/);
  });
});

describe('CommonsBoard: the other states', () => {
  it('a place that is building says how long, and offers no Give', () => {
    const { page: p } = draw('forge', [buildingPlace('forge', 2, 2, ['Ada'])]);
    expect(visibleText(p.root)).toMatch(/The Forge is being built, 2 days left/);
    expect(byName(p.root, 'button', /^Give/)).toHaveLength(0);
  });

  it('a place the guided start has not reached says when it opens, and offers no Give', () => {
    const { page: p } = draw('school', [waitingPlace('school')]);
    expect(visibleText(p.root)).toMatch(
      /Opens once the hearth, the Market and the Forge have grown/,
    );
    expect(byName(p.root, 'button', /^Give/)).toHaveLength(0);
  });

  it('a place with no row in the commons draws nothing', () => {
    const { page: p } = draw('market', [openPlace('forge', 1, 400, 0.1)]);
    expect(visibleText(p.root)).toBe('');
  });
});

describe('CommonsBoard: the sheet the Bonfire opens', () => {
  const bonfire = openPlace('bonfire', 1, 400, 0.35, { mine: { given: 60, shareBp: 4000 } });

  it('is one drawer: Give is a drill-in with Back, never a second layer', () => {
    const { page: p } = draw('bonfire', [bonfire], { host: 'sheet' });
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    // The card's own head is the drawer's title, not drawn twice.
    expect(visibleText(p.root).match(/Level 1 \/ 5/g)).toHaveLength(1);
    p.click(button(p, /^Give/));
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    expect(button(p, /Back/)).toBeDefined();
    p.click(button(p, /Back/));
    expect(byName(p.root, 'button', /^Give/)).toHaveLength(1);
  });

  it('the helper picker is a drill-in list of the same drawer', () => {
    const { page: p, calls } = draw('bonfire', [bonfire], { host: 'sheet' });
    p.click(button(p, /nobody helps/));
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    const options = byRole(p.root, 'option');
    const second = options[1];
    if (second === undefined) throw new Error('no creature row');
    p.click(second);
    expect(calls.posts[0]?.place).toBe('bonfire');
  });
});
