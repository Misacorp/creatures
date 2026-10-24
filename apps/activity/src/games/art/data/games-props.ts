/**
 * Hand-drawn props for the Valley Games, each at most 64x64. Same format as every sprite: rows of
 * characters plus a palette, `.` transparent, `k` the ink outline shared with the creatures and the
 * living room. Tintable parts use the ramp keys of `../tint.ts` (`a b c d` primary, `e f g h`
 * secondary); the palettes here are the defaults. Light comes from the top left. Props that animate
 * have several frames of the same size. Props drawn by code (the melon, the podium blocks, the boards)
 * are in `../drawn.ts`.
 */
import type { SpriteDef } from '../../../sprites/sprite-data';
import { RAMPS } from '../tint';
import { rampPalette, usedPalette } from './games-tiles';

const INK = '#0d0a1a';
const WHITE = '#ffffff';

function sprite(rows: readonly string[], palette: Readonly<Record<string, string>>): SpriteDef {
  return { rows, palette: usedPalette(rows, palette) };
}

const STONES = { s: '#d4cce6', t: '#9a90b8', u: '#5f5584' };
const FIRE = { y: '#fff2a8', o: '#ffb23a', r: '#ef6a3a', q: '#a83a24' };
const STEAM = { w: WHITE, v: '#e6e2f4', u: '#bdb6da' };
const SHARK = { p: '#93a4c4', q: '#5f6f96', r: '#c8d4ea', m: '#d23a4e', w: WHITE };
const WATER_FX = { w: WHITE, x: '#b0ecff', y: '#6cd0f4', n: '#2a74bc' };

/** The sauna stove: a heap of stones in an iron basket on a stove with a glowing door. */
const stoveRows = [
  '..........kkk..kkk........',
  '........kkstskkssukk......',
  '.......kssttsuksstuuk.....',
  '.....kkkstuukkkkuukkkk....',
  '....kssskukkssstkkksstk...',
  '...ksstuukkssttuukssttuk..',
  '...ksttuukstttuuuksttuuk..',
  '..kkkuukkkktuuukkkkuukkkk.',
  '..kaaaaaaaaaaaaaaaaaaaabk.',
  '..kbcccccccccccccccccccdk.',
  '..kkkkkkkkkkkkkkkkkkkkkkk.',
  '...kabbbbbbbbbbbbbbbbcdk..',
  '...kabbbbbbbbbbbbbbbbcdk..',
  '...kabkkkbkkkbkkkbkkkcdk..',
  '...kabbbbbbbbbbbbbbbbcdk..',
  '...kabbbbbbbbbbbbbbbbcdk..',
  '...kabbkkkkkkkkkkkkbbcdk..',
  '...kabkqqqqqqqqqqqqkbcdk..',
  '...kabkqrrrrrrrrrrqkbcdk..',
  '...kabkqrrrorrrrorqkbcdk..',
  '...kabkqrroyorrooyqkbcdk..',
  '...kabkqroyyoroyyoqkbcdk..',
  '...kabkqoyyyyoyyyyqkbcdk..',
  '...kabkqoyyyyyyyyoqkbcdk..',
  '...kabkqkkkkkkkkkkqkbcdk..',
  '...kabkkkkkkkkkkkkkkbcdk..',
  '...kabbbbbbbbbbbbbbbbcdk..',
  '...kabbbbbbbbbbbbbbbbcdk..',
  '...kbbbbbbbbbbbbbbbbbcdk..',
  '...kbbbbbbbbbbbbbbbbccdk..',
  '...kbcccccccccccccccccdk..',
  '..kkkkkkkkkkkkkkkkkkkkkkk.',
  '..kaaaaaaaaaaaaaaaaaaaabk.',
  '..kbcccccccccccccccccccdk.',
  '..kkkkkkkkkkkkkkkkkkkkkkk.',
  '...kbck............kbck...',
  '...kbck............kbck...',
  '...kkkk............kkkk...',
];

