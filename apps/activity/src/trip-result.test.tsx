import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseGameState } from './api';
import creaturesState from './fixtures/creatures-state.json';
import { pendingFind } from './find-view';
import type { PendingCatch } from './talent-types';
import { FakeElement, byClass, byName, createPage, find, visibleText, type Page } from './test-dom';
import { TripResult } from './TripResult';
import type { TripResultView } from './trip-result-view';
import { experienceGain } from './xp-gain';

let page: Page | null = null;

// The banner measures its width and the card scrolls into view: the fake DOM answers with a fixed box.
beforeAll(() => {
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({ top: 0, width: 320 }));
  Reflect.set(FakeElement.prototype, 'scrollIntoView', () => undefined);
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    Reflect.set(globalThis, 'requestAnimationFrame', () => 0);
    Reflect.set(globalThis, 'cancelAnimationFrame', () => undefined);
  }
});

afterEach(() => {
  page?.unmount();
  page = null;
});

const waiting = parseGameState(creaturesState);
const [teachable, , , known] = waiting.pending as [
  PendingCatch,
  PendingCatch,
  PendingCatch,
  PendingCatch,
];

const view: TripResultView = {
  tone: 'home',
  explorer: { id: 'e', species: 'sproutle', shiny: false, name: 'Sproutle' },
  place: { id: 'tidepools', name: 'Tidepools' },
  hours: 12,
  failure: null,
  pushOn: null,
  finds: [pendingFind(teachable, waiting.creatures), pendingFind(known, waiting.creatures)],
  noCatch: null,
  autoSettled: [],
  counts: [],
  loot: null,
  xp: null,
  growth: null,
  stars: null,
  slot: null,
  gifts: [],
  journal: [{ title: 'A small friend', text: 'They hum.', set: null, setComplete: false }],
};

function radios(root: FakeElement): FakeElement[] {
  return find(root, (e) => e.localName === 'input' && e.getAttribute('type') === 'radio');
}

/** The explorer's experience as the server's answer gives it. */
const grew = (levelBefore: number, level: number, treat: boolean) =>
  experienceGain(
    {
      creatureId: 'e',
      gained: 240,
      treat,
      levelBefore,
      level,
      exp: 40,
      needed: 300,
      waiting: false,
      gold: false,
    },
    'Sproutle',
  );

describe('the experience row of a trip', () => {
  it('is the same row as a Workshop job: "Experience", the level change, +N, the multiplier and the bar', () => {
    page = createPage();
    page.draw(
      <TripResult
        view={{ ...view, growth: grew(8, 9, true) }}
        busy={false}
        onClaim={() => undefined}
      />,
    );
    const list = first(page.root, byClass(page.root, 'xp-list'));
    const text = visibleText(list);
    expect(text).toContain('Experience');
    expect(text).toContain('Lv 8 → 9');
    expect(text).toContain('+240');
    expect(text).toContain('Level up!');
    // The treat is the melon and the ×2 chip, never the word.
    expect(text).not.toContain('Treat');
    expect(byClass(list, 'xp-treat')).toHaveLength(1);
    expect(visibleText(first(list, byClass(list, 'xp-times')))).toBe('×2');
    const bar = find(page.root, (e) => e.getAttribute('role') === 'progressbar')[0];
    expect(bar?.getAttribute('aria-label')).toBe("Sproutle's experience");
    expect(bar?.getAttribute('aria-valuetext')).toBe('40 / 300, +240');
  });

  it('shows no level change or Level up! when the level stayed, only the bar and the gain', () => {
    page = createPage();
    page.draw(
      <TripResult
        view={{ ...view, growth: grew(9, 9, false) }}
        busy={false}
        onClaim={() => undefined}
      />,
    );
    const list = first(page.root, byClass(page.root, 'xp-list'));
    const text = visibleText(list);
    expect(text).toContain('+240');
    expect(text).not.toContain('Level up!');
    expect(byClass(list, 'xp-boost')).toHaveLength(0);
    expect(find(page.root, (e) => e.getAttribute('role') === 'progressbar')).toHaveLength(1);
  });
});

describe('the trip result', () => {
  it('says who went where for how long, with each duplicate as radio rows', () => {
    page = createPage();
    page.draw(<TripResult view={view} busy={false} onClaim={() => undefined} />);
    expect(visibleText(first(page.root, 'h3'))).toBe(
      'Sproutle spent 12 hours at Tidepools and found…',
    );
    expect(byClass(page.root, 'find-card')).toHaveLength(2);
    expect(byClass(page.root, 'find-talent-head').map(visibleText)).toEqual([
      'Discovered talentNew',
      'Discovered talent',
    ]);
    // The known talent's Teach row is greyed and cannot be picked.
    const blocked = radios(page.root).filter((r) => r.hasAttribute('disabled'));
    expect(blocked).toHaveLength(1);
    // The journal icon and title share one line.
    expect(byClass(page.root, 'tr-journal-title')).toHaveLength(1);
  });

  it('claims with Recommended for each duplicate, or the row the player picked', () => {
    const onClaim = vi.fn();
    page = createPage();
    page.draw(<TripResult view={view} busy={false} onClaim={onClaim} />);
    const p = page;
    p.click(first(p.root, byName(p.root, 'button', 'Claim')));
    const splashet = teachable.offered.teach[0];
    expect(onClaim).toHaveBeenLastCalledWith([
      { card: teachable, request: { choice: 'teach', creatureId: splashet } },
      { card: known, request: { choice: 'fuse', creatureId: splashet } },
    ]);
    // Pick Release for the first one.
    const release = radios(p.root).find((r) => r.getAttribute('id') === `${teachable.id}-release`);
    if (release === undefined) throw new Error('no Release row');
    p.update(() => {
      for (const listener of release.listeners.get('change') ?? [])
        listener.call(release, {
          type: 'change',
          target: release,
          currentTarget: release,
          defaultPrevented: false,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        });
    });
    p.click(first(p.root, byName(p.root, 'button', 'Claim')));
    expect(onClaim).toHaveBeenLastCalledWith([
      { card: teachable, request: { choice: 'release' } },
      { card: known, request: { choice: 'fuse', creatureId: splashet } },
    ]);
  });
});

function first(root: FakeElement, tagOrList: string | FakeElement[]): FakeElement {
  const list =
    typeof tagOrList === 'string' ? find(root, (e) => e.localName === tagOrList) : tagOrList;
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}
