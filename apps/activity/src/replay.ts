/**
 * Pure helpers for the replay viewer: stepping through the event log, the "Key moments" summary and
 * the personal recap. Nothing here touches the DOM or the network, and all text it returns is
 * plain text (it can contain player names).
 */
import { RULES } from '@creatures/game';
import { beatEnds, describeEvent, type EventNames, type FightEvent } from '@creatures/engine';
import type { ReplayRowEntry } from './raid-api';

// --- Stepping ---

/** What the screen shows after some number of events have played. */
export interface StepState {
  /** How many events have been applied. */
  index: number;
  round: number;
  bossHp: number;
  /** The boss's current mark as an element id, or null. */
  mark: string | null;
  /** The creature whose turn it is, or null (start of a round, or the boss acting). */
  actor: string | null;
  /** True while the boss is attacking or using a gimmick. */
  bossActing: boolean;
  /** Creatures that already acted this round. */
  acted: readonly string[];
  knockedOut: readonly string[];
  /** The status effects on the boss right now (stacks and turns left). */
  bossEffects: readonly EffectView[];
  /** The status effects on each creature that carries any, by creature id. */
  creatureEffects: Readonly<Record<string, readonly EffectView[]>>;
  /** The boss retreated this round: its effects do not count down at the round's end. */
  retreating: boolean;
  /** A barrier on the foe (a lasting move armed this round, `BARRIER_OPS`), or null. */
  barrier: BarrierState | null;
}

/**
 * The ops that raise a barrier over the foe while armed: they last the round and the first reaction
 * that meets them breaks them (Backdraft, Molten Shell, the Thorns room). A new lasting move joins
 * by its op here; how its barrier looks is `barrierLookOf` (`move-fx.ts`).
 */
export const BARRIER_OPS: ReadonlySet<string> = new Set(['reflect_first_reaction']);

export interface BarrierState {
  /** The move that raised it (its content id). */
  gimmick: string;
  round: number;
  /**
   * Set once a reaction broke it: the event, the creature whose reaction did, and whether a gear set
   * turned it aside (nothing thrown back). It lasts until the round ends.
   */
  broken: { i: number; creature: string; turned: boolean } | null;
}

/** One status effect on a fighter, as the stage shows it. */
export interface EffectView {
  effect: string;
  stacks: number;
  /** Turns left on its target's own turns; the effect ends when it reaches 0. */
  turnsLeft: number;
}

const withoutEffect = (list: readonly EffectView[], effect: string): EffectView[] =>
  list.filter((e) => e.effect !== effect);

/** One turn of the fighter's has passed: every effect has one turn less (the engine's `tickEffects`). */
function ticked(list: readonly EffectView[]): EffectView[] {
  return list.map((e) => ({ ...e, turnsLeft: Math.max(1, e.turnsLeft - 1) }));
}

/** The creature's effects counted down (its turn is over); effects that would reach 0 were ended by their own event. */
function creatureTicked(s: StepState, creature: string | null): StepState {
  const list = creature === null ? undefined : s.creatureEffects[creature];
  if (creature === null || list === undefined) return s;
  return { ...s, creatureEffects: { ...s.creatureEffects, [creature]: ticked(list) } };
}

/** The creature's effects replaced; an empty list removes its entry. */
function withCreatureEffects(
  s: StepState,
  creature: string,
  list: readonly EffectView[],
): StepState {
  const next = { ...s.creatureEffects };
  if (list.length === 0) delete next[creature];
  else next[creature] = list;
  return { ...s, creatureEffects: next };
}

/** An effect applied: new, or more stacks and a full timer. */
function appliedTo(list: readonly EffectView[], e: EffectView): EffectView[] {
  const at = list.findIndex((x) => x.effect === e.effect);
  if (at < 0) return [...list, e];
  return list.map((x, i) => (i === at ? e : x));
}

export function initialStep(bossHpStart: number): StepState {
  return {
    index: 0,
    round: 0,
    bossHp: bossHpStart,
    mark: null,
    actor: null,
    bossActing: false,
    acted: [],
    knockedOut: [],
    bossEffects: [],
    creatureEffects: {},
    retreating: false,
    barrier: null,
  };
}

function applyOne(s: StepState, e: FightEvent, i: number): StepState {
  const next = applyEvent(s, e);
  const barrier = barrierAfter(s.barrier, e, i);
  return barrier === next.barrier ? next : { ...next, barrier };
}

