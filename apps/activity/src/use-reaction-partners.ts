/**
 * The reaction-partner highlight of a canvas (the raid's, the Cave's): which creature is touched, and what every creature is drawn with
 * while it is. A creature is touched by the pointer over it or the keyboard focus on it (`touch`), or is `pinned` by the screen (the one
 * whose card is open); the pointer wins. Display only: the kits come from what the screen already has (`reaction-partner-kits.ts`).
 */
import { useCallback, useMemo, useState } from 'preact/hooks';
import { useCombatPack } from './combat-pack';
import {
  partnersOf,
  reactionPaint,
  type PartnerKit,
  type PartnerLook,
  type PartnerPaint,
} from './reaction-partners';

export interface ReactionPartners {
  /** The creature touched now (the pointer's, else the pinned one), or null. */
  touched: string | null;
  /** The pointer or the keyboard focus reaches a creature (its id), or leaves (null). */
  touch: (id: string | null) => void;
  /** What a creature is drawn with: undefined for none. */
  paint: (id: string) => PartnerPaint | undefined;
}

export function useReactionPartners(args: {
  kits: readonly PartnerKit[];
  look: PartnerLook;
  /** The creature whose card is open (a phone's popover, a drawer): touched while the pointer is on none. */
  pinned: string | null;
  /** Nothing is highlighted (a creature is being carried, a stage is playing). */
  off?: boolean;
  /** Starts touched (the workbench shows a preset). */
  initial?: string | null;
}): ReactionPartners {
  const [hover, setHover] = useState<string | null>(args.initial ?? null);
  const touch = useCallback((id: string | null) => {
    setHover(id);
  }, []);
  const touched = args.off === true ? null : (hover ?? args.pinned);
  const { kits, look } = args;
  const pack = useCombatPack();
  const partners = useMemo(() => {
    const kit = touched === null ? undefined : kits.find((k) => k.id === touched);
    return kit === undefined ? new Map() : partnersOf(kit, kits, pack);
  }, [kits, touched, pack]);
  const paint = useMemo(() => reactionPaint(look, touched, partners), [look, touched, partners]);
  return { touched, touch, paint };
}
