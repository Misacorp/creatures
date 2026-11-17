import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { homeAlerts } from '../home-view';
import { byClass, createPage, visibleText, type Page } from '../test-dom';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { HonoursContext, honoursOf } from './HonourRibbon';
import { sampleValley } from './signpost-sample';
import { sampleSchool, sampleTrial, withTrials } from './school-sample';
import type { SchoolFeed } from './school-feed';
import { WAITING_LINE } from './school-view';
import { ValleyFrame } from './ValleyFrame';
import type { ValleyView } from './valley-nav';

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
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

const base = homeInput('busy', true);
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('sample creatures');

const feed = (view: SchoolFeed['view']): SchoolFeed => ({
  view,
  actions: { seat: () => Promise.resolve(true) },
  now: HOME_NOW,
  zone: 'Europe/Helsinki',
});

function draw(
  view: ValleyView,
  school: SchoolFeed | undefined,
  options: { systems?: boolean; ready?: number; honours?: Parameters<typeof honoursOf>[0] } = {},
): Page {
  const p = createPage();
  page = p;
  const systems = options.systems ?? true;
  const valley = sampleValley(free, []);
  const visit = systems
    ? withTrials(valley, {}, { ready: options.ready ?? 0, nextAt: HOME_NOW + 3_600_000 })
    : null;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <HonoursContext.Provider value={honoursOf(options.honours ?? [])}>
        <ValleyFrame
          view={view}
          creatures={free}
          trayInput={{ trips: [], jobs: null, now: HOME_NOW }}
          alerts={homeAlerts(base)}
          placeInput={base}
          castExtra={{ dungeonTeam: null, dungeonPhase: null, waiting: [] }}
          visit={visit}
          {...(school === undefined ? {} : { school })}
          focus={null}
          onOpen={() => undefined}
          onLeave={() => undefined}
          onBook={() => undefined}
          notices={null}
          away={null}
          settings={null}
        >
          {null}
        </ValleyFrame>
      </HonoursContext.Provider>
    </PopoverHost>,
  );
  return p;
}

const AT_SCHOOL: ValleyView = { kind: 'soon', place: 'school' };

describe('the School’s place with the valley systems on', () => {
  it('here: the School as a canvas (the lectern, the seats, the house), no page under it', () => {
    const p = draw(AT_SCHOOL, feed(sampleSchool({ wouldLearn: [a.id] })), { ready: 2 });
    expect(byClass(p.root, 'pc-root')).toHaveLength(1);
    expect(byClass(p.root, 'sch-page')).toHaveLength(0);
    expect(byClass(p.root, 'vy-soon')).toHaveLength(1);
    const names = byClass(p.root, 'cv-target').map((el) => el.getAttribute('aria-label') ?? '');
    expect(names.some((n) => /^The lectern, the visiting teacher is here/.test(n))).toBe(true);
    expect(names.some((n) => /^The graduation stage, 2 ready to graduate/.test(n))).toBe(true);
    expect(visibleText(p.root)).not.toContain(WAITING_LINE);
  });

  it('away: still the canvas (an empty yard, the teacher line read out), never a countdown', () => {
    const p = draw(AT_SCHOOL, feed(sampleSchool({ phase: 'away' })));
    expect(byClass(p.root, 'pc-root')).toHaveLength(1);
    expect(visibleText(p.root)).toContain('No teacher at the School right now.');
    expect(visibleText(p.root)).not.toMatch(/until|\d+ ?h\b/i);
  });

  it('before the server has said: the old "not open yet" line', () => {
    const p = draw(AT_SCHOOL, feed(null));
    expect(byClass(p.root, 'pc-root')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });

  it('with the systems off nothing changes, even if a feed is given', () => {
    const p = draw(AT_SCHOOL, feed(sampleSchool()), { systems: false });
    expect(byClass(p.root, 'pc-root')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });

  it('without a feed (the flag off) the place is as it was', () => {
    const p = draw(AT_SCHOOL, undefined);
    expect(byClass(p.root, 'pc-root')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });

  it('a seated student stands in the scene, and an honour shows on its sprite there', () => {
    const p = draw(AT_SCHOOL, feed(sampleSchool({ seated: [a.id, null], wouldLearn: [a.id] })), {
      honours: [{ id: a.id, trial: sampleTrial({ honour: 1 }) }],
    });
    expect(byClass(p.root, 'vy-stand')).toHaveLength(1);
    expect(byClass(p.root, 'honour-ribbon')).toHaveLength(1);
  });
});
