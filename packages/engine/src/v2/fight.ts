/**
 * The combat v2 fight (docs/design/combat/proposals/001-combat-v2.md). Pure: no I/O, an injected RNG. It is the lab's fight,
 * moved here as it was (phase 2, slice 1 of docs/design/combat/engine-port.md) and split by rule group in slice 2: `state.ts`,
 * `escalation.ts`, `board.ts`, `marks.ts`, `taking.ts`, `creature.ts` and `boss.ts` hold the rules; this module builds the state
 * and plays the rounds. The rules numbers, the element chart and the resolved creatures all arrive in the input (`FightInputV2`),
 * so nothing here reads content.
 *
 * A round (R8): round start (in slot order: Support verbs, then round-start Knacks; charged moves of
 * the round are announced), then for each row from the front: the row's creatures act left to
 * right, then the boss takes a turn. A boss turn is its due moves, its plain attack, then (Clean
 * Scales) the shedding of the marks that were on it when the turn began.
 */
import type { Rng } from '@creatures/game';
import * as bossMod from './boss';
import * as creatureMod from './creature';
import * as escalationMod from './escalation';
import * as marksMod from './marks';
import * as stateMod from './state';
import type { Context, State } from './state';
import type {
  BossDef,
  FightInputV2,
  FightOptions,
  FightResult,
  Fighter,
  FighterSpec,
} from './types';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { bossTurn } = bossMod;
const { creatureTurn } = creatureMod;
const { escalationState, fadeMired } = escalationMod;
const { roundStart } = marksMod;
const { alive, aliveBySlot, contextOf, effectsCarried, log, strengthOf } = stateMod;

/** A creature at the start of a fight: its spec, at full HP, with nothing stored. */
function fighterOf(spec: FighterSpec): Fighter {
  return {
    uid: spec.uid,
    owner: spec.owner,
    formId: spec.formId,
    name: spec.name,
    element: spec.element,
    role: spec.role,
    maxHp: spec.maxHp,
    hp: spec.maxHp,
    atk: spec.atk,
    spd: spec.spd,
    baseArmour: spec.baseArmour,
    critChanceBp: spec.critChanceBp,
    critDamageBp: spec.critDamageBp,
    sureCrits: 0,
    guardTaken: 0,
    knack: spec.knack,
    talents: spec.talents,
    fxAll: spec.fxAll,
    fxStat: spec.fxStat,
    triageIdle: spec.triageIdle,
    hitsLanded: 0,
    secondWindDone: false,
    holdOnDone: false,
    row: spec.row,
    col: spec.col,
    silencedTurns: 0,
    store: 0,
    boostBp: 0,
    undodgeable: false,
    lastPrimeRound: 0,
    damageDealt: 0,
    hitDamage: 0,
    watchTurn: -1,
    damageThisRound: 0,
    damageLastRound: 0,
    lastStoreRound: -1,
    hitsMade: 0,
    momentum: false,
    avenged: false,
    marksLeft: 0,
    verbsUsed: 0,
    fires: {},
  };
}

