/**
 * The combat v2 fight as board states: the one place playback reads the engine's events (the way `replay.ts` is for v1). A stored stage
 * and the live finale carry a list of events, each with the engine's typed `board` part beside its text (`FightEvent.board`); this module
 * folds them into the state of the board after any event: each creature's HP and status, who is out, silence with its turns left, Store, the
 * boss's HP, its marks oldest first with their counts, Mired, the Escalating count and step, what it resists, the moves announced and
 * not yet landed, and the live inputs in play. It also cuts the events into beats (the playback's steps) and says what each beat shows
 * (who hit, who is out, what was cashed). Pure: no DOM, no clock, no network; all names and ids stay data (drawn as text by the screens).
 *
 * The fold trusts nothing it cannot read: an event it has no rule for changes nothing, and the final `end` event sets the boss's HP, so the
 * last state is the fight's own whatever a rule it does not know did on the way.
 */
import { content } from '@creatures/game';
import type { BoardEvent, FightEvent, FinaleActionKind } from '@creatures/engine/v2';
import type { FightCreatureV2 } from './fight-v2-api';
import type { BossCardV2 } from './raid-v2-api';

/** The rounds a Purge lasts: the round it acts in and the one after (`purgeRounds` of `rules.json`; a test holds the two together). */
export const PURGE_ROUNDS = 2;

/** One creature of the fight, as the fold needs it. */
export interface FoldCreature {
  key: string;
  maxHp: number;
  /** Its HP when the stage began. */
  startHp: number;
  row: number;
  col: number;
  /** Its element (the colour of its hits and of a reaction it sets off), when known. */
  element?: string;
  /** Its saved Knack's name, when it has one (the name that pops on it when it acts). */
  knackName?: string | null;
}

/** What the fold knows about the fight before the first event. */
export interface FoldSetup {
  creatures: readonly FoldCreature[];
  /** The boss's HP when the stage began. */
  bossHpStart: number;
  /** The boss's moves by id and the boss turn (row) each lands on, from the boss card. */
  moveTurns: Readonly<Record<string, number>>;
  /** The boss sheds marks every turn (Clean Scales): the strip lets them blink before the turn. */
  shedsMarks: boolean;
  /** The Escalating step the stage begins at (the card's), or null for a boss that does not escalate. */
  escalationStep: number | null;
}

export interface CreatureState {
  hp: number;
  /** Knocked out (for the stage: out for the weekend). */
  out: boolean;
  /** Turns of silence left (0: not silenced). */
  silenced: number;
  /** Its Store (Heat, Calm, Dodge stacks): 0 when it has none. */
  store: number;
  /**
   * A Support's Boost it still carries, in basis points (0: none). A Boost lasts until the creature's next hit on the boss (R16, the
   * keyword "Boost"), so a hit from it spends it, and a knock-out takes it away.
   */
  boost: number;
}

/** A mark on the boss: its element, its count and whether it is Sealed. */
export interface MarkState {
  element: string;
  stacks: number;
  sealed: boolean;
}

export interface EscalationState {
  /** The feed's count so far (null until the first escalation event of this stage). */
  count: number | null;
  /** The steps taken that help the boss (the meter), and those that help the players. */
  step: number;
  fall: number;
  phase: boolean;
  phaseNext: boolean;
}

/** A move announced at round start: the (row, column) of each creature it will land on, until its boss turn is over. */
export interface AnnouncedMove {
  move: string;
  /** The boss turn it lands on, when the card says (else the last). */
  turn: number | null;
  slots: readonly (readonly [number, number])[];
}

/** A live input in play (Rally, Shield Wall with its row, Purge) and the round it acted in. */
export interface ActionState {
  kind: FinaleActionKind;
  row: number | null;
  by: string;
  round: number;
}

/** Where a round stands: after the creatures of a row acted (or while they do), or while the boss takes the turn after that row. */
export interface StepState {
  kind: 'row' | 'boss';
  row: number;
}

