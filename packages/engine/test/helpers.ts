import {
  RULES,
  content,
  createSeededRng,
  type BossDef,
  type ContentPack,
  type Element,
  type FinaleAbilityDef,
  type Role,
} from '@creatures/game';
import {
  makeSlot,
  scaleBoss,
  type AbilityChoice,
  type FightInput,
  type FightSlot,
  type PhaseId,
} from '../src/index';

/**
 * The M3 basic abilities (Rally +40% for the round, Shield Wall stops all damage for the round,
 * Re-mark, Purge for the rest of the fight), pinned so the hand-checked numbers in these tests do
 * not move when the balance simulator retunes the shipped abilities.
 */
const M3_EFFECTS: Record<string, FinaleAbilityDef['effects']> = {
  rally: [{ op: 'rally', damageBp: 4_000, rounds: 1 }],
  'shield-wall': [{ op: 'shield_wall', zone: 'choose', reduceBp: 10_000, rounds: 1 }],
  're-mark': [{ op: 're_mark', element: 'choose' }],
  purge: [{ op: 'purge' }],
};

/** Ability definitions used only by tests (ids are not in the shipped content). */
const TEST_ABILITIES: FinaleAbilityDef[] = [
  {
    id: 'test-strike',
    name: 'Test Strike',
    description: 'Hits at once for 200% of Attack.',
    kind: 'creature',
    effects: [{ op: 'strike', atkBp: 20_000 }],
    defaultRound: 2,
  },
  {
    id: 'test-half-wall',
    name: 'Test Half Wall',
    description: 'One chosen zone takes 50% less damage for 2 rounds.',
    kind: 'creature',
    effects: [{ op: 'shield_wall', zone: 'choose', reduceBp: 5_000, rounds: 2 }],
    defaultRound: 2,
  },
  {
    id: 'test-guard',
    name: 'Test Guard',
    description: 'Its zone takes 50% less damage for 2 rounds.',
    kind: 'creature',
    effects: [{ op: 'shield_wall', zone: 'own', reduceBp: 5_000, rounds: 2 }],
    defaultRound: 2,
  },
  {
    id: 'test-setter',
    name: 'Test Setter',
    description: 'Marks the boss with its own element and rallies 10% for 2 rounds.',
    kind: 'creature',
    effects: [
      { op: 're_mark', element: 'own' },
      { op: 'rally', damageBp: 1_000, rounds: 2 },
    ],
    defaultRound: 3,
  },
  {
    id: 'test-purge',
    name: 'Test Purge',
    description: 'Removes the adaptation for 2 rounds.',
    kind: 'creature',
    effects: [{ op: 'purge', rounds: 2 }],
    defaultRound: 2,
  },
  {
    id: 'test-combo',
    name: 'Test Combo',
    description: 'A strike, then its own mark.',
    kind: 'creature',
    effects: [
      { op: 'strike', atkBp: 10_000 },
      { op: 're_mark', element: 'own' },
    ],
    defaultRound: 2,
  },
];

/**
 * The shipped content with the reaction multipliers pinned to the original design values (x2.5,
 * payoff x1.25) and the basic abilities pinned to their M3 values, plus a few test abilities, so
 * the hand-checked numbers in these tests do not move when the balance simulator retunes the
 * shipped content.
 */
export const TEST_PACK: ContentPack = {
  ...content,
  reactions: content.reactions.map((r) => ({ ...r, multiplierBp: 25_000, payoffBonusBp: 12_500 })),
  finaleAbilities: [
    ...content.finaleAbilities.map((a) => {
      const effects = M3_EFFECTS[a.id];
      return a.kind === 'basic' && effects !== undefined ? { ...a, effects } : a;
    }),
    ...TEST_ABILITIES,
  ],
};

export function boss(id: string): BossDef {
  const b = content.bosses.find((x) => x.id === id);
  if (!b) throw new Error(`missing boss ${id}`);
  return b;
}

export function species(id: string) {
  const s = content.creatures.find((x) => x.id === id);
  if (!s) throw new Error(`missing species ${id}`);
  return s;
}

/** A slot with exact stats, for hand-checkable fights. */
export function slot(
  id: string,
  options: {
    owner?: string | null;
    element?: Element;
    role?: Role;
    hp?: number;
    atk?: number;
    spd?: number;
  } = {},
): FightSlot {
  return {
    id,
    ownerId: options.owner === undefined ? 'p1' : options.owner,
    name: id,
    speciesId: 'splashet',
    element: options.element ?? 'tide',
    role: options.role ?? 'setter',
    level: 1,
    fusionCount: 0,
    stats: { hp: options.hp ?? 100_000, atk: options.atk ?? 100, spd: options.spd ?? 10 },
  };
}

