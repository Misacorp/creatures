import {
  createSeededRng,
  type AdaptationDef,
  type BossDef,
  type ContentPack,
  type Element,
  type Gimmick,
  type LuckConfig,
  type Role,
  type Zone,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  compactRow,
  resolveMods,
  simulateFight,
  sparseBoard,
  type AbilityChoice,
  type FightInput,
  type FightResult,
  type FightRules,
  type FightSlot,
  type PhaseId,
  type SlotMods,
} from '../src/index';
import { NO_MODS } from '../src/mods';
import fixture from './fixtures/replay-rules.json';
import { TEST_PACK, slot } from './helpers';

/**
 * Replay equality for the rest of the engine (backend audit B13, step 1): `replay.test.ts` locks
 * fights without `rules`, patterns, gear, luck dice beyond the plain ones or weather. This is its
 * twin for the paths a refactor of `fight.ts` would most likely disturb. 200 fixed seeded fights
 * (25 rosters x 8 pinned bosses) use every input field the worker and the simulator fill in: the
 * combat `rules`, every attack pattern and charge, sparse boards, the Guard reach of the dungeon,
 * the phase floor, enrage, extra boss attacks, luck of every kind, the day's sky (Kind Rain, Morning
 * Haze, Bramble Season), Phase 2 adaptations, creature abilities, partial HP, and a modifier sheet
 * on most creatures that stands for gear, gear sets, talents and weather (the engine reads only
 * numbers, so a sheet of numbers is exactly what the worker hands it). Each result, whole, is
 * reduced to a hash and stored in `fixtures/replay-rules.json`. If this fails, an engine change
 * moved how a fight plays out or which dice it draws.
 *
 * Everything the fights read from outside the engine is pinned in this file (bosses, rules, luck,
 * sheets, abilities, adaptations), so a content retune never touches the fixture. The "covers"
 * tests below stop the set drifting into fights that never reach a path (every sheet field, every
 * kind of event).
 *
 * Re-pins (an intended engine change moves results; say which fights moved and why):
 * - 2026-10-18, E3: Backdraft is announced once per armed round (the duplicate `gimmick` event on
 *   the boss's turn is gone). The 20 fights against the pinned Lock Trap that armed the trap
 *   changed their event lists only; the outcome, HP and credit of every fight were identical
 *   (checked by hashing each result with its events removed, before and after).
 * - 2026-10-18, E4: Hollow Weave's heal is changed by the wearer's `healReceivedBp` like every other
 *   heal. 13 fights moved (3:lock-wave, 3:lock-line, 6:lock-lance, 7:lock-wave, 8:lock-wave,
 *   11:lock-wave, 14:lock-line, 15:lock-volley, 19:lock-charge, 21:lock-wave, 22:lock-wave,
 *   22:lock-volley, 22:lock-slam). Only a creature with both `healOnReactionBp` and a non-zero
 *   `healReceivedBp` can change, and no other fight moved. `replay.json` did not move.
 */

const ELEMENTS: readonly Element[] = ['tide', 'ember', 'grove', 'spark'];
const ROLES: readonly Role[] = [
  'setter',
  'payoff',
  'guard',
  'support',
  'payoff',
  'setter',
  'guard',
];
const PHASES: readonly PhaseId[] = ['phase1', 'phase2', 'finale'];
const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8, 10] as const;
const ZONE_IDS: readonly Zone[] = ['front', 'middle', 'back'];

/** Pinned luck: every die kind there is. */
const LUCK: LuckConfig = {
  critChanceBp: 700,
  critBp: 5_000,
  critMaxChanceBp: 3_500,
  critMaxBp: 15_000,
  bossCritChanceBp: 600,
  bossCritBp: 5_000,
  bossRandomTargetBp: 1_500,
  spreadBp: 500,
  surgeChanceBp: 700,
  slumpChanceBp: 700,
  swingBp: 1_500,
  swingRounds: 2,
};

