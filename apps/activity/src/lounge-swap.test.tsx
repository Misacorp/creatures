import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loungeSample } from './creature-card-sample';
import { LOUNGING_NOW, swapOptions } from './lounge-swap';
import { LoungeSwap } from './LoungeSwap';
import { PopoverHost } from './PopoverHost';
import { SmallCreature } from './SmallCreature';
import { FakeElement, byClass, createPage, find, nameOf, visibleText, type Page } from './test-dom';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

describe('swapOptions', () => {
  it('lists free creatures that still earn first (lowest level first), then Rested, then the lounger and the busy', () => {
    const options = swapOptions(loungeSample());
    expect(options.map((o) => [o.name, o.level, o.disabled, o.rested])).toEqual([
      ['Captain Puddlestomps', 8, null, false],
      ['Hearthshell', 27, null, false],
      ['Mistnewt', 1, null, true],
      ['Lanternfin', 1, LOUNGING_NOW, false],
      ['Cindle', 15, 'Away', false],
    ]);
  });

  it('gives each creature its experience bar towards the next level', () => {
    const options = swapOptions(loungeSample());
    expect(options.find((o) => o.name === 'Captain Puddlestomps')?.xpBar).toMatchObject({
      value: 96,
      max: 328,
      top: false,
      text: '96 / 328',
    });
  });
});

describe('LoungeSwap', () => {
  it('draws every creature with its level, XP and a Rested tag, and picks a free one', () => {
    page = createPage();
    const onPick = vi.fn();
    page.draw(<LoungeSwap state={loungeSample()} onPick={onPick} onClose={() => undefined} />);
    const rows = find(page.root, (e) => e.getAttribute('role') === 'option');
    expect(rows).toHaveLength(5);
    // The card's experience bar: the level tag, then the bar with its numbers.
    const bar = byClass(rows[0] as FakeElement, 'xp-static')[0] as FakeElement;
    expect(visibleText(bar)).toContain('Lv 8');
    expect(visibleText(bar)).toContain('96 / 328');
    expect(find(bar, (e) => e.getAttribute('role') === 'progressbar')).toHaveLength(1);
    expect(byClass(rows[2] as FakeElement, 'rested').map((t) => visibleText(t))).toEqual([
      'Rested',
    ]);
    // A Rested creature can still be chosen.
    page.click(rows[2] as FakeElement);
    expect(onPick).toHaveBeenCalledWith('v-mistnewt');
    // The lounger cannot be picked: it is there already.
    page.click(rows[3] as FakeElement);
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe('the popover of your own creature in the room', () => {
  beforeEach(() => {
    // The little the fake DOM leaves out that the popover asks a browser for (its place on the page).
    vi.stubGlobal('window', {
      innerHeight: 800,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({
      top: 0,
      left: 0,
      width: 10,
      height: 10,
    }));
  });

  afterEach(() => {
    Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
    vi.unstubAllGlobals();
  });

  it('has Move and Swap side by side; each closes the popover and does its thing', () => {
    page = createPage();
    const onMove = vi.fn();
    const onSwap = vi.fn();
    const info = loungeSample().creatures[0];
    if (info === undefined) throw new Error('no creature');
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <SmallCreature
          id="me"
          info={{
            name: 'Mistnewt',
            species: info.species,
            level: 1,
            element: 'tide',
            role: 'guard',
            shiny: false,
            loungeXp: 34,
          }}
          action={[
            { label: 'Move', onAct: onMove },
            { label: 'Swap', onAct: onSwap },
          ]}
        >
          me
        </SmallCreature>
      </PopoverHost>,
    );
    const trigger = find(page.root, (e) => e.localName === 'button')[0] as FakeElement;
    page.click(trigger);
    const row = byClass(page.root, 'pop-actions')[0] as FakeElement;
    const buttons = find(row, (e) => e.localName === 'button');
    expect(buttons.map((b) => nameOf(b))).toEqual(['Move', 'Swap']);
    // The modern head: the name in its rarity's colour, a rarity tag, and the facts as a data table.
    const title = byClass(page.root, 'pop-title')[0] as FakeElement;
    expect(title.getAttribute('class')).toContain('rarity-name');
    expect(byClass(page.root, 'rarity-tag')).toHaveLength(1);
    const table = byClass(page.root, 'data-table')[0] as FakeElement;
    expect(visibleText(table)).toContain('Level');
    // Your own lounger says how far it is today, as on its card.
    const tag = byClass(page.root, 'lounge')[0] as FakeElement;
    expect(visibleText(tag)).toBe('Lounging 34 / 60 XP');
    expect(byClass(tag, 'armchair-icon')).toHaveLength(1);
    page.click(buttons[1] as FakeElement);
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
    expect(byClass(page.root, 'pop-actions')).toHaveLength(0);
  });
});