export interface BoardState {
  /** The round on show (0 before the first). */
  round: number;
  /** The step of the round in progress; null at the round's start and before the fight. */
  step: StepState | null;
  creatures: Readonly<Record<string, CreatureState>>;
  bossHp: number;
  /** The boss's marks, oldest first. */
  marks: readonly MarkState[];
  /** The marks that will be shed by the boss's next turn (a boss that sheds, shown just before it). */
  expiring: readonly string[];
  mired: number;
  /** Fizzle: the boss is immune to reactions until its next turn. */
  fizzled: boolean;
  escalation: EscalationState | null;
  resistance: { reaction: string | null; element: string | null } | null;
  announced: readonly AnnouncedMove[];
  actions: readonly ActionState[];
  /** The fight is over: how, once the `end` event has played. */
  end: { round: number; won: boolean; wiped: boolean } | null;
}

/** The state before the first event. */
export function startState(setup: FoldSetup): BoardState {
  return {
    round: 0,
    step: null,
    creatures: Object.fromEntries(
      setup.creatures.map((c) => [
        c.key,
        { hp: c.startHp, out: c.startHp <= 0, silenced: 0, store: 0, boost: 0 },
      ]),
    ),
    bossHp: setup.bossHpStart,
    marks: [],
    expiring: [],
    mired: 0,
    fizzled: false,
    escalation:
      setup.escalationStep === null
        ? null
        : {
            count: null,
            step: setup.escalationStep,
            fall: setup.escalationStep,
            phase: false,
            phaseNext: false,
          },
    resistance: null,
    announced: [],
    actions: [],
    end: null,
  };
}

/** A copy of the state to change (the creatures are the only part changed in place by a rule, so only they are copied deeply). */
function cloneOf(state: BoardState): MutableState {
  return {
    ...state,
    creatures: Object.fromEntries(Object.entries(state.creatures).map(([k, c]) => [k, { ...c }])),
    marks: state.marks.map((m) => ({ ...m })),
    announced: [...state.announced],
    actions: [...state.actions],
  };
}

type MutableState = {
  -readonly [K in keyof BoardState]: BoardState[K];
} & {
  creatures: Record<string, CreatureState>;
  marks: MarkState[];
  announced: AnnouncedMove[];
  actions: ActionState[];
};

/** The slot of the step: which turn a creature's hit belongs to. */
const stepIndex = (step: StepState | null): number =>
  step === null ? -1 : step.row * 2 + (step.kind === 'boss' ? 1 : 0);

