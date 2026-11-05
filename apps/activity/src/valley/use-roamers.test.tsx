import { afterEach, describe, expect, it } from 'vitest';
import { createPage, type Page } from '../test-dom';
import { useRoamers, type Person } from './use-roamers';

type Walker = Person<(typeof CREATURES)[number]>;

const AREA = { x: 0, y: 0, width: 200, height: 100 };
const CREATURES = [
  { id: 'a', species: 'cindle', shiny: false },
  { id: 'b', species: 'sproutle', shiny: false },
];

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const seen: { people: Walker[] } = { people: [] };
/** One component for every draw, so the hook keeps its walkers between them. */
function Probe({
  tick,
  held,
}: {
  tick: number;
  held: { id: string; x: number; y: number } | null;
}) {
  seen.people = useRoamers(CREATURES, tick, true, AREA, undefined, held);
  return <div />;
}

/** Draws the roamers at `tick` and returns where the hook put them. */
function roam(tick: number, held: { id: string; x: number; y: number } | null): Walker[] {
  page ??= createPage();
  page.draw(<Probe tick={tick} held={held} />);
  return seen.people;
}

describe('useRoamers held by a hand', () => {
  it('a held creature stands where it is held, however many ticks pass', () => {
    const held = { id: 'a', x: 150, y: 60 };
    roam(0, held);
    const people = roam(40, held);
    const a = people.find((p) => p.key === 'a');
    expect(a?.x).toBe(150);
    expect(a?.y).toBe(60);
  });

  it('let go, it wanders on from where it was put down', () => {
    roam(0, { id: 'a', x: 150, y: 60 });
    const after = roam(1, null).find((p) => p.key === 'a');
    // At most a step or two from the drop (it rests a few ticks first), never back at its old start.
    expect(Math.abs((after?.x ?? 0) - 150)).toBeLessThanOrEqual(2);
    expect(Math.abs((after?.y ?? 0) - 60)).toBeLessThanOrEqual(2);
    const later = roam(60, null).find((p) => p.key === 'a');
    expect(later).toBeDefined();
  });

  it('the others keep their own way while one is held', () => {
    const before = roam(0, { id: 'a', x: 150, y: 60 }).find((p) => p.key === 'b');
    const after = roam(30, { id: 'a', x: 150, y: 60 }).find((p) => p.key === 'b');
    expect(before).toBeDefined();
    expect(after).toBeDefined();
  });
});
