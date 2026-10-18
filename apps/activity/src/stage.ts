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
import { RULES, content, dungeonContent, effectiveStats, type BossDef } from '@creatures/game';
import {
  planRounds,
  zoneOfIndex,
  ZONES,
  type FightEvent,
  type PlaybackOptions,
  type ProcKind,
  type Zone,
} from '@creatures/engine';
import { getSpecies } from './game';
import type { FightGuardRules, ReplayRowEntry } from './raid-api';
import { stateAt, turnOrderOfRound, type StepState } from './replay';

type FloatTone = 'hit' | 'hurt' | 'blocked' | 'buff' | 'heal' | 'cleanse' | 'immune';
type ZoneEffect = 'shield' | 'rally' | 'hit';

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
      /**
       * Set on a boss hit that was one of more than `CROWDED_HITS` creatures hit by one action: the
       * damage it did, so the stage can leave out the small ones (`showsNumber`).
       */
      crowded?: true;
      damage?: number;
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
  /** Guard cover softened a hit on this creature: a small shield pip on it. */
  | { kind: 'cover'; i: number; creature: string; guard: string }
  /** A Guard's armor took this much off a hit it took: a small shield pip on the Guard. */
  | { kind: 'armor'; i: number; creature: string; prevented: number }
  | { kind: 'banner'; i: number; text: string };

/** What the boss does. `reflect_armed` is the trap being set at the start of a round: it has no wind-up. */
type StrikeAction =
  | 'attack'
  | 'hit_zone'
  | 'strike_highest_atk'
  | 'silence_ends'
  | 'reflect'
  | 'reflect_armed'
  | 'sweep'
  | 'barrage'
  | 'slam'
  | 'lance'
  | 'pincer'
  /** A charged pattern was announced: its victims stay marked until it lands. */
  | 'charge'
  /** The enrage round's hit on every living creature. */
  | 'enrage'
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
  /** A sweep's rows, front first (a charge's, when it is announced). Absent for other actions. */
  rows?: readonly Zone[];
  /** The creatures a slam's splash reached, beside the impact (which is in `targets`). */
  splash?: readonly string[];
  /** A lance's lane: the slot position within a row, from 0. */
  lane?: number;
  /** The pattern is a charge that has landed: its victims were marked a round ago. */
  charged?: true;
}

/** The most reticles a boss action puts up at once; more targets than this are still hit. */
export const MAX_RETICLES = 6;
/** When one action hits more creatures than this, only the big hits get a number. */
export const CROWDED_HITS = 8;
/** "Big" for a crowded action: a hit of at least this share of the creature's max HP, in basis points. */
export const BIG_HIT_BP = 1_000;

/**
 * The rows an action covers, for the row outline: a sweep's (or a charge's, once announced), or the
 * one zone of a zone hit. Empty for the actions that mark creatures instead.
 */
export function strikeRows(strike: BossStrike): readonly Zone[] {
  if (strike.rows !== undefined) return strike.rows;
  return strike.action === 'hit_zone' && strike.zone !== null ? [strike.zone] : [];
}

