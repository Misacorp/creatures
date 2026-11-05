import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { byClass, byName, createPage, type Page } from '../test-dom';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { PlaceScene } from './PlaceScene';
import { castFor, type CastInput } from './place-cast';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
});
let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

const base = homeInput('busy', true);
const input = (extra: Partial<CastInput>): CastInput => ({
  ...base,
  dungeonTeam: null,
  waiting: [],
  now: HOME_NOW,
  ...extra,
});
const ART = { width: 64, height: 54 };

function draw(cast: ReturnType<typeof castFor>, onAct: () => void = () => undefined): Page {
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <PlaceScene cast={cast} onAct={onAct} />
    </PopoverHost>,
  );
  return p;
}

describe('PlaceScene', () => {
  it('a newcomer at the gate is the real creature with the Paddock’s bubble, a button that takes the action’s route', () => {
    const waiting = [{ id: 'w1', species: 'cindle', shiny: false }];
    const cast = castFor('paddock', input({ waiting, pending: 1 }), ART, []);
    let acted = 0;
    const p = draw(cast, () => {
      acted += 1;
    });
    const gate = byName(p.root, 'button', /waits at the gate/)[0];
    if (gate === undefined) throw new Error('no newcomer');
    expect(gate.getAttribute('aria-label')).toMatch(/^Cindle waits at the gate/);
    expect(byClass(p.root, 'vy-bubble')).toHaveLength(1);
    expect(byClass(gate, 'vy-creature')).toHaveLength(1);
    p.click(gate);
    expect(acted).toBe(1);
  });

  it('the arena’s boss has an accessible name', () => {
    const raid = {
      ...(base.raid ?? { schedule: {} as never }),
      scene: { boss: { id: 'old-bogback', name: 'Old Bogback' }, party: [] },
    };
    const cast = castFor('arena', input({ raid }), ART, []);
    const p = draw(cast);
    const region = byClass(p.root, 'vy-region-box')[0];
    expect(region?.getAttribute('aria-label')).toBe('This week: Old Bogback');
    expect(region?.getAttribute('role')).toBe('img');
  });

  it('no boss before the raid view has loaded', () => {
    const p = draw(castFor('arena', input({ raid: null }), ART, []));
    expect(byClass(p.root, 'vy-region-box')).toHaveLength(0);
  });
});
