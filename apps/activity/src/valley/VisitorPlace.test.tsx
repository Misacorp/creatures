import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { homeAlerts } from '../home-view';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { ValleyFrame } from './ValleyFrame';
import type { VisitorFeed } from './VisitorPage';
import { DEFAULT_LOOK, placePlacements, visitorName } from './valley-places';
import { sampleValley } from './signpost-sample';
import { trayStates } from './tray-state';
import { SAMPLE_AWAY, SAMPLE_GEAR, sampleVisitor } from './visitor-sample';
import { AWAY_LINE, WAITING_LINE } from './visitor-view';
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
  vi.unstubAllGlobals();
  page?.unmount();
  page = null;
});

const base = homeInput('busy', true);
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));

const feed = (view: VisitorFeed['view']): VisitorFeed => ({
  view,
  actions: {
    look: () => Promise.resolve(undefined),
    reroll: () => Promise.resolve(undefined),
    buy: () => Promise.resolve(undefined),
  },
  items: SAMPLE_GEAR.items,
  blueprints: SAMPLE_GEAR.blueprints,
  purse: { acorns: 900, scrap: 9000, shards: 200 },
});

function draw(view: ValleyView, visitor: VisitorFeed | undefined, systems = true): Page {
  const p = createPage();
  page = p;
  const visit = systems ? sampleValley(free, []) : null;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <ValleyFrame
        view={view}
        creatures={free}
        trayInput={{
          trips: [],
          jobs: null,
          now: HOME_NOW,
          ...(visit === null ? {} : trayStates(visit)),
        }}
        alerts={homeAlerts(base)}
        placeInput={base}
        castExtra={{ dungeonTeam: null, dungeonPhase: null, waiting: [] }}
        visit={visit}
        {...(visitor === undefined ? {} : { visitor })}
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
    </PopoverHost>,
  );
  return p;
}

const AT_VISITOR: ValleyView = { kind: 'soon', place: 'visitor' };

describe('his place with the valley systems on', () => {
  it('here: his stall as a scene, and his page under it (the reroll and the week`s blueprint)', () => {
    const p = draw(AT_VISITOR, feed(sampleVisitor()));
    expect(byClass(p.root, 'vs-page')).toHaveLength(1);
    expect(byClass(p.root, 'vy-soon')).toHaveLength(0);
    const text = visibleText(p.root);
    expect(text).toMatch(/Reroll a piece/);
    expect(text).toMatch(/This week.s blueprint/);
    // No timer and no "until" line while he is here.
    expect(text).not.toMatch(/until|back thursday|\d+ ?h\b/i);
    expect(visibleText(p.root)).not.toContain(AWAY_LINE);
  });

  it('away: the shuttered spot and one line that he is back Thursday, no page', () => {
    const p = draw(AT_VISITOR, feed(SAMPLE_AWAY));
    expect(byClass(p.root, 'vs-page')).toHaveLength(0);
    expect(byClass(p.root, 'vy-soon')).toHaveLength(1);
    expect(visibleText(p.root)).toContain(AWAY_LINE);
    expect(byName(p.root, 'button', /Reroll/)).toHaveLength(0);
  });

  it('before the server has said: the old "not open yet" line', () => {
    const p = draw(AT_VISITOR, feed(null));
    expect(byClass(p.root, 'vs-page')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });

  it('with the systems off nothing changes: the place stays not open yet even if a feed is given', () => {
    const p = draw(AT_VISITOR, feed(sampleVisitor()), false);
    expect(byClass(p.root, 'vs-page')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });

  it('without a feed (the flag off) his place is as it was', () => {
    const p = draw(AT_VISITOR, undefined);
    expect(byClass(p.root, 'vs-page')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });
});

describe('his stall on the map follows the server', () => {
  it('is the open stall while he is here and the shuttered one while he is away', () => {
    expect(visitorName(true)).toBe('visitor');
    expect(visitorName(false)).toBe('visitor-away');
    // The two looks draw different sprites at his spot.
    const here = placePlacements({ ...DEFAULT_LOOK, visitorHere: true });
    const away = placePlacements({ ...DEFAULT_LOOK, visitorHere: false });
    expect(here).toHaveLength(away.length);
    const differing = here.filter((p, i) => p.sprite !== away[i]?.sprite);
    expect(differing).toHaveLength(1);
  });
});
