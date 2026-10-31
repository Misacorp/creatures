/**
 * The Void place, concept art (not in the game): two 64x24 expedition banners in the format of
 * `data/banner-sprites.ts`. The working name is the Quiet Verge, the edge of the world where the
 * sky goes on under the ground. Drawn from the brief in `docs/compendium/places.md` ("Quiet Verge",
 * concept). No creature or person is in either banner; the explorer walks the calm bottom lane, left
 * to right. Keys: `k` ink, `a c d` the dusk sky from top to horizon, `h` lilac rim, `p` pale
 * rim light, `b` body, `s` shade, `n` the dark of a window (always edged by `h`/`p`),
 * `p` also a cool star, the path is `s` over `a`, `t` the one warm star, `g` the glint.
 */
import type { SpriteDef } from '../sprite-data';
import type { ConceptSet } from './index';

/** "Window open": the sky warms to plum and the stars burn warmer, as if the dark were looking back. */
const WINDOW_OPEN = {
  a: '#3a2352',
  c: '#4d2d62',
  d: '#7a4a86',
  s: '#6a4590',
  t: '#ffd37a',
  p: '#f0d8f0',
} as const;

const MAIN: SpriteDef = {
  palette: {
    k: '#0d0a1a',
    a: '#262050',
    c: '#352d68',
    d: '#5a4f9e',
    h: '#9d92dc',
    p: '#c5bdee',
    b: '#6f62b8',
    s: '#4a4090',
    n: '#100c22',
    t: '#fff1b8',
    g: '#9fe8ff',
  },
  rows: [
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaapaaaaaaaaaaaaaaaaaaaaapaaaaaaaaaaa',
    'aaapaaaaaaaaaapaaaaaaaaaaaaaaaaaaaaaaapaaahhhhhaaaaaaaaaaaaapaaa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaapaaaaaaaaaaaaahnnnnphaaaaaaaaaaaaaaaa',
    'acacacacatacacacacacacacacacacacacacacachnnnnnnphcacacacacacacpc',
    'ccccccccccccccccccccccccccccccccccccccchnnnnnnnnphcccdkkkkkkkkdc',
    'ccccccccccccccccccccpcccccccccccccccccchnpnnnnnnphccckdhhhhhhdkc',
    'cccccccccccccccccccccccccccphcccctccccnhnnnnnnnnphccckhhnnnnhhkc',
    'cccccccccccccccccpcccccccccsscccccccccchpnnnnnnnphccckhnnnnnnhkc',
    'dcdcdcpphhdcdcdcdcdcdcdcpcdcdcdckkkkkcdhnntnnnnnphdcdkhnpnngnhkc',
    'dddddddsssdddddddddddphdddddddddkphhkdddhnnnnnnphddddkhnnnnnnhkd',
    'ddddddddddddpddddddddssdddddddddkhbskddddhnnnnphdddddkhnnntnnhkd',
    'ddddddddddddddddddddddpddddkkkkdkhbskkkkkdhhhhhddddddkhnntttnhkd',
    'hhhhhhhhhddddhhhhhhhhhhddddkphkdkhbskphhkddddddddddhhkhnnntnnhkd',
    'ssssssssshhhhsssssssssshhddkhskkhbskkhbskhhhhhhhhhhsskhnnnnnnhkh',
    'ssssssssspppppppppppppppphhkhskkhbskskhbskppssssssphskhnnnnnphks',
    'sspppppppnnnpnnnnntnnnnnnppkhskkhbskpkhbskbbppppppssskhnpnnnnhkp',
    'ppbbbbpnnpnnnnnnnnntnpnnnnnpppbbbbbbbbbbbbbbbbbbbbbbpkhnnnnnnhkb',
    'bbbbbbbpnnnnnpnpnnnnnnngnnpbbbbbbbbbbbbbbbbbbbbbbbbbbkhnnnnnnhkb',
    'bbbbbbbbbppppppppppppppppbbbbbbbbbbbbbbbbbbbbbbbbbbbbkhnnnnnnhkb',
    'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
    'ssssbssssssssbssssssssbssssssssbssssssssbssssssssbssssssssbsssss',
    'ssssssbssssssssbssssssssbssssssssbssssssssbssssssssbssssssssbsss',
    'ccccccccsccccccccsccccccccsccccccccsccccccccsccccccccsccccccccsc',
    'csccccccccsccccccccsccccccccsccccccccsccccccccsccccccccscccccccc',
  ],
};

