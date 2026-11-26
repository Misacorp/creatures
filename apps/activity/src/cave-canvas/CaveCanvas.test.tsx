/**
 * The Cave canvas drawn in the fake DOM: it replaces the dungeon page only with the valley on AND the day on combat v2 (both switches
 * are staging-only), the page stays in every other case, and a room's fight holds its answer back until it has played. The decisions
 * themselves are proved in `cave-canvas-logic.test.ts`.
 */
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from '../api';
import { sampleRoster } from '../creature-card-sample';
import { loadCombatPack } from '../combat-pack';
import { Dungeon } from '../Dungeon';
import { nodeLabel } from '../dungeon-map';
import { sampleState } from '../dungeon-map-sample';
import { sampleSummary, sampleToday } from '../dungeon-path-samples';
import type { DungeonActResponse, DungeonRunState, DungeonToday } from '../dungeon-types';
import { SAMPLE_MAP } from '../dungeon-map-sample';
import { byClass, byName, createPage, FakeElement, visibleText, type Page } from '../test-dom';
import { caveSample } from '../workbench/cave-canvas-sample';
import { mapV2, sampleRoomV2 } from '../workbench/dungeon-v2-sample';
import { CaveCanvas, type CaveCanvasProps } from './CaveCanvas';

const api = vi.hoisted(() => ({
  dungeonAct: vi.fn(),
  fetchDungeonToday: vi.fn(),
  fetchDungeonReplay: vi.fn(),
  fetchDungeonPreview: vi.fn(),
  saveDungeonTeam: vi.fn(),
  startDungeonRun: vi.fn(),
}));
vi.mock('../dungeon-api', () => api);

let page: Page | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  Reflect.set(globalThis, 'requestAnimationFrame', (cb: (t: number) => void) =>
    setTimeout(() => {
      cb(Date.now());
    }, 16),
  );
  Reflect.set(globalThis, 'cancelAnimationFrame', (id: number) => {
    clearTimeout(id);
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({ top: 0 }));
  Reflect.set(FakeElement.prototype, 'querySelectorAll', () => []);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined },
  });
  for (const fn of Object.values(api)) fn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  Reflect.deleteProperty(globalThis, 'localStorage');
  Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
  Reflect.deleteProperty(FakeElement.prototype, 'querySelectorAll');
});

const noop = (): void => undefined;

const button = (root: FakeElement, name: RegExp | string): FakeElement => {
  const found = byName(root, 'button', name)[0];
  if (found === undefined) throw new Error(`no button ${String(name)}`);
  return found;
};

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  // Effects run after the frame (the fake one is a short timer).
  await act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(40);
    else await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

const v2Run = (): DungeonRunState => {
  const base = sampleState('midway') as DungeonRunState;
  return { ...base, rules: 2, map: mapV2(base.map, 6) };
};
const roster = (): Creature[] => sampleRoster(6);

interface DrawOptions {
  canvas: boolean;
  rules: 2 | undefined;
  run?: DungeonRunState;
  onCanRunChange?: (canRun: boolean) => void;
  onPhaseChange?: (phase: 'active' | 'ready' | 'none') => void;
  onCanvasChange?: (on: boolean) => void;
  onRunFinished?: () => void;
  today?: Partial<DungeonToday>;
}

function drawDungeon(o: DrawOptions): Page {
  const open = o.run ?? null;
  api.fetchDungeonToday.mockResolvedValue(
    sampleToday({
      ...(o.rules === undefined ? {} : { rules: o.rules }),
      depth: 6,
      canRun: open === null,
      map: o.rules === 2 ? mapV2(SAMPLE_MAP, 6) : SAMPLE_MAP,
      active: open,
      ...(o.today ?? {}),
    }),
  );
  page = createPage();
  Reflect.set(page.document, 'addEventListener', noop);
  Reflect.set(page.document, 'removeEventListener', noop);
  page.draw(
    <Dungeon
      creatures={roster()}
      forecast={null}
      bait={100}
      draft={null}
      onDraftChange={noop}
      onRunStarted={noop}
      onCanRunChange={o.onCanRunChange ?? noop}
      onRunFinished={o.onRunFinished ?? noop}
      canvas={o.canvas}
      onPhaseChange={o.onPhaseChange}
      onCanvasChange={o.onCanvasChange}
    />,
  );
  return page;
}

