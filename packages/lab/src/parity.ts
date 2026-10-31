/**
 * The parity digest of the combat v2 fight (docs/design/combat/engine-port.md, section 4). A fixed corpus of fights and weekends
 * is played on seeded dice and every result field (damage, counts, the log, each creature's final state) is turned into a
 * sha256, one per case and one overall. The digest is committed (`data/parity/digest.json`): a change to the fight code that
 * claims to change no rule must reproduce it exactly (`scripts/parity.mjs --check`, `test/parity.test.ts`), and one that changes a
 * rule re-writes it on purpose (`scripts/parity.mjs --write`) with a sentence in the PR on what moved and why.
 *
 * The corpus is the rules, not the content: it plays whatever the lab's catalogue says today, so a change to a Knack, a card or a
 * boss number moves the digest too (re-write it in the same commit and say so).
 */
import { createHash } from 'node:crypto';
import { createSeededRng, int } from '@creatures/game';
import { randomTalents } from './answerMeasure';
import { CARDS } from './cards';
import { FOE_IDS, foeAt } from './foes';
import { ALL_ROUND_TEAM } from './dungeon';
import { fight, placeFighters, weekend } from './fight';
import { FORM_KNACKS } from './knacks';
import { ANSWERS } from './report';
import { RAID_BOSS_IDS, raidBench, raidBossOf, raidMode } from './bosses';
import { slotAnswersOf, slotBoss } from './track';
import { casualRosters } from './teams';
import {
  CLASSIC_LINE,
  GAUNTLET,
  bossFor,
  classicFor,
  toPlacements,
  type Mode,
  type Pick,
} from './search';
import { TALENTS, legalTalents } from './talents';
import type { BossDef, FightOptions, FightResult, Fighter, Placement } from './types';

/** One case of the corpus: a name and a function that plays it and returns what to digest. */
export interface ParityCase {
  readonly name: string;
  readonly run: () => unknown;
}

export interface ParityDigest {
  /** The digest's own format; bump it only when `canonical` changes, never to hide a rule change. */
  readonly format: 1;
  /** sha256 over every case's name and hash, in name order. */
  readonly overall: string;
  /** sha256 of each case's canonical form, by case name. */
  readonly cases: Readonly<Record<string, string>>;
}

// ---------- canonical form ----------

/** `value` as JSON text that does not depend on key order: sorted keys, Maps and Sets as sorted entry lists, no `undefined`. */
export function canonical(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return `#${String(value)}`;
    return value;
  }
  if (value instanceof Map) {
    return {
      $map: [...value.entries()]
        .map(([k, v]) => [String(k), normalise(v)] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    };
  }
  if (value instanceof Set) return { $set: [...value].map(String).sort() };
  if (Array.isArray(value)) return value.map(normalise);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = normalise(v);
  }
  return out;
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The state a creature ends a fight in (every mutable field, and the fields that name it), not its resolved effects. */
function fighterState(f: Fighter): Record<string, unknown> {
  return {
    uid: f.uid,
    owner: f.owner,
    formId: f.formId,
    row: f.row,
    col: f.col,
    maxHp: f.maxHp,
    hp: f.hp,
    hitsLanded: f.hitsLanded,
    secondWindDone: f.secondWindDone,
    holdOnDone: f.holdOnDone,
    silencedTurns: f.silencedTurns,
    store: f.store,
    boostBp: f.boostBp,
    undodgeable: f.undodgeable,
    lastPrimeRound: f.lastPrimeRound,
    damageDealt: f.damageDealt,
    hitDamage: f.hitDamage,
    watchTurn: f.watchTurn,
    damageThisRound: f.damageThisRound,
    damageLastRound: f.damageLastRound,
    lastStoreRound: f.lastStoreRound,
    sureCrits: f.sureCrits,
    guardTaken: f.guardTaken,
    hitsMade: f.hitsMade,
    momentum: f.momentum,
    avenged: f.avenged,
    marksLeft: f.marksLeft,
    verbsUsed: f.verbsUsed,
    fires: f.fires,
  };
}

