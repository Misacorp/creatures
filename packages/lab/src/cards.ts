import type { BossDef, BossMove } from './types';

/**
 * Boss rule cards (docs/design/combat-v2.md, "Rule cards"). Each one asks the team a question and
 * should have at least two answers from different tools.
 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  readonly asks: string;
  /** Only a raid weekend means anything to it (the report's controlled tests and the lab page leave it out). */
  readonly raidOnly?: boolean;
  /** Builds the card on the boss at a strength (bp of the full card, default 10000). */
  readonly apply: (boss: BossDef, strengthBp?: number) => BossDef;
}

const addMove = (boss: BossDef, move: BossMove): BossDef => ({
  ...boss,
  moves: [...boss.moves, move],
});

/** `value` at `strengthBp` of full strength (whole numbers). */
const share = (value: number, strengthBp: number): number =>
  Math.floor((value * strengthBp) / 10_000);
/** A card's power: an added move deals its strength's share of its full power (at least 1 bp so it still lands). */
const scaledMove = (move: BossMove, strengthBp: number): BossMove => ({
  ...move,
  powerBp: Math.max(1, share(move.powerBp, strengthBp)),
});

export const CARDS: readonly CardDef[] = [
  { id: 'plain', name: 'No card', asks: 'Baseline.', apply: (b) => b },
  {
    id: 'thick-hide',
    name: 'Thick Hide',
    asks: 'Small hits are Blocked; can you land big ones?',
    apply: (b, st = 10_000) => ({ ...b, armour: b.armour + share(70, st) }),
  },
  {
    id: 'stone-skin',
    name: 'Stone Skin',
    asks: 'No hit deals more than a cap; can you hit often?',
    // A weaker card caps higher: at half strength the cap is double, and at 0 there is none.
    apply: (b, st = 10_000) =>
      st <= 0 ? b : { ...b, mods: { ...b.mods, capPerHit: Math.floor((260 * 10_000) / st) } },
  },
  {
    id: 'clean-scales',
    name: 'Clean Scales',
    asks: 'Marks are shed at the end of every boss turn; are Setter and Payoff in the same row?',
    apply: (b, st = 10_000) => ({ ...b, strengthBp: st, mods: { ...b.mods, shedMarks: true } }),
  },
  {
    id: 'reflective-hide',
    name: 'Reflective Hide',
    asks: 'The first reaction after each boss turn bounces back; can your Payoff take it?',
    apply: (b, st = 10_000) => ({ ...b, strengthBp: st, mods: { ...b.mods, reflectFirst: true } }),
  },
  {
    id: 'elusive',
    name: 'Elusive',
    asks: 'The boss dodges a lot; can you make hits land?',
    apply: (b, st = 10_000) => ({ ...b, spd: b.spd + share(300, st) }),
  },
  {
    id: 'bramble-bind',
    name: 'Bramble Bind',
    asks: 'The ends of every row are silenced; who stands at the ends?',
    apply: (b, st = 10_000) =>
      addMove(b, {
        strengthBp: st,
        id: 'bramble-bind',
        name: 'Bramble Bind',
        pattern: { anchor: 'front', shape: 'rowEnds', n: 1 },
        powerBp: 0,
        every: 2,
        turn: 0,
        silenceTurns: 2,
      }),
  },
  {
    id: 'wither',
    name: 'Wither',
    asks: 'Healing is halved; can you prevent damage instead?',
    apply: (b, st = 10_000) => ({
      ...b,
      atk: Math.floor((b.atk * (10_000 + share(2_000, st))) / 10_000),
      mods: { ...b.mods, healBp: 10_000 - share(5_000, st) },
    }),
  },
  {
    id: 'payoff-hunter',
    name: 'Payoff Hunter',
    asks: 'Every 3 rounds it slams the strongest Payoff (aimed) and the slots beside it (area); is a Guard there?',
    apply: (b, st = 10_000) =>
      addMove(
        b,
        scaledMove(
          {
            id: 'payoff-slam',
            name: 'Payoff Slam',
            pattern: { anchor: 'payoff', shape: 'line3' },
            powerBp: 15_000,
            every: 3,
          },
          st,
        ),
      ),
  },
  {
    id: 'grudge',
    name: 'Grudge',
    asks: 'It hits whoever dealt the most last round.',
    apply: (b, st = 10_000) => ({
      ...b,
      plain: {
        ...b.plain,
        pattern: { anchor: 'grudge', shape: 'single' },
        powerBp: Math.floor((b.plain.powerBp * (10_000 + share(5_000, st))) / 10_000),
      },
    }),
  },
  {
    id: 'great-wave',
    name: 'Great Wave',
    asks: 'Every 3 rounds a Wind-up sweep of a row, announced at round start; who stands there?',
    apply: (b, st = 10_000) =>
      addMove(
        b,
        scaledMove(
          {
            id: 'great-wave',
            name: 'Great Wave',
            pattern: { anchor: 'random', shape: 'randomRow' },
            powerBp: 18_000,
            every: 3,
            charged: true,
          },
          st,
        ),
      ),
  },
  {
    id: 'swarm',
    name: 'Swarm',
    asks: 'Many small hits on random slots; does armour or dodge hold?',
    apply: (b, st = 10_000) => ({
      ...b,
      plain: {
        pattern: { anchor: 'random', shape: 'single' },
        powerBp: 4_500,
        hits: Math.max(1, Math.round((4 * st) / 10_000)),
      },
    }),
  },
  {
    id: 'crusher',
    name: 'Crusher',
    asks: 'One huge hit on the strongest every third round.',
    apply: (b, st = 10_000) =>
      addMove(
        b,
        scaledMove(
          {
            id: 'crush',
            name: 'Crush',
            pattern: { anchor: 'strongest', shape: 'single' },
            powerBp: 40_000,
            every: 3,
          },
          st,
        ),
      ),
  },
  {
    id: 'fizzle',
    name: 'Fizzle',
    asks: 'A mark left by a reaction cannot be cashed until after the next boss turn; do your chains cross rows?',
    apply: (b, st = 10_000) => ({ ...b, strengthBp: st, mods: { ...b.mods, fizzle: true } }),
  },
  {
    id: 'shake-it-off',
    name: 'Shake It Off',
    asks: 'Every 3 rounds the boss clears all its debuffs, announced at round start; can you put them back?',
    apply: (b, st = 10_000) => ({ ...b, strengthBp: st, mods: { ...b.mods, shakeEvery: 3 } }),
  },
  {
    id: 'adapts',
    name: 'Reaction Resistance',
    raidOnly: true,
    asks: 'Raid only: from stage 2 it resists your most-used reaction.',
    apply: (b, st = 10_000) => ({ ...b, strengthBp: st, mods: { ...b.mods, adapts: true } }),
  },
  {
    id: 'adapts-element',
    name: 'Element Resistance',
    raidOnly: true,
    asks: 'Raid only: from stage 2 the element that dealt the most damage hits it a quarter softer; is your team more than one element?',
    apply: (b, st = 10_000) => ({ ...b, strengthBp: st, mods: { ...b.mods, adaptsElement: true } }),
  },
];

export function card(id: string): CardDef {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
}

/** A lab boss: a neutral element (no matchups), huge HP for damage tests unless given. */
export function labBoss(opts: {
  rows: number;
  cols: number;
  cards?: readonly string[];
  hp?: number;
  atk?: number;
  rounds?: number;
}): BossDef {
  let boss: BossDef = {
    id: 'lab-golem',
    name: 'Lab Golem',
    element: 'neutral',
    hp: opts.hp ?? 1_000_000,
    atk: opts.atk ?? 110,
    armour: 20,
    spd: 50,
    rounds: opts.rounds ?? 10,
    rows: opts.rows,
    cols: opts.cols,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    moves: [],
    cards: opts.cards ?? [],
    mods: {},
  };
  for (const id of opts.cards ?? []) boss = card(id).apply(boss);
  return boss;
}
