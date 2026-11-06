/**
 * Real combat v2 fights for the workbench pages and the tests of the playback: a party on the boss's grid, the stages played by the engine
 * itself (`stageV2` with the log on, a seeded RNG, the carry handed from one stage to the next), shaped as the worker's views send them
 * (`ReplayViewV2`, `LiveSnapshotV2`). Nothing here is written by hand: every event is the engine's. Fixture data only; no API call.
 */
import { content, createSeededRng, dungeonContent } from '@creatures/game';
import { combatV2, knownKnacks, moveLabel } from '@creatures/game/combat-v2';
import {
  applyCards,
  createResolver,
  stageV2,
  startCarry,
  trackBoss,
  type BossDef,
  type FightEvent,
  type FinaleAction,
  type FighterSpec,
  type Shipped,
  type StageCarry,
  type StageInputV2,
} from '@creatures/engine/v2';
import type { FightCreatureV2, LiveSnapshotV2, ReplayViewV2, StatsV2 } from '../fight-v2-api';
import type { BossCardV2 as BossCardV2View } from '../raid-v2-api';
import { speciesLabel } from './data';

const SHIPPED: Shipped = {
  creatures: content.creatures,
  bosses: content.bosses,
  foes: dungeonContent.foes,
};
const resolver = createResolver(combatV2, SHIPPED);

/** The players of a sample party; the first is you. */
export const FIGHT_NAMES: readonly string[] = [
  'You',
  'Mira',
  'Jun',
  'Ann',
  'Bo',
  'Cy',
  'Dee',
  'Eli',
];

/** Species by the row a creature stands in: a Guard in front, a Setter or a Payoff in the middle, a Payoff or a Support behind. */
const BY_ROW: readonly (readonly string[])[] = [
  ['thornbuck', 'hearthshell', 'mistnewt', 'kilnmole'],
  ['tidewing', 'voltaro', 'wickat', 'splashet'],
  ['pyrelynx', 'tempestray', 'coralynx', 'cindle'],
  ['ashmole', 'lanternfin', 'aurorix', 'sunfawn'],
];

/**
 * A party that mixes the roles in each row, so a fight has everything the stage draws: a Guard beside a Setter that its cover and
 * intercepts can save, and a Support beside a Payoff to boost and heal it.
 */
const MIXED_BY_ROW: readonly (readonly string[])[] = [
  ['thornbuck', 'wickat', 'hearthshell', 'splashet'],
  ['tidewing', 'voltaro', 'mistnewt', 'splashet'],
  ['lanternfin', 'tempestray', 'sunfawn', 'cindle'],
];

/**
 * The party of the second answers (2026-11-05): a Setter with Pin Down and a Payoff after it, a Setter and Detonators behind it, a
 * Backlash Payoff and Squelch Song Supports, for the boss that sheds its marks, caps a hit and shakes off its Mired
 * (`ANSWERS_CARDS`). The Knack of each creature is named by species and row.
 */
const ANSWERS_BY_ROW: readonly (readonly string[])[] = [
  ['splashet', 'tempestray', 'voltaro', 'bloomback'],
  ['thornbuck', 'gaiadrake', 'thornbuck', 'splashet'],
  ['croakmire', 'sunfawn', 'croakmire', 'kilnmole'],
];

/** The Knack the party of the second answers gives a species (the first its form knows for the others). */
const ANSWERS_KNACKS: Readonly<Record<string, string>> = {
  splashet: 'pin-down',
  bloomback: 'aftershock',
  gaiadrake: 'backlash',
  croakmire: 'squelch-song',
  tempestray: 'detonate',
  thornbuck: 'cool-head',
};

/** The cards the party of the second answers meets on top of the slot's own: marks are shed, a hit is capped. */
export const ANSWERS_CARDS: readonly string[] = ['clean-scales', 'stone-skin'];

/** The knack a sample creature takes: the first its form knows (the party of the second answers has its own). */
const knackOf = (species: string, party: 'rows' | 'mixed' | 'answers'): string | undefined =>
  party === 'answers' && Object.hasOwn(ANSWERS_KNACKS, species)
    ? ANSWERS_KNACKS[species]
    : knownKnacks(species)[0];

export interface FightSampleOptions {
  /** The track's slot (the Boss Rank). */
  slot: number;
  /** The party's players: the board has one column per player. */
  players: number;
  /** The stage to show: 1, 2 or 3 (the finale). The earlier stages are played first and hand their carry on. */
  stage: 1 | 2 | 3;
  /** The seed of the dice (a stage uses `seed-stage`). */
  seed: string;
  /** Level of every creature. */
  level?: number;
  /** `mixed`: Guards and Supports stand among the Setters and Payoffs (default: a role to a row); `answers`: the party of the second answers, against a boss that also sheds marks and caps a hit. */
  party?: 'rows' | 'mixed' | 'answers';
  /** The finale's live inputs (stage 3). */
  actions?: readonly FinaleAction[];
}