/** Every field of a fight result, the creatures as their final state. */
export function resultState(r: FightResult): Record<string, unknown> {
  return {
    damage: r.damage,
    bossHpLeft: r.bossHpLeft,
    bossHpReal: r.bossHpReal,
    won: r.won,
    killingBlow: r.killingBlow,
    wiped: r.wiped,
    knockouts: r.knockouts,
    reactions: r.reactions,
    reactionsByMark: r.reactionsByMark,
    blocked: r.blocked,
    dodges: r.dodges,
    intercepts: r.intercepts,
    healed: r.healed,
    hpLeft: r.hpLeft,
    escalation: r.escalation,
    fighters: r.fighters.map(fighterState),
    events: r.events,
  };
}

// ---------- the corpus ----------

const seedsOf = (n: number) => Array.from({ length: n }, (_, i) => i);
const rngOf = (name: string, seed: number) => createSeededRng(`parity:${name}:${seed}`);

/** A line of picks as the placements of a mode. */
const placed = (line: readonly Pick[], mode: Mode): Placement[] => toPlacements(line, mode);

/** The raid line at a Boss Rank slot, written answers first, then the classic line. */
function slotTeams(slot: number, boss: BossDef): { label: string; line: Pick[] }[] {
  const mode = raidMode(boss);
  return [
    ...slotAnswersOf(slot).map((a, i) => ({ label: `answer${i}`, line: a.line })),
    { label: 'classic', line: classicFor(mode) },
  ];
}

let casual: ReturnType<typeof casualRosters>[number] | undefined;

/** A casual raid line: twelve picks from a casual roster's pool (at most four copies of a form), each with a random legal talent. */
function casualLine(boss: BossDef, key: string): Pick[] {
  const rng = createSeededRng(`parity:casual:${key}`);
  const roster = (casual ??= casualRosters(true)[0]);
  if (!roster) throw new Error('no casual roster');
  const mode = raidMode(boss);
  const n = mode.rows * mode.cols;
  const copies = new Map<string, number>();
  const line: Pick[] = [];
  while (line.length < n) {
    const p = roster.pool[int(rng, roster.pool.length)] as Pick;
    const c = copies.get(p.formId) ?? 0;
    if (c >= mode.maxCopies) continue;
    copies.set(p.formId, c + 1);
    line.push(p);
  }
  return randomTalents(
    rng,
    line.map((p) => ({ formId: p.formId, knack: p.knack })),
  );
}

/** The track's first three laps: between them Slippery, Lucky Strike, Breakwater, strength, the Build-up, Adapts and Element Resistance all appear. */
const SLOTS = Array.from({ length: 15 }, (_, i) => i + 1);