/** Plays one event into `s` (a state from `cloneOf`). `rows` tells a creature's row. */
function play(
  s: MutableState,
  event: FightEvent,
  setup: FoldSetup,
  rowOf: ReadonlyMap<string, number>,
): void {
  const b: BoardEvent | undefined = event.board;
  if (b === undefined) return;
  switch (b.type) {
    case 'round':
      s.round = b.round;
      s.step = null;
      s.announced = [];
      break;
    case 'announce':
      s.announced.push({
        move: b.move,
        turn: Object.hasOwn(setup.moveTurns, b.move) ? (setup.moveTurns[b.move] ?? null) : null,
        slots: b.slots,
      });
      break;
    case 'bossTurn': {
      s.step = { kind: 'boss', row: b.row };
      // The boss turn after row r is where silence runs down for the creatures of row r: they have acted.
      for (const [key, row] of rowOf) {
        const c = s.creatures[key];
        if (c !== undefined && row === b.row && !c.out && c.silenced > 0) c.silenced--;
      }
      break;
    }
    case 'hit': {
      if (b.from !== null && b.to === null) {
        // A creature hits the boss (a Setter's hit that the boss dodged or that was Blocked changes nothing but the step).
        s.bossHp = Math.max(0, s.bossHp - b.damage);
        const row = rowOf.get(b.from);
        if (row !== undefined) s.step = { kind: 'row', row };
        const hitter = s.creatures[b.from];
        if (hitter !== undefined) hitter.boost = 0;
      } else if (b.to !== null) {
        const taker = s.creatures[b.by ?? b.to];
        if (taker !== undefined) taker.hp = Math.max(0, taker.hp - b.damage);
      }
      break;
    }
    case 'counter':
      s.bossHp = Math.max(0, s.bossHp - b.damage);
      break;
    case 'mark': {
      const at = s.marks.findIndex((m) => m.element === b.element);
      if (b.stacks <= 0) {
        if (at >= 0) s.marks.splice(at, 1);
      } else if (at >= 0) s.marks[at] = { element: b.element, stacks: b.stacks, sealed: b.sealed };
      else s.marks.push({ element: b.element, stacks: b.stacks, sealed: b.sealed });
      break;
    }
    case 'shed':
      s.marks = s.marks.filter((m) => !b.marks.includes(m.element));
      break;
    case 'reaction': {
      const at = s.marks.findIndex((m) => m.element === b.mark);
      if (at >= 0) {
        const mark = s.marks[at] as MarkState;
        if (b.left <= 0) s.marks.splice(at, 1);
        else s.marks[at] = { ...mark, stacks: b.left };
      }
      break;
    }
    case 'heal': {
      const target = s.creatures[b.who];
      const max = setup.creatures.find((c) => c.key === b.who)?.maxHp;
      if (target !== undefined && max !== undefined)
        target.hp = Math.min(max, target.hp + b.amount);
      break;
    }
    case 'knockout': {
      const c = s.creatures[b.who];
      if (c !== undefined) {
        c.out = true;
        c.hp = 0;
        c.silenced = 0;
        c.store = 0;
        c.boost = 0;
      }
      break;
    }
    case 'boost': {
      const c = s.creatures[b.who];
      if (c !== undefined && !c.out) c.boost += b.bp;
      break;
    }
    case 'silence': {
      const c = s.creatures[b.who];
      if (c !== undefined && !c.out) c.silenced = b.turns;
      break;
    }
    case 'store': {
      const c = s.creatures[b.who];
      if (c !== undefined && !c.out) c.store = b.value;
      break;
    }
    case 'mired':
      s.mired = b.stacks;
      break;
    case 'fizzle':
      if (b.state !== 'blocked') s.fizzled = b.state === 'on';
      break;
    case 'escalation':
      s.escalation = {
        count: b.count,
        step: b.step,
        fall: b.fall,
        phase: b.phase,
        phaseNext: b.phaseNext,
      };
      break;
    case 'resistance':
      s.resistance = { reaction: b.reaction ?? null, element: b.element ?? null };
      break;
    case 'action':
      s.actions.push({ kind: b.kind, row: b.row ?? null, by: b.by, round: s.round });
      break;
    case 'end':
      s.end = { round: b.round, won: b.won, wiped: b.wiped };
      s.bossHp = Math.max(0, b.bossHp);
      s.step = null;
      s.announced = [];
      break;
  }
}

/** Fills in what depends on the step: the announced moves that have landed leave, the marks about to be shed are named. */
function settle(s: MutableState, setup: FoldSetup, next: FightEvent | undefined): void {
  const at = stepIndex(s.step);
  s.announced = s.announced.filter((a) => {
    const turn = a.turn ?? Number.POSITIVE_INFINITY;
    return at <= Math.min(turn, 1_000_000) * 2 + 1;
  });
  const bossNext = s.step?.kind === 'boss' || next?.board?.type === 'bossTurn';
  s.expiring =
    setup.shedsMarks && bossNext && s.end === null
      ? s.marks.filter((m) => !m.sealed).map((m) => m.element)
      : [];
}

/** The rows of the creatures by key. */
function rowsOf(setup: FoldSetup): ReadonlyMap<string, number> {
  return new Map(setup.creatures.map((c) => [c.key, c.row]));
}