describe('the Cave is a canvas only with the valley on and the day on combat v2', () => {
  it('valley on and combat v2: the canvas, and the valley is told to draw no scene above it', async () => {
    const changes: boolean[] = [];
    const p = drawDungeon({
      canvas: true,
      rules: 2,
      onCanvasChange: (on) => changes.push(on),
    });
    await settle();
    expect(byClass(p.root, 'cave-scene')).toHaveLength(1);
    expect(byClass(p.root, 'dungeon-card')).toHaveLength(0);
    expect(changes.at(-1)).toBe(true);
  });

  it('the valley off: the page, whatever the rules', async () => {
    const p = drawDungeon({ canvas: false, rules: 2 });
    await settle();
    expect(byClass(p.root, 'cave-scene')).toHaveLength(0);
    expect(byClass(p.root, 'dungeon-card')).toHaveLength(1);
  });

  it('combat v1: the page, with the valley on', async () => {
    const changes: boolean[] = [];
    const p = drawDungeon({
      canvas: true,
      rules: undefined,
      onCanvasChange: (on) => changes.push(on),
    });
    await settle();
    expect(byClass(p.root, 'cave-scene')).toHaveLength(0);
    expect(byClass(p.root, 'dungeon-card')).toHaveLength(1);
    expect(changes.at(-1)).toBe(false);
  });

  it('an open run of v1 goes on the page even when the day is v2', async () => {
    const run = sampleState('midway') as DungeonRunState;
    const v1 = { ...run };
    delete (v1 as { rules?: 2 }).rules;
    const p = drawDungeon({ canvas: true, rules: 2, run: v1 });
    await settle();
    expect(byClass(p.root, 'cave-scene')).toHaveLength(0);
  });
});

describe('a room fight holds its answer until it has played', () => {
  it('the canvas shows the fight on the scene; the pip, the Cave line and the Pack stay as they were', async () => {
    vi.useFakeTimers();
    const run = v2Run();
    const { room } = sampleRoomV2({
      foe: 'puddle-imp',
      depth: 6,
      level: 14,
      seed: 'cave-canvas-test',
      node: 'f2l1',
    });
    const after: DungeonRunState = {
      ...run,
      step: run.step + 1,
      at: 'f2l1',
      pack: { ...run.pack, bait: run.pack.bait + 7 },
      team: run.team.map((c) => ({ ...c, hp: 1 })),
    };
    const answer: DungeonActResponse = {
      state: after,
      room,
      // Today after the room: a run could start again. It must not show while the fight plays.
      today: sampleToday({ rules: 2, depth: 6, canRun: true, active: null, map: run.map }),
    };
    api.dungeonAct.mockResolvedValue(answer);
    const canRun: boolean[] = [];
    const phases: string[] = [];
    const p = drawDungeon({
      canvas: true,
      rules: 2,
      run,
      onCanRunChange: (c) => canRun.push(c),
      onPhaseChange: (ph) => phases.push(ph),
    });
    await settle();
    const node = run.map.nodes.find((n) => n.id === 'f2l1');
    if (node === undefined) throw new Error('no room');
    p.click(
      button(p.root, new RegExp(`^${nodeLabel(node).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`)),
    );
    p.click(button(p.root, /^Go/));
    await settle();
    // The fight is on the scene: no map, a fight state, the now line names the room and its foe.
    const scene = byClass(p.root, 'cave-scene')[0] as FakeElement;
    expect(scene.getAttribute('data-state')).toBe('playing');
    expect(byClass(p.root, 'dmap')).toHaveLength(0);
    expect(visibleText(scene)).toMatch(/Room 3 \/ 7: /);
    // Nothing of the answer: today's pip and the Cave line are still the open run's.
    expect(canRun).not.toContain(true);
    expect(phases.at(-1)).toBe('active');
    // Pack, Route and the map's HP are not offered over a fight; the Log is.
    const plates = byClass(p.root, 'rc-plate').map((el) => visibleText(el));
    expect(plates).toEqual(['Log']);
  });
});

