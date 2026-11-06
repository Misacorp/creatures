import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { homeAlerts } from '../home-view';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { HonoursContext, honoursOf } from './HonourRibbon';
import { castFor } from './place-cast';
import { bubbleAt, listOrder, placeBubbles, placeStates } from './place-state';
import { sampleValley } from './signpost-sample';
import { sampleSchool, sampleTrial, withTrials } from './school-sample';
import type { SchoolFeed } from './SchoolPage';
import { WAITING_LINE, studentIds } from './school-view';
import { artSize } from './place-scene';
import { trayBadge, trayFor, trayStates } from './tray-state';
import { ValleyFrame } from './ValleyFrame';
import type { ValleyView } from './valley-nav';
import { SCENE_ART } from './PlaceScene';

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
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('sample creatures');

const feed = (view: SchoolFeed['view']): SchoolFeed => ({
  view,
  actions: { seat: () => Promise.resolve(true) },
  now: HOME_NOW,
  zone: 'Europe/Helsinki',
});

function draw(
  view: ValleyView,
  school: SchoolFeed | undefined,
  options: { systems?: boolean; ready?: number; honours?: Parameters<typeof honoursOf>[0] } = {},
): Page {
  const p = createPage();
  page = p;
  const systems = options.systems ?? true;
  const valley = sampleValley(free, []);
  const visit = systems
    ? withTrials(valley, {}, { ready: options.ready ?? 0, nextAt: HOME_NOW + 3_600_000 })
    : null;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <HonoursContext.Provider value={honoursOf(options.honours ?? [])}>
        <ValleyFrame
          view={view}
          creatures={free}
          trayInput={{ trips: [], jobs: null, now: HOME_NOW }}
          alerts={homeAlerts(base)}
          placeInput={base}
          castExtra={{ dungeonTeam: null, dungeonPhase: null, waiting: [] }}
          visit={visit}
          {...(school === undefined ? {} : { school })}
          focus={null}
          onOpen={() => undefined}
          onLeave={() => undefined}
          onBook={() => undefined}
          notices={null}
          away={null}
          settings={null}
        >
          {null}
        </ValleyFrame>
      </HonoursContext.Provider>
    </PopoverHost>,
  );
  return p;
}

const AT_SCHOOL: ValleyView = { kind: 'soon', place: 'school' };