/** Pinned combat rules, in the shape of `liveFightRules()`. */
const RULES_TABLE: FightRules = {
  coverBp: 4_000,
  maxHitBp: 6_000,
  guardHpBp: 3_000,
  guardArmorBp: 1_500,
  supportFx: {
    tide: { healBp: 400, cleanse: true },
    ember: { buffBp: 2_500 },
    grove: { healBp: 600 },
    spark: { reactionBp: 2_000 },
  },
};

const PINNED_ADAPTATIONS: AdaptationDef[] = [
  {
    id: 'resist-top-reaction',
    name: 'Reaction Resistance',
    kind: 'top_reaction',
    resistBp: 5_000,
    description: 'Pinned for the replay lock.',
  },
  {
    id: 'resist-top-element',
    name: 'Element Resistance',
    kind: 'top_element',
    resistBp: 2_500,
    description: 'Pinned for the replay lock.',
  },
];

/** The shared test pack (pinned reactions and abilities) with the adaptations pinned as well. */
const PACK: ContentPack = { ...TEST_PACK, adaptations: PINNED_ADAPTATIONS };

const g = (id: string, g2: Record<string, unknown>): Gimmick =>
  ({ id, name: id, ...g2 }) as Gimmick;

/** Eight pinned bosses between them using every gimmick op and trigger, plain attacks only for the last. */
const BOSSES: BossDef[] = [
  {
    id: 'lock-wave',
    name: 'Lock Wave',
    element: 'tide',
    baseHp: 5_000,
    baseAtk: 30,
    turnOrder: 'left_to_right',
    gimmicks: [
      g('walk', {
        trigger: { eachRound: true },
        op: 'sweep',
        rows: ['front', 'middle', 'back', 'all'],
        power: 6_000,
      }),
      g('undertow', { trigger: { every: 3 }, op: 'hit_zone', zone: 'back', power: 9_000 }),
    ],
    adaptation: 'resist-top-reaction',
    lootTable: 'lock',
    finaleRounds: 10,
  },
  {
    id: 'lock-volley',
    name: 'Lock Volley',
    element: 'ember',
    baseHp: 5_000,
    baseAtk: 30,
    turnOrder: 'speed',
    gimmicks: [
      g('shells', {
        trigger: { eachRound: true },
        op: 'barrage',
        shells: { min: 2, max: 5, shareBp: 3_000 },
        power: 5_000,
      }),
      g('bind', { trigger: { every: 2 }, op: 'silence_ends', scope: 'rows', turns: 2 }),
      g('bolt', {
        trigger: { every: 3 },
        op: 'strike_highest_atk',
        power: 12_000,
        jumps: 2,
        decayBp: 5_000,
      }),
    ],
    adaptation: 'resist-top-element',
    lootTable: 'lock',
    finaleRounds: 12,
  },
  {
    id: 'lock-slam',
    name: 'Lock Slam',
    element: 'grove',
    baseHp: 5_000,
    baseAtk: 30,
    turnOrder: 'right_to_left',
    gimmicks: [
      g('slam-strong', {
        trigger: { eachRound: true },
        op: 'slam',
        aim: 'strongest',
        power: 14_000,
        splashBp: 4_000,
      }),
      g('slam-random', {
        trigger: { every: 2 },
        op: 'slam',
        aim: 'random',
        power: 9_000,
        splashBp: 3_000,
      }),
      g('slam-payoff', {
        trigger: { every: 3 },
        op: 'slam',
        aim: 'payoff',
        power: 10_000,
        splashBp: 2_000,
      }),
      g('slam-left', {
        trigger: { every: 4 },
        op: 'slam',
        aim: 'left',
        power: 8_000,
        splashBp: 5_000,
      }),
      g('slam-front', {
        trigger: { every: 5 },
        op: 'slam',
        aim: 'front',
        power: 8_000,
        splashBp: 5_000,
      }),
    ],
    adaptation: 'resist-top-reaction',
    lootTable: 'lock',
    finaleRounds: 12,
  },
  {
    id: 'lock-lance',
    name: 'Lock Lance',
    element: 'spark',
    baseHp: 5_000,
    baseAtk: 30,
    turnOrder: 'left_to_right',
    gimmicks: [
      g('lance-strong', {
        trigger: { eachRound: true },
        op: 'lance',
        lane: 'strongest',
        power: 9_000,
        falloffBp: 7_000,
      }),
      g('lance-random', {
        trigger: { every: 2 },
        op: 'lance',
        lane: 'random',
        power: 8_000,
        falloffBp: 5_000,
      }),
      g('pinch', { trigger: { every: 3 }, op: 'pincer', scope: 'rows', power: 9_000 }),
      g('payoff-sweep', {
        trigger: { every: 4 },
        op: 'sweep',
        rows: ['payoffs'],
        power: 8_000,
      }),
    ],
    adaptation: 'resist-top-element',
    lootTable: 'lock',
    finaleRounds: 12,
  },
  {
    id: 'lock-charge',
    name: 'Lock Charge',
    element: 'tide',
    baseHp: 5_000,
    baseAtk: 30,
    turnOrder: 'speed',
    gimmicks: [
      g('c-sweep', {
        trigger: { every: 3 },
        op: 'charge',
        then: { op: 'sweep', rows: ['front', 'back'], power: 14_000 },
      }),
      g('c-slam', {
        trigger: { every: 2 },
        op: 'charge',
        then: { op: 'slam', aim: 'strongest', power: 16_000, splashBp: 4_000 },
      }),
      g('c-barrage', {
        trigger: { every: 4 },
        op: 'charge',
        then: { op: 'barrage', shells: { min: 1, max: 4, shareBp: 2_500 }, power: 12_000 },
      }),
      g('c-lance', {
        trigger: { every: 5 },
        op: 'charge',
        then: { op: 'lance', lane: 'random', power: 12_000, falloffBp: 6_000 },
      }),
      g('c-pincer', {
        trigger: { every: 6 },
        op: 'charge',
        then: { op: 'pincer', scope: 'rows', power: 12_000 },
      }),
    ],
    adaptation: 'resist-top-reaction',
    lootTable: 'lock',
    finaleRounds: 12,
  },
  {
    id: 'lock-trap',
    name: 'Lock Trap',
    element: 'ember',
    baseHp: 5_000,
    baseAtk: 30,
    turnOrder: 'left_to_right',
    gimmicks: [
      g('backdraft', { trigger: { eachRound: true }, op: 'reflect_first_reaction' }),
      g('rod', { trigger: { eachRound: true }, op: 'strike_highest_atk', power: 11_000 }),
    ],
    adaptation: 'resist-top-element',
    lootTable: 'lock',
    finaleRounds: 12,
  },
  {
    id: 'lock-line',
    name: 'Lock Line',
    element: 'grove',
    baseHp: 5_000,
    baseAtk: 30,
    turnOrder: 'right_to_left',
    gimmicks: [
      g('ends', { trigger: { every: 2 }, op: 'silence_ends', scope: 'row', turns: 3 }),
      g('pinch-row', { trigger: { every: 3 }, op: 'pincer', scope: 'row', power: 10_000 }),
      g('sweep-all', { trigger: { every: 4 }, op: 'sweep', rows: ['all'], power: 7_000 }),
      g('hit-mid', { trigger: { eachRound: true }, op: 'hit_zone', zone: 'middle', power: 5_000 }),
    ],
    adaptation: 'resist-top-reaction',
    lootTable: 'lock',
    finaleRounds: 12,
  },
  {
    id: 'lock-plain',
    name: 'Lock Plain',
    element: 'spark',
    baseHp: 5_000,
    baseAtk: 30,
    turnOrder: 'speed',
    gimmicks: [],
    adaptation: 'resist-top-element',
    lootTable: 'lock',
    finaleRounds: 12,
  },
];

