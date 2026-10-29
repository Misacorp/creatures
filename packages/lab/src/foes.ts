/**
 * The daily dungeon's foes and floor bosses as combat v2 `BossDef`s: one line of three, then the foe (R8.7: one boss turn
 * after the line), with HP and Attack set by a depth. Id, name, kind, element and round count come from the content
 * (`dungeon-foes.json`), so they cannot drift; the stats are scaled by the dungeon's own depth curve; the armour, plain
 * attack, moves and rule cards are lab data in the grammar of `types.ts`.
 *
 * Misa's direction (2026-10-28): the foes may change freely, so each one asks its own question instead of repeating a
 * shipped gimmick. A dungeon shows its encounters up front but sends many different foes, so it needs an all-round
 * team, and it is tough, so the camp (a rest between rooms) matters. Fourth panel (2026-10-28): three foes ask a question
 * the classic line fails unless it answers it (`needs`: a Guard, a silence ward, something for armour), and the depth
 * curve grows one stat, HP, so a deeper foe is a longer fight and not a harder-hitting one. The runs on the shipped map,
 * the camp and the Undercroft are in `dungeon.ts`.
 */
import { depthFactorBp, dungeonContent, isLandmark } from '@creatures/game';
import { card } from './cards';
import { move, type MoveRow } from './bosses';
import type { BossDef, Escalation } from './types';

/** The dungeon line: one row of three. */
export const FOE_ROWS = 1;
export const FOE_COLS = 3;

/**
 * Lab scale of a foe's content numbers (basis points of them): the content's HP and Attack were made for the shipped
 * engine, and a v2 creature is bigger with flat armour, so the lab multiplies both.
 */
export const FOE_BASE = { hpBp: 23_000, atkBp: 225_000 } as const;

/**
 * The lab's depth curve, in the shape of the dungeon's (`depthFactorBp`: 10000 plus a step for each depth above 1 plus a
 * curve for each square of them). It grows one stat: HP (a foe's Attack is the same at every depth; Attack growth on top
 * of HP growth tested worse, a double step the best team never recovered from). It is gentler than the shipped one: the
 * lab's creatures are all at their level cap, so there is no levelling wall to climb. Tuned (2026-10-28) so a good
 * all-round team with a plan clears over half of its runs at depths 1 to 8 (about 100% at depth 1 down to about 70% at depth 8),
 * the Undercroft below is harder, and the classic line falls away by depth 3. Lab depths are not the shipped depth numbers.
 */
export const FOE_CURVE = {
  hpStepBp: 1_600,
  hpCurveBp: 45,
  atkStepBp: 0,
  atkCurveBp: 0,
} as const;

export interface FoeSpec {
  readonly id: string;
  readonly armour: number;
  readonly plain: BossDef['plain'];
  readonly moves: readonly MoveRow[];
  /** A floor boss's landmark move: only at a landmark depth, announced at round start. */
  readonly signature?: MoveRow;
  readonly cards: readonly string[];
  readonly escalation?: Escalation;
  /** The question the foe asks the team (for the report). */
  readonly asks: string;
  /** A foe that asks a hard question is tuned on its own: its HP and Attack, in basis points of the lab's scaled numbers (10000 is unchanged). */
  readonly hpBp?: number;
  readonly atkBp?: number;
  /**
   * Set when the classic line (Tidewing, Tempestray, Thornbuck) fails the foe unless it answers the question (tested):
   * `guard` (a team with no Guard loses a hitter), `ward` (a team with no silence ward loses its Setter and Guard to the
   * silence) or `pierce` (a team with nothing to get past its bark makes no dent).
   */
  readonly needs?: 'guard' | 'ward' | 'pierce';
}

const front = { anchor: 'front', shape: 'single' } as const;

