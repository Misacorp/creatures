/**
 * One shared timer for every blinking or twinkling sprite. Each sprite has its own deterministic
 * rhythm taken from a seed (never `Math.random`): it blinks for 150 ms about every 3 to 7 s, and a
 * shiny one twinkles (dot, plus, dot, 150 ms each) about every 4 to 8 s at a spot that changes each
 * time. The timer runs only while a sprite is listening, and does nothing under reduced motion.
 */

export const BLINK_MS = 150;
export const TWINKLE_STEP_MS = 150;
const TICK_MS = 50;

export interface LifeState {
  blink: boolean;
  /** 0 = none, 1 and 3 = dot, 2 = plus. */
  twinkle: 0 | 1 | 2 | 3;
  /** Which of the sprite's twinkle spots this round uses (take it modulo the count). */
  spotIndex: number;
}

export const REST: LifeState = { blink: false, twinkle: 0, spotIndex: 0 };

export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A blink's period (3000 to 7000 ms) and where in it this sprite starts. */
export function blinkRhythm(seed: string): { period: number; phase: number } {
  const period = 3000 + (fnv1a(`blink:${seed}`) % 4001);
  return { period, phase: fnv1a(`blink-phase:${seed}`) % period };
}

/** A twinkle's period (4000 to 8000 ms) and its phase. */
export function twinkleRhythm(seed: string): { period: number; phase: number } {
  const period = 4000 + (fnv1a(`twinkle:${seed}`) % 4001);
  return { period, phase: fnv1a(`twinkle-phase:${seed}`) % period };
}

/** What a sprite with this seed is doing `ms` milliseconds after the clock started. Pure. */
export function lifeAt(seed: string, shiny: boolean, ms: number): LifeState {
  const b = blinkRhythm(seed);
  const blink = (ms + b.phase) % b.period < BLINK_MS;
  if (!shiny) return blink ? { ...REST, blink } : REST;
  const t = twinkleRhythm(seed);
  const at = ms + t.phase;
  const round = Math.floor(at / t.period);
  const step = Math.floor((at % t.period) / TWINKLE_STEP_MS);
  const twinkle = step === 0 ? 1 : step === 1 ? 2 : step === 2 ? 3 : 0;
  return { blink, twinkle, spotIndex: fnv1a(`spot:${seed}:${String(round)}`) };
}

interface Listener {
  seed: string;
  shiny: boolean;
  last: LifeState;
  notify: (state: LifeState) => void;
}

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | undefined;
let started = 0;

function reduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function tick(): void {
  const still = reduced();
  const now = performance.now() - started;
  for (const l of listeners) {
    const next = still ? REST : lifeAt(l.seed, l.shiny, now);
    // The spot only matters while a twinkle shows, so a new round alone is not a change.
    const changed =
      next.blink !== l.last.blink ||
      next.twinkle !== l.last.twinkle ||
      (next.twinkle !== 0 && next.spotIndex !== l.last.spotIndex);
    if (changed) {
      l.last = next;
      l.notify(next);
    }
  }
}

/** Starts listening; returns the way to stop. The shared timer runs while anyone listens. */
export function subscribeLife(
  seed: string,
  shiny: boolean,
  notify: (state: LifeState) => void,
): () => void {
  const listener: Listener = { seed, shiny, last: REST, notify };
  if (listeners.size === 0) {
    started = performance.now();
    timer = setInterval(tick, TICK_MS);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
