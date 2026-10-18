import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DungeonDescend, bankedCounts, nothingBanked } from './DungeonDescend';
import { undercroftState } from './dungeon-undercroft-sample';
import type { DungeonAct } from './dungeon-types';
import { byClass, byName, createPage, FakeElement, visibleText, type Page } from './test-dom';

let page: Page | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'window', { innerHeight: 800 });
  Reflect.set(globalThis, 'requestAnimationFrame', () => 0);
  Reflect.set(globalThis, 'cancelAnimationFrame', () => undefined);
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({ top: 0 }));
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
});

const run = undercroftState('descent');
const descent = (() => {
  if (run.pending?.kind !== 'descend') throw new Error('descent');
  return run.pending;
})();

function draw(over: Partial<Parameters<typeof DungeonDescend>[0]> = {}): {
  page: Page;
  acts: DungeonAct[];
} {
  const acts: DungeonAct[] = [];
  page = createPage();
  page.draw(
    <DungeonDescend
      descent={descent}
      pack={run.pack}
      busy={false}
      onAct={(a) => acts.push(a)}
      {...over}
    />,
  );
  return { page, acts };
}

describe('what the chest banked, as the descent card shows it', () => {
  it('counts the supplies and the parts, and knows when nothing was banked', () => {
    expect(bankedCounts(descent.banked).map((c) => [c.key, c.amount])).toEqual([
      ['supply-satchel-good', 1],
      ['glimmer', 1],
    ]);
    expect(nothingBanked(descent.banked)).toBe(false);
    expect(nothingBanked({ gear: [], supplies: [], parts: {} })).toBe(true);
    expect(nothingBanked({ gear: [], supplies: ['satchel-good'], parts: {} })).toBe(false);
    expect(nothingBanked({ gear: descent.banked.gear, supplies: [], parts: {} })).toBe(false);
  });
});

describe('DungeonDescend', () => {
  it('says the new depth, what is banked, what is at risk and what lies below', () => {
    const { page: p } = draw();
    const text = visibleText(p.root);
    expect(text).toContain('Depth 15 is yours');
    expect(text).toContain('Cinder Charm');
    expect(text).toContain('Sturdy Satchel');
    expect(byName(p.root, 'span', 'Bait: 2')).toHaveLength(1);
    expect(byName(p.root, 'span', 'Essence: 3')).toHaveLength(1);
    expect(byName(p.root, 'span', 'Scrap: 3')).toHaveLength(1);
    expect(text).toContain('At risk');
    expect(text).toContain('The Undercroft · foes are fiercer here');
    expect(text).toContain(
      '4 floors, with a keeper on the last. Foes fight 1 depth deeper than yours.',
    );
    expect(text).toContain('Your creatures catch their breath (20% HP).');
    expect(text).toContain('A defeat below keeps only half your pack, rounded up.');
    expect(byClass(p.root, 'dungeon-descend')).toHaveLength(1);
  });

  it('Descend and heading home are the two acts', () => {
    const { page: p, acts } = draw();
    p.click(byName(p.root, 'button', 'Descend')[0] as FakeElement);
    p.click(byName(p.root, 'button', 'Head home with everything')[0] as FakeElement);
    expect(acts).toEqual([{ type: 'descend' }, { type: 'home' }]);
  });

  it('waits while an act is on its way', () => {
    const { page: p, acts } = draw({ busy: true });
    for (const name of ['Descend', 'Head home with everything']) {
      const b = byName(p.root, 'button', name)[0] as FakeElement;
      expect(b.getAttribute('disabled')).not.toBeNull();
      p.click(b);
    }
    expect(acts).toEqual([]);
  });

  it('after a cracked floor it says so, and an empty chest and an empty pack are said plainly', () => {
    const { page: p } = draw({
      descent: { ...descent, level: 2, floors: 3, banked: { gear: [], supplies: [], parts: {} } },
      pack: { bait: 0, essence: 0, scrap: 0 },
    });
    const text = visibleText(p.root);
    expect(text).toContain('The keeper is down');
    expect(text).toContain('The floor cracks open: an even deeper Undercroft.');
    expect(text).toContain('Nothing new this time.');
    expect(text).toContain('Your pack is empty.');
    expect(text).toContain('A deeper Undercroft · foes are fiercer still');
    expect(text).toContain(
      '3 floors, with a keeper on the last. Foes fight 2 depths deeper than yours.',
    );
    expect(text).toContain('Your pack is empty, so little is at stake.');
  });
});