/** The stove's flue, from the ceiling down to the stones (it stands behind them). */
const stovePipeRows = [
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kkkkkk',
  'kaabck',
  'kkkkkk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kkkkkk',
  'kaabck',
  'kkkkkk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
  'kabcdk',
];

const bucketRows = [
  '..........kk..',
  '.........kbk..',
  '..kkkkkkkbkk..',
  '.kmmmmmmkbmmk.',
  'kmjjjjjkbkjjmk',
  'kmjjjjjjkjjjmk',
  'kkmmmmmmmmmmkk',
  '.kabbbbbbbbck.',
  '.kmmmmmmmmmmk.',
  '.kabbbbbbbbck.',
  '..kabbbbbbck..',
  '..kmmmmmmmmk..',
  '...kkkkkkkk...',
];

const steamFrames = [
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......uuu.......',
    '.....uwwvu......',
    '....uwwwwvu.....',
    '....uwwwvvu.....',
    '.....uvvvu......',
    '......uuu.......',
    '................',
  ],
  [
    '................',
    '................',
    '.......uuu......',
    '......uwwvu.uu..',
    '.....uwwwwvuwvu.',
    '..uu.uwwwwvuvvu.',
    '.uwvuuvwwvvu.uu.',
    '.uvvu.uvvvu.....',
    '..uu...uuu......',
    '................',
    '................',
    '................',
  ],
  [
    '.....uu..uuu....',
    '....uvvuuvwvu...',
    '...uvwwvvwwvvu..',
    '...uvvvvvvvvu...',
    '....uuvvuvvu....',
    '......uu.uu.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
];

/**
 * The wall thermometer: a pine plaque (`a b c d`), a glass tube with tick marks and a bulb (`e f g h`,
 * red; blue for the cold plunge). The fill is drawn over the tube by `thermometerFill` (`../drawn.ts`):
 * the tube's inside is x 4 to 6, rows 3 to 31.
 */
const thermometerRows = [
  '.kkkkkkkkk.',
  'kaaaaaaaabk',
  'kabkkkkkbck',
  'kabknnnkdck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkdck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkdck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkdck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkdck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkdck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkdck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabknnnkbck',
  'kabkfggkbck',
  'kakfffgghkk',
  'kakfeffghkk',
  'kakfffgghkk',
  'kabkgghkbck',
  'kbckkkkkcdk',
  '.kkkkkkkkk.',
];

/** A chili pepper (8x8): tint it green, red or ghostly purple. */
const pepperRows = [
  '......k.',
  '...kkksk',
  '..kawbbk',
  '.kabbbck',
  '.kbbbcck',
  'kbbbcck.',
  'kbccdk..',
  '.kkkk...',
];

const plateRows = [
  '...kkkkkkkk...',
  '.kkwwwwwwwwkk.',
  'kvwwwwwwwwwwvk',
  '.kkvvvvvvvvkk.',
  '...kkkkkkkk...',
];

const sharkFinFrames = [
  [
    '...kk.........',
    '...krk........',
    '...krqk.......',
    '...krqqk......',
    '...krpqqk.....',
    '..krppqqk.....',
    '..krpppqqk....',
    '.krppppqqqk...',
    'xkkkkkkkkkkkxx',
    '.xxwxx..xxwx..',
  ],
  [
    '..............',
    '...kk.........',
    '...krk........',
    '...krqk.......',
    '...krqqk......',
    '...krpqqk.....',
    '..krppqqk.....',
    '..krpppqqk....',
    'xxkkkkkkkkkkxx',
    'xwxx..xxwxx..x',
  ],
];

