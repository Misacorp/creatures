/**
 * The fight stage's brain: turns the fight's event log into short animation beats. Pure (no DOM, no
 * timers, no randomness), so it is unit-tested; `Stage.tsx` draws what this says and `LiveStage`
 * plays the beats with timers.
 *
 * A beat is one run of events that belong together, cut at the same places as the replay's steps
 * (`beatEnds`): a round opening with its abilities, one creature's turn with its hit, mark and
 * reaction, one boss attack, one boss gimmick. Each beat gets cues (what to show) and a length
 * of at most `MAX_BEAT_MS`. Anything that moves is only decoration: the state after a beat (HP, the
 * mark, who is knocked out, which zones are shielded) always comes from the events themselves.
 */
import { content } from '@creatures/game';
import { zoneOfIndex, ZONES, type FightEvent, type Zone } from '@creatures/engine';
import { beatEnds, stateAt, type StepState } from './replay';

/** No beat lasts longer than this, and none is shorter than the minimum. */
export const MAX_BEAT_MS = 600;
export const MIN_BEAT_MS = 120;
const BASE_BEAT_MS = 300;

/** Extra time for the beats that carry something worth a second look. */
const WEIGHT_MS = {
  crit: 150,
  burst: 150,
  ability: 150,
  ko: 100,
  gimmick: 100,
  banner: 100,
} as const;

export type FloatTone = 'hit' | 'hurt' | 'blocked' | 'buff';
export type ZoneEffect = 'shield' | 'rally' | 'hit';

/**
 * One thing to show. `i` is the index of the event it came from, so cues are unique and their
 * order is the order of the log. A `null` target is the boss.
 */
export type Cue =
  | { kind: 'hop'; i: number; creature: string }
  | { kind: 'flash'; i: number; target: string | null }
  | {
      kind: 'float';
      i: number;
      target: string | null;
      text: string;
      tone: FloatTone;
      crit: boolean;
      /** Sideways drift in steps (-3 to 3), from the event index. */
      drift: number;
    }
  | {
      kind: 'burst';
      i: number;
      target: string | null;
      reaction: string;
      /** The element of the mark and the element that set it off, or null for an unknown reaction. */
      elements: readonly [string, string] | null;
      reflected: boolean;
    }
  | { kind: 'mark'; i: number; element: string }
  | { kind: 'ko'; i: number; creature: string }
  | { kind: 'zone'; i: number; zone: Zone; effect: ZoneEffect; op: string | null }
  | { kind: 'shake'; i: number; zone: Zone }
  | { kind: 'ability'; i: number; ability: string; creature: string | null; player: string }
  | { kind: 'gimmick'; i: number; gimmick: string; op: string }
  | { kind: 'silenced'; i: number; creature: string }
  | { kind: 'banner'; i: number; text: string };

export interface Beat {
  /** The events [from, to) of the log. */
  from: number;
  to: number;
  round: number;
  cues: Cue[];
  /** How long the beat lasts, in milliseconds. */
  ms: number;
}

// --- Visual randomness, without randomness ---

const DRIFTS = [-2, 2, -1, 3, 0, -3, 1] as const;

/** The sideways drift of a floating number, picked from the event index (the same every time). */
export function driftFor(eventIndex: number): number {
  return DRIFTS[Math.abs(Math.trunc(eventIndex)) % DRIFTS.length] ?? 0;
}

// --- Zones ---

/** The zone a creature stands in, from the row (ids, left to right); null if it is not in the row. */
export function zoneOfCreature(rowIds: readonly string[], id: string): Zone | null {
  const index = rowIds.indexOf(id);
  return index < 0 ? null : zoneOfIndex(index, rowIds.length);
}

