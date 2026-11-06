import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValleyCommonsPlace } from '@creatures/game';
import { PopoverHost } from '../PopoverHost';
import {
  badgesIn,
  byClass,
  byName,
  byRole,
  createPage,
  find,
  nameOf,
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
import { marketPlace } from './market-sample';
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

/** The row of the give list whose badge is this resource (a choice shows an icon and a number, never a name). */
const row = (p: Page, resource: RegExp): FakeElement => {
  const el = byClass(p.root, 'choice').find((c) => resource.test(badgesIn(c)[0]?.[0] ?? ''));
  if (el === undefined) throw new Error(`no give row ${String(resource)}`);
  return el;
};

/** The one Give button that carries a cost (the confirm of the amount view), with its badge. */
const confirm = (p: Page): FakeElement => {
  const el = find(
    p.root,
    (c) => c.localName === 'button' && /^Give/.test(nameOf(c)) && badgesIn(c).length > 0,
  )[0];
  if (el === undefined) throw new Error('no confirm button');
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
    expect(text).toMatch(/Still needed:/);
    // What is still needed is icons and numbers, never the resources' names.
    expect(badgesIn(byClass(p.root, 'cm-need')[0] as FakeElement)).toEqual([
      ['Bait', '260'],
      ['Scrap', '519'],
      ['Grove Shards', '65'],
    ]);
    expect(text).not.toMatch(/Acorns|scrap|shards/);
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
    p.click(row(p, /^Bait/));
    // 260 Acorns are needed and 1000 are held: the stepper starts at what the project takes.
    expect(badgesIn(confirm(p))).toEqual([['Bait', '260']]);
    p.click(button(p, /One fewer/));
    expect(badgesIn(confirm(p))).toEqual([['Bait', '259']]);
    p.click(confirm(p));
    expect(calls.gives).toHaveLength(1);
    expect(calls.gives[0]?.place).toBe('signpost');
    expect(calls.gives[0]?.row.id).toBe('acorns');
    expect(calls.gives[0]?.units).toBe(259);
  });

  it('shards of another element pay at the exchange rate, three for one', () => {
    const { page: p, calls } = draw('signpost', [signpost]);
    p.click(button(p, /^Give/));
    p.click(row(p, /^Mire Shard/));
    // 7 Mire shards pay for 2 units; the button says what the player spends: 6 of them.
    expect(badgesIn(confirm(p))).toEqual([['Mire Shards', '6']]);
    p.click(confirm(p));
    expect(calls.gives[0]?.row.per).toBe(3);
    expect(calls.gives[0]?.units).toBe(2);
  });

  it('the Market takes shards of any kind: the board says so, the drawer lists the biggest pile first, and a gift names the element', () => {
    const market = marketPlace('being built');
    const { page: p, calls } = draw('market', [market]);
    expect(badgesIn(byClass(p.root, 'cm-need')[0] as FakeElement)).toEqual([
      ['Bait', '190'],
      ['Scrap', '380'],
    ]);
    // The rate is an any-shard icon and a number, then an Acorn: "4 [shard] = 1 [acorn]".
    const rate = byClass(p.root, 'cm-need')[1] as FakeElement;
    expect(badgesIn(rate)).toEqual([
      ['Shards of any kind', ''],
      ['Shards of any kind', '4'],
      ['Bait', '1'],
    ]);
    expect(visibleText(p.root)).not.toMatch(/shards/i);
    p.click(button(p, /^Give/));
    const names = byClass(p.root, 'choice').map((el) => badgesIn(el)[0]?.[0] ?? '');
    // The shelf holds Mire 7, Tide 4, Ember 4, Grove 1: Mire (the biggest) comes first among the shards.
    const order = ['Mire', 'Tide', 'Ember', 'Grove'].map((n) =>
      names.findIndex((t) => t.startsWith(`${n} Shard`)),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    p.click(row(p, /^Mire Shard/));
    expect(badgesIn(confirm(p))).toEqual([['Mire Shards', '7']]);
    p.click(confirm(p));
    expect(calls.gives[0]?.place).toBe('market');
    expect(calls.gives[0]?.row).toMatchObject({ part: 'shards', element: 'mire', per: 1 });
    expect(calls.gives[0]?.units).toBe(7);
  });

  it('a part the player cannot pay is listed with its reason and cannot be opened', () => {
    const { page: p } = draw('signpost', [signpost], { scrap: 0 });
    p.click(button(p, /^Give/));
    const scrap = row(p, /^Scrap/);
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