const idOf = (p: number, r: number): string => `c-${String(p)}-${String(r)}`;
const aliasOf = (p: number): string => `m${String(p + 1)}`;

/** The party's creatures as the fight takes them, with the id the board events call them by. */
export function sampleFighters(
  boss: BossDef,
  players: number,
  level: number,
  party: 'rows' | 'mixed' | 'answers' = 'rows',
): FighterSpec[] {
  const out: FighterSpec[] = [];
  for (let p = 0; p < players; p++) {
    for (let r = 0; r < Math.min(3, boss.rows); r++) {
      const options =
        (party === 'answers' ? ANSWERS_BY_ROW : party === 'mixed' ? MIXED_BY_ROW : BY_ROW)[r] ??
        BY_ROW[0] ??
        [];
      const species = options[p % options.length] ?? 'splashet';
      const knack = knackOf(species, party);
      out.push({
        ...resolver.resolve({
          owner: aliasOf(p),
          formId: species,
          level: level + ((p * 3 + r) % 5),
          ...(knack === undefined ? {} : { knack }),
          talents: [],
          row: r,
          col: p,
        }),
        uid: idOf(p, r),
        key: idOf(p, r),
        name: speciesLabel(species),
      });
    }
  }
  return out;
}

/** The boss card the worker works out for a replay or a snapshot (a small copy of `bossCardView`, as `raid-v2-sample.ts` has). */
export function cardOfBoss(boss: BossDef, carry: StageCarry | null): BossCardV2View {
  const last = boss.rows - 1;
  const own = new Set(boss.moves.map((m) => m.id));
  const view = (m: BossDef['moves'][number], later: boolean): BossCardV2View['moves'][number] => {
    const def = Object.hasOwn(combatV2.moves, m.id) ? combatV2.moves[m.id] : undefined;
    const shape = def?.shape ?? m.pattern.shape;
    const silences = def?.silences ?? m.silenceTurns !== undefined;
    const oneShot = def?.oneShot === true || m.oneShotBp !== undefined;
    const fizzles = def?.fizzles === true || m.fizzles === true;
    return {
      id: m.id,
      name: m.name,
      label: moveLabel({
        shape,
        anchor: def?.anchor ?? m.pattern.anchor,
        silences,
        oneShot,
        fizzles,
      }),
      shape,
      silences,
      oneShot,
      fizzles,
      every: m.every,
      turn: Math.min(m.turn ?? last, last),
      windUp: m.charged === true,
      later,
    };
  };
  const plain = boss.plain.pattern;
  return {
    armour: boss.armour,
    cards: boss.cards.flatMap((id) => {
      const card = Object.hasOwn(combatV2.cards, id) ? combatV2.cards[id] : undefined;
      return card === undefined || card.id === 'plain'
        ? []
        : [{ id: card.id, name: card.name, asks: card.asks }];
    }),
    strengthBp: boss.strengthBp ?? 10_000,
    escalation:
      boss.escalation === undefined
        ? null
        : {
            name: boss.escalation.name,
            cap: boss.escalation.cap,
            step: Math.min(carry?.escalation?.step ?? 0, boss.escalation.cap),
          },
    plain: {
      label: moveLabel({ shape: plain.shape, anchor: plain.anchor, silences: false }),
      shape: plain.shape,
      hits: boss.plain.hits ?? 1,
    },
    moves: [
      ...boss.moves.map((m) => view(m, false)),
      ...(boss.escalation?.phase?.moves ?? [])
        .filter((m) => !own.has(m.id))
        .map((m) => view(m, true)),
    ],
  };
}

const moveNamesOf = (boss: BossDef): Record<string, string> =>
  Object.fromEntries(
    [...boss.moves, ...(boss.escalation?.phase?.moves ?? [])].map((m) => [
      m.id,
      combatV2.moves[m.id]?.name ?? m.id,
    ]),
  );

/** The creatures of a stage as the server's views list them. */
function creaturesOf(input: StageInputV2, before: StageCarry): FightCreatureV2[] {
  return input.fighters.map((f) => {
    const key = f.key ?? f.uid;
    return {
      key,
      name: f.name,
      species: f.formId,
      element: f.element,
      role: f.role,
      level: null,
      owner: f.owner,
      row: f.row,
      col: f.col,
      knack: f.knack ?? null,
      knackName: f.knack === undefined ? null : (combatV2.knacks[f.knack]?.name ?? null),
      talents: [...f.talents],
      maxHp: f.maxHp,
      startHp: before.hp[key] ?? f.maxHp,
    };
  });
}

