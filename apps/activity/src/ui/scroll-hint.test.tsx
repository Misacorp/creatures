import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byClass, createPage, FakeElement, type Page } from '../test-dom';
import { ScrollHint } from './ScrollHint';
import {
  SCROLL_HINT_DELAY_MS,
  SCROLL_HINT_INTERACTIONS,
  SCROLL_HINT_SPEED,
  hasMoreBelow,
  isOwnScroll,
  maxScroll,
  nextScrollTop,
  overflows,
} from './scroll-hint-logic';

/**
 * The scroll hint: rules as pure functions, then the hook and component against the fake DOM with fake timers,
 * a stubbed `requestAnimationFrame` and a stubbed box geometry (the fake DOM has no layout).
 */

describe('scroll hint rules', () => {
  it('stops for a press, a touch, the wheel, a key and focus inside', () => {
    expect([...SCROLL_HINT_INTERACTIONS]).toEqual([
      'pointerdown',
      'touchstart',
      'wheel',
      'keydown',
      'focusin',
    ]);
  });

  it('says whether a box overflows and how far it can scroll', () => {
    expect(maxScroll({ scrollHeight: 500, clientHeight: 200 })).toBe(300);
    expect(maxScroll({ scrollHeight: 100, clientHeight: 200 })).toBe(0);
    expect(overflows({ scrollHeight: 201, clientHeight: 200 })).toBe(false);
    expect(overflows({ scrollHeight: 202, clientHeight: 200 })).toBe(true);
  });

  it('says whether there is more below', () => {
    expect(hasMoreBelow({ scrollHeight: 500, clientHeight: 200, scrollTop: 0 })).toBe(true);
    expect(hasMoreBelow({ scrollHeight: 500, clientHeight: 200, scrollTop: 299 })).toBe(false);
    expect(hasMoreBelow({ scrollHeight: 100, clientHeight: 200, scrollTop: 0 })).toBe(false);
  });

  it('moves 12 px a second, never up and never past the bottom, and not far after a long gap', () => {
    expect(SCROLL_HINT_DELAY_MS).toBe(2500);
    expect(SCROLL_HINT_SPEED).toBe(12);
    expect(nextScrollTop(0, 100, 12, 300)).toBeCloseTo(1.2);
    expect(nextScrollTop(50, 0, 12, 300)).toBe(50);
    expect(nextScrollTop(50, -40, 12, 300)).toBe(50);
    expect(nextScrollTop(299.9, 100, 12, 300)).toBe(300);
    // A hidden tab's long gap counts as a tenth of a second.
    expect(nextScrollTop(0, 60_000, 12, 300)).toBeCloseTo(1.2);
  });

  it('knows its own scroll from the player, with room for the browser rounding', () => {
    expect(isOwnScroll(10, 10)).toBe(true);
    expect(isOwnScroll(10, 9.4)).toBe(true);
    expect(isOwnScroll(40, 10)).toBe(false);
    expect(isOwnScroll(3, 10)).toBe(false);
  });
});

interface Geometry {
  height: number;
  client: number;
  top: number;
  /** The browser rounds the scroll position to whole pixels. */
  round: boolean;
}

let geo: Geometry;
let page: Page | null = null;
let frames: Map<number, (time: number) => void>;
let frameId = 0;

function installGeometry(): void {
  const proto = FakeElement.prototype;
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => geo.height });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => geo.client });
  Object.defineProperty(proto, 'scrollTop', {
    configurable: true,
    get: () => geo.top,
    set: (value: number) => {
      geo.top = geo.round ? Math.floor(value) : value;
    },
  });
}