/**
 * Modifier sheets, each a plain literal in the units of `SlotMods`. Between them they name every
 * field (checked below). They stand for gear lines, the six set effects, position lines, talents
 * and weather (Long Shadows, Lantern Light and so on) as the worker folds them.
 */
const SHEETS: SlotMods[] = [
  { vsElementBp: { tide: 1_500, ember: 500, spark: 2_000 }, markedFoeBp: 800 },
  { firstHitBp: 3_000, markingHitBp: 1_500, strikeBp: 2_000 },
  { besideRoleBp: { guard: 1_000, support: 1_500, payoff: 500 }, pierceBp: 3_000 },
  {
    reactionBp: { steam: 2_000, wildfire: 1_500, grounding: 1_000, overload: 2_500 },
    pounceBp: 500,
    ownerMarkBp: 1_000,
    keenReactionBp: 1_500,
  },
  // dodgeBp and areaDodgeBp do nothing in these fights: their rules carry no dodge.
  {
    shareBp: 2_500,
    boostBp: 1_200,
    mendBp: 300,
    sharedWarmthBp: 1_000,
    dodgeBp: 500,
    areaDodgeBp: 300,
  },
  { takenBp: 1_000, areaBp: 1_500, aimedBp: 1_500, reflectedBp: 2_500, chargedBp: 2_000 },
  { wardBp: { tide: 2_000, ember: 1_000, spark: 1_500, grove: 500 }, healReceivedBp: 3_500 },
  { armorBp: 1_000, coverBp: 1_500, shelterBp: 1_000, coverReach: 1, boostReach: 1 },
  { lingerRounds: 1, ignoreSilence: 1, lastStandBp: 2_500, stubborn: 1 },
  // The six 3-piece set effects.
  { unreflected: 1, critWindowBp: 2_000, healOnReactionBp: 300 },
  {
    chainMark: 1,
    sealMark: 1,
    firstReactionCrit: 1,
    healOnReactionBp: 500,
    healReceivedBp: -2_500,
  },
  { secondWindBp: 3_000, echoBp: 2_500, sidestepBp: 2_000, steadyPawsBp: 3_000 },
  { warmHeartBp: 3_000, quickRemarkBp: 3_000, spillOverBp: 3_000, lingerRounds: 2 },
  { paybackBp: 1_500, kindlingBp: 1_200, openingMark: 1, rallyCryBp: 800 },
  { emberTailBp: 1_500, stormWarningBp: 2_500, overflowBp: 1_500, secondBreathBp: 1_500 },
  { patientBp: 2_000, secondBreathBp: 2_000, takenBp: -1_500, lingerRounds: 1 },
  { markedFoeBp: -500, mendBp: 500, healReceivedBp: 2_000 },
];