/** What the engine made of the stages up to the one asked for. */
export interface FightSample {
  boss: BossDef;
  input: StageInputV2;
  /** The carry the shown stage started from and the one it left. */
  before: StageCarry;
  after: StageCarry;
  events: readonly FightEvent[];
  rounds: number;
  won: boolean;
  wiped: boolean;
  fighters: FightCreatureV2[];
  names: { players: Record<string, string>; creatures: Record<string, string> };
}

/** Plays the stages up to `o.stage` and returns the last one. */
export function playSample(o: FightSampleOptions): FightSample {
  const players = Math.max(1, o.players);
  const slotBoss = trackBoss(combatV2, SHIPPED, o.slot, { players, followSmallParty: true });
  const boss =
    o.party === 'answers'
      ? {
          ...applyCards(combatV2, slotBoss, ANSWERS_CARDS, slotBoss.strengthBp),
          cards: [...slotBoss.cards, ...ANSWERS_CARDS],
        }
      : slotBoss;
  const fighters = sampleFighters(boss, players, o.level ?? 20, o.party ?? 'rows');
  let carry = startCarry(boss);
  let shown: FightSample | null = null;
  for (let stage = 1; stage <= o.stage; stage++) {
    const input: StageInputV2 = {
      version: 2,
      rules: combatV2.rules,
      elements: content.elements.map((e) => e.id),
      chart: content.elementChart,
      boss,
      fighters,
      options: { log: true },
      ...(stage === 3 && o.actions !== undefined ? { actions: o.actions } : {}),
    };
    const output = stageV2(input, carry, createSeededRng(`${o.seed}-${String(stage)}`));
    const { result } = output;
    const creatures = creaturesOf(input, carry);
    shown = {
      boss,
      input,
      before: carry,
      after: output.carry,
      events: result.events,
      rounds: Math.max(0, ...result.events.map((e) => e.round)),
      won: result.won,
      wiped: result.wiped,
      fighters: creatures,
      names: {
        players: Object.fromEntries(
          Array.from({ length: players }, (_, p) => [aliasOf(p), FIGHT_NAMES[p] ?? 'Someone']),
        ),
        creatures: Object.fromEntries(creatures.map((c) => [c.key, c.name])),
      },
    };
    carry = output.carry;
  }
  if (shown === null) throw new Error('no stage played');
  return shown;
}

/** A stored stage as the replay route answers it (`ReplayViewV2`). */
export function replaySample(o: FightSampleOptions): ReplayViewV2 {
  const s = playSample(o);
  const phase = o.stage === 3 ? 'finale' : o.stage === 2 ? 'stage2' : 'stage1';
  return {
    rules: 2,
    weekId: '26w45',
    party: 1,
    phase,
    stage: o.stage - 1,
    at: 1_800_000_000_000,
    boss: s.boss,
    moveNames: moveNamesOf(s.boss),
    card: cardOfBoss(s.boss, s.before),
    rounds: s.rounds,
    cleared: s.won || s.after.bossHp < s.boss.hp * (o.stage === 1 ? 0.7 : 0.15),
    kill: s.won,
    bossHpMax: s.boss.hp,
    bossHpStart: s.before.bossHp,
    bossHpEnd: s.after.bossHp,
    you: 'm1',
    fighters: s.fighters,
    actions: s.input.actions ?? null,
    events: s.events,
    names: s.names,
    carry: s.after,
  };
}

/**
 * The live finale as a poll answers it (`LiveSnapshotV2`) with the rounds `round` have started: the fight is played whole by the engine,
 * and the events after `round` are left out, as the worker's replay stops at the clock's round.
 */