/** A fight input with a plain boss (no gimmicks) unless overridden. */
export function input(row: FightSlot[], overrides: Partial<FightInput> = {}): FightInput {
  const base = boss('tidal-colossus');
  const owners = [...new Set(row.map((s) => s.ownerId).filter((o): o is string => o !== null))];
  return {
    boss: { ...base, gimmicks: [], element: 'tide' },
    bossAtk: 1,
    phase: 'phase1',
    bossHpPool: { max: 1_000_000, current: 1_000_000 },
    adaptation: null,
    row,
    players: owners.length > 0 ? owners : ['p1'],
    finaleAbilities: [],
    ...overrides,
  };
}

export const rng = () => createSeededRng('test');

/** A deterministic pseudo-random roster for property and performance tests. */
export function randomInput(seed: string, playerCount: number, phase: PhaseId): FightInput {
  const r = createSeededRng(seed);
  const pick = (n: number) => r.nextU32() % n;
  const stage1 = content.creatures.filter((c) => c.stage === 1);
  const row: FightSlot[] = [];
  const players: string[] = [];
  for (let p = 0; p < playerCount; p++) {
    const owner = `player-${p}`;
    players.push(owner);
    for (let k = 0; k < 3; k++) {
      const sp = stage1[pick(stage1.length)] ?? species('splashet');
      const level = 1 + pick(sp.levelCap);
      row.push(makeSlot(sp, { id: `${owner}-c${k}`, ownerId: owner, level, fusionCount: pick(6) }));
    }
  }
  // Shuffle positions deterministically.
  for (let i = row.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [row[i], row[j]] = [row[j] as FightSlot, row[i] as FightSlot];
  }
  const b = content.bosses[pick(content.bosses.length)] ?? boss('tidal-colossus');
  const avg = Math.floor(row.reduce((s, c) => s + c.level, 0) / row.length);
  // The average level stands in for a rank here (random rows of every strength get a boss of a
  // comparable strength); capped so Attack stays sensible.
  const scaled = scaleBoss(b, playerCount, Math.min(avg, 8));
  const rule = content.adaptations.find((a) => a.id === b.adaptation);
  const basics = content.finaleAbilities.filter((a) => a.kind === 'basic');
  const abilities: AbilityChoice[] = players.map((playerId, i) => {
    const def = basics[i % basics.length];
    return {
      playerId,
      abilityId: def?.id ?? 'rally',
      key: `${playerId}:basic`,
      ...(i % 2 === 0 ? { fireAtRound: 1 + pick(12) } : {}),
    };
  });
  // Creature abilities of every creature at the unlock level or above (several per player).
  for (const s of row) {
    const abilityId = species(s.speciesId).ability?.id;
    if (abilityId === undefined || s.ownerId === null || s.level < RULES.abilities.unlockLevel) {
      continue;
    }
    abilities.push({
      playerId: s.ownerId,
      abilityId,
      key: `${s.id}:ability`,
      creatureId: s.id,
      ...(pick(2) === 0 ? { fireAtRound: 1 + pick(12) } : {}),
    });
  }
  return {
    boss: b,
    bossAtk: scaled.atk,
    phase,
    bossHpPool: {
      max: scaled.maxHp,
      current: pick(3) === 0 ? Math.floor(scaled.maxHp / 2) : scaled.maxHp,
    },
    adaptation:
      pick(2) === 0 && rule ? { rule: rule.id, target: pick(2) === 0 ? 'steam' : 'tide' } : null,
    row,
    players,
    finaleAbilities: abilities,
  };
}

import { simulateFight, type FightEvent, type FightResult } from '../src/index';

/** Runs a fight with the fixed test RNG. */
export function run(
  row: FightSlot[],
  overrides: Partial<FightInput> = {},
  options?: Parameters<typeof simulateFight>[2],
): FightResult {
  return simulateFight(input(row, overrides), rng(), { pack: TEST_PACK, ...options });
}

export function eventsOf<T extends FightEvent['t']>(
  result: FightResult,
  t: T,
): Extract<FightEvent, { t: T }>[] {
  return result.events.filter((e): e is Extract<FightEvent, { t: T }> => e.t === t);
}

/** Events that happened in one round. */
export function inRound(result: FightResult, round: number): FightEvent[] {
  return result.events.filter((e) => 'round' in e && e.round === round);
}
