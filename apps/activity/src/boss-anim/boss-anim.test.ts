import { describe, expect, it } from 'vitest';
import type { FightEvent } from '@creatures/engine/v2';
import { validateSprite } from '../sprites/sprite-data';
import * as assets from './assets';
import { frameAt, shakeAt, type Geometry } from './frame';
import { BOSS_LOOKS, resolveLook } from './looks';
import { FORM_OF, SHAPES, bossAimOf, planOf, type Shape } from './plan';
import { parseCells, sampleCells } from './sample-cells';
import { BOSS_MOVE_MS, PHASES, leadMs, phaseAt, phaseShot, phaseSpans } from './timeline';

const GRID = { rows: 3, cols: 4 };
const geom: Geometry = {
  layer: { w: 400, h: 600 },
  hand: { x: 250, y: 120 },
  grid: GRID,
  cell: (c) => ({ x: 40 + c.col * 80, y: 300 + c.row * 90, w: 76, h: 86 }),
};

describe('timeline', () => {
  it('tiles the move with no gap and lands the beat at the impact', () => {
    for (const total of [300, 1700, 2551]) {
      const spans = phaseSpans(total);
      expect(spans.map((s) => s.id)).toEqual(PHASES.map((p) => p.id));
      expect(spans[0]?.start).toBe(0);
      expect(spans[spans.length - 1]?.end).toBe(total);
      spans.forEach((s, k) => {
        if (k > 0) expect(s.start).toBe(spans[k - 1]?.end);
      });
      expect(leadMs(total)).toBe(spans.find((s) => s.id === 'impact')?.start);
    }
  });
  it('finds the phase of a time, clamping past the end', () => {
    expect(phaseAt(1000, 0).id).toBe('windup');
    expect(phaseAt(1000, 999).id).toBe('impact');
    expect(phaseAt(1000, 5000)).toEqual({ id: 'impact', u: 1 });
    for (const p of PHASES)
      expect(phaseAt(BOSS_MOVE_MS, phaseShot(BOSS_MOVE_MS, p.id)).id).toBe(p.id);
  });
  it('keeps a move between one and two seconds', () => {
    expect(BOSS_MOVE_MS).toBeGreaterThanOrEqual(1200);
    expect(BOSS_MOVE_MS).toBeLessThanOrEqual(2000);
  });
});

describe('plans', () => {
  it('has a motion for every shape', () => {
    for (const shape of SHAPES) {
      const plan = planOf({ moveId: 'x', shape, cells: sampleCells(shape, GRID) }, GRID);
      expect(plan.form).toBe(FORM_OF[shape]);
      expect(plan.strikes.length).toBeGreaterThan(0);
      expect(plan.marks.length).toBeGreaterThan(0);
    }
  });
  it('sends a column strike down each column hit and marks the whole column', () => {
    const plan = planOf(
      {
        moveId: 'x',
        shape: 'columns',
        cells: [
          { row: 1, col: 1 },
          { row: 0, col: 2 },
        ],
      },
      GRID,
    );
    expect(plan.strikes).toEqual([
      { kind: 'column', col: 1 },
      { kind: 'column', col: 2 },
    ]);
    expect(plan.marks).toHaveLength(6);
    expect(plan.pointers).toEqual([
      { row: 0, col: 1, dir: 'down' },
      { row: 0, col: 2, dir: 'down' },
    ]);
  });
  it('caps the weapons that fly but still bursts on every creature', () => {
    const cells = sampleCells('checker', GRID);
    const plan = planOf({ moveId: 'x', shape: 'checker', cells }, GRID);
    expect(plan.strikes.length).toBeLessThanOrEqual(4);
    expect(plan.impacts).toHaveLength(cells.length);
  });
  it('reads a boss beat: the move id and the creatures it hit', () => {
    const events: FightEvent[] = [
      { round: 1, turn: 0, kind: 'move', text: 'Lightning Bolt' },
      { round: 1, turn: 0, kind: 'target', text: 'A (row 1, slot 2) <- lightning-bolt' },
      {
        round: 1,
        turn: 0,
        kind: 'hit',
        text: '',
        board: {
          type: 'hit',
          from: null,
          to: 'a',
          damage: 5,
          crit: false,
          blocked: false,
          dodged: false,
        },
      },
      { round: 1, turn: 0, kind: 'target', text: 'B (row 1, slot 1) <- plain' },
      {
        round: 1,
        turn: 0,
        kind: 'hit',
        text: '',
        board: {
          type: 'hit',
          from: null,
          to: 'b',
          damage: 5,
          crit: false,
          blocked: false,
          dodged: false,
        },
      },
    ];
    const aim = bossAimOf(
      events,
      { from: 0, to: events.length, kind: 'boss' },
      {
        moves: [{ id: 'lightning-bolt', name: 'Lightning Bolt', shape: 'columns' }],
        plainShape: 'single',
        creatures: [
          { key: 'a', row: 0, col: 1 },
          { key: 'b', row: 0, col: 0 },
        ],
      },
    );
    expect(aim).toEqual({
      moveId: 'lightning-bolt',
      shape: 'columns',
      cells: [{ row: 0, col: 1 }],
    });
    expect(
      bossAimOf(
        events,
        { from: 0, to: 1, kind: 'boss' },
        { moves: [], plainShape: 'single', creatures: [] },
      ),
    ).toBeNull();
    expect(
      bossAimOf(
        events,
        { from: 0, to: 5, kind: 'creature' },
        { moves: [], plainShape: 'single', creatures: [] },
      ),
    ).toBeNull();
  });
  it('parses cells from the workbench and refuses bad ones', () => {
    expect(parseCells('0:1 2:3', GRID)).toEqual([
      { row: 0, col: 1 },
      { row: 2, col: 3 },
    ]);
    expect(parseCells('auto', GRID)).toBeNull();
    expect(parseCells('3:0', GRID)).toBeNull();
  });
});