export const FOE_SPECS: readonly FoeSpec[] = [
  {
    id: 'puddle-imp',
    armour: 4,
    plain: { pattern: { anchor: 'random', shape: 'single' }, powerBp: 4_500, hits: 4 },
    moves: [],
    cards: [],
    asks: 'Many small splashes on random creatures: dodge turns them away, armour only wears them down.',
  },
  {
    id: 'drift-wisp',
    armour: 2,
    plain: { pattern: front, powerBp: 8_000 },
    moves: [['sea-mist', 'Sea Mist', 1, 0, 'front', 'rowEnds', 0, { n: 1, silenceTurns: 2 }]],
    cards: ['elusive'],
    escalation: { name: 'Wisp Fog', feed: 'dodges', per: 2, cap: 2, grow: { dodgeBp: 800 } },
    asks: 'Hard to hit, it keeps the ends of the line quiet, and every miss thickens the fog. Something must ward the ends.',
    hpBp: 22_000,
    needs: 'ward',
  },
  {
    id: 'ember-mite',
    armour: 6,
    plain: { pattern: front, powerBp: 7_000 },
    moves: [['flare-up', 'Flare Up', 2, 0, 'random', 'scatter', 9_000, { n: 2 }]],
    cards: ['clean-scales'],
    escalation: {
      name: 'Warm Stones',
      feed: 'shed',
      per: 2,
      cap: 2,
      grow: { atkBp: 2_500, targets: 1 },
    },
    asks: 'Its heat sheds your marks after every turn of its own, and each mark shed warms it. A sealed mark stays, and so does one left during its own turn.',
    // A longer fight (balance pass 2026-10-29), so keeping marks is worth a team's slot: Seal does it, and so does Primed by Pain
    // (it leaves its mark while the foe is taking its turn, after the shedding began).
    hpBp: 14_000,
  },
  {
    id: 'ash-sprite',
    armour: 8,
    plain: { pattern: { anchor: 'front', shape: 'line3' }, powerBp: 8_000 },
    moves: [],
    cards: ['fizzle'],
    asks: 'Ash settles on a mark made by a reaction, so it cannot be cashed at once, and the fight is long: a Guard that builds Heat doubles a reaction every few rounds.',
  },
  {
    id: 'bramble-hound',
    armour: 6,
    plain: { pattern: front, powerBp: 9_000 },
    moves: [['thorn-snap', 'Thorn Snap', 3, 0, 'front', 'rowEnds', 0, { n: 1, silenceTurns: 1 }]],
    cards: ['thick-hide'],
    asks: 'Bark turns small hits away, and it silences the ends of the line. Tunnel Through or a big hit gets past.',
    hpBp: 12_000,
    needs: 'pierce',
  },
  {
    id: 'moss-lurker',
    armour: 10,
    plain: { pattern: front, powerBp: 6_000 },
    moves: [['root-grab', 'Root Grab', 2, 0, 'strongest', 'line3', 18_000]],
    cards: ['grudge'],
    asks: 'It likes the loudest visitor: the one that dealt the most, and the strongest. A Guard beside it takes the hit.',
    hpBp: 12500,
    atkBp: 1_0000,
    needs: 'guard',
  },
  {
    id: 'static-bat',
    armour: 3,
    plain: { pattern: front, powerBp: 6_000 },
    moves: [['zap-dive', 'Zap Dive', 3, 0, 'strongest', 'chain', 11_000, { n: 2, decayBp: 6_000 }]],
    cards: ['stone-skin'],
    escalation: { name: 'Static Charge', feed: 'crits', per: 1, cap: 2, grow: { atkBp: 2_500 } },
    asks: 'No hit deals more than a cap, it dives at the hardest hitter, and every crit on it charges it. Dodge keeps the team standing while it hits often.',
  },
  {
    id: 'flicker-swarm',
    armour: 2,
    plain: { pattern: { anchor: 'random', shape: 'scatter', n: 2 }, powerBp: 5_000 },
    moves: [['buzz-cloud', 'Buzz Cloud', 2, 0, 'front', 'all', 5_000]],
    cards: [],
    asks: 'Sparks everywhere: area hits on all three, every round. A row ward cuts every one of them.',
  },
  {
    id: 'bog-toad',
    armour: 14,
    plain: { pattern: front, powerBp: 8_000 },
    moves: [['mud-spit', 'Mud Spit', 2, 0, 'random', 'scatter', 9_000, { n: 1 }]],
    cards: ['shake-it-off'],
    asks: 'It washes every debuff off itself every third round: a Mired that comes back every round holds it down.',
  },
  {
    id: 'tar-leech',
    armour: 24,
    plain: { pattern: front, powerBp: 7_000 },
    moves: [['tar-cling', 'Tar Cling', 3, 0, 'front', 'line3', 13_000]],
    cards: ['wither'],
    asks: 'Black, thick and draining: healing is halved and little gets through its armour, so a boost that reaches every hitter gets more through than a heal; its heavy hits are dodged, not healed.',
  },
  // Floor bosses.
  {
    id: 'drowned-warden',
    armour: 16,
    plain: { pattern: front, powerBp: 6_000 },
    moves: [
      ['flood-gate', 'Flood Gate', 3, 0, 'front', 'all', 6_000],
      ['sluice-pull', 'Sluice Pull', 2, 0, 'front', 'columns', 7_000, { n: 2 }],
    ],
    signature: ['sluice-surge', 'Sluice Surge', 4, 0, 'front', 'all', 11_000, { windUp: true }],
    cards: [],
    // A dungeon run is one player's own team, so a Build-up that feeds on knockouts blames no one: each creature that falls lets the water rise.
    escalation: { name: 'Rising Water', feed: 'knockouts', per: 1, cap: 2, grow: { atkBp: 1_200 } },
    asks: 'The gates open on the whole line, and each creature that falls lets the water rise; at a landmark, a wave announced at round start.',
  },
  {
    id: 'slag-tyrant',
    armour: 20,
    plain: { pattern: front, powerBp: 7_000 },
    moves: [['anvil-fall', 'Anvil Fall', 3, 0, 'front', 'line3', 15_000]],
    signature: ['slag-spill', 'Slag Spill', 4, 0, 'strongest', 'line3', 24_000, { windUp: true }],
    cards: ['reflective-hide'],
    escalation: { name: 'Molten Shell', feed: 'reactions', per: 2, cap: 2, grow: { armour: 8 } },
    asks: 'The first reaction after each of its turns burns the one who plays it, and every reaction heats it. A Mired that comes back every round holds its Molten Shell down.',
  },
  {
    id: 'bramble-matron',
    armour: 18,
    plain: { pattern: front, powerBp: 6_000 },
    moves: [
      ['tangle', 'Tangle', 2, 0, 'front', 'rowEnds', 0, { n: 1, silenceTurns: 1 }],
      ['thorn-rain', 'Thorn Rain', 3, 0, 'random', 'scatter', 8_000, { n: 2 }],
    ],
    signature: [
      'briar-cage',
      'Briar Cage',
      4,
      0,
      'front',
      'rowEnds',
      13_000,
      { n: 1, windUp: true },
    ],
    cards: ['wither'],
    asks: 'She silences the ends and drains healing; thorns land on two random creatures. A Guard that marks as it takes a hit does the Setter\u2019s work.',
  },
  {
    id: 'coil-baron',
    armour: 14,
    plain: { pattern: { anchor: 'strongest', shape: 'single' }, powerBp: 6_000 },
    moves: [['arc-lash', 'Arc Lash', 1, 0, 'strongest', 'chain', 6_000, { n: 1, decayBp: 6_000 }]],
    signature: ['coil-burst', 'Coil Burst', 4, 0, 'strongest', 'line3', 22_000, { windUp: true }],
    cards: [],
    escalation: {
      name: 'Tightening Coil',
      feed: 'rounds',
      per: 2,
      cap: 3,
      grow: { atkBp: 1_500, jumps: 1 },
    },
    asks: 'It always goes for the strongest, and the charge builds with every round: a race, where Heat doubles the reactions.',
  },
  {
    id: 'fen-lurker',
    armour: 22,
    plain: { pattern: front, powerBp: 6_000 },
    moves: [['sink-down', 'Sink Down', 3, 0, 'front', 'all', 6_000]],
    signature: ['fen-tug', 'Fen Tug', 4, 0, 'front', 'all', 11_000, { windUp: true }],
    cards: ['shake-it-off'],
    asks: 'A heavy sweep of the line announced at round start, and it washes off every debuff every third round. Night Watch takes the first Wind-up hit.',
  },
];

