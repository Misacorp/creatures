import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { homeInput } from '../workbench/home-sample';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { SchoolPage, type SchoolActions } from './SchoolPage';
import { sampleSchool, STAY_NOON } from './school-sample';
import { NONE_OF_YOURS, SEATS_FULL_LINE } from './school-view';
import type { SchoolState } from '../api';

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

const creatures = homeInput('busy', true).creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b, c] = creatures;
if (a === undefined || b === undefined || c === undefined) throw new Error('sample creatures');

const NEXT_CEREMONY = Date.UTC(2026, 10, 9, 15);

function draw(
  view: SchoolState,
  options: { busy?: boolean; graduation?: { ready: number; nextAt: number } | undefined } = {},
): { page: Page; seats: [number, string | null][] } {
  const seats: [number, string | null][] = [];
  const actions: SchoolActions = {
    seat: (index, creatureId) => {
      seats.push([index, creatureId]);
      return Promise.resolve(true);
    },
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <SchoolPage
        view={view}
        creatures={creatures}
        graduation={'graduation' in options ? options.graduation : undefined}
        now={STAY_NOON}
        zone="Europe/Helsinki"
        busy={options.busy ?? false}
        actions={actions}
      />
    </PopoverHost>,
  );
  return { page: p, seats };
}

const button = (p: Page, name: RegExp): FakeElement => {
  const el = byName(p.root, 'button', name)[0];
  if (el === undefined) throw new Error(`no button ${String(name)}`);
  return el;
};

describe('the School page with a teacher here', () => {
  it('says where the teacher stands, with the days and the talent, and no timer', () => {
    const { page: p } = draw(sampleSchool({ wouldLearn: [a.id] }));
    const text = visibleText(p.root);
    expect(text).toContain('The visiting teacher is here Monday to Wednesday.');
    expect(text).toContain('First Pounce');
    expect(text).not.toMatch(/until|\d+ ?h\b|left/i);
  });

  it('shows the faces that would learn, each with one Send', () => {
    const { page: p } = draw(sampleSchool({ wouldLearn: [a.id, b.id] }));
    expect(byName(p.root, 'button', /^Send /)).toHaveLength(2);
    expect(visibleText(p.root)).not.toContain(NONE_OF_YOURS);
  });

  it('sends a creature to the first free seat with one tap', () => {
    const { page: p, seats } = draw(
      sampleSchool({ wouldLearn: [a.id, b.id], seated: [a.id, null] }),
    );
    p.click(button(p, /^Send /));
    expect(seats).toEqual([[1, b.id]]);
  });

  it('shows a seated student with "Learns it by morning" and one Take off', () => {
    const { page: p, seats } = draw(
      sampleSchool({ wouldLearn: [a.id, b.id], seated: [a.id, null] }),
    );
    expect(visibleText(p.root)).toContain('Learns it by morning');
    p.click(button(p, /^Take .* off the seat/));
    expect(seats).toEqual([[0, null]]);
  });

  it('says "none of yours this time" in words when no creature would learn it', () => {
    const { page: p } = draw(sampleSchool({ wouldLearn: [] }));
    expect(visibleText(p.root)).toContain(NONE_OF_YOURS);
    expect(byName(p.root, 'button', /^Send /)).toHaveLength(0);
  });

  it('turns Send off with both seats taken and says so', () => {
    const { page: p } = draw(
      sampleSchool({ wouldLearn: [a.id, b.id, c.id], seated: [a.id, b.id] }),
    );
    expect(visibleText(p.root)).toContain(SEATS_FULL_LINE);
    expect(button(p, /^Send /).getAttribute('disabled')).not.toBeNull();
  });

  it('turns every button off while an action is under way', () => {
    const { page: p } = draw(sampleSchool({ wouldLearn: [a.id] }), { busy: true });
    expect(button(p, /^Send /).getAttribute('disabled')).not.toBeNull();
  });

  it('costs are never words: the page names no currency', () => {
    const { page: p } = draw(sampleSchool({ wouldLearn: [a.id] }));
    expect(visibleText(p.root)).not.toMatch(/\bAcorns?\b|\bscrap\b|\bshards?\b|\bBait\b/i);
  });
});

describe('the School page while the teacher is announced or away', () => {
  it('announced: says the days the teacher comes, and the faces can already be sent (a seat before the arrival learns by morning)', () => {
    const { page: p } = draw(sampleSchool({ phase: 'announced', wouldLearn: [a.id] }));
    expect(visibleText(p.root)).toContain('A visiting teacher comes Monday to Wednesday.');
    expect(byName(p.root, 'button', /^Send /)).toHaveLength(1);
  });

  it('away: one line, no students card', () => {
    const { page: p } = draw(sampleSchool({ phase: 'away' }));
    expect(visibleText(p.root)).toContain('No teacher at the School right now.');
    expect(byName(p.root, 'button', /^Send /)).toHaveLength(0);
    expect(visibleText(p.root)).not.toContain('Your students');
  });
});

describe('the graduation card', () => {
  it('says how many are ready and when the ceremony is, in words', () => {
    const { page: p } = draw(sampleSchool({ phase: 'away' }), {
      graduation: { ready: 2, nextAt: NEXT_CEREMONY },
    });
    const text = visibleText(p.root);
    expect(text).toContain('2 ready to graduate');
    expect(text).toContain('The next ceremony is this evening.');
    expect(byClass(p.root, 'sch-ready')).toHaveLength(1);
  });

  it('has no card before the server sends the ceremony', () => {
    const { page: p } = draw(sampleSchool({ phase: 'away' }));
    expect(visibleText(p.root)).not.toContain('Graduation');
  });
});