describe('frames', () => {
  const plan = planOf(
    { moveId: 'lightning-bolt', shape: 'columns', cells: [{ row: 1, col: 1 }] },
    GRID,
  );
  const look = resolveLook('storm-sovereign', 'spark', {
    id: 'lightning-bolt',
    shape: 'columns',
    form: 'spear',
  });
  const kinds = (t: number): string[] =>
    frameAt(plan, look, geom, BOSS_MOVE_MS, t).map((i) => i.kind);
  it('shows the weapon at the hand, then the markers, then the strike, then the burst', () => {
    expect(kinds(phaseShot(BOSS_MOVE_MS, 'windup'))).toEqual(['sprite']);
    expect(kinds(phaseShot(BOSS_MOVE_MS, 'aim'))).toContain('pointer');
    expect(kinds(phaseShot(BOSS_MOVE_MS, 'aim'))).toContain('cell');
    const strike = frameAt(plan, look, geom, BOSS_MOVE_MS, phaseShot(BOSS_MOVE_MS, 'strike'));
    const weapon = strike.find((i) => i.kind === 'sprite');
    expect(weapon).toMatchObject({ rot: 180 });
    const impact = frameAt(plan, look, geom, BOSS_MOVE_MS, phaseShot(BOSS_MOVE_MS, 'impact'));
    expect(impact.some((i) => i.kind === 'sprite' && i.key.startsWith('spark'))).toBe(true);
    expect(impact.some((i) => i.kind === 'pointer')).toBe(false);
  });
  it('sends the thrown weapon off the top of the stage', () => {
    const end = frameAt(
      plan,
      look,
      geom,
      BOSS_MOVE_MS,
      phaseSpans(BOSS_MOVE_MS).find((s) => s.id === 'throw')!.end - 1,
    );
    const weapon = end.find((i) => i.kind === 'sprite');
    expect(weapon !== undefined && weapon.kind === 'sprite' && weapon.y < 0).toBe(true);
  });
  it('leaves a trail behind the falling weapon and flashes the hit cells as it lands', () => {
    const strike = frameAt(plan, look, geom, BOSS_MOVE_MS, phaseShot(BOSS_MOVE_MS, 'strike'));
    expect(
      strike.filter((i) => i.kind === 'sprite' && i.key.startsWith('trail')).length,
    ).toBeGreaterThan(0);
    const spans = phaseSpans(BOSS_MOVE_MS);
    const landing = (spans.find((s) => s.id === 'impact')?.start ?? 0) + 5;
    const flash = frameAt(plan, look, geom, BOSS_MOVE_MS, landing);
    expect(flash.some((i) => i.kind === 'cell' && i.tone === 'flash')).toBe(true);
    const later = frameAt(plan, look, geom, BOSS_MOVE_MS, BOSS_MOVE_MS - 5);
    expect(later.some((i) => i.kind === 'cell' && i.tone === 'flash')).toBe(false);
  });
  it('points down at a column from above and at a row from the left', () => {
    const aim = phaseShot(BOSS_MOVE_MS, 'aim');
    const down = frameAt(plan, look, geom, BOSS_MOVE_MS, aim).find((i) => i.kind === 'pointer');
    expect(down).toMatchObject({ dir: 'down' });
    expect(down !== undefined && down.kind === 'pointer' && down.y < 300).toBe(true);
    const rowPlan = planOf({ moveId: 'x', shape: 'row', cells: sampleCells('row', GRID) }, GRID);
    const side = frameAt(rowPlan, look, geom, BOSS_MOVE_MS, aim).find((i) => i.kind === 'pointer');
    expect(
      side !== undefined && side.kind === 'pointer' && side.dir === 'side' && side.x < 40,
    ).toBe(true);
  });
  it('shakes the board only for a heavy move, as it lands', () => {
    const impact = phaseShot(BOSS_MOVE_MS, 'impact') - 120;
    const heavy = resolveLook('storm-sovereign', 'spark', {
      id: 'judgement-bolt',
      shape: 'single',
      form: 'orb',
    });
    const single = planOf(
      { moveId: 'judgement-bolt', shape: 'single', cells: [{ row: 0, col: 0 }] },
      GRID,
    );
    const moved = Array.from({ length: 20 }, (_, k) =>
      shakeAt(single, heavy, BOSS_MOVE_MS, impact + k * 5),
    );
    expect(moved.some((s) => s.x !== 0 || s.y !== 0)).toBe(true);
    expect(shakeAt(single, look, BOSS_MOVE_MS, impact)).toEqual({ x: 0, y: 0 });
    expect(shakeAt(single, heavy, BOSS_MOVE_MS, phaseShot(BOSS_MOVE_MS, 'aim'))).toEqual({
      x: 0,
      y: 0,
    });
  });
  it('draws nothing outside the move', () => {
    expect(frameAt(plan, look, geom, BOSS_MOVE_MS, -1)).toEqual([]);
    expect(frameAt(plan, look, geom, BOSS_MOVE_MS, BOSS_MOVE_MS + 1)).toEqual([]);
  });
  it('plays every shape at every phase without a missing cell breaking it', () => {
    for (const shape of SHAPES as readonly Shape[]) {
      const p = planOf({ moveId: 'x', shape, cells: sampleCells(shape, GRID) }, GRID);
      const l = resolveLook(null, 'tide', { id: 'x', shape, form: FORM_OF[shape] });
      for (let t = 0; t <= BOSS_MOVE_MS; t += 50) {
        for (const item of frameAt(p, l, geom, BOSS_MOVE_MS, t)) {
          if (item.kind === 'sprite') {
            expect(Number.isFinite(item.x) && Number.isFinite(item.y)).toBe(true);
          }
        }
      }
    }
  });
});

