import { afterEach, describe, expect, it, vi } from 'vitest';
import { GearItemsContext } from '../../gear-items-context';
import { PopoverHost } from '../../PopoverHost';
import { byClass, byName, createPage, type FakeElement, type Page } from '../../test-dom';
import { ComingHome } from './ComingHome';
import {
  COUNT_STEPS,
  countSteps,
  flyMode,
  flyParam,
  homeGains,
  originOf,
  stepText,
  coinCount,
  coinDelay,
  coinOffset,
  purseDisplay,
  targetOf,
} from './coming-home';
import { welcomeOf } from './highlights';
import { DAILY, WEEKLY } from './journey';
import { WelcomeSheet } from './WelcomeSheet';
import { castOf, welcomeWorld } from './welcome-world';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const first = (list: FakeElement[]): FakeElement => {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
};

describe('what a visit brought home', () => {
  it('is the visit’s Acorns (the library’s Bait) as a whole number, nothing when none came', () => {
    const visit = DAILY.visits[21];
    if (visit === undefined) throw new Error('no visit 22');
    const gains = homeGains(visit);
    expect(gains).toEqual([{ resource: 'bait', amount: Math.round(visit.cameHome.acorns) }]);
    expect(homeGains({ ...visit, cameHome: { ...visit.cameHome, acorns: 0.2 } })).toEqual([]);
  });

  it('has whole, positive amounts in every visit of both journeys', () => {
    for (const journey of [DAILY, WEEKLY]) {
      for (const visit of journey.visits) {
        for (const g of homeGains(visit)) {
          expect(Number.isInteger(g.amount)).toBe(true);
          expect(g.amount).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('the count-up', () => {
  it('rises without falling, starts above zero and ends exactly on the amount', () => {
    for (const amount of [1, 2, 7, 180, 4321]) {
      const steps = countSteps(amount);
      expect(steps).toHaveLength(COUNT_STEPS);
      expect(steps[0]).toBeGreaterThanOrEqual(1);
      expect(steps.at(-1)).toBe(amount);
      for (let i = 1; i < steps.length; i += 1) {
        expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1] ?? 0);
      }
    }
  });

  it('rushes at the end: the last step is the biggest', () => {
    const s = countSteps(180);
    expect((s.at(-1) ?? 0) - (s.at(-2) ?? 0)).toBeGreaterThan((s[1] ?? 0) - (s[0] ?? 0));
  });

  it('counts nothing as "+0" and clamps the step', () => {
    expect(stepText(0, 3)).toBe('+0');
    expect(stepText(180, 99)).toBe('+180');
    expect(stepText(180, -4)).toBe(`+${String(countSteps(180)[0])}`);
  });
});

describe('the coin swarm', () => {
  it('scales the coin count with the amount: 6 for small, capped at 16, none for nothing', () => {
    expect(coinCount(0)).toBe(0);
    expect(coinCount(1)).toBe(6);
    expect(coinCount(52)).toBe(9);
    expect(coinCount(180)).toBe(16);
    expect(coinCount(100000)).toBe(16);
  });

  it('bursts the same way every time, every coin to its own place, and staggers them', () => {
    const a = Array.from({ length: 12 }, (_, i) => coinOffset(i, 12));
    const b = Array.from({ length: 12 }, (_, i) => coinOffset(i, 12));
    expect(a).toEqual(b);
    expect(new Set(a.map((o) => `${String(o.x)},${String(o.y)}`)).size).toBe(12);
    const delays = Array.from({ length: 12 }, (_, i) => coinDelay(i, 12));
    expect(delays[0]).toBe(0);
    expect([...delays].sort((x, y) => x - y)).toEqual(delays);
    expect(delays.at(-1)).toBeLessThan(1100 * 0.4);
  });
});

describe('the purse’s count-up', () => {
  it('starts at the total less the gain and ends on the total', () => {
    expect(purseDisplay(100, 52, 0)).toBe(48);
    expect(purseDisplay(100, 52, 13)).toBe(61);
    expect(purseDisplay(100, 52, 52)).toBe(100);
    expect(purseDisplay(100, 52, 999)).toBe(100);
  });
});

describe('where and how it plays', () => {
  it('starts in the paper and lands in the middle of the purse', () => {
    expect(originOf({ left: 10, top: 100, width: 370, height: 500 })).toEqual({ x: 195, y: 300 });
    expect(targetOf({ left: 300, top: 8, width: 80, height: 40 })).toEqual({ x: 340, y: 28 });
  });

  it('does not fly under reduced motion or in a screenshot, unless the dev param freezes it mid-flight', () => {
    expect(flyMode({ reduced: false, still: false, param: null })).toBe('play');
    expect(flyMode({ reduced: true, still: false, param: null })).toBe('still');
    expect(flyMode({ reduced: false, still: true, param: null })).toBe('still');
    expect(flyMode({ reduced: true, still: true, param: 'mid' })).toBe('mid');
    expect(flyParam('#welcome?step=1&fly=mid')).toBe('mid');
    expect(flyParam('#welcome?step=1&fly=midway')).toBeNull();
  });
});

const world = welcomeWorld();
const cast = castOf(world);
const welcome = welcomeOf(DAILY, 21, cast);

function drawSheet(onClose: (at: { x: number; y: number }) => void): Page {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  page = createPage();
  page.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <GearItemsContext.Provider value={world.items}>
        <WelcomeSheet welcome={welcome} cast={cast} items={world.items} open onClose={onClose} />
      </GearItemsContext.Provider>
    </PopoverHost>,
  );
  return page;
}

describe('closing the Gazette', () => {
  it('says that everything is already home, under the date', () => {
    drawSheet(() => undefined);
    expect(byClass(page?.root as FakeElement, 'wb-home-note')).toHaveLength(1);
  });

  it('starts the moment from the footer button', () => {
    const onClose = vi.fn();
    const p = drawSheet(onClose);
    p.click(first(byName(p.root, 'button', /more thing/)));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('starts the moment from the drawer’s X too', () => {
    const onClose = vi.fn();
    const p = drawSheet(onClose);
    p.click(first(byName(p.root, 'button', 'Close')));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ x: 0, y: 0 });
  });
});

function drawMoment(
  mode: 'play' | 'still',
  handlers: { onLand: () => void; onDone: () => void; onCount?: (r: string, n: number) => void },
) {
  page = createPage();
  page.draw(
    <ComingHome
      gains={[{ resource: 'bait', amount: 180 }]}
      from={{ x: 195, y: 300 }}
      mode={mode}
      onCount={() => undefined}
      {...handlers}
    />,
  );
  return page;
}

describe('the moment', () => {
  it('draws the swarm while flying, none under reduced motion', () => {
    vi.useFakeTimers();
    const noop = { onLand: () => undefined, onDone: () => undefined };
    const flying = drawMoment('play', noop);
    expect(byClass(flying.root, 'wb-coin')).toHaveLength(coinCount(180));
    flying.unmount();
    const still = drawMoment('still', noop);
    expect(byClass(still.root, 'wb-coin')).toHaveLength(0);
  });

  it('tells the purse how much has landed: rising to the full gain, at once under reduced motion', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const p = drawMoment('play', {
      onLand: () => undefined,
      onDone: () => undefined,
      onCount: (_r, n) => seen.push(n),
    });
    p.update(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(180);
    expect(seen.at(-1)).toBe(180);
    p.unmount();
    const atOnce: number[] = [];
    drawMoment('still', {
      onLand: () => undefined,
      onDone: () => undefined,
      onCount: (_r, n) => atOnce.push(n),
    });
    expect(atOnce).toEqual([180]);
  });

  it('flies: counts up, lands, then ends, and a tap anywhere finishes it at once', () => {
    vi.useFakeTimers();
    const onLand = vi.fn();
    const onDone = vi.fn();
    const p = drawMoment('play', { onLand, onDone });
    const root = first(byClass(p.root, 'wb-fly'));
    expect(root.getAttribute('class')).toContain('play');
    expect(root.textContent).toContain('+');
    p.update(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    p.update(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('is finished by a tap anywhere, the purse landing as if it had run out', () => {
    vi.useFakeTimers();
    const onLand = vi.fn();
    const onDone = vi.fn();
    const p = drawMoment('play', { onLand, onDone });
    p.event(p.document.body, 'pointerdown');
    expect(onLand).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('does not fly under reduced motion: the total with "+180" beside the purse for a moment', () => {
    vi.useFakeTimers();
    const onLand = vi.fn();
    const onDone = vi.fn();
    const p = drawMoment('still', { onLand, onDone });
    const root = first(byClass(p.root, 'wb-fly'));
    expect(root.getAttribute('class')).toContain('still');
    expect(root.textContent).toContain('+180');
    p.update(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).not.toHaveBeenCalled();
    p.update(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onLand).not.toHaveBeenCalled();
  });
});
