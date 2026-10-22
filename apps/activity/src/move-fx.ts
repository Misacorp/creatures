/**
 * What a boss action looks like (decisions.md, 2026-10-23): the recipe of its animation and the
 * theme of its colours, from the move itself (Bramble Bind is vines, Bog Lob a ball of mud falling
 * from the sky), or from its kind and the boss's element for a move with no recipe of its own. Pure:
 * `stage/BossFx.ts` plays it.
 *
 * Every recipe starts at the boss, except where its theme says otherwise: something falls from the
 * sky (a meteor, an anvil, a bolt of lightning, a rain of embers), or grows from the ground (vines,
 * water, mud, bubbles).
 */
import type { Zone } from '@creatures/engine';
import { strikeRows, type BossStrike } from './stage';

export type FxRecipe =
  /** A glowing crescent from the boss to each target (the plain attack). */
  | 'crescent'
  /** Water, mud or lava rises from under a row, crests and drains away; the row shakes. */
  | 'surge'
  /** A jet of water from the boss down a lane. */
  | 'jet'
  /** Embers, seeds or thorns rain from the sky onto each target. */
  | 'rain'
  /** A blob arcs high from the boss and splats on its target. */
  | 'mortar'
  /** A boulder (mud, tar, an anvil) falls from the sky and shatters on its target; the neighbours shake. */
  | 'meteor'
  /** A bolt of lightning from the sky onto the target, the neighbours shake. */
  | 'skybolt'
  /** Lightning from the boss to the first target, then jumping on. */
  | 'chain'
  /** Lightning crackles along a row from creature to creature. */
  | 'static'
  /** Vines burst from the ground under each target, tangle it and shake it. */
  | 'vines'
  /** Two thorny vines grow in from both ends of a row. */
  | 'pincer'
  /** Bubbles rise from under each target and pop. */
  | 'bubbles'
  /** A buzzing swarm darts from the boss to each target. */
  | 'swarm'
  /** A ring of fire flickers around the boss (a trap is armed). */
  | 'flames'
  /** The boss shakes itself and mud splatters off it. */
  | 'shakeoff'
  /** The boss leaps, a shadow grows on its target, and it lands. */
  | 'flop'
  /** A ring of fire tightens around the target and bursts. */
  | 'constrict'
  /** A thorny whip lashes from the boss to its target, then on. */
  | 'whip';

export type FxTheme =
  | 'water'
  | 'fire'
  | 'lava'
  | 'vine'
  | 'thorn'
  | 'seed'
  | 'lightning'
  | 'mud'
  | 'tar'
  | 'mist'
  | 'metal'
  | 'swarm'
  | 'bubble';

export interface FxPlan {
  recipe: FxRecipe;
  theme: FxTheme;
  /** The creatures it hits (all of them, not only the six with reticles). */
  targets: readonly string[];
  /** The rows it covers (a surge, the enrage round). */
  rows: readonly Zone[];
  /** The creatures beside the impact a slam splashes (they shake). */
  splash: readonly string[];
  /** A bigger version (a charged move landing, Judgement Bolt, the enrage round). */
  big: boolean;
}