/** The barrier after an event: raised when its move is armed, broken by the first reaction, gone at the round's end. */
function barrierAfter(b: BarrierState | null, e: FightEvent, i: number): BarrierState | null {
  switch (e.t) {
    case 'gimmick':
      // Fights stored before 2026-10 announce the trap twice a round: the second keeps the first.
      if (!BARRIER_OPS.has(e.op) || b?.round === e.round) return b;
      return { gimmick: e.gimmick, round: e.round, broken: null };
    case 'reaction':
      if (b === null || b.broken !== null || !(e.reflected || e.proof === true)) return b;
      return { ...b, broken: { i, creature: e.payoff, turned: !e.reflected } };
    case 'round_end':
    case 'round_start':
      return b === null ? b : null;
    default:
      return b;
  }
}

function applyEvent(s: StepState, e: FightEvent): StepState {
  switch (e.t) {
    case 'round_start':
      return {
        ...s,
        round: e.round,
        bossHp: e.bossHp,
        mark: e.mark,
        actor: null,
        bossActing: false,
        acted: [],
        retreating: false,
      };
    case 'turn':
    case 'skip': {
      // The creature before this one has finished its turn: its effects count down.
      const done = creatureTicked(s, s.actor);
      return {
        ...done,
        round: e.round,
        actor: e.creature,
        bossActing: false,
        acted: s.actor === null ? s.acted : [...s.acted, s.actor],
      };
    }
    case 'hit':
      return { ...s, bossHp: e.bossHp };
    case 'proc':
      // Echo lands again on the boss: it carries the boss's HP after it.
      return e.bossHp === undefined ? s : { ...s, bossHp: e.bossHp };
    case 'mark':
      return { ...s, mark: e.element };
    case 'reaction':
      return { ...s, mark: null };
    case 'gimmick':
      return {
        ...creatureTicked(s, s.actor),
        actor: null,
        bossActing: true,
        acted: s.actor === null ? s.acted : [...s.acted, s.actor],
      };
    case 'boss_hit':
      return e.source === 'reflect'
        ? s
        : {
            ...creatureTicked(s, s.actor),
            actor: null,
            bossActing: true,
            acted: s.actor === null ? s.acted : [...s.acted, s.actor],
          };
    case 'knockout': {
      if (s.knockedOut.includes(e.creature)) return s;
      // A knocked-out creature's effects end at once (the engine writes no event for it).
      const next = withCreatureEffects(s, e.creature, []);
      return { ...next, knockedOut: [...s.knockedOut, e.creature] };
    }
    case 'retreat':
      return { ...s, retreating: true };
    case 'effect_apply': {
      const view: EffectView = { effect: e.effect, stacks: e.stacks, turnsLeft: e.turnsLeft };
      if (e.target === null) return { ...s, bossEffects: appliedTo(s.bossEffects, view) };
      return withCreatureEffects(s, e.target, appliedTo(s.creatureEffects[e.target] ?? [], view));
    }
    case 'effect_expire':
      if (e.target === null) {
        return { ...s, bossEffects: withoutEffect(s.bossEffects, e.effect) };
      }
      return withCreatureEffects(
        s,
        e.target,
        withoutEffect(s.creatureEffects[e.target] ?? [], e.effect),
      );
    case 'effect_consume':
      return { ...s, bossEffects: withoutEffect(s.bossEffects, e.effect) };
    case 'effect_purge':
      return {
        ...s,
        bossEffects: s.bossEffects.filter((x) => !e.removed.some((r) => r.effect === x.effect)),
      };
    case 'effect_cleanse':
      return withCreatureEffects(
        s,
        e.target,
        withoutEffect(s.creatureEffects[e.target] ?? [], e.effect),
      );
    case 'round_end': {
      // The boss's turn is over: its effects count down once a round (not when it retreated or fell).
      const counted = creatureTicked(s, s.actor);
      const bossEffects =
        s.retreating || e.bossHp <= 0 ? counted.bossEffects : ticked(counted.bossEffects);
      return { ...counted, bossEffects, bossHp: e.bossHp, actor: null, bossActing: false };
    }
    default:
      return s;
  }
}

/** The state after the first `index` events (clamped to the log). */
export function stateAt(
  events: readonly FightEvent[],
  index: number,
  bossHpStart: number,
): StepState {
  const end = Math.min(Math.max(0, Math.trunc(index)), events.length);
  let state = initialStep(bossHpStart);
  for (let i = 0; i < end; i++) state = applyOne(state, events[i] as FightEvent, i);
  return { ...state, index: end };
}

