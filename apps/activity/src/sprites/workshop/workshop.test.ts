import { describe, expect, it } from 'vitest';
import { housing } from '@creatures/game/housing-content';
import { spriteSize, validateSprite } from '../sprite-data';
import { pieceHash, pixelDiff } from './compare';
import { FORMS } from './forms/index';
import { generatePiece, makePiece, pieceId, setPack, setReport, type SetSource } from './pack';
import { PLAIN_PINE } from './sample/plain-pine';
import { SAMPLE_STYLES, SHIPPED_SETS, lockOf } from './sets';
import SHIPPED_LOCK from './shipped-art.json';
import ART_DIGEST from './art-digest.json';
import { artDigest, HAND_PACKS } from './art-lock';
import { SET_FORMS, type Style, styleProblems } from './style';

const STYLES: Style[] = [
  ...Object.values(SAMPLE_STYLES),
  ...Object.values(SHIPPED_SETS).map((s) => s.style),
];

describe('forms', () => {
  it('has one form per set form, at the box of forms.json', () => {
    expect(Object.keys(FORMS).sort()).toEqual([...SET_FORMS].sort());
    for (const form of SET_FORMS) {
      const content = housing.forms.find((f) => f.id === form);
      expect(content?.box, form).toEqual(FORMS[form].box);
    }
  });

  it('draws every form from every style at exactly its box, with layers that parse and fit', () => {
    for (const style of STYLES) {
      for (const form of SET_FORMS) {
        const art = generatePiece(form, style);
        const where = `${style.id}-${form}`;
        validateSprite(art.sprite, { width: FORMS[form].box.w, height: FORMS[form].box.h });
        if (art.front !== undefined) validateSprite(art.front, spriteSize(art.sprite));
        if (art.glow !== undefined) {
          validateSprite(art.glow);
          expect(spriteSize(art.glow).width, where).toBe(spriteSize(art.sprite).width);
        }
        for (const def of [art.sprite, art.front, art.glow]) {
          for (const [key, colour] of Object.entries(def?.palette ?? {})) {
            expect(style.palette[key], `${where} ${key}`).toBe(colour);
          }
        }
      }
    }
  });

  it('gives the bed a front and a sleep anchor that fits a 16x16 sleeper, and the lamp a glow', () => {
    for (const style of STYLES) {
      const bed = generatePiece('bed', style);
      expect(bed.front).toBeDefined();
      expect((bed.sleep?.x ?? 99) + 16).toBeLessThanOrEqual(48);
      expect((bed.sleep?.y ?? 99) + 16).toBeLessThanOrEqual(26);
      expect(generatePiece('lamp', style).glow).toBeDefined();
    }
  });

  it('is deterministic', () => {
    for (const form of SET_FORMS) {
      expect(generatePiece(form, PLAIN_PINE)).toEqual(generatePiece(form, PLAIN_PINE));
    }
  });

  it('lets a style replace each named part of each form', () => {
    for (const form of SET_FORMS) {
      for (const name of FORMS[form].parts) {
        let called = 0;
        const style: Style = {
          ...PLAIN_PINE,
          parts: {
            [form]: {
              [name]: () => {
                called++;
              },
            },
          },
        };
        generatePiece(form, style);
        expect(called, `${form}.${name}`).toBe(1);
      }
    }
  });
});

describe('styles', () => {
  it('are sound: the ink, the colours and every ramp key in the palette', () => {
    for (const style of STYLES) expect(styleProblems(style), style.id).toEqual([]);
  });

  it('name the problems of a broken style, and setPack refuses it', () => {
    const broken: Style = { ...PLAIN_PINE, wood: { light: 'Z', mid: 'b', dark: 'c' }, shelf: [] };
    expect(styleProblems(broken)).toEqual([
      'wood uses "Z", not in the palette',
      'the shelf needs at least one thing',
    ]);
    expect(() => setPack({ style: broken })).toThrow(/Z/);
  });
});