/** The recipe and theme of each move that has its own look. */
export const MOVE_FX: Readonly<Record<string, { recipe: FxRecipe; theme: FxTheme; big?: true }>> = {
  // Tidal Colossus
  undertow: { recipe: 'surge', theme: 'water' },
  riptide: { recipe: 'jet', theme: 'water' },
  'great-wave': { recipe: 'surge', theme: 'water', big: true },
  'deepwater-spear': { recipe: 'jet', theme: 'water', big: true },
  'spring-tide': { recipe: 'surge', theme: 'water', big: true },
  // Cinder Wyrm
  backdraft: { recipe: 'flames', theme: 'fire' },
  'cinder-fall': { recipe: 'rain', theme: 'fire' },
  'coil-crush': { recipe: 'constrict', theme: 'fire' },
  'magma-spit': { recipe: 'mortar', theme: 'lava' },
  eruption: { recipe: 'surge', theme: 'lava', big: true },
  // Thornmother
  'bramble-bind': { recipe: 'vines', theme: 'thorn' },
  'briar-pincer': { recipe: 'pincer', theme: 'thorn' },
  'seed-burst': { recipe: 'rain', theme: 'seed', big: true },
  'choking-vines': { recipe: 'vines', theme: 'vine', big: true },
  'thorn-lash': { recipe: 'whip', theme: 'thorn' },
  // Storm Sovereign
  'lightning-rod': { recipe: 'chain', theme: 'lightning' },
  thunderclap: { recipe: 'skybolt', theme: 'lightning' },
  'static-field': { recipe: 'static', theme: 'lightning' },
  'judgement-bolt': { recipe: 'skybolt', theme: 'lightning', big: true },
  // Old Bogback
  'sinking-mud': { recipe: 'surge', theme: 'mud' },
  'belly-flop': { recipe: 'flop', theme: 'mud' },
  'shake-off': { recipe: 'shakeoff', theme: 'mud' },
  'bog-lob': { recipe: 'meteor', theme: 'mud' },
  'rising-bubbles': { recipe: 'bubbles', theme: 'bubble', big: true },
  // Dungeon foes
  'sea-mist': { recipe: 'mortar', theme: 'mist' },
  'flare-up': { recipe: 'rain', theme: 'fire' },
  'thorn-snap': { recipe: 'vines', theme: 'thorn' },
  'root-grab': { recipe: 'vines', theme: 'vine' },
  'zap-dive': { recipe: 'chain', theme: 'lightning' },
  'buzz-cloud': { recipe: 'swarm', theme: 'swarm' },
  'flood-gate': { recipe: 'surge', theme: 'water' },
  'molten-shell': { recipe: 'flames', theme: 'lava' },
  'anvil-fall': { recipe: 'meteor', theme: 'metal' },
  tangle: { recipe: 'vines', theme: 'vine' },
  'thorn-rain': { recipe: 'rain', theme: 'thorn' },
  'arc-lash': { recipe: 'chain', theme: 'lightning' },
  'mud-spit': { recipe: 'mortar', theme: 'mud' },
  'tar-cling': { recipe: 'meteor', theme: 'tar' },
  'sink-down': { recipe: 'surge', theme: 'mud' },
};

/** The boss's element as a theme (the plain attack, and a move with no look of its own). */
export function elementTheme(element: string | null): FxTheme {
  switch (element) {
    case 'tide':
      return 'water';
    case 'ember':
      return 'fire';
    case 'grove':
      return 'vine';
    case 'spark':
      return 'lightning';
    case 'mire':
      return 'mud';
    default:
      return 'fire';
  }
}

/** The recipe of a move with no look of its own, from what kind of move it is. */
function recipeOfAction(strike: BossStrike, theme: FxTheme): FxRecipe | null {
  switch (strike.action) {
    case 'hit_zone':
    case 'sweep':
    case 'enrage':
      return 'surge';
    case 'barrage':
      return 'rain';
    case 'slam':
      return theme === 'lightning' ? 'skybolt' : 'meteor';
    case 'lance':
      return 'jet';
    case 'pincer':
      return 'pincer';
    case 'silence_ends':
      return 'vines';
    case 'strike_highest_atk':
      return theme === 'lightning' ? 'chain' : 'whip';
    case 'reflect_armed':
      return 'flames';
    case 'charge':
      // The announcement: its marks say who it will hit; the move plays when it lands.
      return null;
    default:
      return 'crescent';
  }
}

/** What to play for one boss action, or null when nothing plays (a charge being announced). */
export function fxPlanOf(strike: BossStrike, bossElement: string | null): FxPlan | null {
  const own = strike.gimmick === null ? undefined : MOVE_FX[strike.gimmick];
  const theme = own?.theme ?? elementTheme(bossElement);
  if (strike.action === 'charge') return null;
  const recipe = own?.recipe ?? recipeOfAction(strike, theme);
  if (recipe === null) return null;
  const rows = strikeRows(strike);
  const targets = strike.targets;
  return {
    recipe: strike.action === 'enrage' ? 'surge' : recipe,
    theme,
    targets,
    rows:
      strike.action === 'enrage'
        ? ['front', 'middle', 'back']
        : rows.length > 0
          ? rows
          : (recipe === 'surge' || recipe === 'static' || recipe === 'pincer') &&
              strike.zone !== null
            ? [strike.zone]
            : [],
    splash: strike.splash ?? [],
    big: own?.big === true || strike.charged === true || strike.action === 'enrage',
  };
}
