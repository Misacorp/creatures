import { dungeonRewardScalars } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { teamSample } from './creature-page/team-sample';
import { withV2 } from './creature-page/v2-sample';
import { depthPickNote, depthScalarsText, scalarText } from './dungeon-depth';
import { parseDungeonPreview, parseDungeonToday } from './dungeon-parse';
import { ActionIds } from './actions';
import { resultSummary, runStatusLine } from './dungeon-text';
import type { DungeonPreview } from './dungeon-types';
import { DungeonSetup } from './DungeonSetup';
import todayFixture from './fixtures/dungeon-today-map.json';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from './test-dom';

let page: Page | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    scrollTo: () => undefined,
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function draw(options: { rules?: 2; depth: number; initialDepth?: number }) {
  page = createPage();
  const scene = teamSample();
  const today = parseDungeonToday({
    ...todayFixture,
    ...(options.rules === 2 ? { rules: 2 } : {}),
    depth: options.depth,
    lastTeam: scene.team.map((c) => c.id),
  });
  const creatures =
    options.rules === 2
      ? scene.creatures.map((c) => withV2(c, { knack: 0, learned: [0, 1], golden: [1] }))
      : scene.creatures;
  const onEnter = vi.fn();
  const loadPreview = vi.fn((depth: number): Promise<DungeonPreview> =>
    Promise.resolve({
      depth,
      landmark: false,
      landmarkBoss: null,
      map: (today.map as NonNullable<typeof today.map>) ?? { floors: 0, nodes: [] },
    }),
  );
  page.draw(
    <DungeonSetup
      today={today}
      creatures={creatures}
      bait={40}
      busy={false}
      error={null}
      draft={null}
      onDraftChange={vi.fn()}
      onEnter={onEnter}
      loadPreview={loadPreview}
      {...(options.initialDepth === undefined ? {} : { initialDepth: options.initialDepth })}
      onSeeLast={vi.fn()}
    />,
  );
  return { root: page.root, onEnter, loadPreview };
}

describe('the depth picker on the pre-run card', () => {
  it('shows the scalars of the depth and which depth is the player’s own, on combat v2', () => {
    const { root } = draw({ rules: 2, depth: 23 });
    const picker = first(byClass(root, 'depth-pick'));
    const text = visibleText(picker);
    expect(text).toContain('Depth to play');
    expect(text).toContain(depthScalarsText(23));
    expect(text).toContain('23 / 23');
    expect(text).toContain('Your depth. A clear unlocks depth 24.');
  });

  it('steps below the own depth: other scalars, the line that it does not advance, a preview of that depth', () => {
    const { root, loadPreview } = draw({ rules: 2, depth: 23, initialDepth: 16 });
    const text = visibleText(first(byClass(root, 'depth-pick')));
    expect(text).toContain(depthScalarsText(16));
    expect(text).toContain('16 / 23');
    expect(text).toContain('Your depth is 23.');
    expect(text).toContain('does not take you deeper');
    expect(loadPreview).toHaveBeenCalledWith(16);
    // The depth track stays the player's own depth.
    expect(byClass(root, 'depth-pick-note')).toHaveLength(1);
  });

  it('flips with the arrows, stops at 1 and at the own depth, and enters at the picked depth', () => {
    const { root, onEnter } = draw({ rules: 2, depth: 3 });
    const p = page as Page;
    const arrow = (name: string): FakeElement => first(byName(root, 'button', name));
    // At the own depth the next arrow is dead.
    p.click(arrow('Next depth'));
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain('3 / 3');
    p.click(arrow('Previous depth: Depth 2'));
    p.click(arrow('Previous depth: Depth 1'));
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain('1 / 3');
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain(depthScalarsText(1));
    // At depth 1 the previous arrow is dead.
    p.click(arrow('Previous depth'));
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain('1 / 3');
    p.click(first(byName(root, 'button', 'Enter the dungeon')));
    // The team of the last run is placed, so Enter is on and asks for depth 1.
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]?.[2]).toBe(1);
  });

  it('shows no picker on combat v1, and Enter sends no depth', () => {
    const { root, onEnter, loadPreview } = draw({ depth: 23 });
    expect(byClass(root, 'depth-pick')).toHaveLength(0);
    expect(loadPreview).not.toHaveBeenCalled();
    (page as Page).click(first(byName(root, 'button', 'Enter the dungeon')));
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]).toHaveLength(2);
  });

  it('shows no picker at depth 1 (nothing to pick)', () => {
    const { root } = draw({ rules: 2, depth: 1 });
    expect(byClass(root, 'depth-pick')).toHaveLength(0);
  });
});