describe('the School’s place with the valley systems on', () => {
  it('here: the School as a scene and its page under it (the teacher, the faces, the ceremony)', () => {
    const p = draw(AT_SCHOOL, feed(sampleSchool({ wouldLearn: [a.id] })), { ready: 2 });
    expect(byClass(p.root, 'sch-page')).toHaveLength(1);
    expect(byClass(p.root, 'vy-soon')).toHaveLength(0);
    const text = visibleText(p.root);
    expect(text).toContain('The visiting teacher is here');
    expect(text).toContain('2 ready to graduate');
    expect(byName(p.root, 'button', /^Send /)).toHaveLength(1);
    expect(text).not.toContain(WAITING_LINE);
  });

  it('away: still the page (an empty yard and one line), never a countdown', () => {
    const p = draw(AT_SCHOOL, feed(sampleSchool({ phase: 'away' })));
    expect(byClass(p.root, 'sch-page')).toHaveLength(1);
    expect(visibleText(p.root)).toContain('No teacher at the School right now.');
    expect(visibleText(p.root)).not.toMatch(/until|\d+ ?h\b/i);
  });

  it('before the server has said: the old "not open yet" line', () => {
    const p = draw(AT_SCHOOL, feed(null));
    expect(byClass(p.root, 'sch-page')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });

  it('with the systems off nothing changes, even if a feed is given', () => {
    const p = draw(AT_SCHOOL, feed(sampleSchool()), { systems: false });
    expect(byClass(p.root, 'sch-page')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });

  it('without a feed (the flag off) the place is as it was', () => {
    const p = draw(AT_SCHOOL, undefined);
    expect(byClass(p.root, 'sch-page')).toHaveLength(0);
    expect(visibleText(p.root)).toContain(WAITING_LINE);
  });

  it('a seated student stands in the scene, and an honour shows on its sprite there', () => {
    const p = draw(AT_SCHOOL, feed(sampleSchool({ seated: [a.id, null], wouldLearn: [a.id] })), {
      honours: [{ id: a.id, trial: sampleTrial({ honour: 1 }) }],
    });
    expect(byClass(p.root, 'vy-stand')).toHaveLength(1);
    expect(byClass(p.root, 'honour-ribbon')).toHaveLength(1);
  });
});

describe('the School’s yard (V-SCH-11)', () => {
  const cast = (school: ReturnType<typeof sampleSchool> | null) =>
    castFor(
      'school',
      {
        ...base,
        dungeonTeam: null,
        dungeonPhase: null,
        waiting: [],
        creatures: free,
        school,
      },
      artSize(SCENE_ART.school),
      [],
    );

  it('is empty before the server has said and while away: the bench only', () => {
    for (const school of [null, sampleSchool({ phase: 'away' })]) {
      const c = cast(school);
      expect(c.school).toEqual({ lectern: false, bell: false, teacher: null });
      expect(c.stands).toEqual([]);
    }
  });

  it('has the lectern and the tilted bell at the door while announced, and no teacher yet', () => {
    expect(cast(sampleSchool({ phase: 'announced' })).school).toEqual({
      lectern: true,
      bell: true,
      teacher: null,
    });
  });

  it('has the teacher at the lectern while here, a species the player does not own', () => {
    const c = cast(sampleSchool({ phase: 'here' }));
    expect(c.school?.lectern).toBe(true);
    expect(c.school?.bell).toBe(false);
    const teacher = c.school?.teacher ?? null;
    expect(teacher).not.toBeNull();
    expect(free.map((f) => f.species)).not.toContain(teacher);
  });

  it('has no lesson at all when no talent was drawn: the yard is empty', () => {
    expect(cast(sampleSchool({ talent: false })).school).toEqual({
      lectern: false,
      bell: false,
      teacher: null,
    });
  });

  it('seats the students on the bench in the order of the seats, saying they learn it by morning', () => {
    const c = cast(sampleSchool({ seated: [b.id, a.id] }));
    expect(c.stands.map((s) => s.creature.id)).toEqual([b.id, a.id]);
    expect(c.stands.every((s) => s.where.includes('learns it by morning'))).toBe(true);
    expect(c.act).toEqual({ kind: 'calm', line: '' });
  });
});

describe('a student at the School is not resting', () => {
  const visit = sampleValley(free, []);
  const school = sampleSchool({ seated: [a.id, null], wouldLearn: [a.id] });

  it('is "at the School" on the tray, ahead of the fire’s "z", and never free', () => {
    const students = studentIds(school);
    const input = {
      trips: [],
      jobs: null,
      now: HOME_NOW,
      ...trayStates(visit),
      studying: students,
    };
    const badge = trayBadge(a, input);
    expect(badge.state).toBe('studying');
    expect(badge.label).toContain('At the School');
    // The rest of the roster is unchanged.
    expect(trayBadge(b, input).state).not.toBe('studying');
    expect(trayFor(free, input)).toHaveLength(free.length);
  });

  it('leaves the map’s walkers and the fire’s ring to the others (the frame hides the student there)', () => {
    const p = draw({ kind: 'valley' }, feed(school));
    // The map's walkers are the creatures at home that are not posted: the student is not among them.
    const walking = byClass(p.root, 'vy-person').length;
    const without = draw({ kind: 'valley' }, feed(sampleSchool()));
    expect(walking).toBeLessThanOrEqual(byClass(without.root, 'vy-person').length);
  });
});

describe('the School on the map and in the Places list', () => {
  it('has a bubble over the School for creatures ready to graduate, with the count', () => {
    const visit = withTrials(sampleValley(free, []), {}, { ready: 3, nextAt: HOME_NOW });
    const bubbles = placeBubbles(homeAlerts(base), { ...base, visit, school: null });
    const bubble = bubbleAt(bubbles, 'school');
    expect(bubble?.count).toBe(3);
    expect(bubble?.spoken).toBe('3 ready to graduate');
    // The places with something waiting come first in the Places list, the School among them.
    expect(listOrder(bubbles).slice(0, bubbles.length)).toContain('school');
  });

  it('has a bubble for a lesson one of yours can take, and none when both seats are taken', () => {
    const visit = withTrials(sampleValley(free, []), {}, { ready: 0, nextAt: HOME_NOW });
    const open = placeBubbles(homeAlerts(base), {
      ...base,
      visit,
      school: sampleSchool({ wouldLearn: [a.id] }),
    });
    expect(bubbleAt(open, 'school')?.spoken).toMatch(/lesson one of yours can take/);
    const full = placeBubbles(homeAlerts(base), {
      ...base,
      visit,
      school: sampleSchool({ wouldLearn: [a.id, b.id], seated: [a.id, b.id] }),
    });
    expect(bubbleAt(full, 'school')).toBeUndefined();
    const away = placeBubbles(homeAlerts(base), {
      ...base,
      visit,
      school: sampleSchool({ phase: 'away' }),
    });
    expect(bubbleAt(away, 'school')).toBeUndefined();
  });

  it('says the ceremony and the teacher in the Places list', () => {
    const visit = withTrials(sampleValley(free, []), {}, { ready: 2, nextAt: HOME_NOW });
    const lines = placeStates({ ...base, visit, school: sampleSchool() });
    expect(lines.school).toBe('2 ready to graduate · a teacher is here');
    expect(placeStates({ ...base, visit: null, school: null }).school).toBe('not open yet');
  });
});