/** A shark leaping out of the lake, jaws open (it faces right). */
const sharkLeapRows = [
  '.............kk.........',
  'kk..........kqk.........',
  'kqk........kqqk.........',
  'kqqk..kkkkkqqqqkkkk.....',
  '.kqqkkqqqqqqqqqqqqqkk...',
  '..kqqqqqqqqqqqqqqqqqqkk.',
  '..kqqpppppppppppqqqkqqqk',
  '.kqqkpppppppppppppppqqqk',
  'kqqk.kwwwwwwwwwwwkkkkkk.',
  'kqk...kwwwwwwwwwkmwmwmk.',
  'kk.....kkwwwwwwkmmmmmk..',
  '.........kkkkkk.kwkwkk..',
  '................kkkk....',
];

const buoyRows = [
  '...kk...',
  '..k..k..',
  '..kkkk..',
  '.kaabck.',
  'kwwwwwvk',
  'kabbbcdk',
  'kbbbccdk',
  '.kwwwvk.',
  'xxkkkkxx',
  '.xx..xx.',
];

const finishFlagFrames = [
  [
    '.kk...........',
    'kyyk..........',
    'kyyk..........',
    '.kpkkkkkkkkkk.',
    '.kpkwwnnwwnnk.',
    '.kpkwwnnwwnnk.',
    '.kpknnwwnnwwk.',
    '.kpknnwwnnwwk.',
    '.kpkwwnnwwnnk.',
    '.kpkwwnnwwnnk.',
    '.kpkkkkkkkkkk.',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    'kkkkk.........',
  ],
  [
    '.kk...........',
    'kyyk..........',
    'kyyk..........',
    '.kpkkkkkk.....',
    '.kpkwwnnwkkkk.',
    '.kpkwwnnwwnnk.',
    '.kpknnwwnnnnk.',
    '.kpknnwwnnwwk.',
    '.kpkwwnnwnwwk.',
    '.kpkwwnnwwnnk.',
    '.kpkkkkkkwnnk.',
    '.kpk.....kkkk.',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    '.kpk..........',
    'kkkkk.........',
  ],
];

/** Three crack shapes for the ice (variants, not frames). */
const crackRows = [
  ['n.........', '.nn....n..', '...nnnn.n.', '..n......n', '.n........'],
  ['...n...', 'n..n..n', '.n.n.n.', '..nnn..', '.n.n.n.', 'n..n...', '...n...'],
  ['nn..........', '..nnn...nn..', '.....nnn..nn', '...........n'],
];

const splashFrames = [
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......kk.......',
    '...k..kwwk..k...',
    '..kwk.kwxk.kwk..',
    '.kwxk.kxyk.kxwk.',
    'kwxxykkxykkyxxwk',
    '.kkkkkkkkkkkkkk.',
  ],
  [
    '.....k....k.....',
    '....kwk..kwk....',
    '.k...k.kk.k...k.',
    'kwk...kwwk...kwk',
    '.k.k.kwxxwk.k.k.',
    '...kwkwxxwkwk...',
    '..kwxkwxyxkxwk..',
    '..kwxykxykyxwk..',
    '.kwxxykxykyxxwk.',
    '.kwxyyyxyyyyxwk.',
    'kwxxyyyyyyyyxxwk',
    '.kkkkkkkkkkkkkk.',
  ],
  [
    '................',
    '...k........k...',
    '..kwk......kwk..',
    '...k...kk...k...',
    '......kwwk......',
    '.k.....kk.....k.',
    'kwk..........kwk',
    '.k............k.',
    '................',
    '...kkkkkkkkkk...',
    '.kkwwxxxxxxwwkk.',
    '..kkkkkkkkkkkk..',
  ],
];

const flameFrames = [
  [
    '....k...',
    '...kck..',
    '..kcck..',
    '..kcbck.',
    '.kcbbck.',
    '.kcbabck',
    'kcbaabck',
    'kcbaabck',
    '.kcbbck.',
    '..kkkk..',
  ],
  [
    '..k.....',
    '..kck...',
    '...kck..',
    '..kcbck.',
    '.kcbbck.',
    'kcbbabck',
    'kcbaabck',
    'kcbaabck',
    '.kcbbck.',
    '..kkkk..',
  ],
  [
    '........',
    '....k...',
    '.k.kck..',
    'kck.kck.',
    'kcbkcbck',
    '.kcbbbck',
    'kcbaabck',
    'kcbaabck',
    '.kcbbck.',
    '..kkkk..',
  ],
];