/** The creatures an action puts reticles on: its targets, but never more than `MAX_RETICLES`. A row outline has none. */
export function reticleTargets(strike: BossStrike): readonly string[] {
  switch (strike.action) {
    case 'hit_zone':
    case 'sweep':
    case 'reflect_armed':
    case 'charge':
    case 'enrage':
      return [];
    default:
      return strike.targets.slice(0, MAX_RETICLES);
  }
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

/** "1st", "2nd", "3rd", "4th", "11th", "21st": a place in an order (the dungeon's acting order under each creature). */
export function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${String(n)}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${String(n)}${suffix}`;
}

/**
 * Each creature's place in the acting order of a round, from 1, for the ordinals under the creatures.
 * `fixed` (the dungeon) acts in row order, left to right. Otherwise (the raid, whose turn orders vary
 * by boss) it follows the engine's own turn and skip events for `round`, so a creature with no turn
 * that round (knocked out earlier, or a round the log has not reached) has no place.
 */
export function actingSlots(
  events: readonly FightEvent[],
  round: number,
  rowIds: readonly string[],
  fixed: boolean,
): Map<string, number> {
  const order = fixed ? rowIds : turnOrderOfRound(events, Math.max(1, round));
  return new Map(order.map((id, i) => [id, i + 1]));
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
  ...dungeonContent.foes.flatMap((f) => [
    ...f.gimmicks,
    // A room boss's landmark signature (a charge): it only comes up at landmark depths.
    ...(f.signature === undefined ? [] : [f.signature]),
  ]),
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

/**
 * The word floated over a creature when a chance line or a trigger line fires (a proc event). The lines
 * that boost another creature (Kindling, Warm heart, Overflow) float the boost over that creature
 * instead; Echo floats its damage over the boss.
 */
export const PROC_WORDS: Readonly<Record<ProcKind, string>> = {
  echo: 'Echo',
  steady_paws: 'Steady',
  warm_heart: 'Warm heart',
  quick_remark: 'Re-mark',
  spill_over: 'Spill-over',
  payback: 'Payback',
  kindling: 'Kindling',
  opening_mark: 'Opening mark',
  rally_cry: 'Rally cry',
  ember_tail: 'Ember tail',
  storm_warning: 'Storm warning',
  stubborn: 'Stubborn!',
  last_stand: 'Last stand',
  overflow: 'Overflow',
  patient: 'Patient',
  shared_warmth: 'Shared warmth',
};

const KNOWN_ACTIONS: ReadonlySet<string> = new Set([
  'hit_zone',
  'strike_highest_atk',
  'silence_ends',
  'sweep',
  'barrage',
  'slam',
  'lance',
  'pincer',
]);

/** True for the events that end the run of hits one boss action makes. */
function endsHitRun(e: FightEvent): boolean {
  return (
    e.t === 'gimmick' ||
    e.t === 'turn' ||
    e.t === 'skip' ||
    e.t === 'round_start' ||
    e.t === 'round_end' ||
    e.t === 'enrage' ||
    e.t === 'retreat' ||
    (e.t === 'boss_hit' && (e.source === 'attack' || e.source === 'enrage'))
  );
}

/** The zones the given creatures stand in, front first, once each. */
function zonesOf(rowIds: readonly string[], ids: readonly string[]): Zone[] {
  const found = new Set<Zone>();
  for (const id of ids) {
    const zone = zoneOfCreature(rowIds, id);
    if (zone !== null) found.add(zone);
  }
  return ZONES.filter((z) => found.has(z));
}

/**
 * The boss actions in the events [from, to), each with the event index it starts at: a plain attack,
 * a zone hit, a strike on the strongest creature (with its jumps), a silence, a sweep, a barrage, a
 * slam, a lance, a pincer, a charge being announced (its marks), the enrage round's hit, a reflected
 * reaction, and the reflect trap being armed. The targets are read from the events themselves
 * (whoever the engine hurt or silenced), so the telegraph shows exactly the affected creatures; only
 * the zone of a zone hit comes from the boss's content (a zone whose creatures are all down still
 * has its outline).
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
  // The enrage round's hits on every creature are one action: this is its strike while it is open.
  let enrage: { targets: string[] } | null = null;
  for (let i = Math.max(0, from); i < end; i++) {
    const e = events[i] as FightEvent;
    if (endsHitRun(e) && !(e.t === 'boss_hit' && e.source === 'enrage')) enrage = null;
    if (e.t === 'boss_hit' && e.source === 'enrage') {
      if (enrage === null) {
        const targets: string[] = [];
        enrage = { targets };
        out.push({
          i,
          strike: {
            action: 'enrage',
            gimmick: null,
            targets,
            zone: null,
            blocked: [],
            guarded: null,
          },
        });
      }
      if (!enrage.targets.includes(e.target)) enrage.targets.push(e.target);
    } else if (e.t === 'boss_hit' && e.source === 'attack') {
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
    } else if (e.t === 'charge') {
      const rows = e.rows === undefined ? [] : ZONES.filter((z) => e.rows?.includes(z) === true);
      out.push({
        i,
        strike: {
          action: 'charge',
          gimmick: e.gimmick,
          targets: e.marks,
          zone: rows[0] ?? (e.marks[0] === undefined ? null : zoneOfCreature(rowIds, e.marks[0])),
          blocked: [],
          guarded: null,
          ...(rows.length === 0 ? {} : { rows }),
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
      const def = gimmickOf(bossId, e.gimmick);
      // A charge that lands is its pattern: the event may name either (the content says which).
      const inner = def?.op === 'charge' ? def.then.op : null;
      const op = e.op === 'charge' && inner !== null ? inner : e.op;
      const targets: string[] = [];
      const splash: string[] = [];
      const blocked: string[] = [];
      let guarded: string | null = null;
      for (let k = i + 1; k < end; k++) {
        const next = events[k] as FightEvent;
        if (endsHitRun(next)) break;
        if (next.t === 'boss_hit' && next.source === 'gimmick') {
          if (next.splash === true) {
            if (!splash.includes(next.target)) splash.push(next.target);
          } else {
            if (targets.length === 0 && next.from !== undefined) guarded = next.from;
            if (!targets.includes(next.target)) targets.push(next.target);
          }
          if (next.shielded === true) blocked.push(next.target);
        } else if (next.t === 'silence' && !targets.includes(next.creature)) {
          targets.push(next.creature);
        }
      }
      const action: StrikeAction = KNOWN_ACTIONS.has(op) ? (op as StrikeAction) : 'other';
      const sweepRows =
        action === 'sweep'
          ? e.rows !== undefined
            ? ZONES.filter((z) => e.rows?.includes(z) === true)
            : zonesOf(rowIds, targets)
          : [];
      const zone =
        def?.op === 'hit_zone'
          ? def.zone
          : (sweepRows[0] ??
            (targets[0] === undefined ? null : zoneOfCreature(rowIds, targets[0])));
      out.push({
        i,
        strike: {
          action,
          gimmick: e.gimmick,
          targets,
          zone,
          blocked,
          guarded: action === 'slam' || action === 'strike_highest_atk' ? guarded : null,
          ...(action === 'sweep' && sweepRows.length > 0 ? { rows: sweepRows } : {}),
          ...(action === 'slam' && splash.length > 0 ? { splash } : {}),
          ...(action === 'lance' && e.lane !== undefined ? { lane: e.lane } : {}),
          ...(inner === null ? {} : { charged: true as const }),
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
    .filter(
      ({ strike }) =>
        strike.action !== 'reflect_armed' &&
        strike.action !== 'charge' &&
        strike.action !== 'enrage',
    )
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
  const crowded = crowdedHits(events, from, end);
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
        if (e.reason === 'haze') {
          // Morning Haze: the creature loses its first turn. A small word over it, no silence mark.
          cues.push({
            kind: 'float',
            i,
            target: e.creature,
            text: 'Hazy',
            tone: 'blocked',
            crit: false,
            drift: driftFor(i),
          });
        } else {
          cues.push({ kind: 'silenced', i, creature: e.creature });
        }
        break;
      case 'proc': {
        const word = PROC_WORDS[e.kind];
        if (e.kind === 'echo') {
          // Echo: the hit lands again, a number over the boss.
          cues.push({ kind: 'hop', i, creature: e.creature });
          cues.push({
            kind: 'float',
            i,
            target: null,
            text: String(e.amount ?? 0),
            tone: 'hit',
            crit: false,
            drift: driftFor(i),
          });
        } else if (
          (e.kind === 'kindling' || e.kind === 'warm_heart' || e.kind === 'overflow') &&
          e.target !== undefined
        ) {
          // A boost for another creature, like a Support's: +N% over the creature that gets it.
          cues.push({ kind: 'hop', i, creature: e.creature });
          cues.push({
            kind: 'float',
            i,
            target: e.target,
            text: `+${String(Math.round((e.amount ?? 0) / 100))}%`,
            tone: 'buff',
            crit: false,
            drift: driftFor(i),
          });
        } else {
          cues.push({
            kind: 'float',
            i,
            target: e.creature,
            text: word,
            tone: 'buff',
            crit: false,
            drift: driftFor(i),
          });
        }
        break;
      }
      case 'sky_heal':
        // Kind Rain at round start: a green number on every creature it healed.
        for (const [k, h] of e.heals.entries()) {
          cues.push({
            kind: 'float',
            i,
            target: h.creature,
            text: `+${String(h.amount)}`,
            tone: 'heal',
            crit: false,
            drift: driftFor(i + k),
          });
        }
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
        // A Sidestep takes nothing: a word over the creature, no flash and no shake.
        if (e.sidestep === true) {
          cues.push({
            kind: 'float',
            i,
            target: e.target,
            text: 'SIDESTEP',
            tone: 'blocked',
            crit: false,
            drift: driftFor(i),
          });
          break;
        }
        cues.push({ kind: 'flash', i, target: e.target });
        cues.push({
          kind: 'float',
          i,
          target: e.target,
          text: e.shielded === true ? 'BLOCKED' : String(e.damage),
          tone: e.shielded === true ? 'blocked' : 'hurt',
          crit: e.crit === true,
          drift: driftFor(i),
          ...(crowded.has(i) ? { crowded: true as const, damage: e.damage } : {}),
        });
        if (e.covered !== undefined) {
          cues.push({ kind: 'cover', i, creature: e.target, guard: e.covered.guard });
        }
        if (e.armored !== undefined && e.armored > 0) {
          cues.push({ kind: 'armor', i, creature: e.target, prevented: e.armored });
        }
        if (zone !== null) {
          cues.push({ kind: 'shake', i, zone });
          if (e.shielded === true) cues.push({ kind: 'zone', i, zone, effect: 'shield' });
        }
        break;
      }
      case 'heal':
        // A Support's Mend at round start: a green number on the creature it restored.
        cues.push({ kind: 'hop', i, creature: e.supporter });
        cues.push({
          kind: 'float',
          i,
          target: e.target,
          text: `+${String(e.amount)}`,
          tone: 'heal',
          crit: false,
          drift: driftFor(i),
        });
        break;
      case 'cleanse':
        // Shown quietly: a small word on the creature whose silence was cleared.
        cues.push({ kind: 'hop', i, creature: e.supporter });
        cues.push({
          kind: 'float',
          i,
          target: e.target,
          text: 'Cleansed',
          tone: 'cleanse',
          crit: false,
          drift: driftFor(i),
        });
        break;
      case 'retreat':
        // The boss is out of reach: "Immune!" over it (the line that says why is drawn from the state).
        cues.push({
          kind: 'float',
          i,
          target: null,
          text: 'Immune!',
          tone: 'immune',
          crit: false,
          drift: driftFor(i),
        });
        break;
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
    // A zone hit or a sweep is a shockwave over the whole row it covers (a sweep may cover several).
    for (const zone of strikeRows(strike)) cues.push({ kind: 'zone', i, zone, effect: 'hit' });
  }
  return cues;
}

/**
 * The boss hits in [from, to) that belong to an action which hit more than `CROWDED_HITS` creatures
 * (a long sweep, a pincer on a big raid, the enrage round): by event index. Their numbers are cut
 * down to the big hits (`showsNumber`), so a crowded round stays readable. A run of hits is the
 * events after a gimmick, or the enrage round's hits, up to the next boss action.
 */
export function crowdedHits(events: readonly FightEvent[], from: number, to: number): Set<number> {
  const out = new Set<number>();
  const end = Math.min(to, events.length);
  let run: { hits: number[]; targets: Set<string> } | null = null;
  const close = (): void => {
    if (run !== null && run.targets.size > CROWDED_HITS) for (const i of run.hits) out.add(i);
    run = null;
  };
  for (let i = Math.max(0, from); i < end; i++) {
    const e = events[i] as FightEvent;
    const enrageHit = e.t === 'boss_hit' && e.source === 'enrage';
    if (endsHitRun(e) && !enrageHit) close();
    if (e.t === 'gimmick') run = { hits: [], targets: new Set() };
    if (enrageHit && run === null) run = { hits: [], targets: new Set() };
    if (e.t === 'boss_hit' && (e.source === 'gimmick' || enrageHit) && run !== null) {
      run.hits.push(i);
      run.targets.add(e.target);
    }
  }
  close();
  return out;
}

/**
 * The most HP a creature can have, as far as the stage can tell. A Guard has the extra HP of the
 * fight's own rules (`rules`; none now, its Guard has armor instead), or the content's old bonus
 * (`RULES.combat.guardHpBp`) for a fight stored without rules.
 */
export function estimatedMaxHp(
  creature: Pick<ReplayRowEntry, 'species' | 'level' | 'role'>,
  rules?: FightGuardRules,
): number | null {
  const species = getSpecies(creature.species);
  if (species === undefined) return null;
  const level = Math.max(1, Math.min(creature.level, species.levelCap));
  const hp = effectiveStats(species, level, 0).hp;
  return creature.role === 'guard'
    ? Math.floor(
        (hp * (10_000 + (rules === undefined ? RULES.combat.guardHpBp : rules.guardHpBp))) / 10_000,
      )
    : hp;
}

/**
 * True when a floating number should show. Only the numbers of a crowded action are ever left out,
 * and only the ones under `BIG_HIT_BP` of the creature's max HP; with no max HP to judge by, it shows.
 */
export function showsNumber(cue: Extract<Cue, { kind: 'float' }>, maxHp: number | null): boolean {
  if (cue.crowded !== true || maxHp === null || maxHp <= 0) return true;
  return (cue.damage ?? 0) * 10_000 >= maxHp * BIG_HIT_BP;
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

interface StageState extends StepState {
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

/** A charged pattern that has been announced and has not landed yet. */
export interface PendingCharge {
  /** The gimmick's content id. */
  gimmick: string;
  /** The round it lands in. */
  landing: number;
  /** The creatures marked for it (some may have fallen since: they are skipped when it lands). */
  marks: readonly string[];
  /** The rows marked, for a charged sweep; empty otherwise. */
  rows: readonly Zone[];
}

/**
 * The charges that are on screen after the first `index` events: announced by a `charge` event and
 * not landed yet. A charge lands when its gimmick fires in (or after) its landing round; if the
 * log moves past the landing round without it, it is gone (nothing is left marked for a round that
 * is over). The amber marks on the stage stand for as long as this says so.
 */
export function pendingChargesAt(events: readonly FightEvent[], index: number): PendingCharge[] {
  const end = Math.min(Math.max(0, Math.trunc(index)), events.length);
  let pending: PendingCharge[] = [];
  let round = 0;
  for (let i = 0; i < end; i++) {
    const e = events[i] as FightEvent;
    round = e.round;
    if (e.t === 'charge') {
      pending = [
        ...pending.filter((c) => c.gimmick !== e.gimmick),
        {
          gimmick: e.gimmick,
          landing: e.landing,
          marks: e.marks,
          rows: e.rows === undefined ? [] : ZONES.filter((z) => e.rows?.includes(z) === true),
        },
      ];
    } else if (e.t === 'gimmick') {
      pending = pending.filter((c) => !(c.gimmick === e.gimmick && e.round >= c.landing));
    }
  }
  return pending.filter((c) => c.landing >= round);
}

/** True once the first `enrage` event is among the first `index` events: the boss is enraged. */
export function enragedAt(events: readonly FightEvent[], index: number): boolean {
  const end = Math.min(Math.max(0, Math.trunc(index)), events.length);
  for (let i = 0; i < end; i++) if ((events[i] as FightEvent).t === 'enrage') return true;
  return false;
}

/** True once the `retreat` event is among the first `index` events: the boss is out of reach. */
export function retreatedAt(events: readonly FightEvent[], index: number): boolean {
  const end = Math.min(Math.max(0, Math.trunc(index)), events.length);
  for (let i = 0; i < end; i++) if ((events[i] as FightEvent).t === 'retreat') return true;
  return false;
}

/**
 * Each creature's HP after the first `index` events, from the HP it started the fight with. What
 * costs a creature HP is a boss hit (`boss_hit`, whose `damage` is what got through after guards,
 * cover and Shield Walls); what gives it back is a Support's `heal` (the HP actually restored, never
 * more than was missing, and never a revival). It never goes below 0. A creature missing from
 * `start` is left out.
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
    if (e.t === 'sky_heal') {
      for (const h of e.heals) {
        const before = hp[h.creature];
        if (before !== undefined && before > 0) hp[h.creature] = before + h.amount;
      }
      continue;
    }
    if (e.t === 'heal') {
      const before = hp[e.target];
      // Never a revival: a creature that is down stays down (a heal for one is ignored).
      if (before !== undefined && before > 0) hp[e.target] = before + e.amount;
      continue;
    }
    if (e.t !== 'boss_hit') continue;
    const before = hp[e.target];
    // Stubborn: the hit shows its full damage but the creature is left at 1 HP.
    if (before !== undefined) {
      hp[e.target] = e.stubborn === true && before > 0 ? 1 : Math.max(0, before - e.damage);
    }
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
