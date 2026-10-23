/**
 * The timeline builder every kind writes through: it keeps beats compact (a position, state, meter or
 * score only when it changes), chooses and spaces the commentary (`sayGapTicks`, by priority) and
 * counts the moments.
 */
import type { GamesSayKey } from '@creatures/game';
import {
  FILLER,
  FILLER_REPEATS,
  IMPORTANT,
  MUST,
  PAIR_LINES,
  TWIST,
  sayPriority,
} from './say-priority';
import type { GamesActorState, GamesBeat, GamesFx } from './types';

type SayArgs = { a?: number; b?: number; n?: number };
/** Exit lines (single and pair): the only lines that may name a creature after it has gone. */
const ELIMINATION: ReadonlySet<string> = new Set([...PAIR_LINES.keys(), ...PAIR_LINES.values()]);
interface Offer {
  t: number;
  line: GamesSayKey;
  args: SayArgs;
  pri: number;
  seq: number;
}

export class Show {
  readonly beats: GamesBeat[] = [];
  moments = 0;
  private readonly posAt: ({ x: number; y: number } | undefined)[];
  private readonly stateOf: (GamesActorState | undefined)[];
  private readonly meterOf: (number | undefined)[];
  private readonly scoreOf: (number | undefined)[];
  private readonly propAt = new Map<string, string>();
  private readonly offers: Offer[] = [];
  private closer: Offer | undefined;
  private finished = false;
  private readonly outTick = new Map<number, number>();
  /** The tick of every moment, in order of writing. */
  readonly momentTicks: number[] = [];
  private lastT = 0;

  constructor(
    count: number,
    readonly sayGapTicks: number,
    /** The smallest change of a meter worth a beat (percentage points). */
    private readonly meterStep = 3,
  ) {
    this.posAt = new Array<{ x: number; y: number } | undefined>(count);
    this.stateOf = new Array<GamesActorState | undefined>(count);
    this.meterOf = new Array<number | undefined>(count);
    this.scoreOf = new Array<number | undefined>(count);
  }

  private push(b: GamesBeat): void {
    if (b.t > this.lastT) this.lastT = b.t;
    this.beats.push(b);
  }

  /** The start position (no beat: it is the actor's `x`, `y`). */
  place(a: number, x: number, y: number): void {
    this.posAt[a] = { x, y };
  }

  pos(t: number, a: number, x: number, y: number): void {
    const p = this.posAt[a];
    if (p !== undefined && p.x === x && p.y === y) return;
    this.posAt[a] = { x, y };
    this.push({ t, k: 'pos', a, x, y });
  }

  state(t: number, a: number, s: GamesActorState): void {
    if (this.stateOf[a] === s) return;
    this.stateOf[a] = s;
    this.push({ t, k: 'state', a, s });
  }

  /** The current state (undefined before the first). */
  stateNow(a: number): GamesActorState | undefined {
    return this.stateOf[a];
  }

  /** A meter value from 0 to 10000 (basis points), shown as 0 to 100 in steps of `meterStep`. */
  meter(t: number, a: number, bp: number): void {
    const v = Math.max(0, Math.min(100, Math.floor(bp / 100)));
    const last = this.meterOf[a];
    if (last !== undefined) {
      if (v === last) return;
      const edge = v === 0 || v === 100;
      if (!edge && Math.abs(v - last) < this.meterStep) return;
    }
    this.meterOf[a] = v;
    this.push({ t, k: 'meter', a, v });
  }

  score(t: number, a: number, v: number): void {
    if (this.scoreOf[a] === v) return;
    this.scoreOf[a] = v;
    this.push({ t, k: 'score', a, v });
  }

  /** An effect; `moment` counts it as a notable beat. */
  fx(t: number, fx: GamesFx, at: { a?: number; x?: number; y?: number }, moment = false): void {
    const b: GamesBeat = { t, k: 'fx', fx };
    if (at.a !== undefined) b.a = at.a;
    if (at.x !== undefined) b.x = at.x;
    if (at.y !== undefined) b.y = at.y;
    this.push(b);
    if (moment) this.moment(t);
  }

  /** Counts a notable beat at `t`. */
  moment(t: number): void {
    this.moments += 1;
    this.momentTicks.push(t);
  }

  out(t: number, a: number, cause: string): void {
    this.push({ t, k: 'out', a, cause });
    this.outTick.set(a, t);
    this.moment(t);
  }

  prop(t: number, p: string, x: number, y: number, f?: number): void {
    const key = `${String(x)},${String(y)},${String(f)}`;
    if (this.propAt.get(p) === key) return;
    this.propAt.set(p, key);
    const b: GamesBeat = { t, k: 'prop', p, x, y };
    if (f !== undefined) b.f = f;
    this.push(b);
  }

  /**
   * Proposes a commentary line. Lines are chosen when the show is finished (`finish`): the most
   * important first (`sayPriority`), each at least `sayGapTicks` from the others. An important line
   * may wait up to a gap for a free slot, a twist a little, a filler not at all; a filler line is used
   * at most twice per show, and a filler loses its slot to anything more important.
   */
  say(t: number, line: GamesSayKey, args: SayArgs = {}): void {
    this.offer(t, line, args, sayPriority(line));
  }

