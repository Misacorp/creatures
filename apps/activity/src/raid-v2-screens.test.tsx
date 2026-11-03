/**
 * The Raid tab on a combat v2 week, the parts that follow the week's rules: at the finale's time the v2 finale opens (never the shipped
 * `Live`), the stages played are listed in Results as soon as they are, the finale action is picked before the finale and a v1 week
 * keeps its screens. The server's calls are replaced; the week is the workbench's sample.
 */
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhaseResultView, RaidView } from './raid-api';
import { Raid } from './Raid';
import { byClass, byName, createPage, visibleText, type Page } from './test-dom';
import { liveSample, statsSample } from './workbench/fight-v2-sample';
import { raidV2Sample } from './workbench/raid-v2-sample';

const fetchRaid = vi.fn<() => Promise<RaidView>>();
vi.mock('./raid-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./raid-api')>()),
  fetchRaid: () => fetchRaid(),
}));

const fetchLiveV2 = vi.fn();
const fetchStatsEither = vi.fn();
vi.mock('./fight-v2-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./fight-v2-api')>()),
  fetchLiveV2: () => fetchLiveV2() as Promise<unknown>,
  fetchStatsEither: () => fetchStatsEither() as Promise<unknown>,
}));

vi.mock('./Live', () => ({ Live: () => <p>SHIPPED FINALE</p> }));

let page: Page | null = null;
beforeEach(() => {
  fetchRaid.mockReset();
  fetchLiveV2.mockReset();
  fetchStatsEither.mockReset();
  Reflect.set(globalThis, 'window', {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
    setTimeout,
    clearTimeout,
    location: { protocol: 'https:', host: 'example.test' },
  });
});
afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

/** Lets the answers of the replaced calls arrive and the screen draw what they bring. */
const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
};

/** The sample v2 week with the clock at `finale` and the caller in a party. */
function weekAt(over: Partial<RaidView> = {}): RaidView {
  const { view } = raidV2Sample({
    slot: 4,
    players: 4,
    stagesPlayed: 1,
    mine: 3,
    bestShareBp: 0,
    knockedOut: false,
    swaps: 'none',
  });
  const now = Date.now();
  return {
    ...view,
    serverNow: now,
    schedule: { weekStart: now - 9e8, phase1: now - 5e8, phase2: now - 2e8, finale: now - 1000 },
    next: null,
    you: {
      ...view.you,
      party: 1,
      inRoster: true,
      ability: { abilityId: 'shield-wall', chosen: true },
      abilities: [
        {
          abilityId: 'shield-wall',
          creatureId: null,
          species: null,
          unlocked: true,
          unlockLevel: 1,
          autoFire: true,
        },
      ],
    },
    ...over,
  };
}

const draw = async (view: RaidView) => {
  fetchRaid.mockResolvedValue(view);
  page = createPage();
  page.draw(
    <Raid
      creatures={[]}
      forecast={null}
      showPractice
      onBalanceChange={() => undefined}
      onNeedsPlacementChange={() => undefined}
    />,
  );
  await flush();
  return page;
};

describe('a combat v2 week', () => {
  it("opens the v2 finale at the finale's time, not the shipped one", async () => {
    fetchLiveV2.mockResolvedValue({
      ...liveSample({ slot: 4, players: 4, stage: 3, seed: 'screen' }, { round: 2 }),
    });
    const p = await draw(weekAt());
    await flush();
    const text = visibleText(p.root);
    expect(text).not.toContain('SHIPPED FINALE');
    expect(fetchLiveV2).toHaveBeenCalled();
    expect(byClass(p.root, 'drill-head').length).toBe(1);
  });

  it('offers the finale action before the finale and never the practice fight', async () => {
    const week = weekAt();
    const later = Date.now() + 3_600_000;
    const p = await draw({ ...week, schedule: { ...week.schedule, finale: later } });
    expect(byClass(p.root, 'finale-action')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Shield Wall').length).toBeGreaterThan(0);
    expect(visibleText(p.root)).not.toContain('Start practice fight');
    // The shipped ability chip is not drawn on a v2 week.
    expect(byClass(p.root, 'ability-chip')).toHaveLength(0);
  });

  it('lists a stage in Results as a compact row with Watch, and a tap opens its card', async () => {
    fetchStatsEither.mockResolvedValue({
      rules: 2,
      stats: statsSample({ slot: 4, players: 4, stage: 1, seed: 'screen' }),
    });
    const early = weekAt();
    const view = withResults(
      { ...early, schedule: { ...early.schedule, finale: Date.now() + 3_600_000 } },
      [result('phase1', 100, 62, true)],
    );
    const p = await draw(view);
    const text = visibleText(p.root);
    expect(text).toContain('Results');
    expect(text).toContain('Stage 1 · 38% of its HP · Cleared');
    expect(byName(p.root, 'button', /Watch/).length).toBe(1);
    // The card asks the server for its numbers only when the row is opened.
    expect(fetchStatsEither).not.toHaveBeenCalled();
    p.click(
      byClass(p.root, 'acc-head').find((el) => visibleText(el).startsWith('Stage 1')) as never,
    );
    await flush();
    expect(fetchStatsEither).toHaveBeenCalled();
    expect(visibleText(p.root)).toContain('Scoreboard');
    expect(visibleText(p.root).toLowerCase()).not.toMatch(/\bwall\b|harder/);
  });

  it("opens no finale when the boss fell in stage 2: the week's result is shown instead", async () => {
    const week = weekAt();
    if (week.v2 === undefined) throw new Error('no v2 part');
    const view = withResults({ ...week, v2: { ...week.v2, stagesPlayed: 2, nextStage: 4 } }, [
      result('phase1', 100, 55, true),
      result('phase2', 55, 0, true),
    ]);
    const p = await draw(view);
    await flush();
    expect(fetchLiveV2).not.toHaveBeenCalled();
    expect(byClass(p.root, 'drill-head')).toHaveLength(0);
    const text = visibleText(p.root);
    expect(text).toContain('Stage 2 · Boss fell · Cleared');
    expect(text).not.toContain('The finale is on now');
  });
});

/** A stored stage as the week's view lists it (HP of the weekend before and after). */
function result(
  phase: 'phase1' | 'phase2',
  start: number,
  end: number,
  cleared: boolean,
): PhaseResultView {
  return {
    phase,
    at: 1,
    cleared,
    rounds: 8,
    bossHpMax: 100,
    bossHpStart: start,
    bossHpEnd: end,
    damage: start - end,
    reactions: 2,
    top: [],
    essence: 5,
    rankChange: null,
    festivalGrant: null,
  };
}

/** The week with these stage results, and the finale's time as it is (now). */
function withResults(week: RaidView, results: NonNullable<RaidView['party']>['results']): RaidView {
  const party = week.party;
  if (party === null) throw new Error('no party');
  return { ...week, party: { ...party, results } };
}
