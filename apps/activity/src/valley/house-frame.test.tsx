import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { homeAlerts } from '../home-view';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';
import { homeInput } from '../workbench/home-sample';
import { ValleyFrame } from './ValleyFrame';

/**
 * The valley's House place: with housing off it is what it was (a scene, Journal and Stats under it); with housing on the game draws
 * the player's house as the place's canvas (`housing/HousePlace`), so the frame adds neither the scene above nor the rows under it.
 */

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

function draw(housing: boolean): Page {
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <ValleyFrame
        view={{ kind: 'place', place: 'house', book: null }}
        creatures={base.creatures}
        trayInput={{ trips: [], jobs: null, now: base.now }}
        alerts={homeAlerts(base)}
        placeInput={base}
        castExtra={{ dungeonTeam: null, dungeonPhase: null, waiting: [] }}
        housing={housing}
        focus={null}
        onOpen={() => undefined}
        onLeave={() => undefined}
        onBook={() => undefined}
        notices={null}
        away={null}
        settings={null}
      >
        <p>the game's page</p>
      </ValleyFrame>
    </PopoverHost>,
  );
  return p;
}

describe('the valley House and the housing flag', () => {
  it('housing off: the scene, Journal and Stats, and no "Your house" row (as in production)', () => {
    const p = draw(false);
    expect(byName(p.root, 'button', /^Journal/)).toHaveLength(1);
    expect(byName(p.root, 'button', /^Stats/)).toHaveLength(1);
    expect(byName(p.root, 'button', /^Your house/)).toHaveLength(0);
    expect(byClass(p.root, 'vy-house')).toHaveLength(1);
    expect(byClass(p.root, 'vy-inside')).toHaveLength(1);
  });

  it('housing on: only the game’s page (the house canvas) fills the place: no rows, no scene above', () => {
    const p = draw(true);
    expect(byClass(p.root, 'vy-house')).toHaveLength(0);
    expect(byName(p.root, 'button', /^Your house/)).toHaveLength(0);
    expect(byClass(p.root, 'vy-inside')).toHaveLength(0);
    expect(visibleText(p.root)).toContain("the game's page");
  });
});