/** One fight: the boss, the creatures, and the rounds of R8. `ctx` is the input's rules and chart (`contextOf`). */
export function playFight(
  ctx: Context,
  boss: BossDef,
  specs: readonly FighterSpec[],
  opts: FightOptions,
  rng: Rng,
): FightResult {
  const fighters = specs.map(fighterOf);
  if (opts.carryHp) for (const f of fighters) f.hp = opts.carryHp.get(f.uid) ?? f.hp;
  // Catch Breath is once per raid weekend: a creature that used it in an earlier stage does not have it again.
  for (const f of fighters) if (opts.carryWindDone?.has(f.uid)) f.secondWindDone = true;
  // So is Refuse to Fall (panel 5: once per weekend, not per stage).
  for (const f of fighters) if (opts.carryHoldOnDone?.has(f.uid)) f.holdOnDone = true;
  const carried = opts.carryEscalation;
  const s: State = {
    ctx,
    rng,
    boss,
    opts,
    fighters,
    bossHp: opts.bossHp ?? boss.hp,
    // A potential stage carried on from an earlier one starts at the real HP (below 1), not at the 1 the boss was held at.
    shadowHp: opts.potential ? (opts.shadowHp ?? opts.bossHp ?? boss.hp) : (opts.bossHp ?? boss.hp),
    marks: new Map(),
    markAge: 0,
    mired: 0,
    round: 0,
    turn: 0,
    bossTurnsDone: 0,
    // Reflective Hide arms after each boss turn, so not before the first one.
    reflectArmed: false,
    esc: {
      fed: 0,
      base: carried?.count ?? 0,
      step: carried?.step ?? 0,
      fall: carried?.fallStep ?? carried?.step ?? 0,
      count: carried?.count ?? 0,
      phase: carried?.phase ?? false,
      phaseNext: carried?.phaseNext ?? false,
    },
    announced: new Map(),
    events: [],
    killer: null,
    count: { reactions: 0, blocked: 0, dodges: 0, intercepts: 0, healed: 0, damage: 0 },
    byMark: {},
    carries: effectsCarried(fighters),
    live: null,
    liveBySlot: null,
    grownStep: -1,
    grownFall: -1,
    grownNow: null,
    phaseMoves: null,
  };
  const startAlive = alive(s).length;
  for (s.round = 1; s.round <= boss.rounds && s.bossHp > 0 && alive(s).length > 0; s.round++) {
    for (const f of fighters) {
      f.undodgeable = false;
      f.damageLastRound = f.damageThisRound;
      f.damageThisRound = 0;
    }
    s.turn = 0;
    roundStart(s);
    // The boss takes a turn after every row of the arena, empty or not.
    for (let r = 0; r < boss.rows && s.bossHp > 0 && alive(s).length > 0; r++) {
      // Events of this row's turns and of the boss turn after them carry the row's number.
      s.turn = r;
      // Left to right: the living in slot order, this row's.
      for (const f of aliveBySlot(s).filter((x) => x.row === r)) creatureTurn(s, f);
      bossTurn(s, r);
    }
    fadeMired(s);
    // Shake It Off: announced at round start, the boss clears every debuff when its round ends.
    if (s.boss.mods.shakeEvery && s.round % s.boss.mods.shakeEvery === 0 && s.mired > 0) {
      // Shake It Off clears the card's strength's share of the Mired (all of it at full strength).
      s.mired -= Math.min(s.mired, Math.round((s.mired * strengthOf(s)) / 10_000));
      if (s.opts.log) log(s, 'shake', `${boss.name} shakes off its debuffs`);
      if (s.opts.log) log(s, 'mired', `Mired x${s.mired}`);
    }
  }
  return {
    damage: s.count.damage,
    bossHpLeft: s.bossHp,
    bossHpReal: s.shadowHp,
    won: s.bossHp <= 0,
    killingBlow: s.killer,
    wiped: alive(s).length === 0,
    knockouts: startAlive - alive(s).length,
    reactions: s.count.reactions,
    reactionsByMark: s.byMark,
    blocked: s.count.blocked,
    dodges: s.count.dodges,
    intercepts: s.count.intercepts,
    healed: s.count.healed,
    hpLeft: new Map(fighters.map((f) => [f.uid, f.hp])),
    escalation: escalationState(s),
    fighters,
    events: s.events,
  };
}

/** One fight of a v2 input. The result is the same for the same input and the same dice (draw order is part of the rules). */
export function fightV2(input: FightInputV2, rng: Rng): FightResult {
  if (input.version !== 2)
    throw new Error(`fightV2 plays version 2 inputs, not ${String(input.version)}`);
  return playFight(contextOf(input), input.boss, input.fighters, input.options, rng);
}
