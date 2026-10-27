import { useEffect, useRef, useState } from 'preact/hooks';

/** How long a press must last before it counts as a long press. */
export const HOLD_MS = 450;
/** How far (in pixels) the pointer may drift before the press is a scroll or a drag, not a hold. */
export const HOLD_SLOP_PX = 8;
/** How long the click that follows a long press is still turned away (it normally comes at once). */
const SWALLOW_MS = 400;

/** What the logic needs of a pointer event. */
export interface HoldPointer {
  x: number;
  y: number;
  id: number;
  /** `touch`, `pen` or `mouse`. */
  kind: string;
  /** The mouse button (0 is the main one); only the main one holds. */
  button: number;
  /** False for the second finger of a gesture. */
  primary: boolean;
}

/** What a hold tells its owner. */
export interface HoldEvents {
  /** The hold completed: act on this key. */
  fire: (key: string) => void;
  /** A hold started on this key (`null`: none is in progress any more): the tile shows its cue. */
  change: (key: string | null) => void;
}

/**
 * The long press (decisions.md, 2026-10-27, "Bulk selection replaces marking"): press and hold ~450 ms on a tile.
 * It is plain logic over pointer events and one timer, with nothing about the page in it:
 *
 * - `down` starts the hold (the main button or a finger; a second finger never does);
 * - `move` cancels it when the pointer drifts more than 8 px (the player is scrolling or dragging);
 * - `end` cancels it (pointer up, pointer cancel, a scroll);
 * - when the time is up `fire` runs once, and the click that follows the release is swallowed (`takeSwallow`),
 *   so the long press does not also toggle or open the tile.
 *
 * Touch and mouse use the same code.
 */
export class Hold {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private swallowTimer: ReturnType<typeof setTimeout> | null = null;
  private at: { key: string; x: number; y: number; id: number } | null = null;
  private swallow = false;

  constructor(private readonly events: HoldEvents) {}

  /** A press began on the tile `key`. */
  down(key: string, p: HoldPointer): void {
    this.cancel();
    if (!p.primary || p.button !== 0) return;
    this.at = { key, x: p.x, y: p.y, id: p.id };
    this.events.change(key);
    this.timer = setTimeout(() => {
      this.timer = null;
      const held = this.at;
      this.at = null;
      if (held === null) return;
      this.events.change(null);
      this.armSwallow();
      this.events.fire(held.key);
    }, HOLD_MS);
  }

  /** The pointer moved: too far cancels the hold. */
  move(p: HoldPointer): void {
    const at = this.at;
    if (at === null || p.id !== at.id) return;
    if (Math.hypot(p.x - at.x, p.y - at.y) > HOLD_SLOP_PX) this.cancel();
  }

  /** The press ended (up, cancel) or the page scrolled. */
  end(): void {
    this.cancel();
  }

  /** True once for the click that follows a completed long press (and clears it). */
  takeSwallow(): boolean {
    const was = this.swallow;
    this.swallow = false;
    if (this.swallowTimer !== null) clearTimeout(this.swallowTimer);
    this.swallowTimer = null;
    return was;
  }

  /** Stops every timer (the grid went away). */
  dispose(): void {
    this.cancel();
    this.takeSwallow();
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.at !== null) {
      this.at = null;
      this.events.change(null);
    }
  }

  private armSwallow(): void {
    this.swallow = true;
    if (this.swallowTimer !== null) clearTimeout(this.swallowTimer);
    this.swallowTimer = setTimeout(() => {
      this.swallow = false;
      this.swallowTimer = null;
    }, SWALLOW_MS);
  }
}

/** The part of a pointer event the handlers read. */
interface PointerLike {
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
  button?: number;
  isPrimary?: boolean;
}

const pointerOf = (e: PointerLike): HoldPointer => ({
  x: e.clientX,
  y: e.clientY,
  id: e.pointerId,
  kind: e.pointerType,
  button: e.button ?? 0,
  primary: e.isPrimary ?? true,
});

/** The handlers a tile takes. */
export interface HoldHandlers {
  onPointerDown: (e: PointerLike) => void;
  onPointerMove: (e: PointerLike) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

/** A short buzz where the device has one (a long press registered). Never throws. */
export function buzz(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  } catch {
    // Some browsers refuse vibration without a recent tap; the cue is only an extra.
  }
}

/**
 * The long press for a grid of tiles: `bind(key)` gives the handlers of one tile, `holding` is the key of the tile
 * being held (its cue), `swallowClick` is true once for the click after a completed hold, and `lastKind` is what
 * kind of pointer touched a tile last (a context menu opens for a mouse, never for a finger). The page's scroll
 * cancels a hold too (a finger that starts a scroll normally ends the pointer with a cancel first).
 */
export function useHold(onLongPress: (key: string) => void): {
  holding: string | null;
  bind: (key: string) => HoldHandlers;
  swallowClick: () => boolean;
  lastKind: () => string;
} {
  const [holding, setHolding] = useState<string | null>(null);
  const latest = useRef(onLongPress);
  latest.current = onLongPress;
  const kind = useRef('mouse');
  const hold = useRef<Hold | null>(null);
  if (hold.current === null) {
    hold.current = new Hold({
      fire: (key) => {
        buzz();
        latest.current(key);
      },
      change: setHolding,
    });
  }
  const current = hold.current;
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const stop = (): void => {
      current.end();
    };
    window.addEventListener('scroll', stop, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', stop, { capture: true });
      current.dispose();
    };
  }, []);
  return {
    holding,
    bind: (key) => ({
      onPointerDown: (e) => {
        kind.current = e.pointerType;
        current.down(key, pointerOf(e));
      },
      onPointerMove: (e) => {
        current.move(pointerOf(e));
      },
      onPointerUp: () => {
        current.end();
      },
      onPointerCancel: () => {
        current.end();
      },
    }),
    swallowClick: () => current.takeSwallow(),
    lastKind: () => kind.current,
  };
}