/** The row cut into its zones, front first. Zones without a creature are left out. */
export function groupByZone<T extends { id: string }>(
  row: readonly T[],
): { zone: Zone; items: T[] }[] {
  const groups = ZONES.map((zone) => ({ zone, items: [] as T[] }));
  for (const [index, item] of row.entries()) {
    const zone = zoneOfIndex(index, row.length);
    groups.find((g) => g.zone === zone)?.items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

// --- Cues ---

/** The two elements of a reaction (its mark and its trigger), from the content. */
export function reactionElements(reactionId: string): readonly [string, string] | null {
  const def = content.reactions.find((r) => r.id === reactionId);
  return def === undefined ? null : [def.markElement, def.triggerElement];
}

const abilityEffects = (abilityId: string) =>
  content.finaleAbilities.find((a) => a.id === abilityId)?.effects ?? [];

/**
 * The cues of the events [from, to). `rowIds` is the row, left to right (it decides which zone a
 * creature is in). Events that show nothing (the end of a round, an adaptation) give no cue; the
 * text log has them.
 */
export function cuesForEvents(
  events: readonly FightEvent[],
  from: number,
  to: number,
  rowIds: readonly string[],
): Cue[] {
  const cues: Cue[] = [];
  const end = Math.min(to, events.length);
  const zoneOf = (id: string): Zone | null => zoneOfCreature(rowIds, id);
  for (let i = Math.max(0, from); i < end; i++) {
    const e = events[i] as FightEvent;
    switch (e.t) {
      case 'round_start':
        if (e.luck !== undefined) {
          cues.push({
            kind: 'banner',
            i,
            text: e.luck.kind === 'surge' ? 'Fortune smiles!' : 'Bad omen!',
          });
        }
        break;
      case 'support_buff':
        cues.push({ kind: 'hop', i, creature: e.supporter });
        cues.push({
          kind: 'float',
          i,
          target: e.target,
          text: `+${String(Math.round(e.bp / 100))}%`,
          tone: 'buff',
          crit: false,
          drift: driftFor(i),
        });
        break;
      case 'ability': {
        cues.push({
          kind: 'ability',
          i,
          ability: e.ability,
          creature: e.creature ?? null,
          player: e.player,
        });
        for (const effect of abilityEffects(e.ability)) {
          if (effect.op === 'shield_wall' && e.zone !== undefined) {
            cues.push({ kind: 'zone', i, zone: e.zone, effect: 'shield', op: null });
          } else if (effect.op === 'rally') {
            for (const zone of ZONES)
              cues.push({ kind: 'zone', i, zone, effect: 'rally', op: null });
          }
        }
        break;
      }
      case 'turn':
        cues.push({ kind: 'hop', i, creature: e.creature });
        break;
      case 'skip':
        cues.push({ kind: 'silenced', i, creature: e.creature });
        break;
      case 'hit':
        cues.push({ kind: 'flash', i, target: null });
        cues.push({
          kind: 'float',
          i,
          target: null,
          text: String(e.damage),
          tone: 'hit',
          crit: e.crit === true,
          drift: driftFor(i),
        });
        break;
      case 'mark':
        cues.push({ kind: 'mark', i, element: e.element });
        break;
      case 'reaction':
        cues.push({
          kind: 'burst',
          i,
          target: e.reflected ? e.payoff : null,
          reaction: e.reaction,
          elements: reactionElements(e.reaction),
          reflected: e.reflected,
        });
        break;
      case 'gimmick': {
        cues.push({ kind: 'gimmick', i, gimmick: e.gimmick, op: e.op });
        if (e.op === 'hit_zone' || e.op === 'strike_highest_atk') {
          // The zone it hit is the zone of the first creature the gimmick hurt.
          for (let k = i + 1; k < end; k++) {
            const next = events[k] as FightEvent;
            if (next.t === 'gimmick' || next.t === 'turn' || next.t === 'round_end') break;
            if (next.t === 'boss_hit' && next.source === 'gimmick') {
              const zone = zoneOf(next.target);
              if (zone !== null) cues.push({ kind: 'zone', i, zone, effect: 'hit', op: e.op });
              break;
            }
          }
        }
        break;
      }
      case 'boss_hit': {
        const zone = zoneOf(e.target);
        cues.push({ kind: 'flash', i, target: e.target });
        cues.push({
          kind: 'float',
          i,
          target: e.target,
          text: e.shielded === true ? 'BLOCKED' : String(e.damage),
          tone: e.shielded === true ? 'blocked' : 'hurt',
          crit: e.crit === true,
          drift: driftFor(i),
        });
        if (zone !== null) {
          cues.push({ kind: 'shake', i, zone });
          if (e.shielded === true) cues.push({ kind: 'zone', i, zone, effect: 'shield', op: null });
        }
        break;
      }
      case 'knockout':
        cues.push({ kind: 'ko', i, creature: e.creature });
        break;
      case 'silence':
        cues.push({ kind: 'silenced', i, creature: e.creature });
        break;
      default:
        break;
    }
  }
  return cues;
}

// --- Beats ---

/** How long a beat lasts: a plain turn is short, a crit, a reaction or an ability gets a little longer. */
export function beatMs(cues: readonly Cue[]): number {
  if (cues.length === 0) return MIN_BEAT_MS;
  let ms = BASE_BEAT_MS;
  const has = (match: (c: Cue) => boolean): boolean => cues.some(match);
  if (has((c) => c.kind === 'float' && c.crit)) ms += WEIGHT_MS.crit;
  if (has((c) => c.kind === 'burst')) ms += WEIGHT_MS.burst;
  if (has((c) => c.kind === 'ability')) ms += WEIGHT_MS.ability;
  if (has((c) => c.kind === 'ko')) ms += WEIGHT_MS.ko;
  if (has((c) => c.kind === 'gimmick')) ms += WEIGHT_MS.gimmick;
  if (has((c) => c.kind === 'banner')) ms += WEIGHT_MS.banner;
  return Math.min(MAX_BEAT_MS, ms);
}

/**
 * The beats that cover the events from index `from` to the end of the log, in order. The first beat
 * may be a partial one (when `from` is inside a beat).
 */
export function buildBeats(
  events: readonly FightEvent[],
  from: number,
  rowIds: readonly string[],
): Beat[] {
  const beats: Beat[] = [];
  let start = Math.max(0, from);
  for (const end of beatEnds(events)) {
    if (end <= start) continue;
    const cues = cuesForEvents(events, start, end, rowIds);
    beats.push({
      from: start,
      to: end,
      round: (events[start] as FightEvent).round,
      cues,
      ms: beatMs(cues),
    });
    start = end;
  }
  return beats;
}

/** Shortens the beats so that together they take at most `budgetMs`, never below the minimum. */
export function fitBeats(beats: readonly Beat[], budgetMs: number): Beat[] {
  const total = beats.reduce((sum, b) => sum + b.ms, 0);
  if (total <= budgetMs || total === 0) return [...beats];
  const scale = Math.max(0, budgetMs) / total;
  return beats.map((b) => ({ ...b, ms: Math.max(MIN_BEAT_MS, Math.floor(b.ms * scale)) }));
}

/** The time a live round's beats may use: the round length, leaving room for the next poll. */
export function liveBudgetMs(roundMs: number): number {
  return Math.max(2000, roundMs - 1500);
}

/** The start time of every beat, in ms from the first beat's start. */
export function beatOffsets(beats: readonly Beat[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const b of beats) {
    out.push(at);
    at += b.ms;
  }
  return out;
}

/**
 * Where a live stage starts playing when it is `shown` events in and the log has grown. If whole
 * rounds went by unseen (the tab was in the background), they are skipped: the stage jumps to the
 * start of the newest round and plays that one.
 */
export function playStart(events: readonly FightEvent[], shown: number): number {
  let newest = 0;
  for (const e of events) if (e.round > newest) newest = e.round;
  const first = events.findIndex((e) => e.t === 'round_start' && e.round === newest);
  return first < 0 ? shown : Math.max(shown, first);
}

// --- State ---

export interface StageState extends StepState {
  /** Zones with a Shield Wall up in the current round. */
  shielded: readonly Zone[];
}

/** The zones that have a Shield Wall up after the first `index` events. */
export function shieldedZones(events: readonly FightEvent[], index: number): Zone[] {
  const end = Math.min(Math.max(0, Math.trunc(index)), events.length);
  const walls: { zone: Zone; until: number }[] = [];
  let round = 0;
  for (let i = 0; i < end; i++) {
    const e = events[i] as FightEvent;
    round = e.round;
    if (e.t !== 'ability' || e.zone === undefined) continue;
    for (const effect of abilityEffects(e.ability)) {
      if (effect.op === 'shield_wall') {
        walls.push({ zone: e.zone, until: e.round + (effect.rounds ?? 1) - 1 });
      }
    }
  }
  return ZONES.filter((zone) => walls.some((w) => w.zone === zone && w.until >= round));
}

/** What the stage shows after the first `index` events: HP, mark, knockouts, shields. */
export function stageStateAt(
  events: readonly FightEvent[],
  index: number,
  bossHpStart: number,
): StageState {
  return { ...stateAt(events, index, bossHpStart), shielded: shieldedZones(events, index) };
}

// --- The HP bar ---

export const HP_SEGMENTS = 20;

/**
 * How many of the bar's segments are lit. Any HP at all keeps at least one lit, and only a boss at
 * full HP shows them all, so the bar never says "dead" or "full" when it is not.
 */
export function hpSegments(current: number, max: number, total = HP_SEGMENTS): number {
  if (max <= 0 || current <= 0) return 0;
  if (current >= max) return total;
  return Math.min(total - 1, Math.max(1, Math.ceil((current * total) / max)));
}

// --- Scrolling the row ---

/**
 * Where to scroll the row so that an item (its left edge and width, in the row's own coordinates)
 * is in view: unchanged when it already is, otherwise centred.
 */
export function scrollToShow(
  view: { scrollLeft: number; width: number },
  item: { left: number; width: number },
): number {
  const visible =
    item.left >= view.scrollLeft && item.left + item.width <= view.scrollLeft + view.width;
  if (visible) return view.scrollLeft;
  return Math.max(0, Math.round(item.left + item.width / 2 - view.width / 2));
}
