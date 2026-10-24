import { describe, expect, it } from 'vitest';
import { mutedRamp, RAMPS } from './art/tint';
import { GAMES_PROP_DATA } from './art/data/games-props';
import { sampleEvent, samplePlayers } from '../workbench/games-show-sample';
import { actorHeight } from './ShowStage';
import { CROWDED_RUNNERS, CROWDED_TEAMS, SMALL_SCALE } from './show-layout';
import { frameAt, liveBoard, prepareEvent } from './show-timeline';

/**
 * Crowded big fields (docs/design/valley-games.md, "Crowded big fields"): spread at display time,
 * never in the engine's beats, so the board and the results stay the engine's.
 */

const BIG_TEAMS = 16;
const BIG_SOLO = 24;

function prepared(id: string, players: number) {
  const result = sampleEvent(id, samplePlayers(players, 0), 'layout');
  return { result, p: prepareEvent(result) };
}

describe('small fields are laid out as the engine placed them', () => {
  it('draws no one smaller and moves no one', () => {
    for (const id of ['sauna-showdown', 'melon-run', 'pumpkin-push', 'crate-tower']) {
      const { result, p } = prepared(id, CROWDED_RUNNERS);
      expect(p.small).toBe(false);
      expect(actorHeight(p)).toBe(16);
      result.actors.forEach((a, i) => {
        expect(p.actors[i]?.pos[0]).toMatchObject({ x: a.x, y: a.y });
      });
    }
  });
});

describe('Sauna Showdown with a full field', () => {
  it('draws the sitters three quarters size on the same seats', () => {
    const { result, p } = prepared('sauna-showdown', BIG_SOLO);
    expect(p.small).toBe(true);
    expect(actorHeight(p)).toBe(Math.round(16 * SMALL_SCALE));
    result.actors.forEach((a, i) => {
      expect(p.actors[i]?.pos[0]).toMatchObject({ x: a.x, y: a.y });
    });
  });
});

describe('Melon Run with a full field', () => {
  it('spreads the runners over more rows, a row of three zig-zagging', () => {
    const { result, p } = prepared('melon-run', BIG_SOLO);
    expect(p.small).toBe(true);
    const start = p.actors.map((a) => a.pos[0]);
    const rows = new Set(start.map((k) => k?.y));
    expect(rows.size).toBe(BIG_SOLO / 3);
    // No two runners share a spot.
    expect(new Set(start.map((k) => `${String(k?.x)},${String(k?.y)}`)).size).toBe(BIG_SOLO);
    // The scene's ground stays the ground.
    for (const k of start) expect(k?.y).toBeGreaterThanOrEqual(46);
    for (const k of start) expect(k?.y).toBeLessThanOrEqual(100);
    expect(result.actors).toHaveLength(BIG_SOLO);
  });

  it('keeps the board and the finish the engine’s', () => {
    const { result, p } = prepared('melon-run', BIG_SOLO);
    const last = p.actors.map((a) => a.pos[a.pos.length - 1]);
    // A runner is back on its engine x once it has run far enough.
    last.forEach((k, a) => {
      const startX = result.actors[a]?.x ?? 0;
      if ((k?.rx ?? 0) - startX >= 160) expect(k?.x).toBe(k?.rx);
    });
    // The live metres are the engine's whatever the drawing: at the start nobody has run, so the
    // board is a tie, in actor order (a drawn spread would put the runners shifted right first).
    const rows = liveBoard(p, frameAt(p, 0));
    expect(rows.map((r) => r.text)).toEqual(rows.map(() => rows[0]?.text));
    expect(rows.map((r) => r.actor)).toEqual(rows.map((r) => r.actor).sort((x, y) => x - y));
  });
});

describe('Pumpkin Push with a full field', () => {
  it('starts the lanes further apart and moves each lane’s finish with it', () => {
    const { result, p } = prepared('pumpkin-push', BIG_TEAMS);
    expect(p.teams).toHaveLength(BIG_TEAMS);
    expect(p.small).toBe(true);
    // Each lane's finish is as far from its start as the engine made it.
    const engine = new Map<number, number>();
    for (const b of result.beats) {
      if (b.k === 'prop' && b.p.startsWith('finish:')) engine.set(Number(b.p.slice(7)), b.x);
    }
    const starts = new Map<number, number>();
    for (const b of result.beats) {
      if (b.k === 'prop' && b.p.startsWith('pumpkin:') && !starts.has(Number(b.p.slice(8)))) {
        starts.set(Number(b.p.slice(8)), b.x);
      }
    }
    for (const f of p.finishes) {
      const load = p.loads.find((l) => l.i === f.i)?.m.keys[0];
      expect(f.x - (load?.x ?? 0)).toBe((engine.get(f.i) ?? 0) - (starts.get(f.i) ?? 0));
    }
    // A crew of three stands further apart than the engine put it.
    for (const team of p.teams) {
      const span = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
      const shown = team.actors.map((a) => p.actors[a]?.pos[0]?.x ?? 0);
      const placed = team.actors.map((a) => result.actors[a]?.x ?? 0);
      expect(span(shown)).toBeGreaterThan(span(placed));
    }
  });
});

describe('Crate Tower with a full field', () => {
  it('stands the towers in three ranks, each a row further back and spreads each crew', () => {
    const { result, p } = prepared('crate-tower', BIG_TEAMS);
    expect(p.teams).toHaveLength(BIG_TEAMS);
    const towers = p.objects
      .map((o) => ({ i: o.i, x: o.m.keys[0]?.x ?? 0, y: o.m.keys[0]?.y ?? 0 }))
      .sort((a, b) => a.x - b.x);
    const base = Math.max(...towers.map((t) => t.y));
    towers.forEach((t, col) => {
      expect(t.y).toBe(base - (col % 3) * 9);
    });
    // Within a team, the three creatures are at least 5 px apart sideways.
    for (const team of p.teams) {
      const xs = team.actors.map((a) => p.actors[a]?.pos[0]?.x ?? 0).sort((a, b) => a - b);
      for (let k = 1; k < xs.length; k++) {
        expect((xs[k] ?? 0) - (xs[k - 1] ?? 0)).toBeGreaterThanOrEqual(5);
      }
    }
    // The engine's beats are untouched.
    expect(result.actors).toHaveLength(BIG_TEAMS * 3);
  });

  it('is not spread at the threshold', () => {
    const { p } = prepared('crate-tower', CROWDED_TEAMS);
    expect(p.small).toBe(false);
    expect(p.teamDy).toEqual([]);
  });
});

describe('the art notes', () => {
  it('tones the risers down', () => {
    const sat = (hex: string): number => {
      const n = Number.parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return Math.max(...c) - Math.min(...c);
    };
    for (const name of ['red', 'green', 'orange', 'spark', 'tide'] as const) {
      const muted = mutedRamp(name);
      expect(sat(muted[2])).toBeLessThan(sat(RAMPS[name][2]));
      expect(mutedRamp(name)).toBe(muted);
    }
  });

  it('draws the ice cracks dark enough to read on the snow', () => {
    const luma = (hex: string): number => {
      const n = Number.parseInt(hex.slice(1), 16);
      return 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
    };
    const crack = GAMES_PROP_DATA.crack[0];
    expect(luma(crack?.palette['n'] ?? '#fff')).toBeLessThan(luma(RAMPS.snow[2]) - 80);
  });
});
