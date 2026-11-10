import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_STATE } from '../creature-card-sample';
import {
  badgesIn,
  byClass,
  byName,
  byRole,
  createPage,
  nameOf,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { BuildPanel } from './BuildPanel';
import { CataloguePanel } from './CataloguePanel';
import { GiftButton } from './GiftButton';
import { Guestbook } from './Guestbook';
import { MailboxPanel } from './MailboxPanel';
import { SkinPicker } from './SkinPicker';
import { SpotPicker } from './SpotPicker';
import { StampPicker } from './StampPicker';
import { VisitList } from './VisitList';
import { WorkbenchPanel } from './WorkbenchPanel';
import {
  SAMPLE_NOW,
  sampleCatalogue,
  sampleGuestbook,
  sampleHouse,
  sampleList,
  sampleOwn,
} from './house-sample';

let page: Page | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    innerWidth: 390,
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

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page?.unmount();
  page = createPage();
  page.draw(vnode);
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const house = sampleHouse();
const noop = () => undefined;

describe('BuildPanel', () => {
  it('lists the buildable parts as rows with a pip per line, and opens one on a tap', () => {
    const onOpen = vi.fn();
    const p = draw(
      <BuildPanel
        house={house}
        own={sampleOwn('rich')}
        busy={false}
        error={null}
        onPay={noop}
        open={null}
        onOpen={onOpen}
      />,
    );
    const rows = byClass(p.root, 'vy-row');
    expect(rows.length).toBeGreaterThan(2);
    const cellar = first(byName(p.root, 'button', /^Cellar, \d \/ \d lines paid into$/));
    expect(byClass(cellar, 'pips')).toHaveLength(1);
    // No Pay in on the list, and no fold: the part's page has them.
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(0);
    expect(visibleText(p.root)).not.toContain('Hold something back');
    p.click(cellar);
    expect(onOpen).toHaveBeenCalledWith('cellar');
  });

  it('pays what is held when "Pay in" is pressed on the part page, for the part it belongs to', () => {
    const onPay = vi.fn();
    const p = draw(
      <BuildPanel
        house={house}
        own={sampleOwn('rich')}
        busy={false}
        error={null}
        onPay={onPay}
        open="cellar"
      />,
    );
    p.click(first(byName(p.root, 'button', 'Pay in')));
    expect(onPay).toHaveBeenCalledTimes(1);
    const [partId, pay] = onPay.mock.calls[0] as [string, { bait?: number; scrap?: number }];
    expect(partId).toBe('cellar');
    expect(pay.bait).toBe(125);
    expect(pay.scrap).toBe(800);
  });

  it('shows have / need, marks the short line, names no currency in words and no output chip', () => {
    const p = draw(
      <BuildPanel
        house={house}
        own={sampleOwn('rich')}
        busy={false}
        error={null}
        onPay={noop}
        open="cellar"
      />,
    );
    const cellar = first(byName(p.root, 'section', 'Cellar'));
    expect(visibleText(cellar)).toContain('0 / 4');
    expect(byClass(cellar, 'short')).toHaveLength(1);
    expect(visibleText(cellar)).not.toMatch(/acorns|scrap|shard/i);
    expect(byClass(cellar, 'recipe-arrow')).toHaveLength(0);
    expect(
      badgesIn(cellar).some(([name, n]) => /acorn|bait/i.test(name) && n === '640 / 125'),
    ).toBe(true);
  });

  it('is off while busy, off with a reason when nothing can be paid, and shows a refusal', () => {
    const busy = draw(
      <BuildPanel
        house={house}
        own={sampleOwn('rich')}
        busy
        error={null}
        onPay={noop}
        open="cellar"
      />,
    );
    expect(first(byName(busy.root, 'button', 'Pay in')).hasAttribute('disabled')).toBe(true);
    const none = draw(
      <BuildPanel
        house={house}
        own={sampleOwn('empty')}
        busy={false}
        error="Not enough."
        onPay={noop}
        open="cottage"
      />,
    );
    // Nothing to pay in: no disabled button, the line says what the player has against what the first line costs.
    expect(byName(none.root, 'button', 'Pay in')).toHaveLength(0);
    expect(visibleText(none.root)).toContain('You have 0; this costs 75.');
    expect(byRole(none.root, 'alert')).toHaveLength(1);
  });

  it('lights a pip on the part page for a line already paid, and has no fold to hold a line back', () => {
    const own = sampleOwn('rich');
    const p = draw(
      <BuildPanel house={house} own={own} busy={false} error={null} onPay={noop} open="cellar" />,
    );
    expect(byClass(p.root, 'pips')).toHaveLength(1);
    expect(visibleText(p.root)).not.toContain('Hold something back');
    expect(
      byRole(p.root, 'img')
        .map(nameOf)
        .some((n) => /lines paid/.test(n)),
    ).toBe(true);
  });

  it('opens a part that cannot be built yet as a goal: its picture, its price and what it needs, no Pay in', () => {
    const onOpen = vi.fn();
    const list = draw(
      <BuildPanel
        house={house}
        own={sampleOwn('rich')}
        busy={false}
        error={null}
        onPay={noop}
        open={null}
        onOpen={onOpen}
      />,
    );
    p_click(list, /^Pool/, onOpen);
    const page = draw(
      <BuildPanel
        house={house}
        own={sampleOwn('rich')}
        busy={false}
        error={null}
        onPay={noop}
        open="pool"
        renderPreview={() => <span class="preview-stub" />}
      />,
    );
    expect(visibleText(page.root)).toContain('Needs the Garden first');
    expect(byName(page.root, 'button', 'Pay in')).toHaveLength(0);
    expect(byClass(page.root, 'preview-stub')).toHaveLength(1);
    expect(byClass(page.root, 'recipe-card')).toHaveLength(1);
  });

  it('lists what cannot be built yet, muted, with its reason', () => {
    const p = draw(
      <BuildPanel house={house} own={sampleOwn('rich')} busy={false} error={null} onPay={noop} />,
    );
    const text = visibleText(p.root);
    expect(text).toContain('Needs the Garden first');
    expect(byClass(p.root, 'vy-row-muted').length).toBeGreaterThan(0);
  });

  it('goes back to the list when the open part is no longer buildable', () => {
    const p = draw(
      <BuildPanel
        house={house}
        own={sampleOwn('rich')}
        busy={false}
        error={null}
        onPay={noop}
        open="hut"
      />,
    );
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(0);
    expect(byClass(p.root, 'vy-row').length).toBeGreaterThan(0);
  });

  it('says everything is built when there is nothing left', () => {
    const own = { ...sampleOwn('rich'), buildable: [], progress: [] };
    const all = { ...house, built: housingPartIds() };
    const p = draw(<BuildPanel house={all} own={own} busy={false} error={null} onPay={noop} />);
    expect(visibleText(p.root)).toContain('Everything is built.');
  });
});

function p_click(p: ReturnType<typeof draw>, name: RegExp, onOpen: ReturnType<typeof vi.fn>): void {
  p.click(first(byName(p.root, 'button', name)));
  expect(onOpen).toHaveBeenCalledWith('pool');
}

function housingPartIds(): string[] {
  return [
    'hut',
    'cottage',
    'house',
    'cellar',
    'terrace',
    'garden',
    'west-wing',
    'west-upper',
    'east-wing',
    'east-upper',
    'pool',
  ];
}

describe('WorkbenchPanel', () => {
  it('makes a piece when Make is pressed', () => {
    const onCraft = vi.fn();
    const p = draw(
      <WorkbenchPanel
        own={sampleOwn('rich')}
        busy={false}
        error={null}
        focus="tidepool-stool"
        onCraft={onCraft}
      />,
    );
    const buttons = byName(p.root, 'button', 'Make');
    expect(buttons.length).toBeGreaterThan(0);
    const enabled = buttons.filter((b) => !b.hasAttribute('disabled'));
    p.click(first(enabled));
    expect(onCraft).toHaveBeenCalledTimes(1);
  });

  it('shows a set as pictures over one card, and the card follows the picture picked', () => {
    const onCraft = vi.fn();
    const p = draw(
      <WorkbenchPanel
        own={sampleOwn('rich')}
        busy={false}
        error={null}
        focus="tidepool-stool"
        onCraft={onCraft}
      />,
    );
    // One card (one Make button), not a card for every recipe of the set.
    expect(byClass(p.root, 'recipe-card')).toHaveLength(1);
    expect(byClass(p.root, 'supply-flat').length).toBeGreaterThan(0);
    const stool = first(byName(p.root, 'button', /^Tidepool Stool/));
    expect(stool.getAttribute('aria-pressed')).toBe('true');
    const table = first(byName(p.root, 'button', /^Tidepool Table/));
    p.click(table);
    expect(first(byName(p.root, 'button', /^Tidepool Table/)).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(byClass(p.root, 'recipe-card')).toHaveLength(1);
  });

  it('dims a picture that cannot be made now, with the owned count in the corner', () => {
    const p = draw(
      <WorkbenchPanel own={sampleOwn('poor')} busy={false} error={null} onCraft={noop} />,
    );
    expect(byClass(p.root, 'blocked').length).toBeGreaterThan(0);
    expect(byClass(p.root, 'supply-count').length).toBeGreaterThan(0);
  });

  it('marks a recipe the player is short of and keeps its button off', () => {
    const p = draw(
      <WorkbenchPanel
        own={sampleOwn('poor')}
        busy={false}
        error={null}
        focus="tidepool-table"
        onCraft={noop}
      />,
    );
    expect(byClass(p.root, 'short').length).toBeGreaterThan(0);
    expect(visibleText(p.root)).toContain('Not enough yet.');
  });

  it('says so with nothing known beyond the starters, and shows a refusal', () => {
    const p = draw(
      <WorkbenchPanel own={sampleOwn('empty')} busy={false} error="Nope." onCraft={noop} />,
    );
    expect(byRole(p.root, 'alert')).toHaveLength(1);
    expect(visibleText(p.root)).toContain('Cosy');
  });
});

describe('CataloguePanel', () => {
  it('shows the found count and the kinds, and switches kind', () => {
    const p = draw(<CataloguePanel catalogue={sampleCatalogue()} failed={false} onRetry={noop} />);
    expect(visibleText(p.root)).toMatch(/\d+ \/ 212 found/);
    p.click(first(byName(p.root, 'button', 'Stamps')));
    const tiles = byName(p.root, 'button', /^Unknown\./);
    expect(tiles.length).toBeGreaterThan(0);
  });

  it('names an unknown tile Unknown and speaks its hint', () => {
    const p = draw(<CataloguePanel catalogue={sampleCatalogue()} failed={false} onRetry={noop} />);
    p.click(first(byName(p.root, 'button', /Tidepool/)));
    expect(byName(p.root, 'button', /^Unknown\. /).length).toBeGreaterThan(0);
  });

  it('retries after a failed load', () => {
    const onRetry = vi.fn();
    const p = draw(<CataloguePanel catalogue={null} failed onRetry={onRetry} />);
    p.click(first(byName(p.root, 'button', 'Try again')));
    expect(onRetry).toHaveBeenCalled();
    const loading = draw(<CataloguePanel catalogue={null} failed={false} onRetry={noop} />);
    expect(visibleText(loading.root)).toContain('Loading');
  });
});

describe('SpotPicker', () => {
  const hearth = house.rooms.find((r) => r.id === 'hut:hearth');
  const loft = house.rooms.find((r) => r.id === 'cottage:loft');
  if (hearth === undefined || loft === undefined) throw new Error('rooms');
  const props = {
    own: sampleOwn('rich'),
    housemates: house.housemates,
    creatures: SAMPLE_STATE.creatures,
    busy: false,
    onPlace: noop,
    onHousemate: noop,
    onMake: noop,
  };

  it('lists Empty first and places the chosen piece', () => {
    const onPlace = vi.fn();
    const p = draw(
      <SpotPicker {...props} room={hearth} spotId="floor-small-b" onPlace={onPlace} />,
    );
    const groups = byRole(p.root, 'group');
    const tiles = groups.flatMap((g) => byName(g, 'button', /./));
    expect(nameOf(first(tiles)).startsWith('Empty')).toBe(true);
    // The set's name is a small label over its run of tiles.
    expect(visibleText(p.root)).toContain('Cosy');
    p.click(first(byName(p.root, 'button', /^Cosy Chair/)));
    p.click(first(byName(p.root, 'button', /^Place here/)));
    expect(onPlace).toHaveBeenCalledWith('cosy-chair');
  });

  it('empties a filled spot', () => {
    const onPlace = vi.fn();
    const p = draw(
      <SpotPicker {...props} room={hearth} spotId="floor-small-a" onPlace={onPlace} />,
    );
    p.click(first(byName(p.root, 'button', /^Empty/)));
    p.click(first(byName(p.root, 'button', /^Empty the spot/)));
    expect(onPlace).toHaveBeenCalledWith(null);
  });

  it("opens a blueprint's recipe in the same drawer, and Back returns", () => {
    const onMake = vi.fn();
    const p = draw(<SpotPicker {...props} room={loft} spotId="floor-large-a" onMake={onMake} />);
    p.click(first(byName(p.root, 'button', /^Hammock/)));
    p.click(first(byName(p.root, 'button', /^Make/)));
    expect(visibleText(p.root)).toContain('Back');
    expect(byClass(p.root, 'recipe-card')).toHaveLength(1);
    const make = byName(p.root, 'button', 'Make');
    p.click(first(make));
    expect(onMake).toHaveBeenCalledWith('hammock');
    p.click(first(byName(p.root, 'button', /Back/)));
    expect(byClass(p.root, 'recipe-card')).toHaveLength(0);
  });

  it('shows who sleeps in a bed and lists creatures with Away as a reason', () => {
    const onHousemate = vi.fn();
    const creatures = SAMPLE_STATE.creatures.map((c, i) => (i === 0 ? { ...c, away: true } : c));
    const p = draw(
      <SpotPicker
        {...props}
        room={loft}
        spotId="floor-large-a"
        creatures={creatures}
        onHousemate={onHousemate}
      />,
    );
    p.click(first(byName(p.root, 'button', /^Who sleeps here:/)));
    expect(visibleText(p.root)).toContain('Away');
    const options = byRole(p.root, 'option');
    const free = options.find(
      (o) => !visibleText(o).includes('Away') && o.getAttribute('aria-disabled') !== 'true',
    );
    expect(free).toBeDefined();
  });

  it('has no spot buttons to pick for a display, only a note', () => {
    const p = draw(<SpotPicker {...props} room={hearth} spotId="mantel" />);
    expect(visibleText(p.root)).toContain('fills itself');
  });
});

describe('SkinPicker', () => {
  it('uses a skin the player has and makes one known but not made', () => {
    const onPick = vi.fn();
    const own = sampleOwn('rich');
    const p = draw(
      <SkinPicker
        kind="wall"
        current="tidepool-wall"
        own={own}
        busy={false}
        onPick={onPick}
        onMake={noop}
      />,
    );
    p.click(first(byName(p.root, 'button', /^Cosy Wallpaper/)));
    p.click(first(byName(p.root, 'button', /^Use it/)));
    expect(onPick).toHaveBeenCalledWith('cosy-wall');
  });

  it('keeps Use it off for the skin in use', () => {
    const p = draw(
      <SkinPicker
        kind="wall"
        current="cosy-wall"
        own={sampleOwn('rich')}
        busy={false}
        onPick={noop}
        onMake={noop}
      />,
    );
    expect(first(byName(p.root, 'button', /^Use it/)).hasAttribute('disabled')).toBe(true);
  });
});

describe('MailboxPanel', () => {
  it('lists each gift with its giver and collects once', () => {
    const onCollect = vi.fn();
    const p = draw(
      <MailboxPanel mailbox={sampleOwn('rich').mailbox} busy={false} onCollect={onCollect} />,
    );
    expect(byClass(p.root, 'hp-gift')).toHaveLength(2);
    expect(visibleText(p.root)).toContain('Mika');
    p.click(first(byName(p.root, 'button', /^Collect/)));
    expect(onCollect).toHaveBeenCalledTimes(1);
  });

  it('shows what came in, "+N", with the givers\' names, once the server took the gifts', async () => {
    const onCollect = vi.fn(() => Promise.resolve(true));
    const mailbox = sampleOwn('rich').mailbox;
    const p = draw(<MailboxPanel mailbox={mailbox} busy={false} onCollect={onCollect} />);
    p.click(first(byName(p.root, 'button', /^Collect/)));
    await Promise.resolve();
    await Promise.resolve();
    expect(visibleText(p.root)).toContain(`+${String(mailbox.acorns)}`);
    expect(visibleText(p.root)).toContain('from ');
    expect(visibleText(p.root)).toContain('Mika');
  });

  it('says so with no button when nothing waits, and is off while busy', () => {
    const p = draw(
      <MailboxPanel mailbox={sampleOwn('empty').mailbox} busy={false} onCollect={noop} />,
    );
    expect(visibleText(p.root)).toContain('The mailbox is empty');
    expect(byName(p.root, 'button', /^Collect/)).toHaveLength(0);
    const busy = draw(<MailboxPanel mailbox={sampleOwn('rich').mailbox} busy onCollect={noop} />);
    expect(first(byName(busy.root, 'button', /^Collect/)).hasAttribute('disabled')).toBe(true);
  });
});

describe('VisitList', () => {
  it('opens a house, cuts a long name and keeps the full name in the spoken one', () => {
    const onOpen = vi.fn();
    const p = draw(<VisitList list={sampleList()} failed={false} onRetry={noop} onOpen={onOpen} />);
    expect(visibleText(p.root)).toContain('…');
    const row = first(byName(p.root, 'button', /^Bartholomew-Alexander the Third of Hollowmere/));
    p.click(row);
    expect(onOpen).toHaveBeenCalledWith('100000000000000003');
    expect(visibleText(p.root)).toContain('Gift given · Stamped');
  });

  it('says so when empty, loading or failed', () => {
    const empty = draw(
      <VisitList
        list={{ houses: [], me: { giftLeft: true } }}
        failed={false}
        onRetry={noop}
        onOpen={noop}
      />,
    );
    expect(visibleText(empty.root)).toContain('No other houses yet.');
    const retry = vi.fn();
    const failed = draw(<VisitList list={null} failed onRetry={retry} onOpen={noop} />);
    failed.click(first(byName(failed.root, 'button', 'Try again')));
    expect(retry).toHaveBeenCalled();
  });
});

describe('Guestbook', () => {
  it('lists stamps with who and when, newest first, cutting a long name', () => {
    const p = draw(<Guestbook entries={sampleGuestbook()} now={SAMPLE_NOW} />);
    const rows = byClass(p.root, 'hp-guest');
    expect(rows).toHaveLength(3);
    expect(visibleText(first(rows))).toContain('Mika');
    expect(visibleText(first(rows))).toContain('5 minutes ago');
    expect(visibleText(p.root)).toContain('…');
    expect(visibleText(p.root)).toContain('stamp from');
  });

  it('says so when nobody has signed', () => {
    const p = draw(<Guestbook entries={[]} now={SAMPLE_NOW} />);
    expect(visibleText(p.root)).toContain('Nobody has signed');
  });

  it('renders a name as text, never markup', () => {
    const entries = [
      { visitor: { userId: '1', name: '<b>x</b>' }, stampId: 'paw-print', at: SAMPLE_NOW },
    ];
    const p = draw(<Guestbook entries={entries} now={SAMPLE_NOW} />);
    expect(visibleText(p.root)).toContain('<b>x</b>');
    expect(byName(p.root, 'b', /./)).toHaveLength(0);
  });
});

describe('StampPicker', () => {
  it('offers only owned stamps and stamps at once on a pick', () => {
    const onStamp = vi.fn();
    const p = draw(
      <StampPicker
        owned={['paw-print', 'housewarming']}
        used={false}
        busy={false}
        onStamp={onStamp}
      />,
    );
    p.click(first(byName(p.root, 'button', 'Leave a stamp')));
    const options = byRole(p.root, 'option');
    expect(options.map(nameOf)).toEqual(['Paw Print', 'Housewarming']);
    p.click(first(options));
    expect(onStamp).toHaveBeenCalledWith('paw-print');
  });

  it("is a calm line, never a disabled button, after the day's stamp and with no stamps held", () => {
    const used = draw(<StampPicker owned={['paw-print']} used busy={false} onStamp={noop} />);
    expect(visibleText(used.root)).toContain('Stamped today');
    expect(byName(used.root, 'button', /./)).toHaveLength(0);
    const none = draw(<StampPicker owned={[]} used={false} busy={false} onStamp={noop} />);
    expect(visibleText(none.root)).toContain('No stamps yet');
    expect(byName(none.root, 'button', /./)).toHaveLength(0);
  });
});

describe('GiftButton', () => {
  it('is the gold Gift button saying what it gives, then a calm line once the gift is used', () => {
    const onGift = vi.fn();
    const ready = draw(
      <GiftButton
        today={{ gifted: false, stamped: false }}
        giftLeft
        busy={false}
        owner="Anna"
        onGift={onGift}
      />,
    );
    const button = first(byName(ready.root, 'button', /^Gift/));
    expect(nameOf(button)).toContain('+5 for Anna');
    ready.click(button);
    expect(onGift).toHaveBeenCalledTimes(1);
    const here = draw(
      <GiftButton
        today={{ gifted: true, stamped: false }}
        giftLeft={false}
        busy={false}
        owner="Anna"
        onGift={onGift}
      />,
    );
    expect(visibleText(here.root)).toContain('Gift given today');
    expect(byName(here.root, 'button', /./)).toHaveLength(0);
    const elsewhere = draw(
      <GiftButton
        today={{ gifted: false, stamped: false }}
        giftLeft={false}
        busy={false}
        owner="Anna"
        onGift={onGift}
      />,
    );
    expect(visibleText(elsewhere.root)).toContain('Gift given elsewhere today');
    expect(byName(elsewhere.root, 'button', /./)).toHaveLength(0);
  });

  it('ignores a press while a request runs', () => {
    const onGift = vi.fn();
    const busy = draw(
      <GiftButton
        today={{ gifted: false, stamped: false }}
        giftLeft
        busy
        owner="Anna"
        onGift={onGift}
      />,
    );
    busy.click(first(byName(busy.root, 'button', /^Gift/)));
    expect(onGift).not.toHaveBeenCalled();
  });
});