describe('the canvas shows the run it is given, not a later one', () => {
  const props = (
    view: CaveCanvasProps['view'],
    start: CaveCanvasProps['start'],
  ): CaveCanvasProps => {
    const sample = caveSample('a fight');
    return {
      today: sample.today,
      offset: 0,
      view,
      creatures: sample.creatures,
      busy: false,
      error: null,
      bait: 100,
      treatsOff: false,
      draft: null,
      onDraftChange: noop,
      onEnter: noop,
      onAct: noop,
      onFightDone: noop,
      onPlaybackDone: noop,
      onWatch: noop,
      onRetry: noop,
      onSeeLast: noop,
      configure: sample.configure,
      trayInput: { trips: [], jobs: null, now: 0 },
      start,
    };
  };

  it('the Pack drawer and the now line follow the run given; a fight is given the one before the room', () => {
    const sample = caveSample('a fight');
    if (sample.view.kind !== 'fight') throw new Error('not a fight');
    const { before, after } = sample.view;
    const textOf = (view: CaveCanvasProps['view'], left?: 'pack'): string => {
      const p = createPage();
      page = p;
      Reflect.set(p.document, 'addEventListener', noop);
      Reflect.set(p.document, 'removeEventListener', noop);
      p.draw(<CaveCanvas {...props(view, left === undefined ? {} : { left })} />);
      const text = visibleText(p.root);
      p.unmount();
      page = null;
      return text;
    };
    // The drawer reads the run it is given: the run before the room and the run after it differ in the pack.
    expect(textOf({ kind: 'run', state: before }, 'pack')).not.toBe(
      textOf({ kind: 'run', state: after }, 'pack'),
    );
    // The fight view carries both; its scene shows neither state's map or line, only the fight, and the line is the room's.
    const fight = textOf(sample.view);
    expect(fight).toMatch(/Room 3 \/ 7: Puddle Imp/);
    expect(fight).not.toMatch(/choose the next room/);
  });
});

