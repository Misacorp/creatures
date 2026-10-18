import { createSeededRng, type BossDef, type LuckConfig, type Role } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { simulateFight, type FightInput, type FightSlot, type PhaseId } from '../src/index';
import fixture from './fixtures/replay.json';
import { TEST_PACK, slot } from './helpers';

/**
 * Replay equality (docs/design/attack-patterns.md, slice 0 and risk 9): a fixed set of 480 fights
 * (40 seeded rosters x the 4 raid bosses as they were before attack patterns x 3 phases), each
 * reduced to a hash of its whole result, is stored in `fixtures/replay.json`. An input without
 * `rules` and a boss without pattern ops must reproduce its fight exactly, for ever: this is what
 * keeps stored fights replaying. If this fails, an engine change moved old behaviour or old dice.
 *
 * Re-pins (an intended engine change moves results; say which fights moved and why):
 * - 2026-10-18, E3: Backdraft is announced once per armed round (the duplicate `gimmick` event on
 *   the boss's turn is gone). The 120 fights against the pinned Cinder Wyrm (the only boss with
 *   the trap) changed their event lists only; the other 360 are untouched. Outcome, rounds, HP,
 *   credit and every other event are identical (checked by hashing each result with its events
 *   removed, and the events without the trap's announcements, before and after the change).
 *
 * The bosses' gimmicks, the creature stats, the luck and the abilities are pinned in this file, so
 * a content retune never touches the fixture.
 */

/** The four raid bosses exactly as shipped before attack patterns, copied here on purpose. */
const PINNED_BOSSES: BossDef[] = [
  {
    id: 'tidal-colossus',
    name: 'Tidal Colossus',
    element: 'tide',
    baseHp: 7344,
    baseAtk: 30,
    turnOrder: 'left_to_right',
    gimmicks: [
      {
        id: 'undertow',
        name: 'Undertow',
        trigger: { every: 3 },
        op: 'hit_zone',
        zone: 'front',
        power: 8000,
      },
    ],
    adaptation: 'resist-top-reaction',
    lootTable: 'tidal-colossus',
    finaleRounds: 12,
    hpExponent: { num: 107, den: 100 },
  },
  {
    id: 'cinder-wyrm',
    name: 'Cinder Wyrm',
    element: 'ember',
    baseHp: 2916,
    baseAtk: 30,
    turnOrder: 'speed',
    gimmicks: [
      {
        id: 'backdraft',
        name: 'Backdraft',
        trigger: { eachRound: true },
        op: 'reflect_first_reaction',
      },
    ],
    adaptation: 'resist-top-element',
    lootTable: 'cinder-wyrm',
    finaleRounds: 12,
    hpExponent: { num: 123, den: 100 },
  },
  {
    id: 'thornmother',
    name: 'Thornmother',
    element: 'grove',
    baseHp: 6729,
    baseAtk: 30,
    turnOrder: 'right_to_left',
    gimmicks: [
      {
        id: 'bramble-bind',
        name: 'Bramble Bind',
        trigger: { every: 2 },
        op: 'silence_ends',
        scope: 'row',
        turns: 1,
      },
    ],
    adaptation: 'resist-top-reaction',
    lootTable: 'thornmother',
    finaleRounds: 12,
    hpExponent: { num: 104, den: 100 },
  },
  {
    id: 'storm-sovereign',
    name: 'Storm Sovereign',
    element: 'spark',
    baseHp: 5423,
    baseAtk: 30,
    turnOrder: 'left_to_right',
    gimmicks: [
      {
        id: 'lightning-rod',
        name: 'Lightning Rod',
        trigger: { eachRound: true },
        op: 'strike_highest_atk',
        power: 12000,
      },
    ],
    adaptation: 'resist-top-element',
    lootTable: 'storm-sovereign',
    finaleRounds: 12,
    hpExponent: { num: 115, den: 100 },
  },
];

const PHASES: PhaseId[] = ['phase1', 'phase2', 'finale'];
const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];
const ROLES: Role[] = ['setter', 'payoff', 'guard', 'support', 'payoff', 'setter'];
const ELEMENTS = ['tide', 'ember', 'grove', 'spark'] as const;