const DEEP: SpriteDef = {
  palette: {
    k: '#0d0a1a',
    a: '#262050',
    c: '#352d68',
    d: '#5a4f9e',
    h: '#9d92dc',
    p: '#c5bdee',
    b: '#6f62b8',
    s: '#4a4090',
    n: '#100c22',
    t: '#fff1b8',
    g: '#9fe8ff',
  },
  rows: [
    'aaaaaaaaaaaaaaaaapaaataaaaaaaaaapaaaaaaahaaaaaaaaaaaaaaadadadada',
    'aaaaaaaaaaaaaaaataagaaaapaaaaaaaaahhhhhhphhhhhhaaaadpdadadaddddd',
    'aaaaaataaaaaaaaaaaaaaaaaaaaaataahhpppppphpppppphhadadadpdddddddd',
    'aaaaaaaaaaaaaaaaaaphaaaaaaaaaphhpphhhhhhnhhhhhhpphhdddddddphhdad',
    'cacacacacacacacacasscacacacachhphhnnnnnnnnnnnnnhhphhddpddasssada',
    'cccccccccccccccccccccccccccchhphnnnnnpnnnnnpnnnnnhphhdcdcdcdcccc',
    'ccccphhcccccccccccccpcccccdchphnnnnnnnnntnnnnnnnnnhphcdccccccccc',
    'pcccsssccccccccccccccdcdcpcdhphnnpnnnnnctcnnnnpnnnhphccccccccccc',
    'ccccccccppccccccdcdcdcdcpddhphngnnnnnntttttnnnnnnnnhphcccccccccc',
    'cccccccccccdcdcdcdcdddddddddhphnnnnnnnnctcnnntnnpnhphccccccccccc',
    'acacacdcdcdcdcddddddpddddddchphnnnnpnnnntnnnnnnnnnhphcacacacacac',
    'adadadadadddddddddddddadadadhhphnnnnnnnnnnnnpnnnnhphhaaaaaaaaaaa',
    'dadaddddddphdddddadadadadaaaahhphhpnnnnnnpnnnnnhhphhaaaaaaaaaaaa',
    'ddddddddddssadadadadaaaaaaaaaahhpphhhhhhnhhhhhhpphhaaaaaphaaaaaa',
    'dddddddadapadadaatapaaaaaaaaphhahhpppppphpppppphhaaaaaaassaaaaaa',
    'ddpdadadadaaaaaaaaaaaaaaaaaasssaaahhhhhhphhhhhhaaaaaaaaaaaaaaaaa',
    'dadadacacacacacacacacacacacacacacacacacahacacacpcacacacpcacacaca',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'pppppppppccccccccccccppppppppccccccccccccppppppppccccccccccccccc',
    'hbbbbbbbsccpppppppccchbbbbbbscccppppppccchbbbbbbscccpppppppppppp',
    'hbbbbbbbscchbbbbbsccchbbbbbbsccchbbbbsccchbbbbbbsccchbbbbbbbbbbs',
    'ssssssssscchbbbbbscccssssssssccchbbbbscccssssssssccchbbbbbbbbbbs',
    'cscskscscccsssssssccccscskscccccssssssccccscskscccccssssssssssss',
    'ccccccccchscsckcscchsccccccccchscsckccchsccccccccchscscscskscscc',
  ],
};

export const VOID_PLACE_CONCEPTS: ConceptSet = {
  id: 'void-place',
  title: 'Void place, the Quiet Verge (banners)',
  element: 'void',
  requested: '2026-10-31: design a Void area that can be explored (banner and place).',
  status: 'liked',
  notes: [
    'Misa liked both banners on the art review page (2026-10-31).',
    'Place concept: docs/compendium/places.md, "Quiet Verge" (working name). Concept, not shipped.',
    'Needs before use: the Void element in the content (element chart, marks, creatures from void.ts with names, stats, lore, shiny palettes), an entry in destinations.json with these palette colours and the deeper area, an access rule, journal pages, push-on flavour and a glossary entry, then the compendium entry moved out of concept.',
    'To ship: move the banners into data/ (a void-banner-sprites.ts registered in BANNER_SPRITE_DATA under the destination id) and delete this set.',
    'Each banner uses 11 colours or fewer (the studio cap), where shipped banners use 12 to 14.',
  ],
  sprites: {
    'void-place-banner': {
      kind: 'banner',
      note: 'The Quiet Verge: a dusk plain of lilac dust, a still pool that holds the stars, leaning stones, a dark moon and a stone arch with one warm star at the far end.',
      sprite: MAIN,
      alts: { 'window open': WINDOW_OPEN },
    },
    'void-place-deep': {
      kind: 'banner',
      note: 'The far side: the ground ends, stepping stones cross the open sky, and a great ring hangs ahead with one warm star at its middle.',
      sprite: DEEP,
      alts: { 'window open': WINDOW_OPEN },
    },
  },
};