/**
 * Playback steps. Each step is a run of events that belong together (one creature's turn with its
 * hit, mark and reaction; one boss attack). Returns the event index each step ends at, so step `n`
 * leaves `ends[n - 1]` events applied. It is the engine's, so the replay, the stage and the server's
 * pacing cut the log in the same places.
 */
export { beatEnds };

/** Events applied after `beat` steps (0 = nothing yet). */
export function indexAfterBeat(ends: readonly number[], beat: number): number {
  if (beat <= 0) return 0;
  return ends[Math.min(beat, ends.length) - 1] ?? 0;
}

/** Creature ids in the order they act in a round (from the turn and skip events). */
export function turnOrderOfRound(events: readonly FightEvent[], round: number): string[] {
  const out: string[] = [];
  for (const e of events) {
    if ((e.t === 'turn' || e.t === 'skip') && e.round === round && !out.includes(e.creature)) {
      out.push(e.creature);
    }
  }
  return out;
}

/** One creature of a turn strip, with what the strip says about it right now. */
export interface TurnChip {
  id: string;
  /** The creature's name (plain text). */
  label: string;
  /** It is acting now. */
  current: boolean;
  /** It has acted this round (and is not the one acting now). */
  done: boolean;
  /** It is knocked out. */
  ko: boolean;
}

/**
 * The chips of a turn strip for creatures in `order`, from the step the replay is at: the creature
 * acting now is `current`, those that already acted are `done`, the knocked-out ones are `ko`.
 * `knockedOut` replaces the step's knockouts.
 */
export function turnChips(
  order: readonly string[],
  step: Pick<StepState, 'actor' | 'acted' | 'knockedOut'>,
  labelOf: (id: string) => string,
  options: { knockedOut?: (id: string) => boolean } = {},
): TurnChip[] {
  return order.map((id) => {
    const current = step.actor === id;
    return {
      id,
      label: labelOf(id),
      current,
      done: !current && step.acted.includes(id),
      ko: options.knockedOut?.(id) ?? step.knockedOut.includes(id),
    };
  });
}

export type { Speed } from '@creatures/engine';

// --- Key moments ---

export interface KeyMoment {
  kind: 'reaction' | 'hit' | 'gimmick' | 'knockout' | 'reflect' | 'wasted';
  round: number;
  /** Heading, for example "Biggest reaction". */
  title: string;
  /** One sentence from `describeEvent`. */
  text: string;
}

const MAX_MOMENTS = 5;

/** The event with the largest `score`; the first one wins ties. */
function best<T extends FightEvent>(
  events: readonly FightEvent[],
  match: (e: FightEvent) => e is T,
  score: (e: T) => number,
): T | undefined {
  let out: T | undefined;
  for (const e of events) {
    if (!match(e)) continue;
    if (out === undefined || score(e) > score(out)) out = e;
  }
  return out;
}

/**
 * Up to five moments worth looking at: the biggest reaction, the biggest hit, the boss's strongest
 * gimmick hit (or silence), knockouts, a reaction the boss reflected, and setups that were wasted
 * (a mark overwritten before anyone cashed it in). In that order of importance.
 */
export function keyMoments(events: readonly FightEvent[], names: EventNames): KeyMoment[] {
  const out: KeyMoment[] = [];
  const add = (kind: KeyMoment['kind'], title: string, e: FightEvent): void => {
    out.push({ kind, round: e.round, title, text: describeEvent(e, names) });
  };

  const reaction = best(
    events,
    (e): e is Extract<FightEvent, { t: 'reaction' }> => e.t === 'reaction' && !e.reflected,
    (e) => e.bonus,
  );
  if (reaction !== undefined) add('reaction', 'Biggest reaction', reaction);

  const hit = best(
    events,
    (e): e is Extract<FightEvent, { t: 'hit' }> => e.t === 'hit',
    (e) => e.damage,
  );
  if (hit !== undefined) add('hit', 'Biggest hit', hit);

  const gimmickHit = best(
    events,
    (e): e is Extract<FightEvent, { t: 'boss_hit' }> =>
      e.t === 'boss_hit' && e.source === 'gimmick' && e.shielded !== true,
    (e) => e.damage,
  );
  if (gimmickHit !== undefined) {
    add('gimmick', 'Boss gimmick', gimmickHit);
  } else {
    const silence = events.find((e) => e.t === 'silence');
    if (silence !== undefined) add('gimmick', 'Boss gimmick', silence);
  }

  for (const e of events) {
    if (e.t === 'knockout' && out.filter((m) => m.kind === 'knockout').length < 2) {
      add('knockout', 'Knocked out', e);
    }
  }

  const reflected = events.find((e) => e.t === 'reaction' && e.reflected);
  if (reflected !== undefined) add('reflect', 'Reaction reflected', reflected);

  const wasted = events.find((e) => e.t === 'mark' && e.replaced !== null);
  if (wasted !== undefined) add('wasted', 'Wasted setup', wasted);

  return out.slice(0, MAX_MOMENTS);
}