describe('looks', () => {
  it('falls back from the move, to the shape, to the generic art', () => {
    const generic = resolveLook(null, 'tide', { id: 'x', shape: 'columns', form: 'spear' });
    const shaped = resolveLook('storm-sovereign', 'spark', {
      id: 'x',
      shape: 'columns',
      form: 'spear',
    });
    const moved = resolveLook('storm-sovereign', 'spark', {
      id: 'judgement-bolt',
      shape: 'single',
      form: 'orb',
    });
    expect(shaped.weapon.sprite).toBe(assets.STORM_SPEAR);
    expect(generic.weapon.sprite).not.toBe(assets.STORM_SPEAR);
    expect(moved.weapon.sprite).toBe(assets.STORM_BOLT);
    expect(moved.weapon.scale).toBeGreaterThan(5);
    // The generic art takes the element's colour.
    expect(generic.weapon.sprite.palette['a']).toBe('#4f8fe6');
  });
  it('gives the Tidal Colossus a trident, waves and drops', () => {
    const at = (id: string, shape: Shape) =>
      resolveLook('tidal-colossus', 'tide', { id, shape, form: FORM_OF[shape] });
    expect(at('deepwater-spear', 'columns').weapon.sprite).toBe(assets.TIDE_TRIDENT);
    expect(at('riptide', 'columns').weapon.sprite).toBe(assets.TIDE_TRIDENT);
    expect(at('undertow', 'row').weapon.sprite).toBe(assets.TIDE_WAVE);
    expect(at('backflow', 'rows').weapon.sprite).toBe(assets.TIDE_WAVE);
    expect(at('spray', 'scatter').weapon.sprite).toBe(assets.TIDE_DROPS);
    const great = at('great-wave', 'randomRow');
    expect(great.heavy).toBe(true);
    expect(great.weapon.scale).toBeGreaterThan(at('rogue-wave', 'row').weapon.scale);
    expect(at('plain', 'row').impact.sprite).toBe(assets.TIDE_SPLASH);
  });
  it('draws every asset as a valid sprite', () => {
    const all = Object.values(assets).filter((v) => typeof v === 'object' && 'rows' in v);
    expect(all.length).toBeGreaterThanOrEqual(15);
    for (const sprite of all) expect(() => validateSprite(sprite)).not.toThrow();
    for (const look of Object.values(BOSS_LOOKS))
      for (const entry of [
        ...Object.values(look.shapes ?? {}),
        ...Object.values(look.moves ?? {}),
      ]) {
        if (entry.weapon !== undefined)
          expect(() => validateSprite(entry.weapon!.sprite)).not.toThrow();
      }
  });
});