/** A 53-bit string hash (cyrb53): enough to tell two results apart. */
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

const ROSTERS = 25;

function ruleInput(rosterIdx: number, bossIdx: number): FightInput {
  const r = createSeededRng(`replay-rules-roster-${String(rosterIdx)}-${String(bossIdx)}`);
  const pick = (n: number) => r.nextU32() % n;
  const phase = PHASES[(rosterIdx + bossIdx) % PHASES.length] as PhaseId;
  const playerCount = PARTY_SIZES[rosterIdx % PARTY_SIZES.length] as number;
  const players = Array.from({ length: playerCount }, (_, p) => `p${String(p)}`);
  const dense: FightSlot[] = [];
  for (const owner of players) {
    for (let k = 0; k < 3; k++) {
      const base = slot(`${owner}-c${String(k)}`, {
        owner,
        element: ELEMENTS[pick(4)] as Element,
        role: ROLES[pick(ROLES.length)] as Role,
        hp: 250 + pick(500),
        atk: 30 + pick(120),
        spd: 5 + pick(30),
      });
      const s: FightSlot = { ...base };
      if (pick(3) > 0) {
        const first = SHEETS[pick(SHEETS.length)] as SlotMods;
        const second = pick(3) === 0 ? (SHEETS[pick(SHEETS.length)] as SlotMods) : {};
        s.mods = { ...first, ...second };
      }
      if (pick(5) === 0) s.crit = { chanceBp: 500 + pick(1_500), damageBp: 1_000 + pick(3_000) };
      if (pick(7) === 0) s.hp = 1 + pick(s.stats?.hp ?? 100);
      dense.push(s);
    }
  }
  for (let i = dense.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [dense[i], dense[j]] = [dense[j] as FightSlot, dense[i] as FightSlot];
  }
  // Every other roster stands on a sparse board with gaps, as a raid board does.
  let row: FightSlot[] = dense;
  let board: FightInput['board'];
  if (rosterIdx % 2 === 1) {
    const sparse: (FightSlot | null)[] = [];
    for (const s of dense) {
      if (pick(3) === 0) sparse.push(null);
      sparse.push(s);
    }
    while (sparse.length % 3 !== 0 || pick(4) === 0) sparse.push(null);
    row = compactRow(sparse);
    board = sparseBoard(sparse);
  }
  const maxHp = 2_500 * playerCount + pick(30_000);
  const basics = ['rally', 'shield-wall', 're-mark', 'purge'];
  const abilities: AbilityChoice[] = players.map((playerId, i) => {
    const basic = basics[i % basics.length] as string;
    return {
      playerId,
      abilityId: basic,
      key: `${playerId}:basic`,
      ...(i % 2 === 0 ? { fireAtRound: 1 + pick(10) } : {}),
      ...(basic === 'shield-wall' && pick(2) === 0
        ? { params: { zone: ZONE_IDS[pick(3)] as Zone } }
        : {}),
      ...(basic === 're-mark' && pick(2) === 0
        ? { params: { element: ELEMENTS[pick(4)] as Element } }
        : {}),
    };
  });
  const creatureAbilities = ['test-strike', 'test-guard', 'test-setter', 'test-combo'];
  for (const s of row) {
    if (s.ownerId === null || pick(3) !== 0) continue;
    abilities.push({
      playerId: s.ownerId,
      abilityId: creatureAbilities[pick(creatureAbilities.length)] as string,
      key: `${s.id}:ability`,
      creatureId: s.id,
      ...(pick(2) === 0 ? { fireAtRound: 1 + pick(10) } : {}),
    });
  }
  if (playerCount > 0 && pick(2) === 0) {
    abilities.push({
      playerId: players[0] as string,
      abilityId: pick(2) === 0 ? 'test-half-wall' : 'test-purge',
      key: `${players[0] as string}:extra`,
      fireAtRound: 1 + pick(6),
    });
  }
  const rule = PINNED_ADAPTATIONS[pick(2)] as AdaptationDef;
  const adaptation =
    phase === 'phase1' || pick(4) === 0
      ? null
      : {
          rule: rule.id,
          target: rule.kind === 'top_reaction' ? ['steam', 'wildfire'][pick(2)] : ELEMENTS[pick(4)],
        };
  const boss = BOSSES[bossIdx] as BossDef;
  const luckOn = (rosterIdx + bossIdx) % 3 !== 0;
  const sky = pick(2) === 0;
  return {
    boss,
    bossAtk: 40 + pick(70),
    ...(pick(3) === 0 ? { bossAttacks: 2 + pick(2) } : {}),
    phase,
    bossHpPool: { max: maxHp, current: pick(3) === 0 ? Math.floor(maxHp / 2) : maxHp },
    adaptation: adaptation as FightInput['adaptation'],
    row,
    ...(board === undefined ? {} : { board }),
    players,
    finaleAbilities: abilities,
    ...(pick(4) === 0
      ? { turnOrderOverride: (['left_to_right', 'right_to_left', 'speed'] as const)[pick(3)] }
      : {}),
    ...(rosterIdx % 4 === 0 ? { guardReach: 'adjacent' as const } : {}),
    ...(luckOn ? { luck: LUCK } : {}),
    rules: RULES_TABLE,
    ...(phase === 'finale'
      ? {}
      : { bossHpFloor: Math.floor((maxHp * (3_000 + pick(5_000))) / 10_000) }),
    ...(pick(2) === 0 ? { enrage: { rounds: 1 + pick(4), powerBp: 3_000 + pick(5_000) } } : {}),
    ...(sky && pick(2) === 0 ? { rainHealBp: 200 + pick(400) } : {}),
    ...(sky && pick(2) === 0
      ? { skipFirstTurn: row.filter((_, i) => i % 3 === 0).map((s) => s.id) }
      : {}),
    ...(sky && pick(2) === 0 ? { brambleBp: 1_000 + pick(3_000) } : {}),
  };
}