describe('overrides', () => {
  const hand = {
    pieces: {
      'plain-pine-stool': { sprite: { rows: ['kk'], palette: { k: '#0d0a1a' } } },
      'plain-pine-lamp': {
        sprite: { rows: ['k'], palette: { k: '#0d0a1a' } },
        glow: { rows: ['y'], palette: { y: '#fff2b8' } },
      },
    },
    skins: { 'plain-pine-wall': { tile: { rows: ['a'], palette: { a: '#e8c48a' } } } },
  };

  it('generates a form with no override and keeps hand art, layers, given art or a post step when told', () => {
    const source: SetSource = {
      style: PLAIN_PINE,
      hand,
      pieces: {
        stool: { use: 'hand', why: 'test' },
        lamp: { use: 'layers', layers: ['sprite'], why: 'test' },
        rug: {
          use: 'art',
          art: { sprite: { rows: ['k'], palette: { k: '#0d0a1a' } } },
          why: 'test',
        },
        frame: {
          use: 'post',
          post: (art) => ({ ...art, sprite: { ...art.sprite, rows: art.sprite.rows.slice(0, 2) } }),
          why: 'test',
        },
      },
    };
    expect(makePiece(source, 'table')).toEqual(generatePiece('table', PLAIN_PINE));
    expect(makePiece(source, 'stool')).toBe(hand.pieces['plain-pine-stool']);
    const lamp = makePiece(source, 'lamp');
    expect(lamp.sprite).toBe(hand.pieces['plain-pine-lamp'].sprite);
    expect(lamp.glow).toEqual(generatePiece('lamp', PLAIN_PINE).glow);
    expect(makePiece(source, 'rug').sprite.rows).toEqual(['k']);
    expect(makePiece(source, 'frame').sprite.rows).toHaveLength(2);
    expect(setReport(source).map((r) => r.made)).toEqual([
      'generated',
      'generated',
      'generated',
      'generated',
      'hand',
      'layers',
      'art',
      'post',
      'generated',
    ]);
    const pack = setPack(source);
    expect(Object.keys(pack.pieces ?? {}).sort()).toEqual(
      SET_FORMS.map((f) => pieceId(PLAIN_PINE, f)).sort(),
    );
    expect(pack.skins).toBe(hand.skins);
  });

  it('fails loudly when an override asks for hand art that is not there', () => {
    expect(() =>
      makePiece({ style: PLAIN_PINE, pieces: { bed: { use: 'hand', why: 'test' } } }, 'bed'),
    ).toThrow(/plain-pine-bed/);
  });
});

describe('the shipped sets', () => {
  it('are the eight sets of the content, each with its nine pieces', () => {
    const contentSets = housing.sets.filter((s) => s.id !== 'cosy').map((s) => s.id);
    expect(Object.keys(SHIPPED_SETS).sort()).toEqual(contentSets.sort());
    for (const [id, source] of Object.entries(SHIPPED_SETS)) {
      expect(source.style.id).toBe(id);
      const pack = setPack(source);
      for (const form of SET_FORMS)
        expect(pack.pieces?.[`${id}-${form}`], `${id}-${form}`).toBeDefined();
    }
  });

  it('give a reason for every override', () => {
    for (const source of Object.values(SHIPPED_SETS)) {
      for (const row of setReport(source)) {
        if (row.made !== 'generated')
          expect(row.why.length, `${source.style.id}-${row.form}`).toBeGreaterThan(10);
      }
    }
  });

  it('keep the hand pixels where a layer is generated: those layers match the first pass exactly', () => {
    for (const source of Object.values(SHIPPED_SETS)) {
      for (const form of SET_FORMS) {
        const o = source.pieces?.[form];
        if (o?.use !== 'layers') continue;
        const first = source.hand?.pieces?.[pieceId(source.style, form)];
        const made = makePiece(source, form);
        for (const layer of ['sprite', 'front', 'glow'] as const) {
          const a = first?.[layer];
          const b = made[layer];
          if (a === undefined || b === undefined) {
            expect(a, `${form} ${layer}`).toBe(b);
            continue;
          }
          expect(pixelDiff(a, b).differ, `${source.style.id}-${form} ${layer}`).toBe(0);
        }
      }
    }
  });

  it('ship what shipped-art.json locks (run `pnpm housing compare`, then `pnpm housing lock`, after a deliberate change)', () => {
    expect(lockOf()).toEqual(SHIPPED_LOCK);
  });

  it('ship every other house picture as art-digest.json locks: hand packs, postcard, generated interior tiles (look, then `pnpm housing lock`)', () => {
    expect(artDigest()).toEqual(ART_DIGEST);
  });

  it('lock every pack the game loads: each file of sprites/data/house with art is a set or a hand pack', () => {
    const files = import.meta.glob<{ HOUSE_ART?: unknown }>(
      ['../data/house/*.ts', '!../data/house/*.test.ts'],
      { eager: true },
    );
    const named = new Set([...Object.keys(SHIPPED_SETS), ...Object.keys(HAND_PACKS)]);
    const missing = Object.entries(files)
      .filter(([, m]) => m.HOUSE_ART !== undefined)
      .map(([f]) => f.replace('../data/house/', '').replace(/\.ts$/, ''))
      .filter((name) => !named.has(name));
    expect(missing, 'add the pack to HAND_PACKS in workshop/art-lock.ts').toEqual([]);
  });

  it('lock a light: the same pixels with another light flag hash apart', () => {
    const sprite = { rows: ['ab'], palette: { a: '#111111', b: '#222222' } };
    expect(pieceHash({ sprite })).not.toBe(pieceHash({ sprite, light: 'lamp' }));
    expect(pieceHash({ sprite, light: { kind: 'lamp', at: { x: 1, y: 0 } } })).not.toBe(
      pieceHash({ sprite, light: { kind: 'lamp', at: { x: 0, y: 0 } } }),
    );
  });

  it('hash a piece by its colours, not its key names', () => {
    const a = { sprite: { rows: ['ab'], palette: { a: '#111111', b: '#222222' } } };
    const b = { sprite: { rows: ['xy'], palette: { x: '#111111', y: '#222222' } } };
    expect(pieceHash(a)).toBe(pieceHash(b));
    expect(pieceHash(a)).not.toBe(
      pieceHash({ sprite: { rows: ['ba'], palette: a.sprite.palette } }),
    );
  });
});