beforeEach(() => {
  geo = { height: 500, client: 200, top: 0, round: false };
  installGeometry();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  frames = new Map();
  frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    frameId += 1;
    frames.set(frameId, cb);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(FakeElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(FakeElement.prototype, 'clientHeight');
  Reflect.deleteProperty(FakeElement.prototype, 'scrollTop');
});

function draw(
  contentKey: string,
  options: { delayMs?: number; speed?: number; reducedMotion?: boolean } = {},
): FakeElement {
  page ??= createPage();
  page.draw(
    <ScrollHint contentKey={contentKey} class="box" {...options}>
      <p>Content</p>
    </ScrollHint>,
  );
  const [body] = byClass(page.root, 'scroll-hint-body');
  if (body === undefined) throw new Error('no box');
  return body;
}

function advance(ms: number): void {
  (page as Page).update(() => {
    vi.advanceTimersByTime(ms);
  });
}

let clock = 0;

/** Runs the queued animation frames `count` times, 16 ms apart. */
function runFrames(count: number): void {
  (page as Page).update(() => {
    for (let i = 0; i < count; i += 1) {
      const queued = [...frames.entries()];
      frames.clear();
      clock += 16;
      for (const [, cb] of queued) cb(clock);
    }
  });
}

const className = (): string =>
  byClass((page as Page).root, 'scroll-hint')[0]?.getAttribute('class') ?? '';

describe('the scroll hint', () => {
  it('does nothing at all when the content fits', () => {
    geo.height = 200;
    draw('a');
    expect(vi.getTimerCount()).toBe(0);
    advance(10_000);
    expect(frames.size).toBe(0);
    expect(geo.top).toBe(0);
    expect(className()).toBe('scroll-hint');
  });

  it('waits 2.5 s, then moves the content down about 12 px a second', () => {
    draw('a');
    advance(2499);
    expect(frames.size).toBe(0);
    advance(1);
    expect(frames.size).toBe(1);
    // The first frame only takes the time; a second of frames later it has moved about 12 px.
    runFrames(1);
    expect(geo.top).toBe(0);
    runFrames(62);
    expect(geo.top).toBeGreaterThan(11);
    expect(geo.top).toBeLessThan(13);
  });

  it('takes the delay and the speed as options', () => {
    draw('a', { delayMs: 500, speed: 60 });
    advance(499);
    expect(frames.size).toBe(0);
    advance(1);
    runFrames(1);
    runFrames(62);
    expect(geo.top).toBeGreaterThan(58);
    expect(geo.top).toBeLessThan(62);
  });

  it('stops at the bottom and asks for no more frames', () => {
    geo.height = 210;
    draw('a', { speed: 120 });
    advance(2500);
    runFrames(200);
    expect(geo.top).toBe(10);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(className()).toBe('scroll-hint');
  });

  it('never goes past the bottom when the box shrank under it', () => {
    draw('a', { speed: 600 });
    advance(2500);
    runFrames(2);
    geo.height = 230;
    runFrames(100);
    expect(geo.top).toBe(30);
  });

  it.each(SCROLL_HINT_INTERACTIONS)('stops for good on %s while it moves', (type) => {
    const body = draw('a', { speed: 120 });
    advance(2500);
    runFrames(30);
    const where = geo.top;
    expect(where).toBeGreaterThan(0);
    (page as Page).event(body, type);
    expect(frames.size).toBe(0);
    runFrames(30);
    advance(10_000);
    expect(geo.top).toBe(where);
    expect(frames.size).toBe(0);
  });

  it.each(SCROLL_HINT_INTERACTIONS)('stops on %s during the rest, before it starts', (type) => {
    const body = draw('a');
    advance(1000);
    (page as Page).event(body, type);
    expect(vi.getTimerCount()).toBe(0);
    advance(10_000);
    expect(frames.size).toBe(0);
    expect(geo.top).toBe(0);
  });

  it('stops on a scroll it did not cause, and never scrolls back up', () => {
    const body = draw('a', { speed: 120 });
    advance(2500);
    runFrames(20);
    // The player drags the content to the top.
    geo.top = 0;
    (page as Page).event(body, 'scroll');
    runFrames(20);
    advance(10_000);
    expect(geo.top).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('is not stopped by the scroll events of its own movement, also when the browser rounds', () => {
    geo.round = true;
    const body = draw('a', { speed: 120 });
    advance(2500);
    for (let i = 0; i < 40; i += 1) {
      runFrames(1);
      (page as Page).event(body, 'scroll');
    }
    expect(geo.top).toBeGreaterThan(5);
    expect(frames.size).toBe(1);
  });

  it('starts again for new content, from the top, every time', () => {
    const body = draw('a', { speed: 120 });
    advance(2500);
    runFrames(30);
    (page as Page).event(body, 'wheel');
    expect(frames.size).toBe(0);
    // Another item: the box starts at the top and the hint runs again, though the player stopped it before.
    draw('b', { speed: 120 });
    expect(geo.top).toBe(0);
    advance(2499);
    expect(frames.size).toBe(0);
    advance(1);
    runFrames(30);
    expect(geo.top).toBeGreaterThan(0);
    // And again for a third.
    draw('c', { speed: 120 });
    expect(geo.top).toBe(0);
    advance(2500);
    runFrames(30);
    expect(geo.top).toBeGreaterThan(0);
  });

  it('drops the pending wait and the running frame when the content changes', () => {
    draw('a');
    advance(1000);
    draw('b');
    expect(vi.getTimerCount()).toBe(1);
    advance(2500);
    expect(frames.size).toBe(1);
    draw('c');
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('cleans up its timer, frame and listeners when it goes away', () => {
    const body = draw('a');
    advance(2500);
    expect(frames.size).toBe(1);
    (page as Page).draw(null);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(body.listeners.get('scroll') ?? []).toHaveLength(0);
    for (const type of SCROLL_HINT_INTERACTIONS) {
      expect(body.listeners.get(type) ?? [], type).toHaveLength(0);
    }
  });

  it('does not auto-scroll under reduced motion, and shows the fade instead', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    draw('a');
    expect(vi.getTimerCount()).toBe(0);
    advance(10_000);
    expect(frames.size).toBe(0);
    expect(geo.top).toBe(0);
    expect(className()).toBe('scroll-hint more');
  });

  it('can be told to move or not whatever the browser says', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    draw('a', { reducedMotion: false });
    advance(2500);
    expect(frames.size).toBe(1);
    page?.unmount();
    page = null;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    draw('a', { reducedMotion: true });
    advance(10_000);
    expect(frames.size).toBe(0);
  });

  it('shows the fade while there is more below and not at the bottom', () => {
    const body = draw('a');
    expect(className()).toBe('scroll-hint more');
    geo.top = 300;
    (page as Page).event(body, 'scroll');
    expect(className()).toBe('scroll-hint');
    geo.top = 100;
    (page as Page).event(body, 'scroll');
    expect(className()).toBe('scroll-hint more');
  });

  it('hides the scrollbar by class and keeps the fade out of the reading order', () => {
    draw('a');
    const fade = byClass((page as Page).root, 'scroll-hint-fade')[0];
    expect(fade?.getAttribute('aria-hidden')).toBe('true');
  });
});