const zapFrames = [
  [
    '.....kkk..',
    '....kabk..',
    '...kabk...',
    '..kabkkkk.',
    '.kaaaaabk.',
    '.kkkkabk..',
    '....kabk..',
    '...kbck...',
    '..kbck....',
    '..kkk.....',
  ],
  [
    '....k.....',
    '.k..k..k..',
    '..k.b.k...',
    '...bab....',
    'kkbawabkk.',
    '...bab....',
    '..k.b.k...',
    '.k..k..k..',
    '....k.....',
    '..........',
  ],
];

const dizzyFrames = [
  [
    '.b..............',
    'bab.......b.....',
    '.b.......bab....',
    '..........b...b.',
    '.............bab',
    '..............b.',
  ],
  [
    '......b.........',
    '.....bab......b.',
    '.b....b......bab',
    'bab...........b.',
    '.b..............',
    '................',
  ],
];

const sweatRows = ['..k..', '.kak.', '.kak.', 'kaabk', 'kabck', 'kbcck', '.kkk.'];

const heartRows = ['.kk.kk.', 'kabkbck', 'kbbbbck', '.kbbck.', '..kck..', '...k...'];

const healRows = ['..kkk..', '..kak..', 'kkkakkk', 'kaaabck', 'kkkbkkk', '..kck..', '..kkk..'];

const shieldRows = [
  'kkkkkkkkkk',
  'kfeeeeeegk',
  'kfabbbbcgk',
  'kfabbbbcgk',
  'kfbbbbbcgk',
  'kfbbbbccgk',
  '.kfbbbcgk.',
  '.kfbbccgk.',
  '..kfbcgk..',
  '..kfccgk..',
  '...kfgk...',
  '....kk....',
];

const gulpRows = [
  '..uuuuuuuuuuu..',
  '.uwwwwwwwwwwwu.',
  'uwwwkwwwwkkkkwu',
  'uwwwkwwwwwwwkwu',
  'uwkkkkkwwkkkkwu',
  'uwwwkwwwwkwwwwu',
  'uwwwkwwwwkkkkwu',
  '.uvwwwwwwwwwvu.',
  '..uuuuuuuuuuu..',
];

const dustFrames = [
  [
    '..................',
    '..................',
    '.uu............uu.',
    'uwwu..........uwwu',
    'uwwvu........uvwwu',
    '.uuu..........uuu.',
  ],
  [
    'uu..............uu',
    'wvu............uvw',
    'uu..............uu',
    '..................',
    '.u..............u.',
    '..................',
  ],
];

const confettiFrames = [
  [
    '..b.........',
    '..c.....ff..',
    '..........g.',
    '.ff.....g...',
    '.....y......',
    '....yy..b...',
    '.........c..',
    'g...........',
    'g.....ee....',
    '..........b.',
    '...c......b.',
    '..bb........',
  ],
  [
    '.........b..',
    '..ff.....c..',
    '.g..........',
    '...g.....ff.',
    '......y.....',
    '...b..yy....',
    '..c.........',
    '...........g',
    '....ee.....g',
    '.b..........',
    '.b......c...',
    '........bb..',
  ],
];

const medalRows = [
  'kkkk..kkkk',
  'kefk..kfgk',
  '.kefkkfgk.',
  '..kefgfk..',
  '..kkkkkk..',
  '.kaabbbck.',
  'kawbbbbcck',
  'kabbaabcck',
  'kbbaaaacdk',
  'kbbbaabcdk',
  '.kbcccddk.',
  '..kkkkkk..',
];