/** Pinned luck (not `RULES`): every die kind that exists, on for the odd rosters. */
const LUCK: LuckConfig = {
  critChanceBp: 500,
  critBp: 5_000,
  critMaxChanceBp: 3_000,
  critMaxBp: 15_000,
  bossCritChanceBp: 500,
  bossCritBp: 5_000,
  bossRandomTargetBp: 1_500,
  spreadBp: 500,
  surgeChanceBp: 600,
  slumpChanceBp: 600,
  swingBp: 1_500,
  swingRounds: 2,
};

/** A 53-bit string hash (cyrb53): enough to tell two event logs apart. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function replayInput(rosterIdx: number, bossIdx: number, phase: PhaseId): FightInput {
  const r = createSeededRng(`replay-roster-${String(rosterIdx)}`);
  const pick = (n: number) => r.nextU32() % n;
  const playerCount = PARTY_SIZES[rosterIdx % PARTY_SIZES.length] as number;
  const players = Array.from({ length: playerCount }, (_, p) => `p${String(p)}`);
  const row: FightSlot[] = [];
  for (const owner of players) {
    for (let k = 0; k < 3; k++) {
      row.push(
        slot(`${owner}-c${String(k)}`, {
          owner,
          element: ELEMENTS[pick(4)] as (typeof ELEMENTS)[number],
          role: ROLES[pick(ROLES.length)] as Role,
          hp: 250 + pick(400),
          atk: 30 + pick(110),
          spd: 5 + pick(30),
        }),
      );
    }
  }
  for (let i = row.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [row[i], row[j]] = [row[j] as FightSlot, row[i] as FightSlot];
  }
  const maxHp = 2_500 * playerCount + pick(30_000);
  const basics = ['rally', 'shield-wall', 're-mark', 'purge'];
  return {
    boss: PINNED_BOSSES[bossIdx] as BossDef,
    bossAtk: 40 + pick(60),
    phase,
    bossHpPool: { max: maxHp, current: pick(3) === 0 ? Math.floor(maxHp / 2) : maxHp },
    adaptation: pick(2) === 0 ? { rule: 'resist-top-element', target: 'tide' } : null,
    row,
    players,
    finaleAbilities: players.map((playerId, i) => ({
      playerId,
      abilityId: basics[i % basics.length] as string,
      key: `${playerId}:basic`,
      ...(i % 2 === 0 ? { fireAtRound: 1 + pick(12) } : {}),
    })),
    ...(rosterIdx % 2 === 1 ? { luck: LUCK } : {}),
  };
}

function fingerprints(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let roster = 0; roster < 40; roster++) {
    for (let b = 0; b < PINNED_BOSSES.length; b++) {
      for (const phase of PHASES) {
        const key = `${String(roster)}:${(PINNED_BOSSES[b] as BossDef).id}:${phase}`;
        const input = replayInput(roster, b, phase);
        const rng = createSeededRng(`replay-fight-${key}`);
        const r = simulateFight(input, rng, { pack: TEST_PACK });
        // The fields that existed before attack patterns, so a later new result field is no drift.
        const old = {
          rounds: r.rounds,
          bossHpEnd: r.bossHpEnd,
          cleared: r.cleared,
          events: r.events,
          perPlayer: r.perPlayer,
          perCreature: r.perCreature,
          hpEnd: r.hpEnd,
        };
        out[key] = hash(JSON.stringify(old));
      }
    }
  }
  return out;
}

describe('replay equality', () => {
  it('reproduces 480 stored fights (inputs without rules, bosses without pattern ops)', () => {
    const now = fingerprints();
    expect(Object.keys(now)).toHaveLength(480);
    expect(Object.keys(fixture)).toHaveLength(480);
    const moved = Object.keys(now).filter((k) => now[k] !== (fixture as Record<string, string>)[k]);
    expect(moved).toEqual([]);
  });

  it('uses fights that really play out (not all instant wins or wipes)', () => {
    const rounds = new Set<number>();
    for (let roster = 0; roster < 40; roster += 7) {
      const input = replayInput(roster, roster % 4, 'finale');
      rounds.add(
        simulateFight(input, createSeededRng(`r-${String(roster)}`), { pack: TEST_PACK }).rounds,
      );
    }
    expect(rounds.size).toBeGreaterThan(1);
  });
});
