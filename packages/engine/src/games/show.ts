/**
 * The timeline builder every kind writes through: it keeps beats compact (a position, state, meter or
 * score only when it changes), spaces the commentary (`sayGapTicks`) and counts the moments.
 */
import type { GamesSayKey } from '@creatures/game';
import type { GamesActorState, GamesBeat, GamesFx } from './types';

export class Show {
  readonly beats: GamesBeat[] = [];
  moments = 0;
  private readonly posAt: ({ x: number; y: number } | undefined)[];
  private readonly stateOf: (GamesActorState | undefined)[];
  private readonly meterOf: (number | undefined)[];
  private readonly scoreOf: (number | undefined)[];
  private readonly propAt = new Map<string, string>();
  private lastSay = Number.NEGATIVE_INFINITY;
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
    if (moment) this.moments += 1;
  }

  out(t: number, a: number, cause: string): void {
    this.push({ t, k: 'out', a, cause });
    this.moments += 1;
  }

  prop(t: number, p: string, x: number, y: number, f?: number): void {
    const key = `${String(x)},${String(y)},${String(f)}`;
    if (this.propAt.get(p) === key) return;
    this.propAt.set(p, key);
    const b: GamesBeat = { t, k: 'prop', p, x, y };
    if (f !== undefined) b.f = f;
    this.push(b);
  }

  /** Whether a line may be said at `t` (the gap since the last one has passed). */
  canSay(t: number): boolean {
    return t - this.lastSay >= this.sayGapTicks;
  }

  /** A commentary line, if the gap allows; returns whether it was said. */
  say(t: number, line: GamesSayKey, args: { a?: number; b?: number; n?: number } = {}): boolean {
    if (!this.canSay(t)) return false;
    this.lastSay = t;
    const b: GamesBeat = { t, k: 'say', line };
    if (args.a !== undefined) b.a = args.a;
    if (args.b !== undefined) b.b = args.b;
    if (args.n !== undefined) b.n = args.n;
    this.push(b);
    return true;
  }

  /** The closing line: at `t` or as soon after as the gap allows. Returns its tick. */
  closing(t: number, line: GamesSayKey, args: { a?: number; b?: number; n?: number } = {}): number {
    const at = Math.max(t, this.lastSay + this.sayGapTicks);
    this.say(at, line, args);
    return at;
  }

  /** The last tick any beat uses. */
  get lastTick(): number {
    return this.lastT;
  }

  /** The beats sorted by tick (stable: the order of writing within a tick). */
  sorted(): GamesBeat[] {
    return this.beats
      .map((b, i) => ({ b, i }))
      .sort((p, q) => p.b.t - q.b.t || p.i - q.i)
      .map((p) => p.b);
  }
}