const pinRows = ['..kkk..', '.kaabk.', 'kabwbck', 'kbwwwck', 'kbbwbdk', '.kccdk.', '..kkk..'];

const trophyRows = [
  '..kkkkkkkkkkkk..',
  '..kaaaaaaaaabk..',
  '.kkabwbbbbbbckk.',
  'kbkabwbbbbbbckck',
  'kbkabbbbbbbbckck',
  'kbkabbbbbbbbckck',
  '.kkabbbbbbbcckk.',
  '...kabbbbbccdk..',
  '....kbbbbccdk...',
  '.....kbbccdk....',
  '......kbcdk.....',
  '.......kck......',
  '.......kck......',
  '......kbcdk.....',
  '....kkkkkkkk....',
  '....kabbbbck....',
  '...kabbbbbbck...',
  '...kkkkkkkkkk...',
];

/** A stand microphone for the host. */
const micRows = [
  '.kkk..',
  'kmmnk.',
  'kmnnk.',
  'knnnk.',
  '.kkk..',
  '..k...',
  '..k...',
  '..k...',
  '..k...',
  '..k...',
  '..k...',
  '..k...',
  '.kkk..',
  'kkkkk.',
];

/** A small pennant on a pole (the team or player colour). */
const pennantFrames = [
  [
    '.kk......',
    'kyyk.....',
    '.kkkkk...',
    '.kpkabkk.',
    '.kpkabbck',
    '.kpkbcck.',
    '.kpkckk..',
    '.kpkk....',
    '.kpk.....',
    '.kpk.....',
    '.kpk.....',
    '.kpk.....',
    '.kpk.....',
    '.kkk.....',
  ],
  [
    '.kk......',
    'kyyk.....',
    '.kkkk....',
    '.kpkakk..',
    '.kpkabbkk',
    '.kpkbbcck',
    '.kpkcckk.',
    '.kpkkk...',
    '.kpk.....',
    '.kpk.....',
    '.kpk.....',
    '.kpk.....',
    '.kpk.....',
    '.kkk.....',
  ],
];

/** A fan in the stands: a round silhouette in a team colour that waves its arms. */
const fanFrames = [
  [
    '............',
    '............',
    '....kkkk....',
    '...kaabbk...',
    '..kabbbbck..',
    '..kbkbbkck..',
    '..kbbbbbck..',
    '.kkbbbbbckk.',
    'kcbbbbbbbcck',
    'kkbbbbbbbckk',
    '..kbbbbbck..',
    '..kkkkkkkk..',
  ],
  [
    '............',
    '....kkkk....',
    '.k.kaabbk.k.',
    'kbkabbbbckck',
    'kbkbkbbkckck',
    '.kkbbbbbckk.',
    '..kbbbbbck..',
    '..kbbbbbck..',
    '..kbbbbbck..',
    '..kbbbbbck..',
    '..kbbbbbck..',
    '..kkkkkkkk..',
  ],
];

/** A crate of peppers: wood (`a b c d`), red peppers (`e f g h`) and green ones. */
const crateRows = [
  '...kk...kk..kk....',
  '..kffk.kssk.kffk..',
  '..kfgk.kstk.kfgk..',
  '.kkfgkkkstkkkfgkk.',
  'kkkkkkkkkkkkkkkkkk',
  'kaaaaaaaaaaaaaaabk',
  'kbccccccccccccccdk',
  'kkkkkkkkkkkkkkkkkk',
  'kabkaaaaaaaaaakbdk',
  'kbckbccccccccckcdk',
  'kkkkkkkkkkkkkkkkkk',
  'kaaaaaaaaaaaaaaabk',
  'kbccccccccccccccdk',
  'kkkkkkkkkkkkkkkkkk',
];

/** Icicles under a snowy lip (tiles sideways every 16 px). */
const iciclesRows = [
  'abbbbabbbbbabbbb',
  'bbccbbbccbbbbccb',
  'dbcd.dbcd.dbbd.d',
  '.bd..dbd..dbd...',
  '.d....bd...bd...',
  '......d....d....',
  '...........d....',
  '................',
];