export const FOE_IDS: readonly string[] = FOE_SPECS.map((s) => s.id);

/** The depths the report looks at (7 is the first landmark, where a floor boss has its signature move). */
export const DUNGEON_DEPTHS: readonly number[] = [1, 3, 5, 7];

/** A foe's HP and Attack at a depth: the content's numbers, the lab scale, then the dungeon's depth curve. */
export function foeStats(id: string, depth: number): { hp: number; atk: number } {
  const def = dungeonContent.foes.find((f) => f.id === id);
  if (!def) throw new Error(`unknown dungeon foe ${id}`);
  const spec = FOE_SPECS.find((s) => s.id === id);
  const part = (value: number, scale: number, step: number, curve: number, own: number) =>
    Math.max(
      1,
      Math.floor(
        (Math.floor((Math.floor((value * scale) / 10_000) * own) / 10_000) *
          depthFactorBp(depth, step, curve)) /
          10_000,
      ),
    );
  return {
    hp: part(
      def.baseHp,
      FOE_BASE.hpBp,
      FOE_CURVE.hpStepBp,
      FOE_CURVE.hpCurveBp,
      spec?.hpBp ?? 10_000,
    ),
    atk: part(
      def.baseAtk,
      FOE_BASE.atkBp,
      FOE_CURVE.atkStepBp,
      FOE_CURVE.atkCurveBp,
      spec?.atkBp ?? 10_000,
    ),
  };
}

/**
 * A dungeon foe at a depth: a one-row arena, its own armour, plain attack, moves and cards; a floor boss gains its
 * signature at a landmark (`signature` decides it instead: an Undercroft keeper always has it).
 */
export function foeAt(id: string, depth: number, options: { signature?: boolean } = {}): BossDef {
  const spec = FOE_SPECS.find((s) => s.id === id);
  const def = dungeonContent.foes.find((f) => f.id === id);
  if (!spec || !def) throw new Error(`unknown dungeon foe ${id}`);
  const { hp, atk } = foeStats(id, depth);
  const moves = spec.moves.map(move);
  if (spec.signature && (options.signature ?? isLandmark(depth))) moves.push(move(spec.signature));
  let boss: BossDef = {
    id,
    name: def.name,
    element: def.element,
    hp,
    atk,
    armour: spec.armour,
    spd: def.baseSpd ?? 0,
    rounds: def.rounds,
    rows: FOE_ROWS,
    cols: FOE_COLS,
    plain: spec.plain,
    moves,
    cards: spec.cards,
    mods: {},
    ...(spec.escalation ? { escalation: spec.escalation } : {}),
  };
  for (const c of spec.cards) boss = card(c).apply(boss);
  return boss;
}
