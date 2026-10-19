import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { sampleCreature } from './creature-card-sample';
import type { ExperienceView } from './experience';
import type { JobResult } from './gear-types';
import { JobReveal } from './JobReveal';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

/**
 * The card of a claimed Workshop job (2026-10-18): a dismantle is a picture (the item, an arrow, what it became as
 * count badges), then who did the work with two shared XP rows. These tests draw the real `JobReveal`.
 */

let page: Page | null = null;

beforeEach(() => {
  // Reduced motion: the end state at once. No frames to run.
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const WORKER: Creature = { ...sampleCreature('growing'), id: 'worker', nickname: 'Cindle' };

function paid(over: Partial<ExperienceView> = {}): ExperienceView {
  return {
    creatureId: 'worker',
    gained: 8,
    treat: false,
    levelBefore: 6,
    level: 6,
    exp: 140,
    needed: 222,
    waiting: false,
    gold: false,
    ...over,
  };
}

type Dismantle = Extract<JobResult, { kind: 'dismantle' }>;

function dismantle(over: Partial<Dismantle> = {}): Dismantle {
  return {
    kind: 'dismantle',
    items: [{ baseId: 'forge-hood', rarity: 'rare', itemLevel: 14 }],
    parts: { scrap: 4, 'ember-shard': 1 },
    essence: 6,
    learned: [],
    marked: [],
    experience: paid(),
    xp: 12,
    skillXp: 140,
    skillLevel: 2,
    leveledUp: false,
    ...over,
  };
}

function draw(result: JobResult, creatures: readonly Creature[] = [WORKER]): Page {
  page = createPage();
  page.draw(
    <JobReveal
      result={result}
      items={[]}
      rarity="rare"
      creatures={creatures}
      onDismiss={() => undefined}
    />,
  );
  return page;
}

describe('a claimed dismantle', () => {
  it('is a picture: the item with its corners, an arrow, and what it became as count badges (Essence too)', () => {
    const p = draw(dismantle());
    const row = first(byClass(p.root, 'jr-row'));
    expect(byClass(row, 'item-frame')).toHaveLength(1);
    expect(byClass(row, 'item-lv').map((l) => visibleText(l))).toEqual(['Lv 14']);
    expect(byClass(row, 'jr-chevron')).toHaveLength(1);
    expect(byClass(row, 'part-count').map((b) => visibleText(b))).toEqual(['4', '1', '6']);
    // The arrow sits between what went in and what came out.
    const order = (row.childNodes as FakeElement[]).map(
      (k) => k.getAttribute('class') ?? k.localName,
    );
    expect(order.indexOf('jr-items')).toBeLessThan(order.indexOf('jr-chevron'));
    expect(order.indexOf('jr-chevron')).toBeLessThan(order.indexOf('gives jr-gives'));
  });

  it('has none of the old words: no "taken apart" and no list of what came back', () => {
    const p = draw(dismantle());
    const text = visibleText(p.root);
    expect(text).not.toContain('taken apart');
    expect(text).not.toMatch(/4 Scrap|Ember Shard|6 Essence/);
    expect(text).not.toMatch(/XP$/m);
    expect(first(byName(p.root, 'button', 'Got it'))).toBeDefined();
  });

  it('shows every item of a bundle, and says "Nothing" when nothing came back', () => {
    const bundle = dismantle({
      items: [
        { baseId: 'kelp-cap', rarity: 'common', itemLevel: 2 },
        { baseId: 'trail-cap', rarity: 'common', itemLevel: 1 },
      ],
      parts: {},
      essence: 0,
    });
    const p = draw(bundle);
    expect(byClass(first(byClass(p.root, 'jr-items')), 'item-frame')).toHaveLength(2);
    expect(visibleText(first(byClass(p.root, 'jr-row')))).toContain('Nothing');
  });

  it('shows who did the work and two XP rows, the Crafting one in its own colour', () => {
    const p = draw(dismantle());
    const who = first(byClass(p.root, 'jr-who'));
    expect(visibleText(who)).toBe('Cindle');
    const list = first(byClass(p.root, 'xp-list'));
    const labels = byClass(list, 'xp-label').map((e) => visibleText(e));
    expect(labels).toEqual(['Experience', 'Crafting']);
    expect(byClass(list, 'xp-plus').map((e) => visibleText(e))).toEqual(['+8', '+12']);
    const bars = byRole(list, 'progressbar');
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      "Cindle's experience",
      "Cindle's Crafting XP",
    ]);
    expect(bars.map((b) => b.getAttribute('aria-valuetext'))).toEqual([
      '140 / 222, +8',
      '40 / 150, +12',
    ]);
    // Each row takes its kind's colour: experience gold, Crafting leather.
    const rows = byClass(list, 'xp-row');
    expect(rows.map((r) => r.getAttribute('class'))).toEqual([
      'xp-row xp-kind-experience',
      'xp-row xp-kind-crafting',
    ]);
    // Reduced motion: the end at once, the level each is at in its tag.
    expect(byClass(list, 'xp-text').map((e) => visibleText(e))).toEqual(['140 / 222', '40 / 150']);
    expect(byClass(list, 'xp-lv').map((e) => visibleText(e))).toEqual(['Lv 6', 'Lv 2']);
  });

  it('writes a level change only when there is one, and the tags and multiplier that apply', () => {
    const plain = draw(dismantle());
    expect(byClass(first(byClass(plain.root, 'xp-list')), 'xp-up')).toHaveLength(0);
    expect(byClass(first(byClass(plain.root, 'xp-list')), 'xp-boost')).toHaveLength(0);
    plain.unmount();
    const up = draw(
      dismantle({
        experience: paid({
          levelBefore: 5,
          level: 6,
          exp: 12,
          waiting: true,
          treat: true,
          boost: { parts: [{ source: 'treat', name: 'Treat', times: 2 }], totalBp: 20_000 },
        }),
        xpBoost: { parts: [{ source: 'gear', name: 'Apprentice', bp: 2000 }], totalBp: 12_000 },
        skillXp: 255,
        skillLevel: 3,
        leveledUp: true,
      }),
    );
    const list = first(byClass(up.root, 'xp-list'));
    expect(byClass(list, 'xp-up').map((t) => visibleText(t))).toEqual(['Lv 5 → 6', 'Lv 2 → 3']);
    expect(byClass(list, 'xp-times').map((t) => visibleText(t))).toEqual(['2x', '1.2x']);
    const text = visibleText(list);
    expect(text).toContain('Waiting');
    expect(text).not.toContain('Treat');
    expect(text).toContain('Level up!');
  });

  it('keeps the short notes about a learned blueprint and the quality of a known one', () => {
    const p = draw(
      dismantle({ learned: ['forge-hood'], marked: [{ baseId: 'kelp-cap', marks: 3 }] }),
    );
    const text = visibleText(p.root);
    expect(text).toContain('Learned the Forge Hood blueprint.');
    expect(text).toContain('Kelp Cap: Quality 3 / 10.');
  });

  it('has the Crafting bar alone for an old job that recorded no worker', () => {
    const old: Dismantle = dismantle();
    delete old.experience;
    const p = draw(old);
    expect(byClass(p.root, 'jr-who')).toHaveLength(0);
    const list = first(byClass(p.root, 'xp-list'));
    expect(byClass(list, 'xp-label').map((e) => visibleText(e))).toEqual(['Crafting']);
  });
});

describe('the other claimed jobs share the worker rows', () => {
  it('a craft keeps its item and shows the same worker rows', () => {
    const p = draw({
      kind: 'craft',
      gearId: 'made',
      baseId: 'forge-hood',
      rarity: 'rare',
      itemLevel: 6,
      reach: 'none',
      upgraded: false,
      experience: paid(),
      xp: 12,
      skillXp: 140,
      skillLevel: 2,
      leveledUp: false,
    });
    expect(byClass(p.root, 'jr-row')).toHaveLength(0);
    expect(visibleText(p.root)).toContain('Forge Hood');
    expect(byClass(p.root, 'xp-list')).toHaveLength(1);
    expect(byRole(p.root, 'progressbar')).toHaveLength(2);
  });
});