/** The state after the first `upTo` events, folded from the start. */
export function stateAfter(
  setup: FoldSetup,
  events: readonly FightEvent[],
  upTo: number,
): BoardState {
  const rows = rowsOf(setup);
  const s = cloneOf(startState(setup));
  const limit = Math.min(upTo, events.length);
  for (let i = 0; i < limit; i++) play(s, events[i] as FightEvent, setup, rows);
  settle(s, setup, events[limit]);
  return s;
}

// --- Beats: the steps of the playback ---

/** One step of the playback: the events [from, to) that land together. */
export interface BeatV2 {
  from: number;
  to: number;
  /** `round`: the round's start (Support verbs, Knacks at round start, announcements); `creature`: one creature's hit (or its forgone hit); `boss`: the boss's turn after a row; `end`: the fight's end. */
  kind: 'round' | 'creature' | 'boss' | 'end';
  round: number;
  /** The row of the creature or of the boss turn; 0 for the others. */
  row: number;
  /** The creature that acts (its key); null for the others. */
  actor: string | null;
  /** A reaction goes off in the beat: it is held a moment longer so the callout lands. */
  reacts: boolean;
}

/** Events that come just before a creature's own hit: its reaction, its crit and the Sure Crit it spends. */
const isLead = (e: FightEvent): boolean =>
  e.kind === 'reaction' ||
  e.kind === 'crit' ||
  (e.kind === 'sure-crit' && e.text.includes('spends'));

/**
 * Cuts the events into beats. A round starts one; so does each boss turn; a creature's turn starts at its hit on the boss (and at the
 * reaction, crit or spent Sure Crit that comes right before it), or at the `forgo` event of a Knack that gives the hit up, so its mark, Store and knock-out follow it in the same beat; the end
 * is the last. Events before the first round (the resistance shown at the stage break) go with the first beat.
 */
export function buildBeats(
  events: readonly FightEvent[],
  setup: Pick<FoldSetup, 'creatures'>,
): BeatV2[] {
  const rows = new Map(setup.creatures.map((c) => [c.key, c.row]));
  type Start = Omit<BeatV2, 'to' | 'reacts'>;
  const starts: Start[] = [];
  let round = 0;
  events.forEach((event, i) => {
    const b = event.board;
    if (b === undefined) return;
    const last = starts[starts.length - 1];
    if (b.type === 'round') {
      round = b.round;
      starts.push({ from: i, kind: 'round', round, row: 0, actor: null });
    } else if (b.type === 'bossTurn') {
      starts.push({ from: i, kind: 'boss', round, row: b.row, actor: null });
    } else if (b.type === 'end') {
      starts.push({ from: i, kind: 'end', round, row: 0, actor: null });
    } else if (
      b.type === 'hit' &&
      b.from !== null &&
      b.to === null &&
      b.bonus !== true &&
      rows.has(b.from)
    ) {
      // (A bonus that lands as its own hit, Aftershock's, is the same creature's turn: it stays in the beat of the hit before it.)
      let from = i;
      while (from > 0 && from - 1 > (last?.from ?? -1) && isLead(events[from - 1] as FightEvent))
        from--;
      starts.push({ from, kind: 'creature', round, row: rows.get(b.from) ?? 0, actor: b.from });
    } else if (b.type === 'forgo' && rows.has(b.who)) {
      // A creature whose Knack gives up its hit has no hit to start its turn: the engine says so, and the turn gets its own beat.
      starts.push({ from: i, kind: 'creature', round, row: rows.get(b.who) ?? 0, actor: b.who });
    }
  });
  if (starts.length === 0)
    return events.length === 0
      ? []
      : [
          {
            from: 0,
            to: events.length,
            kind: 'round',
            round: 0,
            row: 0,
            actor: null,
            reacts: false,
          },
        ];
  const first = starts[0] as Start;
  const out = starts.map((st, k): BeatV2 => {
    const from = k === 0 ? 0 : st.from;
    const to = starts[k + 1]?.from ?? events.length;
    let reacts = false;
    for (let i = from; i < to && !reacts; i++) reacts = events[i]?.board?.type === 'reaction';
    return { ...st, from, to, reacts };
  });
  // A first event before the first round belongs to it; the fold keeps their order.
  if (first.from > 0) out[0] = { ...(out[0] as BeatV2), from: 0 };
  return out;
}