export function parityCases(): ParityCase[] {
  const cases: ParityCase[] = [];
  const add = (name: string, run: () => unknown) => cases.push({ name, run });
  const fightCase = (
    name: string,
    boss: BossDef,
    placements: readonly Placement[],
    seeds: number,
    extra: Omit<FightOptions, 'rng'> = {},
  ) => {
    for (const seed of seedsOf(seeds))
      add(`${name}#${seed}`, () =>
        resultState(fight(boss, placements, { ...extra, rng: rngOf(name, seed) })),
      );
  };
  const weekendCase = (
    name: string,
    boss: BossDef,
    placements: readonly Placement[],
    bench: readonly Placement[],
    seeds: number,
    extra: Omit<FightOptions, 'rng'> & { stages?: number } = {},
  ) => {
    for (const seed of seedsOf(seeds))
      add(`${name}#${seed}`, () => {
        const w = weekend(boss, placements, bench, { ...extra, rng: rngOf(name, seed) });
        return { won: w.won, replacements: w.replacements, stages: w.stages.map(resultState) };
      });
  };

  // Gauntlet: every card (the raid-only ones have no meaning in one fight) with each of its intended answers and the classic line.
  for (const c of CARDS.filter((x) => !x.raidOnly)) {
    const boss = bossFor(GAUNTLET, [c.id]);
    const lines: [string, readonly Pick[]][] = [
      ['classic', CLASSIC_LINE],
      ...(ANSWERS[c.id] ?? []).map(
        ([, spec], i) =>
          [
            // The index, not the answer's text: the text names Knacks, and a case's name seeds its dice, so a rename must not move it.
            `answer${i}`,
            spec.split(' ').map((t): Pick => {
              const [formId = '', knack = 'none'] = t.split('/');
              return { formId, knack };
            }),
          ] as [string, readonly Pick[]],
      ),
    ];
    for (const [label, line] of lines)
      fightCase(`gauntlet:${c.id}:${label}`, boss, placed(line, GAUNTLET), 3);
  }
  // Stacked cards: Lucky Strike with Slippery and Breakwater with Stone Skin and Wither (cards are applied in order).
  fightCase(
    'gauntlet:stack:luck',
    bossFor(GAUNTLET, ['slippery', 'lucky-strike', 'stone-skin']),
    placed(CLASSIC_LINE, GAUNTLET),
    2,
  );
  // With the log on, so the events are digested: a few cards that announce, reflect, shed, crit and silence.
  for (const id of [
    'plain',
    'reflective-hide',
    'clean-scales',
    'lucky-strike',
    'payoff-hunter',
    'fizzle',
  ])
    fightCase(`gauntlet-log:${id}`, bossFor(GAUNTLET, [id]), placed(CLASSIC_LINE, GAUNTLET), 1, {
      log: true,
    });
  // Carried HP (a dungeon's rooms), and Determination.
  fightCase('gauntlet:carry', bossFor(GAUNTLET, ['plain']), placed(CLASSIC_LINE, GAUNTLET), 2, {
    carryHp: new Map(
      placeFighters(placed(CLASSIC_LINE, GAUNTLET)).map((f) => [f.uid, Math.ceil(f.maxHp / 3)]),
    ),
    log: true,
  });
  fightCase(
    'gauntlet:determination',
    bossFor(GAUNTLET, ['thick-hide']),
    placed(CLASSIC_LINE, GAUNTLET),
    2,
    {
      determinationBp: 1_500,
    },
  );

  // Every Knack on every form it can equip, in a trio with the classic Setter and Guard, against a plain boss and a boss of cards.
  const sweepBoss = bossFor(GAUNTLET, ['thick-hide', 'payoff-hunter', 'elusive']);
  const sweepPlain = bossFor(GAUNTLET, ['plain']);
  for (const [formId, knacks] of Object.entries(FORM_KNACKS))
    for (const knack of [...knacks, 'none']) {
      const line: Pick[] = [
        { formId, knack },
        { formId: 'tidewing', knack: 'steady-mark' },
        { formId: 'thornbuck', knack: 'wide-reach' },
      ];
      fightCase(`sweep-knack:${formId}:${knack}`, sweepBoss, placed(line, GAUNTLET), 2);
      // The same Knack as the middle creature, so it has a neighbour on each side (beside, kin and row-end effects).
      fightCase(
        `sweep-knack-mid:${formId}:${knack}`,
        sweepPlain,
        placed([line[1] as Pick, line[0] as Pick, line[2] as Pick], GAUNTLET),
        2,
        { log: true },
      );
    }
  // Every talent on the first form that may carry it, in the middle of a trio, alone and with a Knack-less partner.
  for (const t of Object.keys(TALENTS)) {
    const formId = Object.keys(FORM_KNACKS).find((f) => legalTalents(f).includes(t));
    if (!formId) continue;
    const knack = FORM_KNACKS[formId]?.[0] ?? 'none';
    const line: Pick[] = [
      { formId: 'tidewing', knack: 'steady-mark' },
      { formId, knack, talents: [t] },
      { formId: 'thornbuck', knack: 'wide-reach' },
    ];
    fightCase(`sweep-talent:${t}`, sweepBoss, placed(line, GAUNTLET), 2);
    fightCase(`sweep-talent-log:${t}`, sweepPlain, placed(line, GAUNTLET), 1, { log: true });
  }

  // Culling Strike (a kill by a share of HP, also as damage potential) and Hold On (Refuse to Fall against a boss that hits hard).
  const cullLine: Pick[] = [
    { formId: 'tidewing', knack: 'steady-mark', talents: ['cull'] },
    { formId: 'tempestray', knack: 'detonate', talents: ['cull'] },
    { formId: 'thornbuck', knack: 'wide-reach', talents: ['stubborn'] },
  ];
  for (const hp of [3_000, 6_000, 12_000, 24_000, 48_000]) {
    const boss: BossDef = { ...bossFor(GAUNTLET, ['plain']), hp };
    fightCase(`cull:${hp}`, boss, placed(cullLine, GAUNTLET), 2, { log: true });
    fightCase(`cull-potential:${hp}`, boss, placed(cullLine, GAUNTLET), 1, {
      log: true,
      potential: true,
    });
  }
  for (const atk of [300, 600]) {
    const boss: BossDef = { ...bossFor(GAUNTLET, ['plain']), atk };
    fightCase(`hold-on:${atk}`, boss, placed(cullLine, GAUNTLET), 2, { log: true });
  }

  // Dungeon foes at a shallow and a deep floor (signatures, escalations), with the dungeon's all-round team.
  for (const id of FOE_IDS)
    for (const depth of [1, 7]) {
      const boss = foeAt(id, depth);
      fightCase(`foe:${id}:${depth}`, boss, placed([...ALL_ROUND_TEAM], GAUNTLET), 1);
    }

  // Raid bosses at the track's slots, each with its written answers and the classic line and a casual line, as one fight and as a
  // whole weekend with a bench (replacements happen); one of them with the log on, one as damage potential.
  for (const slot of SLOTS) {
    const boss = slotBoss(slot);
    const mode = raidMode(boss);
    const bench = raidBench(boss.cols, boss.rosterLevel);
    const teams = [
      ...slotTeams(slot, boss),
      { label: 'casual', line: casualLine(boss, `s${slot}`) },
    ];
    for (const t of teams) {
      const name = `slot${slot}:${boss.id}:${t.label}`;
      fightCase(`fight:${name}`, boss, placed(t.line, mode), 3);
      weekendCase(`weekend:${name}`, boss, placed(t.line, mode), bench, 3);
    }
    const first = teams[0] as { label: string; line: Pick[] };
    const casual = teams[teams.length - 1] as { label: string; line: Pick[] };
    fightCase(`fight-log:slot${slot}`, boss, placed(first.line, mode), 1, { log: true });
    weekendCase(`weekend-log:slot${slot}`, boss, placed(casual.line, mode), bench, 1, {
      log: true,
    });
    weekendCase(`potential:slot${slot}`, boss, placed(first.line, mode), bench, 3, {
      potential: true,
    });
    weekendCase(`potential-casual:slot${slot}`, boss, placed(casual.line, mode), bench, 1, {
      potential: true,
      log: true,
    });
    weekendCase(`determination:slot${slot}`, boss, placed(casual.line, mode), bench, 1, {
      determinationBp: 1_000,
    });
  }
  // Every raid boss at each Boss Rank (low, mid, high) with the classic line: the ranks' strengths and numbers.
  for (const id of RAID_BOSS_IDS)
    for (const rank of ['low', 'mid', 'high'] as const) {
      const boss = raidBossOf(id, { rank });
      const mode = raidMode(boss);
      weekendCase(
        `rank:${id}:${rank}`,
        boss,
        placed(classicFor(mode), mode),
        raidBench(boss.cols, boss.rosterLevel),
        1,
      );
    }
  // A bigger and a smaller arena than the usual one (the arena's width scales some patterns and the escalation).
  const wideBoss: BossDef = { ...raidBossOf('storm-sovereign'), cols: 5 };
  const wide: Mode = { ...raidMode(wideBoss), cols: 5 };
  weekendCase('wide:storm-sovereign', wideBoss, placed(classicFor(wide), wide), raidBench(5), 1);

  return cases;
}

/** Plays every case of the corpus and digests it. */
export function computeDigest(cases: readonly ParityCase[] = parityCases()): ParityDigest {
  const hashes: Record<string, string> = {};
  for (const c of cases) {
    if (c.name in hashes) throw new Error(`duplicate parity case ${c.name}`);
    hashes[c.name] = sha(canonical(c.run()));
  }
  const names = Object.keys(hashes).sort();
  const sorted: Record<string, string> = {};
  for (const n of names) sorted[n] = hashes[n] as string;
  return {
    format: 1,
    overall: sha(names.map((n) => `${n}\n${sorted[n]}`).join('\n')),
    cases: sorted,
  };
}

/** The cases whose hash differs between two digests (missing on either side counts), by name. */
export function digestDiff(want: ParityDigest, got: ParityDigest): string[] {
  const names = new Set([...Object.keys(want.cases), ...Object.keys(got.cases)]);
  return [...names].filter((n) => want.cases[n] !== got.cases[n]).sort();
}