  /** A line that must be said, at `t` or as soon after as the gap allows. */
  sayNext(t: number, line: GamesSayKey, args: SayArgs = {}): void {
    this.offer(t, line, args, MUST);
  }

  /** The closing line: after every other line, at `t` or as soon after as the gap allows. */
  closing(t: number, line: GamesSayKey, args: SayArgs = {}): void {
    this.closer = { t, line, args, pri: MUST, seq: this.offers.length };
  }

  private offer(t: number, line: GamesSayKey, args: SayArgs, pri: number): void {
    if (this.finished) throw new Error('the show is finished');
    this.offers.push({ t, line, args, pri, seq: this.offers.length });
  }

  /** Places the commentary (once); call it before reading `lastTick` or the beats. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    const gap = this.sayGapTicks;
    const placed: { at: number; o: Offer }[] = [];
    const free = (at: number, except?: { at: number; o: Offer }): boolean =>
      placed.every((p) => p === except || Math.abs(p.at - at) >= gap);
    const uses = new Map<string, number>();
    // Important lines first (they wait a little at most), then the ones that must be said (they can
    // wait as long as it takes), then twists, then filler. A must-say line at the very end (the melon
    // hitting the arch) goes first, so the show does not trail on after the crowning.
    const late = (this.closer?.t ?? Number.POSITIVE_INFINITY) - gap;
    const rank = (o: Offer): number =>
      o.pri === MUST ? (o.t >= late ? MUST : IMPORTANT - 0.5) : o.pri;
    const order = [...this.offers].sort((p, q) => rank(q) - rank(p) || p.t - q.t || p.seq - q.seq);
    for (const o of order) {
      // A filler line at most twice a show, a twist three times.
      const cap =
        o.pri === FILLER ? FILLER_REPEATS : o.pri === TWIST ? FILLER_REPEATS + 1 : Infinity;
      if ((uses.get(o.line) ?? 0) >= cap) continue;
      const wait =
        o.pri >= MUST
          ? 50 * gap
          : o.pri >= IMPORTANT
            ? gap + (gap >> 1)
            : o.pri >= TWIST
              ? gap >> 1
              : 0;
      // After the crowning only an exit or a last must-say line (within a gap), then the closing line.
      const end = (this.closer?.t ?? Number.POSITIVE_INFINITY) + (rank(o) >= IMPORTANT ? gap : 0);
      let until = Math.min(o.t + wait, end);
      // A line about a creature is not said after that creature has gone (its own exit line aside).
      if (!ELIMINATION.has(o.line)) {
        for (const a of [o.args.a, o.args.b]) {
          const out = a === undefined ? undefined : this.outTick.get(a);
          if (out !== undefined && out > o.t) until = Math.min(until, out - 1);
        }
      }
      // Two leaving close together share one line ("{a} and {b} ..."), before either waits.
      const pair = PAIR_LINES.get(o.line);
      if (
        pair !== undefined &&
        o.args.a !== undefined &&
        this.pairUp(placed, o, pair, until, free)
      ) {
        continue;
      }
      for (let at = o.t; at <= until; at++) {
        if (!free(at)) continue;
        placed.push({ at, o });
        uses.set(o.line, (uses.get(o.line) ?? 0) + 1);
        break;
      }
    }
    placed.sort((p, q) => p.at - q.at || p.o.seq - q.o.seq);
    for (const { at, o } of placed) this.speak(at, o.line, o.args);
    if (this.closer !== undefined) {
      const last =
        placed.length === 0
          ? Number.NEGATIVE_INFINITY
          : (placed[placed.length - 1] as { at: number }).at;
      this.speak(Math.max(this.closer.t, last + gap), this.closer.line, this.closer.args);
    }
  }

  /** Turns a placed single elimination line near `o` into the pair line naming both; whether it did. */
  private pairUp(
    placed: { at: number; o: Offer }[],
    o: Offer,
    pair: GamesSayKey,
    until: number,
    free: (at: number, except?: { at: number; o: Offer }) => boolean,
  ): boolean {
    const near = this.sayGapTicks >> 1;
    const mate = placed.find(
      (p) =>
        p.o.line === o.line &&
        p.o.args.b === undefined &&
        p.o.args.a !== undefined &&
        Math.abs(p.o.t - o.t) <= near &&
        Math.abs(p.at - o.t) <= near,
    );
    if (mate === undefined) return false;
    // The pair line comes once both have gone.
    const at = Math.min(until, Math.max(mate.at, o.t));
    if (at < o.t || !free(at, mate)) return false;
    mate.at = at;
    mate.o = { ...mate.o, line: pair, args: { a: mate.o.args.a as number, b: o.args.a as number } };
    return true;
  }

  private speak(t: number, line: GamesSayKey, args: SayArgs): void {
    const b: GamesBeat = { t, k: 'say', line };
    if (args.a !== undefined) b.a = args.a;
    if (args.b !== undefined) b.b = args.b;
    if (args.n !== undefined) b.n = args.n;
    this.push(b);
  }

  /** The last tick any beat uses. */
  get lastTick(): number {
    return this.lastT;
  }

  /** The beats sorted by tick (stable: the order of writing within a tick), the commentary placed. */
  sorted(): GamesBeat[] {
    this.finish();
    return this.beats
      .map((b, i) => ({ b, i }))
      .sort((p, q) => p.b.t - q.b.t || p.i - q.i)
      .map((p) => p.b);
  }
}
