/**
 * The raid canvas drawn in the fake DOM (a phone: no `matchMedia`, so a panel is its own page): the now line, which panel opens for which
 * tap, the seat plates choice, and the outcome held until a stage ends. The decisions themselves are proved in `raid-canvas-logic.test.ts`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCombatPack } from '../combat-pack';
import { creatureName } from '../game';
import {
  find,
  byClass,
  byName,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { canvasSample, type CanvasSample, type CanvasState } from '../workbench/raid-canvas-sample';
import { RaidCanvas, type RaidCanvasProps } from './RaidCanvas';
import type { RaidCanvasConfig } from './config';
import type { RaidView } from '../raid-api';
import { RevealCard } from '../Reveal';
import { summaryBoss } from '../raid-summary-view';

let page: Page | null = null;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined },
  });
});
afterEach(() => {
  vi.stubGlobal('document', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  page?.unmount();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'localStorage');
  page = null;
});

const noop = (): void => undefined;

function draw(
  sample: CanvasSample,
  options: {
    config?: Partial<RaidCanvasConfig>;
    view?: RaidView;
    now?: number;
    reveal?: RaidCanvasProps['reveal'];
    start?: RaidCanvasProps['start'];
  } = {},
): Page {
  const p = createPage();
  page = p;
  p.draw(
    <RaidCanvas
      view={options.view ?? sample.view}
      serverNow={options.now ?? sample.now}
      finale={sample.finale}
      creatures={sample.creatures}
      configure={sample.configure}
      busy={false}
      trayInput={{ trips: [], jobs: null, now: sample.now }}
      config={options.config ?? { creatureTap: 'drawer', seatPlates: 'mine' }}
      reveal={options.reveal}
      start={options.start}
      onOpenPage={noop}
      actions={{
        intent: noop,
        askSwap: noop,
        answerSwap: noop,
        cancelSwap: noop,
        setAbility: noop,
        setAutofire: noop,
      }}
    />,
  );
  return p;
}

const seat = (p: Page, slot: number): FakeElement => {
  const found = find(p.root, (el) => el.getAttribute('data-slot') === String(slot))[0];
  if (found === undefined) throw new Error(`no seat ${String(slot)}`);
  return found;
};
const pageLabel = (p: Page): string | null =>
  byClass(p.root, 'pc-page')[0]?.getAttribute('aria-label') ?? null;
const sampleOf = (state: CanvasState): CanvasSample => canvasSample(state);

describe('the reaction partners of a touched creature', () => {
  beforeAll(async () => {
    await loadCombatPack();
  });

  const config = (partnerLook: 'badge' | 'glow' | 'dim'): Partial<RaidCanvasConfig> => ({
    creatureTap: 'drawer',
    seatPlates: 'mine',
    partnerLook,
  });

  it('badge: a touched setter lights the Payoffs that can cash its mark, on the board and in the tray, and itself', () => {
    const p = draw(sampleOf('placing'), {
      config: config('badge'),
      start: { touch: 'demo-moss' },
    });
    const badges = byClass(p.root, 'partner-badge');
    // Mossback (touched, in the tray and on the board), Pyrelynx and Jun's Cindle on the board, two Cindles in the tray.
    expect(badges.length).toBeGreaterThanOrEqual(5);
    const tray = find(p.root, (el) => el.getAttribute('data-creature') === 'demo-cindle')[0];
    expect(byClass(tray as FakeElement, 'partner-badge')).toHaveLength(1);
    const guard = find(p.root, (el) => el.getAttribute('data-creature') === 'demo-sprout')[0];
    expect(byClass(guard as FakeElement, 'partner-badge')).toHaveLength(0);
  });

  it('nothing is lit when no creature is touched', () => {
    const p = draw(sampleOf('placing'), { config: config('badge') });
    expect(byClass(p.root, 'partner-badge')).toHaveLength(0);
  });

  it('dim: the creatures that are no partner recede', () => {
    const p = draw(sampleOf('placing'), { config: config('dim'), start: { touch: 'demo-moss' } });
    expect(byClass(p.root, 'partner-dim').length).toBeGreaterThan(0);
    expect(byClass(p.root, 'partner-badge')).toHaveLength(0);
    const tray = find(p.root, (el) => el.getAttribute('data-creature') === 'demo-cindle')[0];
    expect(String(tray?.getAttribute('class'))).not.toContain('partner-dim');
  });

  it('glow: partners carry the glow and the mark colour', () => {
    const p = draw(sampleOf('placing'), { config: config('glow'), start: { touch: 'demo-moss' } });
    expect(byClass(p.root, 'partner-glow-fill').length).toBeGreaterThan(0);
  });
});

describe('the raid canvas', () => {
  it('shows the now line as a polite live region on the scene', () => {
    const p = draw(sampleOf('placing'));
    const now = find(
      p.root,
      (el) => el.getAttribute('role') === 'status' && el.getAttribute('aria-live') === 'polite',
    );
    expect(visibleText(now[0] as FakeElement)).toMatch(/Mira asks to swap/);
  });

  it('names the three plates on the scene frame, Log in place of Players while a stage plays', () => {
    const placing = draw(sampleOf('placing'));
    const plates = byClass(placing.root, 'rc-plate').map((el) => visibleText(el));
    expect(plates).toEqual(['Weekend', 'Boss', 'Players']);
  });

  it('opens your creature in the right panel with its page and Remove from board', () => {
    const sample = sampleOf('placing');
    const p = draw(sample);
    expect(pageLabel(p)).toBeNull();
    // Your second creature (row 2, lane 1) is in no swap request.
    p.click(seat(p, 1));
    const row = sample.view.party?.row.find((s) => s.slot === 1)?.creature;
    const owned = sample.creatures.find((c) => c.id === row?.creatureId);
    expect(owned).toBeDefined();
    expect(pageLabel(p)).toBe(creatureName(owned as NonNullable<typeof owned>));
    const text = visibleText(byClass(p.root, 'pc-page')[0] as FakeElement);
    expect(text).toMatch(/Creature page/);
    expect(text).toMatch(/Remove from board/);
  });

  it("opens another player's creature read-only, with Ask to swap", () => {
    const sample = sampleOf('placing');
    const p = draw(sample);
    // Lane 3, row 1: Jun's.
    p.click(seat(p, 6));
    const text = visibleText(byClass(p.root, 'pc-page')[0] as FakeElement);
    expect(text).toMatch(/Jun/);
    expect(text).toMatch(/Ask to swap/);
    expect(text).not.toMatch(/Remove from board/);
  });

  it('opens a creature in a swap request as the request, with Accept and Decline', () => {
    const p = draw(sampleOf('placing'));
    p.click(seat(p, 0));
    expect(pageLabel(p)).toBe('Swap request');
    const text = visibleText(byClass(p.root, 'pc-page')[0] as FakeElement);
    expect(text).toMatch(/Accept/);
    expect(text).toMatch(/Decline/);
  });

  it('opens an empty seat as a picker for your creatures', () => {
    const p = draw(sampleOf('before the weekend'));
    p.click(seat(p, 0));
    expect(pageLabel(p)).toBe('Row 1, lane 1');
  });

  it('a tap on the now line opens what it names (the swap request)', () => {
    const p = draw(sampleOf('placing'));
    const button = byClass(p.root, 'rc-now-button')[0];
    expect(button).toBeDefined();
    p.click(button as FakeElement);
    expect(pageLabel(p)).toBe('Swap request');
  });

  it('prints name and level on other players’ seats only with seatPlates "all"', () => {
    const sample = sampleOf('placing');
    const mine = draw(sample, { config: { seatPlates: 'mine', creatureTap: 'drawer' } });
    const others = (p: Page): string => visibleText(seat(p, 6));
    expect(others(mine)).not.toMatch(/Lv/);
    expect(visibleText(seat(mine, 1))).toMatch(/Lv/);
    mine.unmount();
    const all = draw(sample, { config: { seatPlates: 'all', creatureTap: 'drawer' } });
    expect(others(all)).toMatch(/Lv/);
  });
});

describe('a stage playing out holds the outcome until it ends', () => {
  const withPlaying = (endsAt: number): CanvasSample => {
    const sample = sampleOf('placing');
    const base = sample.view.v2;
    const hurt = sample.creatures[2];
    if (base === undefined || hurt === undefined) throw new Error('no v2');
    // One of yours that is not on the board was knocked out in the stage that is playing.
    const v2 = {
      ...base,
      swaps: { incoming: [], outgoing: [], settled: [] },
      out: [{ creatureId: hurt.id, species: hurt.species, name: 'Hurt', owner: 'You', mine: true }],
    };
    const playing = {
      stage: 2,
      startsAt: endsAt - 240_000,
      roundMs: 30_000,
      nextRoundAt: 0,
      endsAt,
    };
    return { ...sample, view: { ...sample.view, v2: { ...v2, playing } as typeof v2 } };
  };
  const outLabel = (p: Page): boolean =>
    find(p.root, (el) => (el.getAttribute('aria-label') ?? '').includes('Out this weekend'))
      .length > 0;

  it('shows the knocked-out marks once the window is over', () => {
    const sample = withPlaying(1_000);
    expect(outLabel(draw(sample, { now: 2_000 }))).toBe(true);
  });

  it('and not before endsAt', () => {
    const sample = withPlaying(1_000_000);
    const p = draw(sample, { now: 2_000 });
    expect(outLabel(p)).toBe(false);
    expect(visibleText(p.root)).toMatch(/Stage 2 is playing/);
  });
});

describe("the reveal's Replay plays the fight on the canvas", () => {
  it('opens the scene in watch mode, with Close replay, and hides the reveal card', () => {
    const sample = sampleOf('after the finale');
    const reveal = sample.reveal;
    if (reveal === undefined) throw new Error('no reveal');
    const card: RaidCanvasProps['reveal'] = (watch) => (
      <RevealCard
        reveal={reveal}
        busy={false}
        season={{ weekId: sample.view.weekId, season: sample.view.season }}
        boss={summaryBoss(sample.view, reveal.week)}
        afterAction={{
          week: reveal.week,
          party: reveal.party,
          onReplay: () => {
            watch('finale');
          },
        }}
        onDismiss={noop}
      />
    );
    const p = draw(sample, { reveal: card });
    const replay = byName(p.root, 'button', /replay/i)[0];
    expect(replay).toBeDefined();
    expect(byName(p.root, 'button', /close replay/i)).toHaveLength(0);
    p.click(replay as FakeElement);
    expect(byName(p.root, 'button', /close replay/i).length).toBeGreaterThan(0);
    expect(byClass(p.root, 'rc-reveal')).toHaveLength(0);
  });
});
