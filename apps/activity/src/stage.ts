/**
 * The fight stage's brain: turns the fight's event log into short animation beats. Pure (no DOM, no
 * timers, no randomness), so it is unit-tested; `Stage.tsx` draws what this says and `LiveStage`
 * plays the beats with timers.
 *
 * A beat is one run of events that belong together, cut at the same places as the replay's steps
 * (`beatEnds`): a round opening with its abilities, one creature's turn with its hit, mark and
 * reaction, one boss attack, one boss gimmick. The timing of a beat (its stagger, its wind-up and the
 * round's intro and tail) comes from the engine's `planRounds`, the same code the server paces the
 * rounds with, so the stage and the clock cannot disagree. Each beat gets cues (what to show). The
 * stagger is not how long the effects stay on screen. That is `stage-fx.ts` (a damage number floats
 * for 2.5 seconds, a crit for 3), and effects of one beat overlap the next beats.
 *
 * A boss action (an attack, a zone hit, a strike on the strongest, a silence, a reflect) is shown in
 * two steps. The beat's `windup` cues put red reticles on exactly the creatures it will hit, 600 ms
 * before the hit; its `cues` then show the strike, with a label saying what it is and whom it hits. Anything that moves is only decoration: the state
 * after a beat (HP, the mark, who is knocked out, which zones are shielded) always comes from the
 * events themselves.
 */
import { content, dungeonContent, type BossDef } from '@creatures/game';
import {
  planRounds,
  zoneOfIndex,
  ZONES,
  type FightEvent,
  type PlaybackOptions,
  type Zone,
} from '@creatures/engine';
import { stateAt, type StepState } from './replay';

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
  | { kind: 'zone'; i: number; zone: Zone; effect: ZoneEffect }
  | { kind: 'shake'; i: number; zone: Zone }
  | { kind: 'ability'; i: number; ability: string; creature: string | null; player: string }
  | { kind: 'windup'; i: number; strike: BossStrike }
  | { kind: 'strike'; i: number; strike: BossStrike }
  | { kind: 'silenced'; i: number; creature: string }
  | { kind: 'banner'; i: number; text: string };

/** What the boss does. `reflect_armed` is the trap being set at the start of a round: it has no wind-up. */
export type StrikeAction =
  | 'attack'
  | 'hit_zone'
  | 'strike_highest_atk'
  | 'silence_ends'
  | 'reflect'
  | 'reflect_armed'
  | 'other';

/** One boss action, read from the events of its beat. */
export interface BossStrike {
  action: StrikeAction;
  /** The gimmick's content id (its name is in the fight's names); null for the plain attack. */
  gimmick: string | null;
  /** Exactly the creatures it hits or silences, in the order the events say. */
  targets: readonly string[];
  /** The zone a zone hit covers, or the zone of its first target; null if nobody was hit. */
  zone: Zone | null;
  /** Targets whose hit was stopped: a Shield Wall took it. */
  blocked: readonly string[];
  /** The creature a guard stepped in for (the guard is the target); null if no guard did. */
  guarded: string | null;
}