/** The state after each beat: index 0 is the start, index k + 1 the state after beat k. */
export function foldBeats(
  setup: FoldSetup,
  events: readonly FightEvent[],
  beats: readonly BeatV2[],
): BoardState[] {
  const rows = rowsOf(setup);
  const s = cloneOf(startState(setup));
  settle(s, setup, events[0]);
  const states: BoardState[] = [snapshotOf(s)];
  for (const beat of beats) {
    for (let i = beat.from; i < beat.to; i++) play(s, events[i] as FightEvent, setup, rows);
    settle(s, setup, events[beat.to]);
    states.push(snapshotOf(s));
  }
  return states;
}

/** A frozen copy of the state to keep (the next beat changes `s`). */
function snapshotOf(s: MutableState): BoardState {
  return cloneOf(s);
}

// --- What a beat shows ---

/** The kinds of number and word that float over a creature or the boss. */
export type FloatToneV2 =
  'hit' | 'hurt' | 'blocked' | 'dodge' | 'heal' | 'reaction' | 'save' | 'boost' | 'knack';

/** One thing to float over a creature or the boss. */
export interface FloatCue {
  /** The index of the event it came from (unique, so a number is not drawn twice). */
  i: number;
  /** The creature it floats over; null for the boss. */
  target: string | null;
  text: string;
  tone: FloatToneV2;
  crit: boolean;
  /** Sideways drift in steps (-3 to 3), from the event index. */
  drift: number;
  /** A creature's hit on the boss: the hitter's element, the colour of the number. */
  element?: string;
  /** A reaction: the element of the mark and of the hit that cashed it (its two colours). */
  elements?: readonly [string, string];
  /** A short second line: the reaction's bonus, what a Guard's cover saved, a boost's size. */
  sub?: string;
  /** A crit's multiplier, as the words "x2.6!". */
  mult?: string;
  /** A reaction: the hit of the same creature that cashed it, in the same beat (the callout can carry its number). */
  hit?: HitOfReaction;
}

/** The hit a reaction was cashed on: its event index (so the stage can leave its own number out), the damage, and a crit's size. */
export interface HitOfReaction {
  i: number;
  text: string;
  crit: boolean;
  mult?: string;
}

/** What the screen draws for one beat, read from its events. */
export interface BeatShow {
  /** The creatures (null: the boss) a hit lands on in this beat. */
  flash: ReadonlySet<string | null>;
  floats: readonly FloatCue[];
  /** The creatures knocked out in this beat (with the index of the event, for a tag that is drawn once). */
  knockedOut: readonly { i: number; who: string }[];
  /** The creatures silenced in this beat. */
  silenced: readonly string[];
  /** The marks cashed in this beat, by element. */
  cashed: readonly string[];
  /** The marks shed in this beat. */
  shed: readonly string[];
  /** A boss move's name when the beat's boss turn plays one (the plain attack has none). */
  move: string | null;
  /** The boss turn is a plain attack or a move that hit someone. */
  bossHit: boolean;
  /** A live input took effect in this beat. */
  actions: readonly { kind: FinaleActionKind; row: number | null; by: string }[];
  /** Guards that took a hit for, or cut a hit on, a creature (`prevented`: what a cover saved; null when it is not known). */
  saves: readonly { i: number; guard: string; who: string; prevented: number | null }[];
  /** Creatures whose Knack acted in this beat, with the Knack's name (shown only when the player asked for Knack names). */
  knacks: readonly { i: number; who: string; name: string }[];
  /**
   * Creatures whose Knack gave up their hit in this beat, with the Knack's name: the stage shows each acting (a hop) and always names the
   * Knack, so the turn is never seen as skipped. Not in `knacks`.
   */
  forgone: readonly { i: number; who: string; name: string | null }[];
}