describe('after the fight', () => {
  const sceneState = (p: Page): string | null =>
    byClass(p.root, 'cave-scene')[0]?.getAttribute('data-state') ?? null;

  /** Plays the fight on the scene to its end (fake timers), a second at a time. */
  async function playOut(p: Page): Promise<void> {
    for (let i = 0; i < 900 && sceneState(p) === 'playing'; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(sceneState(p)).not.toBe('playing');
  }

  /** Draws the Cave with an open run, answers its move into `f2l1` with `answer`, and goes. */
  async function goFight(o: Partial<DrawOptions>, ends: boolean) {
    vi.useFakeTimers();
    const run = v2Run();
    const { room } = sampleRoomV2({
      foe: 'puddle-imp',
      depth: 6,
      level: 14,
      seed: 'cave-canvas-test',
      node: 'f2l1',
    });
    const after: DungeonRunState = {
      ...run,
      step: run.step + 1,
      at: 'f2l1',
      status: ends ? 'done' : 'active',
    };
    const next = sampleToday({ rules: 2, depth: 6, canRun: true, active: null, map: run.map });
    const answer: DungeonActResponse = {
      state: after,
      room,
      today: next,
      ...(ends ? { summary: sampleSummary('cleared', { rules: 2 }) } : {}),
    };
    api.dungeonAct.mockResolvedValue(answer);
    const p = drawDungeon({ canvas: true, rules: 2, run, ...o });
    await settle();
    const node = run.map.nodes.find((n) => n.id === 'f2l1');
    if (node === undefined) throw new Error('no room');
    const label = nodeLabel(node).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    p.click(button(p.root, new RegExp(`^${label}\\.`)));
    p.click(button(p.root, /^Go/));
    await settle();
    expect(sceneState(p)).toBe('playing');
    return { p, next };
  }

  it('the held today is applied only when the playback has ended', async () => {
    const canRun: boolean[] = [];
    const phases: string[] = [];
    const { p } = await goFight(
      { onCanRunChange: (c) => canRun.push(c), onPhaseChange: (ph) => phases.push(ph) },
      false,
    );
    expect(canRun).not.toContain(true);
    await playOut(p);
    expect(canRun.at(-1)).toBe(true);
    expect(byClass(p.root, 'dmap').length).toBe(1);
  });

  it('the fight that ends the run: the Cave line and the results come only after the playback', async () => {
    const phases: string[] = [];
    const finished = vi.fn();
    const { p } = await goFight(
      { onPhaseChange: (ph) => phases.push(ph), onRunFinished: finished },
      true,
    );
    expect(phases.at(-1)).toBe('active');
    expect(byClass(p.root, 'dungeon-result')).toHaveLength(0);
    expect(visibleText(p.root)).not.toMatch(/The run is over/);
    expect(finished).not.toHaveBeenCalled();
    await playOut(p);
    expect(phases.at(-1)).toBe('none');
    expect(sceneState(p)).toBe('over');
    expect(visibleText(p.root)).toMatch(/The run is over/);
    expect(finished).toHaveBeenCalled();
  });

  it('leaving the Cave mid-fight hands the held answer to the game and pays the run', async () => {
    const canRun: boolean[] = [];
    const phases: string[] = [];
    const finished = vi.fn();
    const { p } = await goFight(
      {
        onCanRunChange: (c) => canRun.push(c),
        onPhaseChange: (ph) => phases.push(ph),
        onRunFinished: finished,
      },
      true,
    );
    expect(canRun).not.toContain(true);
    p.unmount();
    page = null;
    expect(canRun.at(-1)).toBe(true);
    expect(phases.at(-1)).toBe('none');
    expect(finished).toHaveBeenCalled();
  });

  it('a day reset during a fight reloads only after the held answer is applied', async () => {
    const now = Date.now();
    const { p } = await goFight({ today: { serverNow: now, resetsAt: now + 4000 } }, false);
    const before = api.fetchDungeonToday.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(sceneState(p)).toBe('playing');
    expect(api.fetchDungeonToday.mock.calls.length).toBe(before);
    await playOut(p);
    expect(api.fetchDungeonToday.mock.calls.length).toBe(before + 1);
  });
});

describe('treats', () => {
  const enterText = (treatsOff: boolean): string => {
    const sample = caveSample('before a run');
    const p = createPage();
    page = p;
    Reflect.set(p.document, 'addEventListener', noop);
    Reflect.set(p.document, 'removeEventListener', noop);
    p.draw(
      <CaveCanvas
        today={sample.today}
        offset={0}
        view={sample.view}
        creatures={sample.creatures}
        busy={false}
        error={null}
        bait={100}
        treatsOff={treatsOff}
        draft={[sample.creatures[0]?.id ?? null, sample.creatures[1]?.id ?? null, null]}
        onDraftChange={noop}
        onEnter={noop}
        onAct={noop}
        onFightDone={noop}
        onPlaybackDone={noop}
        onWatch={noop}
        onRetry={noop}
        onSeeLast={noop}
        configure={sample.configure}
        trayInput={{ trips: [], jobs: null, now: 0 }}
        start={{ right: { kind: 'enter' } }}
      />,
    );
    const text = visibleText(p.root);
    p.unmount();
    page = null;
    return text;
  };

  it('are offered at the cave mouth, and hidden when the server refuses them', () => {
    expect(enterText(false)).toMatch(/Treats/);
    expect(enterText(true)).not.toMatch(/Treats/);
    expect(enterText(true)).toMatch(/Enter the cave/);
  });
});

describe('the reaction partners in the Cave', () => {
  const drawCave = (state: 'before a run' | 'a fight', touch: string): Page => {
    const sample = caveSample(state, true);
    const touched = sample.creatures.find((c) => c.species === touch)?.id;
    const p = createPage();
    page = p;
    Reflect.set(p.document, 'addEventListener', noop);
    Reflect.set(p.document, 'removeEventListener', noop);
    p.draw(
      <CaveCanvas
        today={sample.today}
        offset={0}
        view={sample.view}
        creatures={sample.creatures}
        busy={false}
        error={null}
        bait={100}
        treatsOff={false}
        draft={sample.draft}
        onDraftChange={noop}
        onEnter={noop}
        onAct={noop}
        onFightDone={noop}
        onPlaybackDone={noop}
        onWatch={noop}
        onRetry={noop}
        onSeeLast={noop}
        configure={sample.configure}
        trayInput={{ trips: [], jobs: null, now: 0 }}
        start={{ closed: true, ...(touched === undefined ? {} : { touch: touched }) }}
        partnerLook="badge"
      />,
    );
    return p;
  };

  it('lights the partners of a touched creature before a run, on the mouth and in the tray', async () => {
    await loadCombatPack();
    const p = drawCave('before a run', 'mossback');
    // Mossback (a Grove Setter, touched) and the Ember Payoffs in the tray that cash Grove.
    expect(byClass(p.root, 'partner-badge').length).toBeGreaterThanOrEqual(3);
  });

  it('lights nothing during a fight, whichever creature is touched', async () => {
    await loadCombatPack();
    const p = drawCave('a fight', 'mossback');
    expect(byClass(p.root, 'partner-badge')).toHaveLength(0);
    expect(byClass(p.root, 'partner-dim')).toHaveLength(0);
  });
});
