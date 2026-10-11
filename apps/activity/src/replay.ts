/**
 * Pure helpers for the replay viewer: stepping through the event log, the "Key moments" summary and
 * the personal recap. Nothing here touches the DOM or the network, and all text it returns is
 * plain text (it can contain player names).
 */
import { describeEvent, type EventNames, type FightEvent } from '@creatures/engine';
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
  };
}

function applyOne(s: StepState, e: FightEvent): StepState {
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
      };
    case 'turn':
    case 'skip':
      return {
        ...s,
        round: e.round,
        actor: e.creature,
        bossActing: false,
        acted: s.actor === null ? s.acted : [...s.acted, s.actor],
      };
    case 'hit':
      return { ...s, bossHp: e.bossHp };
    case 'mark':
      return { ...s, mark: e.element };
    case 'reaction':
      return { ...s, mark: null };
    case 'gimmick':
      return {
        ...s,
        actor: null,
        bossActing: true,
        acted: s.actor === null ? s.acted : [...s.acted, s.actor],
      };
    case 'boss_hit':
      return e.source === 'reflect'
        ? s
        : {
            ...s,
            actor: null,
            bossActing: true,
            acted: s.actor === null ? s.acted : [...s.acted, s.actor],
          };
    case 'knockout':
      return s.knockedOut.includes(e.creature)
        ? s
        : { ...s, knockedOut: [...s.knockedOut, e.creature] };
    case 'round_end':
      return { ...s, bossHp: e.bossHp, actor: null, bossActing: false };
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
  for (let i = 0; i < end; i++) state = applyOne(state, events[i] as FightEvent);
  return { ...state, index: end };
}

/** True when this event starts a new playback step (a creature's turn, the boss acting, a round edge). */
function startsBeat(e: FightEvent): boolean {
  switch (e.t) {
    case 'round_start':
    case 'turn':
    case 'skip':
    case 'gimmick':
    case 'round_end':
      return true;
    case 'boss_hit':
      return e.source === 'attack';
    default:
      return false;
  }
}

/**
 * Playback steps. Each step is a run of events that belong together (one creature's turn with its
 * hit, mark and reaction; one boss attack). Returns the event index each step ends at, so step `n`
 * leaves `ends[n - 1]` events applied.
 */
export function beatEnds(events: readonly FightEvent[]): number[] {
  const ends: number[] = [];
  for (let i = 1; i < events.length; i++) {
    if (startsBeat(events[i] as FightEvent)) ends.push(i);
  }
  if (events.length > 0) ends.push(events.length);
  return ends;
}

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

export type Speed = 1 | 2;

/** Milliseconds between steps. */
export function stepDelayMs(speed: Speed): number {
  return speed === 2 ? 350 : 800;
}

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

export interface CreatureRecap {
  id: string;
  name: string;
  role: string;
  /** Damage this creature dealt to the boss, reaction bonuses included. */
  damage: number;
  /** Credit for marks it set that others (or it) cashed in: half of the reaction bonus. */
  setupCredit: number;
  /** Reactions it set up. */
  setups: number;
  /** Reactions it cashed in. */
  payoffs: number;
  /** Marks of this creature that were overwritten before anyone cashed them in. */
  wasted: number;
  knockedOutRound: number | null;
}

export interface Recap {
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
          setter.setupCredit += Math.floor(e.bonus / 2);
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
