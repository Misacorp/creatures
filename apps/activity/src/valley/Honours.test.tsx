import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatureCard } from '../CreatureCard';
import { CreatureHead } from '../CreatureHead';
import { PopoverHost } from '../PopoverHost';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleCreature } from '../creature-card-sample';
import { creatureName } from '../game';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { HonoursContext, honoursOf } from './HonourRibbon';
import { sampleTrial } from './school-sample';

let page: Page | null = null;
beforeEach(() => {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
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

const creature = sampleCreature('growing');
const state = { ...SAMPLE_STATE, creatures: [creature] };

function drawCard(trial: ReturnType<typeof sampleTrial> | undefined, level = creature.level): Page {
  const p = createPage();
  page = p;
  const c = { ...creature, level };
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <HonoursContext.Provider value={honoursOf(trial === undefined ? [] : [{ id: c.id, trial }])}>
        <ul>
          <CreatureCard
            creature={c}
            state={state}
            gear={SAMPLE_GEAR}
            busy={false}
            found={false}
            actions={{ onRibbon: vi.fn(), onEvolve: vi.fn(), onLounge: vi.fn() }}
            onAnswerCatch={vi.fn()}
            onOpen={vi.fn()}
          />
        </ul>
      </HonoursContext.Provider>
    </PopoverHost>,
  );
  return p;
}

const pips = (p: Page): FakeElement | undefined => byClass(p.root, 'trial-pips')[0];

describe('the next trial on the card (V-TRIAL-3)', () => {
  it('shows only the next trial as pips for its boxes, the ticked ones lit', () => {
    const p = drawCard(sampleTrial({ ticked: 2 }));
    const button = pips(p);
    expect(button?.getAttribute('aria-label')).toBe('Bronze trial, 2 of 4 boxes ticked');
    expect(byClass(button ?? p.root, 'pips')).toHaveLength(1);
    const lit = byClass(button ?? p.root, 'on');
    expect(lit).toHaveLength(2);
    // Only the next trial: nothing names Silver or Gold on the card.
    expect(visibleText(p.root)).not.toMatch(/Silver|Gold/);
  });

  it('has nothing for a creature the server has no trial for (the valley systems off)', () => {
    const p = drawCard(undefined);
    expect(pips(p)).toBeUndefined();
  });

  it('has nothing once Gold is held', () => {
    const p = drawCard(sampleTrial({ honour: 3 }));
    expect(pips(p)).toBeUndefined();
  });

  it('opens the list in the one popover on a tap: a line per box, ticked or not, as text', () => {
    const p = drawCard(sampleTrial({ ticked: 1 }), 12);
    const button = pips(p);
    if (button === undefined) throw new Error('no pips');
    p.click(button);
    const dialog = byName(p.root, 'div', /Bronze trial/)[0] ?? byClass(p.root, 'popover')[0];
    expect(dialog).toBeDefined();
    const list = byClass(p.root, 'trial-list')[0];
    expect(list?.childNodes).toHaveLength(4);
    const text = visibleText(p.root);
    expect(text).toContain('Clear a dungeon run');
    expect(text).toContain('A moment at the bonfire');
    expect(byClass(p.root, 'trial-box').filter((li) => li.classList.contains('done'))).toHaveLength(
      1,
    );
  });

  it('says the boxes tick from the level for a creature below it', () => {
    const p = drawCard(sampleTrial({ ticked: 0 }), 4);
    const button = pips(p);
    if (button === undefined) throw new Error('no pips');
    p.click(button);
    expect(visibleText(p.root)).toContain('The boxes tick from level 10.');
  });
});

describe('an honour on the card and the sprite (V-TRIAL-1)', () => {
  it('shows the title ("Pip, Silver"), a badge and the ribbon on the portrait', () => {
    const p = drawCard(sampleTrial({ honour: 2 }));
    const name = creatureName(creature);
    expect(visibleText(p.root)).toContain(`${name}, Silver`);
    expect(byClass(p.root, 'badge').some((b) => visibleText(b) === 'Silver')).toBe(true);
    expect(byClass(p.root, 'honour-ribbon')).toHaveLength(1);
    // The next trial is Gold.
    expect(pips(p)?.getAttribute('aria-label')).toMatch(/^Gold trial/);
  });

  it('shows nothing of an honour for a creature with none: the plain name, no badge, no ribbon', () => {
    const p = drawCard(sampleTrial({ honour: 0, ticked: 1 }));
    const name = creatureName(creature);
    expect(visibleText(p.root)).not.toContain(`${name},`);
    expect(byClass(p.root, 'honour-ribbon')).toHaveLength(0);
    expect(byClass(p.root, 'badge').some((b) => /Bronze|Silver|Gold/.test(visibleText(b)))).toBe(
      false,
    );
  });

  it('is the same on the creature page’s head: the title and the ribbon', () => {
    const p = createPage();
    page = p;
    p.draw(
      <HonoursContext.Provider
        value={honoursOf([{ id: creature.id, trial: sampleTrial({ honour: 1 }) }])}
      >
        <CreatureHead creature={creature} state={state} nameId="n" />
      </HonoursContext.Provider>,
    );
    expect(visibleText(p.root)).toContain(`${creatureName(creature)}, Bronze`);
    expect(byClass(p.root, 'honour-ribbon')).toHaveLength(1);
  });

  it('reads honours from the valley’s creatures by id', () => {
    const map = honoursOf([{ id: 'a', trial: sampleTrial({ honour: 2 }) }, { id: 'b' }]);
    expect(map.get('a')?.honour).toBe(2);
    expect(map.has('b')).toBe(false);
    expect(honoursOf(undefined).size).toBe(0);
  });
});
