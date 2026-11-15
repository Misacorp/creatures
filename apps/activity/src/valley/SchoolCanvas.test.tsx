/**
 * The School as a canvas (`SchoolCanvas`, the rule "A place is a canvas"): what is in the scene and what a click on each thing opens.
 * Drawn in the fake DOM; a phone has no `matchMedia` here, so a panel is its own page (the shell's other half is in `PlaceCanvas.test`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchoolState } from '../api';
import { PopoverHost } from '../PopoverHost';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import type { CommonsActions } from './CommonsBoard';
import {
  buildingPlace,
  openPlace,
  sampleCommons,
  waitingPlace,
  withCommons,
} from './commons-sample';
import { SchoolCanvas, type SchoolStart } from './SchoolCanvas';
import { sampleSchool, STAY_NOON } from './school-sample';
import { NONE_OF_YOURS, SEATS_FULL_LINE } from './school-view';
import { sampleValley } from './signpost-sample';

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
  // The scene listens for Escape on the document and lets go of it on unmount; the fake DOM has none.
  vi.stubGlobal('document', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  page?.unmount();
  vi.unstubAllGlobals();
  page = null;
});

const free = homeInput('busy', true).creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b, c] = free;
if (a === undefined || b === undefined || c === undefined) throw new Error('fixture');
const plain = sampleValley(free, []);
const NEXT_CEREMONY = Date.UTC(2026, 10, 9, 15);

interface Calls {
  seats: [number, string | null][];
  posts: [string, string | null][];
}

function draw(
  view: SchoolState,
  options: {
    visit?: typeof plain;
    graduation?: { ready: number; nextAt: number } | undefined;
    busy?: boolean;
    start?: SchoolStart;
    withCommons?: boolean;
  } = {},
  calls: Calls = { seats: [], posts: [] },
): Page {
  const commons: CommonsActions = {
    give: () => Promise.resolve(true),
    post: (place, creatureId) => {
      calls.posts.push([place, creatureId]);
      return Promise.resolve(true);
    },
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <SchoolCanvas
        creatures={free}
        visit={options.visit ?? plain}
        view={view}
        graduation={'graduation' in options ? options.graduation : undefined}
        now={STAY_NOON}
        zone="Europe/Helsinki"
        actions={{
          seat: (index, creatureId) => {
            calls.seats.push([index, creatureId]);
            return Promise.resolve(true);
          },
        }}
        busy={options.busy ?? false}
        acorns={100}
        trayInput={{ trips: [], jobs: null, now: HOME_NOW }}
        onOpenPaddock={() => undefined}
        {...(options.withCommons === true ? { commons } : {})}
        {...(options.start === undefined ? {} : { start: options.start })}
      />
    </PopoverHost>,
  );
  return p;
}

const targets = (p: Page): FakeElement[] =>
  byClass(p.root, 'cv-target').filter((el) => el.localName === 'button');
const labels = (p: Page): string[] => targets(p).map((el) => el.getAttribute('aria-label') ?? '');
const target = (p: Page, name: RegExp): FakeElement => {
  const found = targets(p).find((el) => name.test(el.getAttribute('aria-label') ?? ''));
  if (found === undefined) throw new Error(`no target ${String(name)}`);
  return found;
};
const button = (p: Page, name: RegExp): FakeElement => {
  const el = byName(p.root, 'button', name)[0];
  if (el === undefined) throw new Error(`no button ${String(name)}`);
  return el;
};

describe('the School canvas: the scene', () => {
  it('opens on the scene with the lectern, two seats as dashed outlines and the house, all named, no page under it', () => {
    const p = draw(sampleSchool({ wouldLearn: [a.id] }), {
      graduation: { ready: 2, nextAt: NEXT_CEREMONY },
    });
    const names = labels(p);
    expect(names.every((n) => n !== '')).toBe(true);
    expect(names.some((n) => /^The lectern, the visiting teacher is here/.test(n))).toBe(true);
    expect(names.some((n) => /^The graduation stage, 2 ready to graduate/.test(n))).toBe(true);
    const seats = targets(p).filter((el) =>
      /^A student seat/.test(el.getAttribute('aria-label') ?? ''),
    );
    expect(seats).toHaveLength(2);
    expect(seats.every((el) => /cv-slot/.test(el.getAttribute('class') ?? ''))).toBe(true);
    expect(byClass(p.root, 'sch-page')).toHaveLength(0);
    expect(byClass(p.root, 'sp-seat')).toHaveLength(0);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
  });

  it('every clickable thing has a plate and the decoration has none', () => {
    const p = draw(sampleSchool({ wouldLearn: [a.id], seated: [a.id, null] }), {
      graduation: { ready: 0, nextAt: NEXT_CEREMONY },
      visit: withCommons(plain),
      withCommons: true,
    });
    expect(byClass(p.root, 'cv-plate').length).toBe(targets(p).length);
  });

  it('keeps the creature tray under the scene', () => {
    const p = draw(sampleSchool({ wouldLearn: [a.id] }));
    expect(byClass(p.root, 'pc-below')).toHaveLength(1);
    expect(byClass(p.root, 'vy-mon').length).toBe(free.length);
  });

  it('announced: the lectern stands without a teacher, and the seats can already be used', () => {
    const p = draw(sampleSchool({ phase: 'announced', wouldLearn: [a.id] }));
    expect(labels(p).some((n) => /^The lectern, a visiting teacher comes/.test(n))).toBe(true);
    expect(labels(p).filter((n) => /^A student seat/.test(n))).toHaveLength(2);
  });

  it('away: no lectern and no seat to use, the house still says the ceremony; the teacher line is read out', () => {
    const p = draw(sampleSchool({ phase: 'away' }), {
      graduation: { ready: 1, nextAt: NEXT_CEREMONY },
    });
    expect(labels(p).some((n) => /^The lectern/.test(n))).toBe(false);
    expect(labels(p).some((n) => /^A student seat/.test(n))).toBe(false);
    expect(labels(p).some((n) => /^The graduation stage/.test(n))).toBe(true);
    expect(visibleText(p.root)).toContain('No teacher at the School right now.');
  });

  it('a seated student stands on its seat with its plate and wears its honour', () => {
    const p = draw(sampleSchool({ seated: [a.id, null], wouldLearn: [a.id] }));
    expect(byClass(p.root, 'vy-stand')).toHaveLength(1);
    expect(byClass(p.root, 'vy-bob')).toHaveLength(1);
    expect(labels(p).some((n) => /sits at the School and learns it by morning/.test(n))).toBe(true);
    expect(labels(p).filter((n) => /^A student seat/.test(n))).toHaveLength(1);
  });

  it('a student can be reached even when the teacher has gone', () => {
    const p = draw(sampleSchool({ phase: 'away', seated: [a.id, null] }));
    expect(labels(p).some((n) => /sits at the School/.test(n))).toBe(true);
  });
});

describe('the School canvas: the builders’ corner', () => {
  it('stands only while the School has a project being built, with the helper spot dashed while nobody helps', () => {
    const none = draw(sampleSchool(), { visit: withCommons(plain), withCommons: true });
    expect(labels(none).some((n) => /^The builders' table/.test(n))).toBe(false);
    none.unmount();
    page = null;
    const open = draw(sampleSchool(), {
      visit: withCommons(
        plain,
        sampleCommons({
          places: [openPlace('school', 1, 500, 0.3), openPlace('bonfire', 1, 400, 0.2)],
        }),
      ),
      withCommons: true,
    });
    expect(labels(open).some((n) => /^The builders' table/.test(n))).toBe(true);
    expect(target(open, /^The helper spot/).getAttribute('class')).toMatch(/cv-slot/);
    expect(byClass(open.root, 'cv-plate').length).toBe(targets(open).length);
  });

  it('is there while it builds for its days, gone at the top level and before the guided start', () => {
    const top = openPlace('school', 5, 900, 0.2);
    const cases: [string, ReturnType<typeof sampleCommons>, boolean][] = [
      ['building', sampleCommons({ places: [buildingPlace('school', 2, 2, [])] }), true],
      ['top level', sampleCommons({ places: [{ ...top, level: top.max }] }), false],
      ['not reached', sampleCommons({ places: [waitingPlace('school')] }), false],
    ];
    for (const [name, commons, corner] of cases) {
      const p = draw(sampleSchool(), { visit: withCommons(plain, commons), withCommons: true });
      expect(
        labels(p).some((n) => /^The builders' table/.test(n)),
        name,
      ).toBe(corner);
      p.unmount();
      page = null;
    }
  });

  it('the table opens the project board in the left drawer; the helper spot picks who helps and posts to the School', () => {
    const calls: Calls = { seats: [], posts: [] };
    const visit = withCommons(plain, sampleCommons({ places: [openPlace('school', 1, 500, 0.3)] }));
    const p = draw(sampleSchool(), { visit, withCommons: true }, calls);
    p.click(target(p, /^The builders' table/));
    expect(visibleText(p.root)).toMatch(/Project board/);
    expect(visibleText(p.root)).toMatch(/Give/);
    p.unmount();
    page = null;
    const q = draw(sampleSchool(), { visit, withCommons: true }, calls);
    q.click(target(q, /^The helper spot/));
    expect(visibleText(q.root)).toMatch(/Who helps build the School/);
    expect(byRole(q.root, 'option').length).toBeGreaterThan(0);
  });

  it('a helper at the table hammers there', () => {
    const p = draw(sampleSchool(), {
      visit: withCommons(plain, sampleCommons({ places: [openPlace('school', 1, 500, 0.3)] }), {
        place: 'school',
        creatureId: a.id,
      }),
      withCommons: true,
    });
    expect(byClass(p.root, 'fi-hammer')).toHaveLength(1);
    expect(labels(p).some((n) => /helping build the School at the builders' table/.test(n))).toBe(
      true,
    );
  });
});

describe('the School canvas: what a click opens', () => {
  it('the lectern opens the teacher: the days and the talent, no timer, no currency', () => {
    const p = draw(sampleSchool({ wouldLearn: [a.id] }));
    p.click(target(p, /^The lectern/));
    const text = visibleText(p.root);
    expect(text).toContain('The visiting teacher is here Monday to Wednesday.');
    expect(text).toContain('First Pounce');
    expect(text).not.toMatch(/until|\d+ ?h\b|left/i);
    expect(text).not.toMatch(/\bAcorns?\b|\bscrap\b|\bshards?\b|\bBait\b/i);
  });

  it('the teacher lists the faces that would learn, each with one Send to the first free seat', () => {
    const calls: Calls = { seats: [], posts: [] };
    const p = draw(sampleSchool({ wouldLearn: [a.id, b.id], seated: [a.id, null] }), {}, calls);
    p.click(target(p, /^The lectern/));
    expect(visibleText(p.root)).toContain('Learns it by morning');
    p.click(button(p, /^Send /));
    expect(calls.seats).toEqual([[1, b.id]]);
  });

  it('the teacher’s list has one Take off for a seated student', () => {
    const calls: Calls = { seats: [], posts: [] };
    const p = draw(sampleSchool({ wouldLearn: [a.id], seated: [a.id, null] }), {}, calls);
    p.click(target(p, /^The lectern/));
    p.click(button(p, /^Take .* off the seat/));
    expect(calls.seats).toEqual([[0, null]]);
  });

  it('says "none of yours this time" in words and offers no Send', () => {
    const p = draw(sampleSchool({ wouldLearn: [] }));
    p.click(target(p, /^The lectern/));
    expect(visibleText(p.root)).toContain(NONE_OF_YOURS);
    expect(byName(p.root, 'button', /^Send /)).toHaveLength(0);
  });

  it('turns Send off with both seats taken and says so; busy turns it off too', () => {
    const full = draw(sampleSchool({ wouldLearn: [a.id, b.id, c.id], seated: [a.id, b.id] }));
    full.click(target(full, /^The lectern/));
    expect(visibleText(full.root)).toContain(SEATS_FULL_LINE);
    expect(button(full, /^Send /).getAttribute('disabled')).not.toBeNull();
    full.unmount();
    page = null;
    const busy = draw(sampleSchool({ wouldLearn: [a.id] }), { busy: true });
    busy.click(target(busy, /^The lectern/));
    expect(button(busy, /^Send /).getAttribute('disabled')).not.toBeNull();
  });

  it('an empty seat opens who could join; a tap seats that creature at that seat', () => {
    const calls: Calls = { seats: [], posts: [] };
    const p = draw(sampleSchool({ wouldLearn: [a.id, b.id] }), {}, calls);
    const seats = targets(p).filter((el) =>
      /^A student seat/.test(el.getAttribute('aria-label') ?? ''),
    );
    p.click(seats[1] as FakeElement);
    expect(byRole(p.root, 'option')).toHaveLength(2);
    p.click(byRole(p.root, 'option')[0] as FakeElement);
    expect(calls.seats).toHaveLength(1);
    expect(calls.seats[0]?.[0]).toBe(1);
    expect([a.id, b.id]).toContain(calls.seats[0]?.[1]);
  });

  it('an empty seat with nobody who would learn says so', () => {
    const p = draw(sampleSchool({ wouldLearn: [] }));
    p.click(target(p, /^A student seat/));
    expect(visibleText(p.root)).toContain(NONE_OF_YOURS);
  });

  it('a seated student opens as that student with "Learns it by morning" and one Take off', () => {
    const calls: Calls = { seats: [], posts: [] };
    const p = draw(sampleSchool({ wouldLearn: [a.id], seated: [a.id, null] }), {}, calls);
    p.click(target(p, /sits at the School/));
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    expect(visibleText(p.root)).toContain('Learns it by morning');
    p.click(button(p, /Take off the seat/));
    expect(calls.seats).toEqual([[0, null]]);
  });

  it('the house opens the graduation: how many are ready and when, in words', () => {
    const p = draw(sampleSchool({ phase: 'away' }), {
      graduation: { ready: 2, nextAt: NEXT_CEREMONY },
    });
    p.click(target(p, /^The graduation stage/));
    const text = visibleText(p.root);
    expect(text).toContain('2 ready to graduate');
    expect(text).toContain('The next ceremony is this evening.');
    expect(text).toContain('No teacher at the School right now.');
    expect(byClass(p.root, 'sch-ready')).toHaveLength(1);
    expect(text).not.toMatch(/until|\d+ ?h\b/i);
  });

  it('has no house before the server sends the ceremony', () => {
    const p = draw(sampleSchool({ phase: 'away' }));
    expect(labels(p).some((n) => /^The graduation stage/.test(n))).toBe(false);
  });
});