const snowCapRows = [
  '..kkkkk....kkkk.',
  '.kaaaabkkkkaabbk',
  'kabbbbbbbbbbbbck',
  'kkkkkkkkkkkkkkkk',
];

const cloudRows = [
  '........uuuu............',
  '......uuwwwwuu..........',
  '.....uwwwwwwwwu..uuu....',
  '..uuuwwwwwwwwwwuuwwwu...',
  '.uwwwwwwwwwwwwwwwwwwwu..',
  'uwwwwwwwwwwwwwwwwwwwwwu.',
  'uvwwwwwwwwwwwwwwwwwwvvvu',
  '.uvvvvvvvvvvvvvvvvvvvvu.',
  '..uuuuuuuuuuuuuuuuuuuu..',
];

const reedsRows = [
  '..k.....',
  '.kbk..k.',
  '.kbk.kbk',
  '.kck.kbk',
  '..k.kck.',
  '.k.k.k..',
  'kbk.k...',
  'kbk.ck..',
  '.kc.c.k.',
  '..c.c.c.',
  '..ccccc.',
  '.ddddddd',
];

const duckRows = [
  '...kkk...',
  '..kaabk..',
  '..kabkook',
  'kk.kbbkk.',
  'kakkabbbk',
  'kabbbbbck',
  '.kbbbbck.',
  'xxkkkkkxx',
];

/** Rings of water round a swimmer's middle (16 wide). */
const rippleFrames = [
  ['.xxxx......xxxx.', 'xwwwwxxxxxxwwwwx', '.xxxxwwwwwwxxxx.'],
  ['..xxxx....xxxx..', '.xwwwwxxxxwwwwx.', 'xxxxxwwwwwwxxxxx'],
];

const iceChunkRows = [
  '...kkkkk....',
  '.kkaaaabkk..',
  'kaaabbbbbbk.',
  'kbbbbbbbccdk',
  '.kcccccccdk.',
  'xxkkkkkkkkxx',
];

/** A sun with a lit face for the Melon Run sky. */
const sunRows = [
  '......k......',
  '..k...k...k..',
  '...k.....k...',
  '.....kkk.....',
  '....kaaabk...',
  'kk.kaaaabbk.kk',
  '...kaabbbck..',
  '...kabbbbck..',
  '....kbbcck...',
  '.....kkkk....',
  '...k.....k...',
  '..k...k...k..',
  '......k......',
].map((r) => r.padEnd(14, '.').slice(0, 14));

/** A wooden pole for bunting. */
const poleRows = [
  '.kk.',
  'kyyk',
  '.kk.',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kabk',
  'kbck',
  'kkkk',
];

function frames(list: readonly (readonly string[])[], pal: Record<string, string>): SpriteDef[] {
  return list.map((rows) => sprite(rows, pal));
}

const ink = { k: INK };

