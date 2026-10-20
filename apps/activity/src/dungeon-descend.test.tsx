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
      depth={run.depth}
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
      ['supply-map-scrap-good', 1],
      ['ember-shard', 2],
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
    expect(text).toContain('Depth 15 unlocked');
    expect(text).toContain(
      'You beat the floor boss and achieved a new depth. Do you dare delve deeper?',
    );
    expect(text).toContain('Banked now');
    // The headings say it: no help paragraph under them.
    expect(text).not.toContain('are yours, no matter what happens below');
    expect(text).toContain('Ember Muffler');
    expect(text).toContain('Inked Map');
    expect(byName(p.root, 'span', 'Bait: 2')).toHaveLength(1);
    expect(byName(p.root, 'span', 'Essence: 3')).toHaveLength(1);
    expect(byName(p.root, 'span', 'Scrap: 7')).toHaveLength(1);
    expect(text).toContain('Still at risk');
    expect(text).not.toContain('you risk losing some of them');
    expect(text).not.toContain('In your pack:');
    expect(text).toContain('The Undercroft');
    expect(text).not.toContain('foes are fiercer');
    expect(text).toContain('4 rooms with a floor boss at the end. Foes are from depth 15.');
    expect(text).toContain(
      'Your creatures catch their breath and heal 20% HP. Downed creatures revive to 10% HP.',
    );
    expect(text).toContain('Fights in the Undercroft reward double loot.');
    expect(text).toContain("Once you go down, you fight to the end. If you're lucky,");
    expect(text).toContain('Keep half of your pack if you are defeated.');
    expect(text).toContain('Keep your full pack.');
    expect(byClass(p.root, 'dungeon-descend')).toHaveLength(1);
    expect(byClass(p.root, 'descend-ledger')).toHaveLength(1);
    expect(byClass(p.root, 'descend-choice')).toHaveLength(2);
  });

  it('Descend and heading home are the two acts', () => {
    const { page: p, acts } = draw();
    p.click(byName(p.root, 'button', 'Descend')[0] as FakeElement);
    p.click(byName(p.root, 'button', 'Head home with your pack')[0] as FakeElement);
    expect(acts).toEqual([{ type: 'descend' }, { type: 'home' }]);
  });

  it('waits while an act is on its way', () => {
    const { page: p, acts } = draw({ busy: true });
    for (const name of ['Descend', 'Head home with your pack']) {
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
    expect(text).toContain('The floor cracks open');
    expect(text).toContain('Another floor waits below. Do you dare delve deeper?');
    expect(text).toContain('Nothing new this time.');
    expect(text).toContain('Your pack is empty, so there is nothing to lose.');
    expect(text).toContain('3 rooms with a floor boss at the end. Foes are from depth 16.');
  });
});
