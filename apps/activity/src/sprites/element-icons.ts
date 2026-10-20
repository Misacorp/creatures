/** 8x8 pixel icons for the five elements. Each shape is different, so colour is never the only cue. */
import type { SpriteDef } from './sprite-data';

export const ICON_SIZE = { width: 8, height: 8 } as const;

const tide: SpriteDef = {
  palette: { k: '#0d0a1a', c: '#7fc4f5', w: '#e6f6ff', b: '#4f8fe6' },
  rows: [
    '...kk...',
    '..kcck..',
    '..kcck..',
    '.kcwcck.',
    'kcwcccbk',
    'kccccbbk',
    '.kbbbbk.',
    '..kkkk..',
  ],
};

const ember: SpriteDef = {
  palette: { k: '#0d0a1a', o: '#ffa83a', y: '#ffe680', r: '#ef6a3a' },
  rows: [
    '...k....',
    '..kok..k',
    '.kooyk.k',
    '.kooyokk',
    'kooyyork',
    'koyyyrrk',
    '.krrrrk.',
    '..kkkk..',
  ],
};

const grove: SpriteDef = {
  palette: { k: '#0d0a1a', g: '#5cbf5a', l: '#a6e36c', m: '#2f7a3a' },
  rows: [
    '......kk',
    '....kkgk',
    '..kkgllk',
    '.kgglglk',
    '.kggmglk',
    'kkgmggk.',
    'k.kmkk..',
    '..k.....',
  ],
};

const spark: SpriteDef = {
  palette: { k: '#0d0a1a', y: '#f2d43d', h: '#fff6b0' },
  rows: [
    '....kkk.',
    '...khyk.',
    '..khyk..',
    '.khyyyk.',
    '.kkkyyk.',
    '...kyk..',
    '..kyk...',
    '..kk....',
  ],
};

/** A mud mound with a bog bubble rising from it: patience, in peat and ochre. */
const mire: SpriteDef = {
  palette: { k: '#0d0a1a', o: '#b8864a', h: '#e0b878', d: '#6b4a2e' },
  rows: [
    '...kk...',
    '..k..k..',
    '..k.hk..',
    '.kkkkkk.',
    'khhooook',
    'kooooodk',
    'kdoodddk',
    '.kkkkkk.',
  ],
};

const ICONS: Readonly<Record<string, SpriteDef>> = { tide, ember, grove, spark, mire };

/** The icon for an element id, or undefined for an element without one. */
export function elementIcon(elementId: string): SpriteDef | undefined {
  return Object.hasOwn(ICONS, elementId) ? ICONS[elementId] : undefined;
}

export const BUNDLED_ELEMENT_ICONS = ICONS;
