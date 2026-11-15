/**
 * The sealed crate as a prop of the Forge's room (V-FORGE-5): the picture standing where `forge-interior.ts` puts it, glowing by the best
 * rarity inside (rare blue, epic pink-violet), rattling while it is being opened, with a count bubble over it and a clickable target (the
 * shared cue: a plate, "Sealed crate"). Nothing is drawn when the crate is empty. The reveal that follows is `CrateReveal.tsx`.
 */
import { useEffect, useState } from 'preact/hooks';
import { cssVars } from '../css-vars';
import { usePrefersReducedMotion } from '../hooks';
import type { CrateLookVariant } from './art-variants';
import { crateSprite } from './crate-art';
import { RATTLE, RATTLE_STEP_MS, crateLabel, type CrateState } from './crate-view';
import type { Box } from './forge-interior';
import { CanvasTarget, type Opener } from './PlaceCanvas';
import { At, Pic, SpeechBubble } from './parts';
import { PROP } from './forge-canvas';
import type { SceneGeometry } from './SceneFrame';

/** What is happening to the crate: waiting to be tapped, or rattling while the server opens it (the open crate is the reveal's own). */
export type CratePhase = 'idle' | 'rattle';

/** The rattle's frame now: it steps through `RATTLE` while `on`, and rests on the sealed crate (always, for a player who asked for less motion). */
function useRattle(on: boolean): (typeof RATTLE)[number] {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!on || reduced) {
      setStep(0);
      return undefined;
    }
    const id = setInterval(() => {
      setStep((now) => (now + 1) % RATTLE.length);
    }, RATTLE_STEP_MS);
    return () => {
      clearInterval(id);
    };
  }, [on, reduced]);
  return RATTLE[step] ?? 'sealed';
}

export function CrateProp({
  g,
  box,
  crate,
  best,
  night,
  look,
  phase,
  disabled,
  onOpen,
}: {
  g: SceneGeometry;
  box: Box;
  crate: CrateState;
  /** The glow (kept from before the open, when the valley's crate is already empty). */
  best: 'rare' | 'epic' | null;
  night: boolean;
  look: CrateLookVariant;
  phase: CratePhase;
  disabled: boolean;
  onOpen: (opener: Opener) => void;
}) {
  const frame = useRattle(phase === 'rattle');
  const sprite = crateSprite(frame, { best, night, look });
  // A look other than the main one has no drawn rattle: its one picture slides instead (`crate.css`).
  const slides = phase === 'rattle' && look !== 'A' && frame !== 'sealed';
  return (
    <>
      <At x={g.X(box.x)} y={g.Y(box.y)}>
        <Pic
          sprite={sprite}
          scale={g.s}
          class={`cr-prop cr-glow-${best ?? 'rare'}${slides ? ` cr-slide-${frame}` : ''}`}
        />
      </At>
      {phase === 'idle' && (
        <>
          <At x={g.X(box.x + 2)} y={g.Y(box.y)} class="vy-over">
            <span
              class="vy-region-box"
              ref={cssVars({ '--pw': `${String(PROP * g.s)}px`, '--ph': '0px' })}
            />
            <SpeechBubble glyph="sparkle" count={crate.count} />
          </At>
          <CanvasTarget
            g={g}
            x={box.x}
            y={box.y}
            w={box.w}
            h={box.h}
            label={crateLabel(crate)}
            plate="Sealed crate"
            plateAt={box.h}
            disabled={disabled}
            onClick={onOpen}
          />
        </>
      )}
    </>
  );
}
