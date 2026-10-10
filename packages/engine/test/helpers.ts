import {
  content,
  createSeededRng,
  type BossDef,
  type ContentPack,
  type Element,
  type Role,
} from '@creatures/game';
import { makeSlot, scaleBoss, type FightInput, type FightSlot, type PhaseId } from '../src/index';

/**
 * The shipped content with the reaction multipliers pinned to the original design values (x2.5,
 * payoff x1.25), so the hand-checked numbers in these tests do not move when the balance
 * simulator retunes the shipped reactions.
 */
export const TEST_PACK: ContentPack = {
  ...content,
  reactions: content.reactions.map((r) => ({ ...r, multiplierBp: 25_000, payoffBonusBp: 12_500 })),
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
  const scaled = scaleBoss(b, playerCount, avg);
  const rule = content.adaptations.find((a) => a.id === b.adaptation);
  const abilities = players.map((playerId, i) => {
    const def = content.finaleAbilities[i % content.finaleAbilities.length];
    return {
      playerId,
      abilityId: def?.id ?? 'rally',
      ...(i % 2 === 0 ? { fireAtRound: 1 + pick(12) } : {}),
    };
  });
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
