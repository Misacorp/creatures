import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { homeAlerts } from '../home-view';
import { byClass, createPage, type Page } from '../test-dom';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import type { PlaceId } from './valley-art';
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
const AT_ARENA: ValleyView = { kind: 'place', place: 'arena', book: null };

function draw(sceneless?: readonly PlaceId[]): Page {
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <ValleyFrame
        view={AT_ARENA}
        creatures={base.creatures}
        trayInput={{ trips: [], jobs: null, now: HOME_NOW }}
        alerts={homeAlerts(base)}
        placeInput={base}
        castExtra={{ dungeonTeam: null, dungeonPhase: null, waiting: [] }}
        {...(sceneless === undefined ? {} : { sceneless })}
        focus={null}
        onOpen={() => undefined}
        onLeave={() => undefined}
        onBook={() => undefined}
        notices={null}
        away={null}
        settings={null}
      >
        <p class="arena-page">The raid</p>
      </ValleyFrame>
    </PopoverHost>,
  );
  return p;
}

describe('a place whose page draws its own scene', () => {
  it('the Arena draws its scene above its page by default', () => {
    const p = draw();
    expect(byClass(p.root, 'vy-inside')).toHaveLength(1);
    expect(byClass(p.root, 'arena-page')).toHaveLength(1);
  });

  it('listed as sceneless: no scene above, only the page', () => {
    const p = draw(['arena']);
    expect(byClass(p.root, 'vy-inside')).toHaveLength(0);
    expect(byClass(p.root, 'arena-page')).toHaveLength(1);
  });

  it('only the listed places: another place listed leaves the Arena its scene', () => {
    const p = draw(['forge']);
    expect(byClass(p.root, 'vy-inside')).toHaveLength(1);
  });
});