describe('the words of the depth picker', () => {
  it('words a multiple to one decimal as the game words every multiplier', () => {
    expect(scalarText(1)).toBe('1x');
    expect(scalarText(1.44)).toBe('1.4x');
    expect(scalarText(2.46)).toBe('2.5x');
    expect(scalarText(3)).toBe('3x');
  });

  it('is the scalars of the game package: depth 1 is 1x and 1x', () => {
    expect(dungeonRewardScalars(1)).toEqual({ xp: 1, loot: 1 });
    expect(depthScalarsText(1)).toBe('1x XP · 1x loot');
    expect(depthScalarsText(30)).toMatch(/^\d+(\.\d)?x XP · \d+(\.\d)?x loot$/);
  });

  it('says which depth is the own one and that a lower pick does not advance', () => {
    expect(depthPickNote(23, 23)).toBe('Your depth. A clear unlocks depth 24.');
    expect(depthPickNote(23, 16)).toContain('Your depth is 23');
    expect(depthPickNote(23, 16)).toContain('does not take you deeper');
  });

  it('words a clear below the own depth without a new depth', () => {
    const run = {
      outcome: 'cleared' as const,
      cleared: true,
      roomsCleared: 5,
      rooms: [],
      depth: 16,
      newDepth: 23,
      lower: true as const,
    };
    expect(resultSummary(run)).toContain(
      'You defeated the floor boss at depth 16. You stay at depth 23.',
    );
    expect(resultSummary(run)).not.toContain('advanced');
    expect(resultSummary({ ...run, lower: undefined })).toContain('advanced to depth 23');
  });

  it('shows the run’s own depth on the strip at a lower descent', () => {
    const base = {
      at: null,
      map: { floors: 1, nodes: [] },
      depth: 16,
    };
    const descend = {
      kind: 'descend' as const,
      level: 1,
      floors: 3,
      depthBonus: 5,
      catchBreathBp: 2000,
      reviveBp: 1000,
      newDepth: 17,
      banked: { gear: [], supplies: [], parts: {} },
    };
    expect(runStatusLine({ ...base, pending: { ...descend, lower: true } })).toContain('Depth 16');
    expect(runStatusLine({ ...base, pending: descend })).toContain('Depth 17');
  });
});

describe('the preview answer and the start key', () => {
  const today = parseDungeonToday(todayFixture);
  it('reads a preview and refuses a malformed one', () => {
    const ok = parseDungeonPreview({
      depth: 14,
      landmark: true,
      landmarkBoss: { depth: 14, foeId: 'drowned-warden' },
      map: today.map,
    });
    expect(ok.depth).toBe(14);
    expect(ok.landmarkBoss?.foeId).toBe('drowned-warden');
    expect(() => parseDungeonPreview({ depth: 'x', landmark: true, map: today.map })).toThrow();
    expect(() => parseDungeonPreview(null)).toThrow();
    expect(() =>
      parseDungeonPreview({ depth: 3, landmark: false, landmarkBoss: null, map: null }),
    ).toThrow();
  });

  it('gives a start at another depth its own key, and leaves the old key as it was', () => {
    const team: [string, string, string] = ['a', 'b', 'c'];
    expect(ActionIds.dungeonStart(team)).toBe(ActionIds.dungeonStart(team, []));
    expect(ActionIds.dungeonStart(team, [], 5)).not.toBe(ActionIds.dungeonStart(team, [], 6));
    expect(ActionIds.dungeonStart(team, [], 5)).not.toBe(ActionIds.dungeonStart(team));
  });
});