function resultOf(rosterIdx: number, bossIdx: number): FightResult {
  const key = `${String(rosterIdx)}:${(BOSSES[bossIdx] as BossDef).id}`;
  return simulateFight(
    ruleInput(rosterIdx, bossIdx),
    createSeededRng(`replay-rules-fight-${key}`),
    {
      pack: PACK,
    },
  );
}

function eachFight(): { key: string; result: FightResult }[] {
  const out: { key: string; result: FightResult }[] = [];
  for (let roster = 0; roster < ROSTERS; roster++) {
    for (let b = 0; b < BOSSES.length; b++) {
      out.push({
        key: `${String(roster)}:${(BOSSES[b] as BossDef).id}`,
        result: resultOf(roster, b),
      });
    }
  }
  return out;
}

describe('replay equality with rules, patterns, gear sheets, luck and weather', () => {
  it('reproduces 200 stored fights, whole results', () => {
    const now: Record<string, string> = {};
    for (const { key, result } of eachFight()) now[key] = hash(JSON.stringify(result));
    expect(Object.keys(now)).toHaveLength(200);
    expect(Object.keys(fixture)).toHaveLength(200);
    const moved = Object.keys(now).filter((k) => now[k] !== (fixture as Record<string, string>)[k]);
    expect(moved).toEqual([]);
  });

  it('is stable: two runs of every fight give the same bytes', () => {
    const first = eachFight().map((f) => JSON.stringify(f.result));
    const second = eachFight().map((f) => JSON.stringify(f.result));
    expect(second).toEqual(first);
  });

  it('every sheet is valid and together they name every field of the sheet', () => {
    const named = new Set<string>();
    for (const sheet of SHEETS) {
      expect(() =>
        resolveMods('x', sheet, ['steam', 'wildfire', 'grounding', 'overload']),
      ).not.toThrow();
      for (const k of Object.keys(sheet)) named.add(k);
    }
    const missing = Object.keys(NO_MODS).filter((k) => !named.has(k));
    expect(missing).toEqual([]);
  });

  it('the fights reach every kind of event and the main paths', () => {
    const kinds = new Set<string>();
    const causes = new Set<string>();
    const procs = new Set<string>();
    const sources = new Set<string>();
    const ops = new Set<string>();
    const skips = new Set<string>();
    let retreated = 0;
    let enraged = 0;
    let cleared = 0;
    let crits = 0;
    for (const { result } of eachFight()) {
      if (result.retreated) retreated++;
      if (result.enraged) enraged++;
      if (result.cleared) cleared++;
      for (const e of result.events) {
        kinds.add(e.t);
        if (e.t === 'heal' && e.cause !== undefined) causes.add(e.cause);
        if (e.t === 'proc') procs.add(e.kind);
        if (e.t === 'boss_hit') sources.add(e.source);
        if (e.t === 'gimmick') ops.add(e.op);
        if (e.t === 'skip') skips.add(e.reason);
        if (e.t === 'hit' && e.crit) crits++;
      }
    }
    expect([...kinds].sort()).toEqual(
      expect.arrayContaining([
        'ability',
        'adaptation',
        'boss_hit',
        'charge',
        'cleanse',
        'gimmick',
        'heal',
        'hit',
        'knockout',
        'mark',
        'proc',
        'reaction',
        'retreat',
        'enrage',
        'round_end',
        'round_start',
        'silence',
        'sky_heal',
        'skip',
        'support_buff',
        'turn',
      ]),
    );
    expect([...causes].sort()).toEqual(['second_breath', 'second_wind']);
    expect(procs.size).toBeGreaterThanOrEqual(10);
    expect([...skips].sort()).toEqual(['haze', 'silenced']);
    expect(sources.has('reflect')).toBe(true);
    expect(sources.has('gimmick')).toBe(true);
    expect(ops.size).toBeGreaterThanOrEqual(5);
    // A spread of outcomes: not all wins, not all wipes, and the floor and enrage both reached.
    expect(retreated).toBeGreaterThan(5);
    expect(enraged).toBeGreaterThan(5);
    expect(cleared).toBeGreaterThan(20);
    expect(cleared).toBeLessThan(190);
    expect(crits).toBeGreaterThan(50);
  });
});
