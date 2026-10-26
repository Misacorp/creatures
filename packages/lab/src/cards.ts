import type { BossDef, BossMove } from './types';

/**
 * Boss rule cards (docs/design/combat-v2.md, "Rule cards"). Each one asks the team a question and
 * should have at least two answers from different tools.
 */
export interface CardDef {
  readonly id: string;
  readonly name: string;
  readonly asks: string;
  readonly apply: (boss: BossDef) => BossDef;
}

const addMove = (boss: BossDef, move: BossMove): BossDef => ({
  ...boss,
  moves: [...boss.moves, move],
});

export const CARDS: readonly CardDef[] = [
  { id: 'plain', name: 'No card', asks: 'Baseline.', apply: (b) => b },
  {
    id: 'thick-hide',
    name: 'Thick Hide',
    asks: 'Small hits are Blocked; can you land big ones?',
    apply: (b) => ({ ...b, armour: b.armour + 70 }),
  },
  {
    id: 'stone-skin',
    name: 'Stone Skin',
    asks: 'No hit deals more than a cap; can you hit often?',
    apply: (b) => ({ ...b, mods: { ...b.mods, capPerHit: 260 } }),
  },
  {
    id: 'clean-scales',
    name: 'Clean Scales',
    asks: 'Marks are shed after every boss turn; are Setter and Payoff in the same row?',
    apply: (b) => ({ ...b, mods: { ...b.mods, shedMarks: true } }),
  },
  {
    id: 'reflective-hide',
    name: 'Reflective Hide',
    asks: 'The first reaction after each boss turn bounces back; can your Payoff take it?',
    apply: (b) => ({ ...b, mods: { ...b.mods, reflectFirst: true } }),
  },
  {
    id: 'elusive',
    name: 'Elusive',
    asks: 'The boss dodges a lot; can you make hits land?',
    apply: (b) => ({ ...b, spd: b.spd + 300 }),
  },
  {
    id: 'bramble-bind',
    name: 'Bramble Bind',
    asks: 'The ends of every row are silenced; who stands at the ends?',
    apply: (b) =>
      addMove(b, {
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
    apply: (b) => ({ ...b, atk: Math.floor(b.atk * 1.2), mods: { ...b.mods, healBp: 5_000 } }),
  },
  {
    id: 'payoff-hunter',
    name: 'Payoff Hunter',
    asks: 'It slams your strongest Payoff and the slots beside it; is a Guard there?',
    apply: (b) =>
      addMove(b, {
        id: 'payoff-slam',
        name: 'Payoff Slam',
        pattern: { anchor: 'payoff', shape: 'line3' },
        powerBp: 22_000,
        every: 2,
      }),
  },
  {
    id: 'grudge',
    name: 'Grudge',
    asks: 'It hits whoever dealt the most last round.',
    apply: (b) => ({
      ...b,
      plain: {
        ...b.plain,
        pattern: { anchor: 'grudge', shape: 'single' },
        powerBp: Math.floor(b.plain.powerBp * 1.5),
      },
    }),
  },
  {
    id: 'great-wave',
    name: 'Great Wave',
    asks: 'A telegraphed sweep of a whole row every third round.',
    apply: (b) =>
      addMove(b, {
        id: 'great-wave',
        name: 'Great Wave',
        pattern: { anchor: 'random', shape: 'randomRow' },
        powerBp: 25_000,
        every: 3,
        charged: true,
      }),
  },
  {
    id: 'swarm',
    name: 'Swarm',
    asks: 'Many small hits on random slots; does armour or dodge hold?',
    apply: (b) => ({
      ...b,
      plain: { pattern: { anchor: 'random', shape: 'single' }, powerBp: 4_500, hits: 4 },
    }),
  },
  {
    id: 'crusher',
    name: 'Crusher',
    asks: 'One huge hit on the strongest every third round.',
    apply: (b) =>
      addMove(b, {
        id: 'crush',
        name: 'Crush',
        pattern: { anchor: 'strongest', shape: 'single' },
        powerBp: 40_000,
        every: 3,
      }),
  },
  {
    id: 'adapts',
    name: 'Adapts',
    asks: 'Raid only: from stage 2 it resists your most-used reaction.',
    apply: (b) => ({ ...b, mods: { ...b.mods, adapts: true } }),
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
