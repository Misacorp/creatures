/**
 * The pixel banner (64x24, a wide strip) for the Mire destination, Sunken Fen, in the same format as
 * `banner-sprites.ts`. Drawn from its banner brief: a pale mist over a flat bog at dusk, pools of black
 * water with an oily sheen between banks of peat, ochre reeds, and old things the bog keeps (a half-sunk
 * cart wheel, a leaning signpost and, at the far right, a half-sunk stone arch with a lantern under it).
 * No creature or person is in it; the explorer walks across the calm peat bank at the bottom, left to
 * right. The four brief colours are Peat brown `#5b4630`, Tar black `#1f1a26`, Ochre reed `#c49a3c` and
 * Fen mist `#b9b49a`.
 *
 * Not yet in `BANNER_SPRITE_DATA`: the banner test requires a banner for exactly the destinations that
 * exist, so the Mire content slice adds it when `destinations.json` gets `sunken-fen`.
 */
import type { SpriteDef } from '../sprite-data';

export const MIRE_BANNER_SPRITE_DATA: Readonly<Record<string, SpriteDef>> = {
  'sunken-fen': {
    palette: {
      k: '#1f1a26',
      p: '#5b4630',
      o: '#c49a3c',
      m: '#b9b49a',
      a: '#7d7a80',
      b: '#9c978a',
      w: '#2c2a33',
      n: '#4d9c8f',
      v: '#7a5aa6',
      g: '#6f7442',
      d: '#3d2f22',
      r: '#7a4a26',
      f: '#8a8678',
      x: '#8a6a44',
    },
    rows: [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'bbbbbbbbaaaaaaaaaaaaaaaabbbbbbbbbbbbbbaaaaaaaaaaaaaaaaabbbbbbbbb',
      'bbbgggbbbbbbbbbbbgggbbbbbbbbbbbbbbbbbgggbbbbaaaaaaaabbbbbgggbbbb',
      'mggdddggmbgggbmggdddggmbmbmbgggbmbmggdddggmbmbgggbmbmbmggdddggmb',
      'mddrddddgrdddggdddddddmmmmggdddrgmmdrdddddmmggdddggmmmmdddddddmm',
      'mddrdrdddrddddddddddddmmmmdddddrdrmdrdddddmmddrddddmmkggkkkkkgkm',
      'mmmomrmmgomrmmmmmmmmgmmmmgmmmmgomrggomrgmxgmgmrmmgmmkffffffffffk',
      'mmwowommmomrmwmwwmwmmmmmmmmwmwmomommomrmwxxxxxommmmmkffffffffffk',
      'wwwowowwwowownwwwwwwwwwwxxxwwwnowowwowowwxxpxpxwwwwwkffkmkkmkffk',
      'vvwowowowowowwnnwwwwvwwxxxxxwwwowoowowovvxwwwwowwwwwkffkmoomkffk',
      'wppopopppopoppwwwwwwwwxpwpwpxppopoppopoppwxwwwowwnwwkffkmoomkffk',
      'ppppppppppppppppwwwwoxxppoppxxppppppppppppxwnwvowwwwkffkmmmmkffk',
      'wpppppppppppppwppppppxxpppwwxxpppppppppppwxpppppppppkfwkwwpwwfwk',
      'nwwwwwwpwwwwvwwwwvwwpwvwwwnwwwwnwwpwnwwwwwwwwwwpvwwwkfwwwwvwwffk',
      'dpppppdpdddddpdpppppdpddpdpppppdpdddddpdpppppdpddddpppppppdddddd',
      'pppppdpppdppppppppppppdppppppppppppdpppdppppppppppppdppppppppppp',
      'ppppppoppppppdppppppppppppppppppdopppppppppppppppppddppppppppppp',
      'pppppppppppppppppppoppppppppdppdppdppdppdppdppdppopppppppppppppp',
      'pppppppppppppppdpppppppdpppppppdpppppppdpppppppdpppppppdpppppppd',
      'ddpddpddpdpddpddpddpdpddpddpddpdpddpddpddpdpddpddpddpdpddpddpddp',
      'ddpddpppddppdddppddpdpddpddddpdddpddddpddpdpddppdddppddpppddpddd',
      'dppdpdddddpdppppddddddddpdppppdddddddppppdpddddddddppppdpdddddpd',
    ],
  },
};