export function liveSample(
  o: FightSampleOptions,
  state: {
    round: number;
    you?: string;
    mode?: 'default' | 'held' | 'fired';
    ability?: string;
    row?: number;
  },
): LiveSnapshotV2 {
  const s = playSample({ ...o, stage: 3 });
  const round = Math.min(state.round, 8);
  const ability = state.ability ?? 'rally';
  const kind = ability === 'shield-wall' ? 'shieldWall' : ability === 'purge' ? 'purge' : 'rally';
  const defaultRound = ability === 'purge' ? 2 : ability === 'shield-wall' ? 3 : 6;
  const mode = state.mode ?? 'default';
  const acted = mode !== 'held' && defaultRound <= round;
  const events = s.events.filter(
    (e) => e.round <= round && !(e.board?.type === 'end' && round < s.rounds),
  );
  const startedAt = 1_800_000_000_000;
  const roundMs = 30_000;
  const alias = state.you ?? 'm1';
  return {
    rules: 2,
    status: round === 0 ? 'lobby' : round >= s.rounds && state.round > 8 ? 'done' : 'live',
    practice: false,
    week: '26w45',
    party: 1,
    you: alias,
    startsAt: startedAt,
    roundMs,
    rounds: 8,
    round,
    roundStarts: Array.from({ length: round }, (_, k) => startedAt + k * roundMs),
    nextRoundAt: round >= 8 ? null : startedAt + round * roundMs,
    serverNow: startedAt + Math.max(0, round - 1) * roundMs + 9_000,
    boss: {
      id: s.boss.id,
      name: s.boss.name,
      element: s.boss.element,
      hpMax: s.boss.hp,
      hpStart: s.before.bossHp,
    },
    card: cardOfBoss(s.boss, s.before),
    bossDef: s.boss,
    moveNames: moveNamesOf(s.boss),
    fighters: s.fighters,
    names: s.names,
    abilities: [
      {
        key: `${alias}:basic`,
        alias,
        abilityId: ability,
        kind,
        mode,
        autoFire: mode !== 'held',
        fired: acted,
        firedAtRound: acted ? defaultRound : null,
        fireAtRound: mode === 'fired' && !acted ? round + 1 : null,
        defaultRound,
        row: kind === 'shieldWall' ? (state.row ?? 0) : null,
      },
    ],
    events,
    bossHp: s.before.bossHp,
    carry: s.before,
    watching: ['Mira', 'Jun'],
    loot: null,
  };
}

/** The after-action numbers of a stage, counted from its own events (the lean shape of the worker's `buildStatsV2`). */
export function statsSample(o: FightSampleOptions): StatsV2 {
  const s = playSample(o);
  const ownerOf = new Map(s.fighters.map((f) => [f.key, f.owner]));
  const damage = new Map<string, number>();
  const down = new Map<string, number>();
  const byCreature = new Map<string, number>();
  let reactions = 0;
  let blocked = 0;
  let dodges = 0;
  let intercepts = 0;
  let healed = 0;
  const byMark: Record<string, number> = {};
  for (const e of s.events) {
    const b = e.board;
    if (b === undefined) continue;
    if (b.type === 'hit') {
      if (b.from !== null && b.to === null) {
        const owner = ownerOf.get(b.from) ?? '';
        damage.set(owner, (damage.get(owner) ?? 0) + b.damage);
        byCreature.set(b.from, (byCreature.get(b.from) ?? 0) + b.damage);
        if (b.blocked) blocked++;
      } else {
        if (b.blocked) blocked++;
        if (b.dodged) dodges++;
        if (b.by !== undefined) intercepts++;
      }
    } else if (b.type === 'knockout') {
      const owner = ownerOf.get(b.who) ?? '';
      down.set(owner, (down.get(owner) ?? 0) + 1);
    } else if (b.type === 'reaction') {
      reactions++;
      byMark[b.mark] = (byMark[b.mark] ?? 0) + 1;
    } else if (b.type === 'heal') healed += b.amount;
  }
  const you = 'm1';
  const outNow = new Set(s.after.out);
  return {
    rules: 2,
    phase: o.stage === 3 ? 'finale' : o.stage === 2 ? 'stage2' : 'stage1',
    stage: o.stage - 1,
    slot: o.slot,
    cleared: s.won || s.after.bossHp < s.boss.hp * (o.stage === 1 ? 0.7 : 0.15),
    kill: s.won,
    rounds: s.rounds,
    boss: {
      id: s.boss.id,
      name: s.boss.name,
      hpMax: s.boss.hp,
      hpStart: s.before.bossHp,
      hpEnd: s.after.bossHp,
    },
    players: Object.keys(s.names.players).map((alias) => ({
      displayName: s.names.players[alias] ?? 'Someone',
      you: alias === you,
      damage: damage.get(alias) ?? 0,
      knockouts: down.get(alias) ?? 0,
    })),
    creatures: s.fighters.map((f) => ({
      name: f.name,
      species: f.species,
      owner: s.names.players[f.owner] ?? null,
      you: f.owner === you,
      damage: byCreature.get(f.key) ?? 0,
      hp: s.after.hp[f.key] ?? (outNow.has(f.key) ? 0 : f.maxHp),
      maxHp: f.maxHp,
      out: outNow.has(f.key),
    })),
    reactions: { total: reactions, byMark },
    knockouts: [...down.values()].reduce((a, b) => a + b, 0),
    blocked,
    dodges,
    intercepts,
    healed,
  };
}