export interface Beat {
  /** The events [from, to) of the log. */
  from: number;
  to: number;
  round: number;
  /** What to show when the beat's events land (after the wind-up, if it has one). */
  cues: Cue[];
  /** The telegraph shown during the wind-up: reticles on the targets of the boss action. */
  windup: Cue[];
  /** How long the wind-up lasts before the events land (0 for beats without a boss action). */
  windupMs: number;
  /** How long after the beat starts the next one starts, wind-up included. */
  ms: number;
  /** How long "Round N" shows before this beat, when it opens a round; 0 otherwise. */
  introMs: number;
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

// --- Boss actions ---

/**
 * Every gimmick a dungeon room can have: the foes' own, and the one a room modifier adds to its foe
 * (Thorns). A fight in a dungeon room names its foe as the boss, so the lookups below find these
 * after the raid bosses.
 */
const dungeonGimmicks = [
  ...dungeonContent.foes.flatMap((f) => f.gimmicks),
  ...dungeonContent.modifiers.flatMap((m) =>
    m.effects.flatMap((e) => (e.op === 'foe_gimmick' ? [e.gimmick] : [])),
  ),
];

const gimmickOf = (bossId: string | undefined, gimmickId: string) => {
  const boss: BossDef | undefined =
    bossId === undefined ? undefined : content.bosses.find((b) => b.id === bossId);
  return (
    boss?.gimmicks.find((g) => g.id === gimmickId) ??
    content.bosses.flatMap((b) => b.gimmicks).find((g) => g.id === gimmickId) ??
    dungeonGimmicks.find((g) => g.id === gimmickId)
  );
};

/** The content id of the boss's reflect gimmick, for naming a reflected hit; null if it has none. */
function reflectGimmick(bossId: string | undefined): string | null {
  const boss = bossId === undefined ? undefined : content.bosses.find((b) => b.id === bossId);
  if (boss !== undefined) {
    return boss.gimmicks.find((g) => g.op === 'reflect_first_reaction')?.id ?? null;
  }
  // A dungeon foe reflects through the Thorns modifier (or its own gimmick).
  const foe = bossId === undefined ? undefined : dungeonContent.foes.find((f) => f.id === bossId);
  if (foe === undefined) return null;
  const own = foe.gimmicks.find((g) => g.op === 'reflect_first_reaction');
  const added = dungeonGimmicks.find((g) => g.op === 'reflect_first_reaction');
  return (own ?? added)?.id ?? null;
}

const KNOWN_ACTIONS: ReadonlySet<string> = new Set([
  'hit_zone',
  'strike_highest_atk',
  'silence_ends',
  'reflect_first_reaction',
]);

/**
 * The boss actions in the events [from, to), each with the event index it starts at: a plain attack,
 * a zone hit, a strike on the strongest creature, a silence, a reflected reaction, and the reflect
 * trap being armed. The targets are read from the events themselves (whoever the engine hurt or
 * silenced), so the telegraph shows exactly the affected creatures; only the zone of a zone hit comes
 * from the boss's content (a zone whose creatures are all down still has its outline).
 */
export function strikesOf(
  events: readonly FightEvent[],
  from: number,
  to: number,
  rowIds: readonly string[],
  bossId?: string,
): { i: number; strike: BossStrike }[] {
  const out: { i: number; strike: BossStrike }[] = [];
  const end = Math.min(to, events.length);
  for (let i = Math.max(0, from); i < end; i++) {
    const e = events[i] as FightEvent;
    if (e.t === 'boss_hit' && e.source === 'attack') {
      out.push({
        i,
        strike: {
          action: 'attack',
          gimmick: null,
          targets: [e.target],
          zone: zoneOfCreature(rowIds, e.target),
          blocked: e.shielded === true ? [e.target] : [],
          guarded: e.from ?? null,
        },
      });
    } else if (e.t === 'boss_hit' && e.source === 'reflect') {
      out.push({
        i,
        strike: {
          action: 'reflect',
          gimmick: reflectGimmick(bossId),
          targets: [e.target],
          zone: zoneOfCreature(rowIds, e.target),
          blocked: e.shielded === true ? [e.target] : [],
          guarded: null,
        },
      });
    } else if (e.t === 'gimmick') {
      if (e.op === 'reflect_first_reaction') {
        // The engine announces the trap twice a round (when it is armed and at the boss's turn): show it once.
        const first = events.findIndex(
          (x) => x.t === 'gimmick' && x.round === e.round && x.op === e.op,
        );
        if (first === i) {
          out.push({
            i,
            strike: {
              action: 'reflect_armed',
              gimmick: e.gimmick,
              targets: [],
              zone: null,
              blocked: [],
              guarded: null,
            },
          });
        }
        continue;
      }
      const targets: string[] = [];
      const blocked: string[] = [];
      for (let k = i + 1; k < end; k++) {
        const next = events[k] as FightEvent;
        if (
          next.t === 'gimmick' ||
          next.t === 'turn' ||
          next.t === 'skip' ||
          next.t === 'round_end' ||
          (next.t === 'boss_hit' && next.source === 'attack')
        ) {
          break;
        }
        if (next.t === 'boss_hit' && next.source === 'gimmick') {
          if (!targets.includes(next.target)) targets.push(next.target);
          if (next.shielded === true) blocked.push(next.target);
        } else if (next.t === 'silence' && !targets.includes(next.creature)) {
          targets.push(next.creature);
        }
      }
      const def = gimmickOf(bossId, e.gimmick);
      const zone =
        def?.op === 'hit_zone'
          ? def.zone
          : targets[0] === undefined
            ? null
            : zoneOfCreature(rowIds, targets[0]);
      out.push({
        i,
        strike: {
          action: KNOWN_ACTIONS.has(e.op) ? (e.op as StrikeAction) : 'other',
          gimmick: e.gimmick,
          targets,
          zone,
          blocked,
          guarded: null,
        },
      });
    }
  }
  return out;
}

/** The telegraph of the boss actions in [from, to): a reticle cue for each (the trap being armed has none). */
export function windupCuesForEvents(
  events: readonly FightEvent[],
  from: number,
  to: number,
  rowIds: readonly string[],
  bossId?: string,
): Cue[] {
  return strikesOf(events, from, to, rowIds, bossId)
    .filter(({ strike }) => strike.action !== 'reflect_armed')
    .map(({ i, strike }): Cue => ({ kind: 'windup', i, strike }));
}

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
  bossId?: string,
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
            cues.push({ kind: 'zone', i, zone: e.zone, effect: 'shield' });
          } else if (effect.op === 'rally') {
            for (const zone of ZONES) cues.push({ kind: 'zone', i, zone, effect: 'rally' });
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
          if (e.shielded === true) cues.push({ kind: 'zone', i, zone, effect: 'shield' });
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
  for (const { i, strike } of strikesOf(events, from, to, rowIds, bossId)) {
    cues.push({ kind: 'strike', i, strike });
    // A zone hit is a shockwave over the whole row of its zone.
    if (strike.action === 'hit_zone' && strike.zone !== null) {
      cues.push({ kind: 'zone', i, zone: strike.zone, effect: 'hit' });
    }
  }
  return cues;
}