export const GAMES_PROP_DATA = {
  stove: [sprite(stoveRows, rampPalette(RAMPS.iron, undefined, { ...ink, ...STONES, ...FIRE }))],
  stovePipe: [sprite(stovePipeRows, rampPalette(RAMPS.iron, undefined, ink))],
  bucket: [
    sprite(bucketRows, rampPalette(RAMPS.wood, undefined, { ...ink, m: '#9aa0bc', j: '#2a74bc' })),
  ],
  steam: frames(steamFrames, STEAM),
  thermometer: [
    sprite(thermometerRows, rampPalette(RAMPS.pine, RAMPS.red, { ...ink, n: '#f4f8ff' })),
  ],
  pepper: [
    sprite(pepperRows, rampPalette(RAMPS.red, undefined, { ...ink, s: '#3a8a48', w: WHITE })),
  ],
  plate: [sprite(plateRows, { ...ink, w: WHITE, v: '#c8d6ee' })],
  sharkFin: frames(sharkFinFrames, { ...ink, ...SHARK, x: '#b0ecff' }),
  sharkLeap: [sprite(sharkLeapRows, { ...ink, ...SHARK })],
  buoy: [
    sprite(
      buoyRows,
      rampPalette(RAMPS.red, undefined, { ...ink, w: WHITE, v: '#c8d6ee', x: '#b0ecff' }),
    ),
  ],
  finishFlag: frames(finishFlagFrames, {
    ...ink,
    y: '#ffd25a',
    p: '#d4d8e8',
    w: WHITE,
    n: '#2f2a5c',
  }),
  crack: crackRows.map((rows) => sprite(rows, { n: '#5a7fb8' })),
  splash: frames(splashFrames, { ...ink, ...WATER_FX }),
  flame: frames(
    flameFrames,
    rampPalette(['#fff6c8', '#ffd25a', '#ef6a3a', '#a83a24'], undefined, ink),
  ),
  zap: frames(zapFrames, rampPalette(RAMPS.spark, undefined, { ...ink, w: WHITE })),
  dizzy: frames(dizzyFrames, rampPalette(RAMPS.gold, undefined, ink)),
  sweat: [sprite(sweatRows, rampPalette(RAMPS.water, undefined, ink))],
  heart: [sprite(heartRows, rampPalette(RAMPS.red, undefined, ink))],
  heal: [sprite(healRows, rampPalette(RAMPS.green, undefined, ink))],
  shield: [sprite(shieldRows, rampPalette(RAMPS.tide, RAMPS.gold, ink))],
  gulp: [sprite(gulpRows, { ...ink, ...STEAM })],
  dust: frames(dustFrames, STEAM),
  confetti: frames(confettiFrames, rampPalette(RAMPS.pink, RAMPS.teal, { y: '#ffd25a' })),
  medal: [sprite(medalRows, rampPalette(RAMPS.gold, RAMPS.blue, { ...ink, w: WHITE }))],
  pin: [sprite(pinRows, rampPalette(RAMPS.purple, undefined, { ...ink, w: WHITE }))],
  trophy: [sprite(trophyRows, rampPalette(RAMPS.gold, undefined, { ...ink, w: WHITE }))],
  mic: [sprite(micRows, { ...ink, m: '#d4d8e8', n: '#6e6490' })],
  pennant: frames(
    pennantFrames,
    rampPalette(RAMPS.red, undefined, { ...ink, y: '#ffd25a', p: '#c98a52' }),
  ),
  fan: frames(fanFrames, rampPalette(RAMPS.blue, undefined, ink)),
  crate: [
    sprite(crateRows, rampPalette(RAMPS.wood, RAMPS.red, { ...ink, s: '#8fd14a', t: '#4f9a32' })),
  ],
  icicles: [sprite(iciclesRows, rampPalette(RAMPS.ice))],
  snowCap: [sprite(snowCapRows, rampPalette(RAMPS.snow, undefined, ink))],
  cloud: [sprite(cloudRows, { w: WHITE, v: '#e6f2fb', u: '#bcdcf2' })],
  reeds: [sprite(reedsRows, rampPalette(RAMPS.grass, undefined, ink))],
  duck: [
    sprite(duckRows, rampPalette(RAMPS.yellow, undefined, { ...ink, o: '#ff9a4a', x: '#b0ecff' })),
  ],
  ripple: frames(rippleFrames, { w: WHITE, x: '#b0ecff' }),
  iceChunk: [sprite(iceChunkRows, rampPalette(RAMPS.ice, undefined, { ...ink, x: '#a8e0f4' }))],
  sun: [sprite(sunRows, rampPalette(RAMPS.yellow, undefined, ink))],
  pole: [sprite(poleRows, rampPalette(RAMPS.wood, undefined, { ...ink, y: '#ffd25a' }))],
} as const satisfies Readonly<Record<string, readonly SpriteDef[]>>;
