import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import {
  badgesIn,
  byClass,
  byName,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { homeInput } from '../workbench/home-sample';
import { SignpostSeats, type SignpostActions } from './SignpostSeats';
import { sampleSeat, sampleValley } from './signpost-sample';
import { trayStates } from './tray-state';

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

function draw(seats: ReturnType<typeof sampleSeat>[], acorns: number, calls: string[] = []): Page {
  const visit = sampleValley(free, seats);
  const ok = (name: string) => () => {
    calls.push(name);
    return Promise.resolve(true);
  };
  const actions: SignpostActions = {
    post: ok('post'),
    buySeat: ok('buySeat'),
    buyKit: ok('buyKit'),
    setKit: ok('setKit'),
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <SignpostSeats
        visit={visit}
        creatures={free}
        trayInput={{ trips: [], jobs: null, now: 0, ...trayStates(visit) }}
        acorns={acorns}
        busy={false}
        actions={actions}
        onOpenPaddock={() => undefined}
      />
    </PopoverHost>,
  );
  return p;
}

describe('SignpostSeats', () => {
  it('a card for each seat, "Pack full" on a full one, and the next seat to buy with its price', () => {
    const p = draw(
      [sampleSeat('s1', 'tidepools', a.id, 80), sampleSeat('s2', 'tidepools', null, 0)],
      500,
    );
    expect(byClass(p.root, 'sp-seat').length).toBe(3);
    expect(visibleText(p.root)).toMatch(/Pack full/);
    expect(visibleText(p.root)).toMatch(/Nobody posted|Pick a scout/);
  });

  it('buying a seat is one clear button with the cost, and it is off when the Acorns are short', () => {
    const p = draw([sampleSeat('s1', 'tidepools', a.id, 10)], 50);
    const open = byName(p.root, 'button', /A new seat/)[0];
    if (open === undefined) throw new Error('no buy button');
    p.click(open);
    const buy = byName(p.root, 'button', /Buy the seat/)[0];
    expect(buy?.getAttribute('disabled')).not.toBeNull();
    // The price on the button is the Acorn icon and a number; so is what the player has.
    expect(badgesIn(buy as FakeElement)).toEqual([['Bait', '113']]);
    expect(badgesIn(byClass(p.root, 'alert')[0] as FakeElement)).toEqual([
      ['Bait', '50'],
      ['Bait', '113'],
    ]);
    expect(visibleText(p.root)).not.toMatch(/Acorns/);
  });

  it('with the Acorns, the button buys', () => {
    const calls: string[] = [];
    const p = draw([sampleSeat('s1', 'tidepools', a.id, 10)], 500, calls);
    const open = byName(p.root, 'button', /A new seat/)[0];
    if (open === undefined) throw new Error('no buy button');
    p.click(open);
    const buy = byName(p.root, 'button', /Buy the seat/)[0];
    if (buy === undefined) throw new Error('no confirm');
    p.click(buy);
    expect(calls).toEqual(['buySeat']);
  });
});
