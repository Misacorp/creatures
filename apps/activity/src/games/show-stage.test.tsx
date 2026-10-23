import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byClass, createPage, type Page } from '../test-dom';
import { sampleShow } from '../workbench/games-show-sample';
import { ShowStage, actorLook } from './ShowStage';
import {
  SHOW_PODIUM_MS,
  eventMs,
  frameAt,
  podiumOf,
  prepareEvent,
  type PreparedEvent,
  type ShowPhase,
} from './show-timeline';

/**
 * Your markers on the stage: one over each of your creatures in every phase while it is in the scene
 * (the intro's drop included, a greyed-out one too), none over anyone else's, none once a creature has
 * left the scene, and on the podium only over yours that stand on it.
 */
let page: Page | null = null;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
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

function prepared(id: string, seed: string): { p: PreparedEvent; youId: string } {
  const show = sampleShow([id], 8, 0, seed);
  const event = show.events[0];
  if (event === undefined) throw new Error(`no ${id}`);
  return { p: prepareEvent(event), youId: show.youId };
}

function markers(p: PreparedEvent, youId: string, phase: ShowPhase, ms: number): number {
  page?.unmount();
  page = createPage();
  const frame = frameAt(p, phase === 'intro' ? 0 : phase === 'event' ? ms : eventMs(p.result));
  page.draw(
    <ShowStage
      p={p}
      phase={phase}
      phaseMs={phase === 'event' ? 0 : ms}
      frame={frame}
      youId={youId}
      reduced={false}
      label="test"
    />,
  );
  return byClass(page.root, 'gs-you').length;
}

/** Your creatures still drawn in the scene at event ms `ms`. */
function yoursShown(p: PreparedEvent, youId: string, ms: number): number {
  return frameAt(p, ms).actors.filter(
    (f) => p.result.actors[f.a]?.playerId === youId && actorLook(p.kind, f) !== 'hidden',
  ).length;
}

const EVENTS = [
  'sauna-showdown',
  'frost-bath',
  'log-carry',
  'pumpkin-push',
  'melon-run',
  'pepper-panic',
  'shark-derby',
  'floe-sumo',
  'bucket-brigade',
  'crate-tower',
  'kite-flight',
];

describe('your markers on the stage', () => {
  it.each(EVENTS)('marks each of your creatures in %s, from the drop to the end', (id) => {
    const { p, youId } = prepared(id, 'markers');
    const creatures = p.result.actors.filter((a) => a.playerId === youId).length;
    expect(creatures).toBe(p.result.team === 3 ? 3 : 1);
    // A haul's team carries one load, and the at-once team events give each team one barrel, tower
    // or kite: one marker over it, not three.
    const haul = p.kind === 'haul' || p.kind === 'fill' || p.kind === 'stack' || p.kind === 'kite';
    const yours = haul ? 1 : creatures;
    // The intro: before the drop (high above the scene), while falling and after landing.
    for (const ms of [0, 600, 2_800])
      expect(markers(p, youId, 'intro', ms), `intro ${ms}`).toBe(yours);
    // The event: at the start, the middle and the end, minus any of yours that have left the scene.
    const end = eventMs(p.result);
    for (const ms of [0, Math.round(end / 2), end]) {
      expect(markers(p, youId, 'event', ms), `event ${ms}`).toBe(
        haul ? 1 : yoursShown(p, youId, ms),
      );
    }
    expect(markers(p, youId, 'event', 0)).toBe(yours);
  });

  it('drops the marker once a creature leaves the scene, and keeps it while it shows greyed', () => {
    const { p } = prepared('sauna-showdown', 'markers');
    const end = eventMs(p.result);
    const gone = frameAt(p, end).actors.find((f) => actorLook(p.kind, f) === 'hidden');
    const goneOwner = gone === undefined ? undefined : p.result.actors[gone.a]?.playerId;
    if (goneOwner === undefined) throw new Error('nobody left the sauna');
    expect(markers(p, goneOwner, 'event', 0)).toBe(1);
    expect(markers(p, goneOwner, 'event', end)).toBe(0);
    const melon = prepared('melon-run', 'markers').p;
    const melonEnd = eventMs(melon.result);
    const grey = frameAt(melon, melonEnd).actors.find((f) => actorLook(melon.kind, f) === 'grey');
    const greyOwner = grey === undefined ? undefined : melon.result.actors[grey.a]?.playerId;
    if (greyOwner === undefined) throw new Error('nobody squashed');
    expect(markers(melon, greyOwner, 'event', melonEnd)).toBe(1);
  });

  it('marks nobody for a spectator', () => {
    const { p } = prepared('log-carry', 'markers');
    expect(markers(p, 'not-a-player', 'intro', 2_800)).toBe(0);
    expect(markers(p, 'not-a-player', 'event', 1_000)).toBe(0);
    expect(markers(p, 'not-a-player', 'podium', SHOW_PODIUM_MS)).toBe(0);
  });

  it('marks yours on the podium, and only there', () => {
    const { p } = prepared('melon-run', 'markers');
    const [gold] = podiumOf(p).rows;
    if (gold === undefined) throw new Error('no podium');
    expect(markers(p, gold.playerId, 'podium', SHOW_PODIUM_MS)).toBe(1);
    const offPodium = p.result.actors.find(
      (a) => !podiumOf(p).rows.some((r) => r.playerId === a.playerId),
    );
    if (offPodium === undefined) throw new Error('everyone on the podium');
    expect(markers(p, offPodium.playerId, 'podium', SHOW_PODIUM_MS)).toBe(0);
  });
});