const drift = (i: number): number => ((i * 5) % 7) - 3;

/** The name of the reaction a hit of `trigger`'s element sets off on a mark of `mark`'s (the content's own name), or null. */
export const reactionName = (mark: string, trigger: string): string | null =>
  content.reactions.find((r) => r.markElement === mark && r.triggerElement === trigger)?.name ??
  null;

/** "x2.6!" for a crit multiplier in basis points (26_000), as short as it reads ("x2!" for 20_000). */
export const critWords = (bp: number): string => `x${String(Number((bp / 10_000).toFixed(1)))}!`;

/** What `showOf` may know about the fight beyond the events: the creatures (their elements and Knack names) and who is silenced. */
export interface ShowContext {
  creatures?: readonly Pick<FoldCreature, 'key' | 'element' | 'knackName'>[];
  /** Creatures whose Knack does not act (silenced, or out) when the beat begins. */
  quiet?: ReadonlySet<string>;
}

/** What a beat shows: who flashes, the numbers that float, who falls, what is cashed. */
export function showOf(
  events: readonly FightEvent[],
  beat: BeatV2,
  context: ShowContext = {},
): BeatShow {
  const flash = new Set<string | null>();
  const floats: FloatCue[] = [];
  const knockedOut: { i: number; who: string }[] = [];
  const silenced: string[] = [];
  const cashed: string[] = [];
  const shed: string[] = [];
  const actions: { kind: FinaleActionKind; row: number | null; by: string }[] = [];
  const saves: { i: number; guard: string; who: string; prevented: number | null }[] = [];
  const knackOwners = new Map<string, number>();
  const forgone = new Map<string, number>();
  const boosts = new Map<string, { i: number; bp: number }>();
  // The creature behind each number on the boss, and who cashed each reaction: a reaction's callout takes the number of its own hit.
  const hitters = new Map<number, string>();
  const reactors: { cue: FloatCue; by: string }[] = [];
  const byKey = new Map((context.creatures ?? []).map((c) => [c.key, c]));
  const quiet = context.quiet ?? new Set<string>();
  const elementOf = (key: string | null): string | undefined =>
    key === null ? undefined : byKey.get(key)?.element;
  const withElement = (key: string | null): { element: string } | Record<string, never> => {
    const element = elementOf(key);
    return element === undefined ? {} : { element };
  };
  if (beat.kind === 'creature' && beat.actor !== null) knackOwners.set(beat.actor, beat.from);
  let move: string | null = null;
  let bossHit = false;
  for (let i = beat.from; i < beat.to; i++) {
    const event = events[i] as FightEvent;
    if (event.kind === 'move') move = event.text;
    const b = event.board;
    if (b === undefined) continue;
    switch (b.type) {
      case 'hit': {
        if (b.from !== null && b.to === null) {
          flash.add(null);
          if (!b.dodged && !b.blocked) hitters.set(i, b.from);
          floats.push(
            b.dodged
              ? { i, target: null, text: 'Dodged!', tone: 'dodge', crit: false, drift: drift(i) }
              : b.blocked
                ? { i, target: null, text: '0', tone: 'blocked', crit: b.crit, drift: drift(i) }
                : {
                    i,
                    target: null,
                    text: String(b.damage),
                    tone: 'hit',
                    crit: b.crit,
                    drift: drift(i),
                    ...withElement(b.from),
                    ...(b.crit && b.critBp !== undefined ? { mult: critWords(b.critBp) } : {}),
                  },
          );
        } else if (b.to !== null) {
          bossHit = true;
          const target = b.by ?? b.to;
          flash.add(target);
          floats.push(
            b.dodged
              ? { i, target: b.to, text: 'Dodged!', tone: 'dodge', crit: false, drift: drift(i) }
              : b.blocked
                ? { i, target, text: '0', tone: 'blocked', crit: b.crit, drift: drift(i) }
                : {
                    i,
                    target,
                    text: String(b.damage),
                    tone: 'hurt',
                    crit: b.crit,
                    drift: drift(i),
                  },
          );
        }
        break;
      }
      case 'counter':
        flash.add(null);
        // A counter that is its Knack's own effect (Backlash) names the Knack on its tile, as a heal or a boost does.
        if (b.byKnack === true && !knackOwners.has(b.from)) knackOwners.set(b.from, i);
        floats.push({
          i,
          target: null,
          text: String(b.damage),
          tone: 'hit',
          crit: false,
          drift: drift(i),
          ...withElement(b.from),
        });
        break;
      case 'heal':
        floats.push({
          i,
          target: b.who,
          text: `+${String(b.amount)}`,
          tone: 'heal',
          crit: false,
          drift: drift(i),
        });
        if (b.by !== undefined && !knackOwners.has(b.by)) knackOwners.set(b.by, i);
        break;
      case 'boost': {
        const was = boosts.get(b.who);
        boosts.set(b.who, { i: was?.i ?? i, bp: (was?.bp ?? 0) + b.bp });
        if (!knackOwners.has(b.by)) knackOwners.set(b.by, i);
        break;
      }
      case 'intercept':
        saves.push({ i, guard: b.guard, who: b.who, prevented: null });
        break;
      case 'sure':
        // The boss cannot dodge `who` this round: nothing on the board changes, so the Knack that did it is named on its tile.
        if (!knackOwners.has(b.by)) knackOwners.set(b.by, i);
        break;
      case 'mired':
        // Shake It Off: the boss clears its Mired. The same callout a reaction uses, in no element's colours.
        if (b.shook !== undefined && b.shook > 0)
          floats.push({
            i,
            target: null,
            text: 'Shakes it off!',
            tone: 'reaction',
            crit: false,
            drift: drift(i),
            sub: `-${String(b.shook)} Mired`,
          });
        break;
      case 'fizzle':
        // Fizzle: the boss turns reactions away. The same callout a reaction uses, in no element's colours.
        if (b.state === 'on')
          floats.push({
            i,
            target: null,
            text: 'Fizzle!',
            tone: 'reaction',
            crit: false,
            drift: drift(i),
            sub: 'No reactions',
          });
        else if (b.state === 'blocked')
          floats.push({
            i,
            target: null,
            text: 'Fizzled!',
            tone: 'reaction',
            crit: false,
            drift: drift(i),
            sub: 'Mark kept',
          });
        break;
      case 'cover':
        saves.push({ i, guard: b.guard, who: b.who, prevented: b.prevented });
        // Cool Head's ward is a Knack's own effect: its name pops on the Guard's tile (a plain cover has none).
        if (b.byKnack === true && !knackOwners.has(b.guard)) knackOwners.set(b.guard, i);
        break;
      case 'knockout':
        knockedOut.push({ i, who: b.who });
        break;
      case 'silence':
        silenced.push(b.who);
        break;
      case 'forgo':
        if (!forgone.has(b.who)) forgone.set(b.who, i);
        break;
      case 'reaction': {
        cashed.push(b.mark);
        const trigger = elementOf(b.by);
        const name = trigger === undefined ? null : reactionName(b.mark, trigger);
        const cue: FloatCue = {
          i,
          target: null,
          text: `${name ?? 'Reaction'}!`,
          tone: 'reaction',
          crit: false,
          drift: drift(i),
          // Aftershock's bonus lands as its own hit after this one, with its own number, so the callout leaves it out.
          ...(b.split === true ? {} : { sub: `+${String(b.bonus)}` }),
          ...(trigger === undefined ? {} : { elements: [b.mark, trigger] as const }),
        };
        floats.push(cue);
        reactors.push({ cue, by: b.by });
        break;
      }
      case 'shed':
        shed.push(...b.marks);
        break;
      case 'action':
        actions.push({ kind: b.kind, row: b.row ?? null, by: b.by });
        break;
      default:
        break;
    }
  }
  for (const { cue, by } of reactors) {
    const hit = floats.find((f) => f.tone === 'hit' && f.i > cue.i && hitters.get(f.i) === by);
    if (hit !== undefined)
      cue.hit = {
        i: hit.i,
        text: hit.text,
        crit: hit.crit,
        ...(hit.mult === undefined ? {} : { mult: hit.mult }),
      };
  }
  for (const s of saves) {
    floats.push({
      i: s.i,
      target: s.who,
      text: s.prevented === null ? '' : `-${String(s.prevented)}`,
      tone: 'save',
      crit: false,
      drift: 0,
    });
  }
  for (const [who, { i, bp }] of boosts)
    floats.push({
      i,
      target: who,
      text: '',
      tone: 'boost',
      crit: false,
      drift: 0,
      sub: `+${String(Math.round(bp / 100))}%`,
    });
  const knacks = [...knackOwners]
    .filter(
      ([who]) =>
        !forgone.has(who) && !quiet.has(who) && (byKey.get(who)?.knackName ?? null) !== null,
    )
    .map(([who, i]) => ({ i, who, name: byKey.get(who)?.knackName as string }));
  return {
    flash,
    floats,
    knockedOut,
    silenced,
    cashed,
    shed,
    move,
    bossHit,
    actions,
    saves,
    knacks,
    forgone: [...forgone].map(([who, i]) => ({ i, who, name: byKey.get(who)?.knackName ?? null })),
  };
}