// --- Beats ---

/**
 * The beats that cover the events from index `from` to the end of the log, in order, with the timing
 * the engine plans for them (`options` picks the intro and the replay speed). The first beat may be
 * a partial one (when `from` is inside a beat); it has no wind-up and no intro then.
 */
export function buildBeats(
  events: readonly FightEvent[],
  from: number,
  rowIds: readonly string[],
  bossId?: string,
  options: PlaybackOptions = {},
): Beat[] {
  const beats: Beat[] = [];
  const first = Math.max(0, from);
  for (const plan of planRounds(events, options)) {
    plan.beats.forEach((b, k) => {
      if (b.to <= first) return;
      const start = Math.max(b.from, first);
      const whole = start === b.from;
      beats.push({
        from: start,
        to: b.to,
        round: (events[start] as FightEvent).round,
        cues: cuesForEvents(events, start, b.to, rowIds, bossId),
        windup:
          whole && b.windupMs > 0 ? windupCuesForEvents(events, start, b.to, rowIds, bossId) : [],
        windupMs: whole ? b.windupMs : 0,
        ms: b.ms,
        introMs: whole && k === 0 ? plan.introMs : 0,
      });
    });
  }
  return beats;
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

/**
 * Each creature's HP after the first `index` events, from the HP it started the fight with. The
 * only thing that costs a creature HP is a boss hit (`boss_hit`, whose `damage` is what got through
 * after guards and Shield Walls), and nothing heals, so the events are all there is to read. It
 * never goes below 0. A creature missing from `start` is left out.
 */
export function creatureHpAt(
  events: readonly FightEvent[],
  index: number,
  start: Readonly<Record<string, number>>,
): Record<string, number> {
  const hp: Record<string, number> = { ...start };
  const end = Math.min(Math.max(0, Math.trunc(index)), events.length);
  for (let i = 0; i < end; i++) {
    const e = events[i] as FightEvent;
    if (e.t !== 'boss_hit') continue;
    const before = hp[e.target];
    if (before !== undefined) hp[e.target] = Math.max(0, before - e.damage);
  }
  return hp;
}

// --- Abilities that have fired ---

/** One ability that has taken effect: its key, the creature it belongs to (if any) and the round. */
export interface AbilityUse {
  key: string;
  ability: string;
  creature: string | null;
  round: number;
}

/** The abilities that have fired in the first `index` events, in the order they fired. */
export function abilityUsesAt(events: readonly FightEvent[], index: number): AbilityUse[] {
  const end = Math.min(Math.max(0, Math.trunc(index)), events.length);
  const out: AbilityUse[] = [];
  for (let i = 0; i < end; i++) {
    const e = events[i] as FightEvent;
    if (e.t !== 'ability') continue;
    out.push({ key: e.key, ability: e.ability, creature: e.creature ?? null, round: e.round });
  }
  return out;
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