// --- Personal recap ---

interface CreatureRecap {
  id: string;
  name: string;
  role: string;
  /** Damage this creature dealt to the boss, reaction bonuses included. */
  damage: number;
  /** Credit for marks it set that others (or it) cashed in: the setup share (60%) of the reaction bonus. */
  setupCredit: number;
  /** Reactions it set up. */
  setups: number;
  /** Reactions it cashed in. */
  payoffs: number;
  /** Marks of this creature that were overwritten before anyone cashed them in. */
  wasted: number;
  knockedOutRound: number | null;
}

interface Recap {
  creatures: CreatureRecap[];
  damage: number;
  setupCredit: number;
  setups: number;
  /** Plain statements of fact about the player's creatures; never advice. Empty when there is nothing to say. */
  notes: string[];
}

/**
 * The ids of the replay row's creatures that belong to the player, by their owner key in this fight
 * (`ReplayView.you`). With no key (the player was not in the fight) nothing is theirs; guests
 * (owner null) never are.
 */
export function mineInRow(row: readonly ReplayRowEntry[], you: string | null): string[] {
  if (you === null) return [];
  return row.filter((r) => r.owner === you).map((r) => r.id);
}

/** What the player's own creatures did in this fight. */
export function personalRecap(
  events: readonly FightEvent[],
  row: readonly ReplayRowEntry[],
  mineIds: readonly string[],
): Recap {
  const mine = new Set(mineIds);
  const creatures = new Map<string, CreatureRecap>();
  for (const r of row) {
    if (!mine.has(r.id)) continue;
    creatures.set(r.id, {
      id: r.id,
      name: r.name,
      role: r.role,
      damage: 0,
      setupCredit: 0,
      setups: 0,
      payoffs: 0,
      wasted: 0,
      knockedOutRound: null,
    });
  }
  let markOwner: string | null = null;
  for (const e of events) {
    switch (e.t) {
      case 'hit': {
        const c = creatures.get(e.creature);
        if (c !== undefined) c.damage += e.damage;
        break;
      }
      case 'reaction': {
        const payoff = creatures.get(e.payoff);
        if (payoff !== undefined && !e.reflected) payoff.payoffs += 1;
        const setter = e.setupCreature === null ? undefined : creatures.get(e.setupCreature);
        if (setter !== undefined && !e.reflected) {
          setter.setups += 1;
          setter.setupCredit += Math.floor((e.bonus * RULES.combat.setupShareBp) / 10_000);
        }
        markOwner = null;
        break;
      }
      case 'mark': {
        // The creature that set the mark being replaced loses its setup.
        const previous = markOwner === null ? undefined : creatures.get(markOwner);
        if (previous !== undefined && e.replaced !== null) previous.wasted += 1;
        markOwner = e.creature;
        break;
      }
      case 'knockout': {
        const c = creatures.get(e.creature);
        if (c !== undefined && c.knockedOutRound === null) c.knockedOutRound = e.round;
        break;
      }
      default:
        break;
    }
  }
  const list = [...creatures.values()];
  const setups = list.reduce((sum, c) => sum + c.setups, 0);
  return {
    creatures: list,
    damage: list.reduce((sum, c) => sum + c.damage, 0),
    setupCredit: list.reduce((sum, c) => sum + c.setupCredit, 0),
    setups,
    notes: recapNotes(list),
  };
}

/** What happened to the player's creatures, as statements of fact (no advice). */
export function recapNotes(list: readonly CreatureRecap[]): string[] {
  if (list.length === 0) return ['None of your creatures were in this fight.'];
  const notes: string[] = [];
  const setups = list.reduce((sum, c) => sum + c.setups, 0);
  if (setups === 0) notes.push('None of your creatures set up a reaction.');
  const wasted = list.reduce((sum, c) => sum + c.wasted, 0);
  if (wasted > 0) {
    notes.push(
      `${String(wasted)} of your setups ${wasted === 1 ? 'was' : 'were'} overwritten before anyone cashed ${wasted === 1 ? 'it' : 'them'} in.`,
    );
  }
  for (const c of list) {
    if (c.knockedOutRound !== null) {
      notes.push(`${c.name} was knocked out in round ${String(c.knockedOutRound)}.`);
    }
  }
  return notes;
}