// --- Words and counts for the screens ---

/** The turn strip's step the board is at: `row-0`, `boss-0`, `row-1`, ... or null. */
export const stepId = (step: StepState | null): string | null =>
  step === null ? null : `${step.kind}-${String(step.row)}`;

/** Whether a live input still acts in `round` (Rally and Shield Wall for the round they act in, a Purge for `PURGE_ROUNDS`). */
export function actionActive(action: ActionState, round: number): boolean {
  return action.kind === 'purge'
    ? round >= action.round && round < action.round + PURGE_ROUNDS
    : action.round === round;
}

/** How much of the boss's HP is gone, as a whole number of percent of the weekend's HP (0 to 100). */
export function removedPercent(hpMax: number, hpStart: number, hpEnd: number): number {
  if (hpMax <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((hpStart - hpEnd) * 100) / hpMax)));
}

// --- The model a stage view plays ---

/** Everything a stage view draws from, worked out once for a list of events: the setup, the beats and the state after each. */
export interface StageModel {
  setup: FoldSetup;
  beats: readonly BeatV2[];
  /** The state at the start, then after each beat (`states[k + 1]` follows `beats[k]`). */
  states: readonly BoardState[];
}

/** What the fold needs of a fight, from the creatures the server lists and the boss card. */
export function foldSetupOf(args: {
  fighters: readonly FightCreatureV2[];
  card: BossCardV2;
  bossHpStart: number;
}): FoldSetup {
  const { fighters, card, bossHpStart } = args;
  return {
    creatures: fighters.map((f) => ({
      key: f.key,
      maxHp: f.maxHp,
      startHp: f.startHp,
      row: f.row,
      col: f.col,
      element: f.element,
      knackName: f.knackName,
    })),
    bossHpStart,
    moveTurns: Object.fromEntries(card.moves.map((m) => [m.id, m.turn])),
    shedsMarks: card.cards.some((c) => c.id === 'clean-scales'),
    escalationStep: card.escalation === null ? null : card.escalation.step,
  };
}

/** The beats and board states of a list of events (`events` may grow: the live finale folds again with each round). */
export function stageModelOf(setup: FoldSetup, events: readonly FightEvent[]): StageModel {
  const beats = buildBeats(events, setup);
  return { setup, beats, states: foldBeats(setup, events, beats) };
}
