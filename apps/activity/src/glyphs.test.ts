import { content, type BossDef } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_GLYPHS,
  CHAIN_GLYPH,
  GIMMICK_GLYPH_OPS,
  GLYPH_SIZE,
  TURN_ORDER_GLYPHS,
  gimmickGlyph,
  glyph,
  turnOrderGlyph,
} from './glyphs';
import { expandRows, validateSprite } from './sprites/sprite-data';

type GimmickOp = BossDef['gimmicks'][number]['op'];

/** Compile-time check: a new gimmick op in the content schema makes this fail to type-check. */
const ALL_OPS: Record<GimmickOp, true> = {
  hit_zone: true,
  silence_ends: true,
  reflect_first_reaction: true,
  strike_highest_atk: true,
  sweep: true,
  barrage: true,
  slam: true,
  lance: true,
  pincer: true,
  charge: true,
};

describe('glyph data', () => {
  it('is a well-formed 8x8 sprite for every glyph', () => {
    for (const [id, def] of Object.entries(BUNDLED_GLYPHS)) {
      expect(() => {
        validateSprite(def, GLYPH_SIZE);
      }, id).not.toThrow();
    }
  });

  it('draws something in every glyph', () => {
    for (const [id, def] of Object.entries(BUNDLED_GLYPHS)) {
      const filled = expandRows(def).join('').replaceAll('.', '');
      expect(filled.length, id).toBeGreaterThan(8);
    }
  });

  it('gives every glyph its own shape', () => {
    const shapes = Object.entries(BUNDLED_GLYPHS).map(
      ([id, def]) => [id, expandRows(def).join('/')] as const,
    );
    for (const [id, shape] of shapes) {
      const same = shapes.filter(([, other]) => other === shape).map(([other]) => other);
      expect(same, id).toEqual([id]);
    }
  });
});

describe('gimmick glyphs', () => {
  it('lists every gimmick op of the content schema, and no other', () => {
    expect([...GIMMICK_GLYPH_OPS].sort()).toEqual(Object.keys(ALL_OPS).sort());
  });

  it('has a glyph for every gimmick of every boss', () => {
    for (const boss of content.bosses) {
      for (const g of boss.gimmicks) {
        expect(glyph(g.op), `${boss.id}/${g.id}`).toBeDefined();
        expect(gimmickGlyph(g.op)).toBe(glyph(g.op));
      }
    }
  });

  it('draws a strike that chains as its own bolt', () => {
    expect(glyph(CHAIN_GLYPH)).toBeDefined();
    expect(glyph(CHAIN_GLYPH)).not.toBe(glyph('strike_highest_atk'));
  });

  it('falls back to a plain glyph for an op it does not know', () => {
    expect(glyph('time_warp')).toBeUndefined();
    expect(gimmickGlyph('time_warp')).toBe(glyph('unknown'));
  });
});

describe('turn order glyphs', () => {
  it('has a glyph for every turn order in the content', () => {
    for (const boss of content.bosses) {
      expect(glyph(boss.turnOrder), boss.id).toBeDefined();
    }
    for (const order of TURN_ORDER_GLYPHS) {
      expect(turnOrderGlyph(order)).toBe(glyph(order));
    }
  });

  it('shows left to right and right to left as mirror images', () => {
    const ltr = expandRows(turnOrderGlyph('left_to_right'));
    const rtl = expandRows(turnOrderGlyph('right_to_left'));
    expect(rtl).toEqual(ltr.map((row) => [...row].reverse().join('')));
  });

  it('falls back to the plain glyph for an unknown order', () => {
    expect(turnOrderGlyph('sideways')).toBe(glyph('unknown'));
  });
});
