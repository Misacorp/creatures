import { useEffect } from 'preact/hooks';
import { creatureName, speciesName } from '../../game';
import { glyphOrUnknown } from '../../glyphs';
import { usePrefersReducedMotion } from '../../hooks';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { CloseGlyph } from '../../ui/Drawer';
import { creatureOf } from '../world';
import { evolveTo } from './party-actions';
import type { PartyState } from './party-state';

const FLASH_MS = 900;
const SPARKS = 8;

/**
 * The evolution moment, in the clearing's place: the creature alone in the middle, its two branches on
 * either side (each a button with its Essence cost). Picking one plays the flash (white in three steps,
 * the new form, sparkles in eight directions); then the new form stands there until you go on.
 */
export function EvolveStage({
  state,
  setState,
  scale,
}: {
  state: PartyState;
  setState: (change: (s: PartyState) => PartyState) => void;
  scale: number;
}) {
  const reduced = usePrefersReducedMotion();
  const moment = state.moment;
  const flashing = moment?.kind === 'evolving' ? moment : null;
  useEffect(() => {
    if (flashing === null) return undefined;
    const t = setTimeout(
      () => {
        setState((s) => evolveTo(s, flashing.creatureId, flashing.to));
      },
      reduced ? 120 : FLASH_MS,
    );
    return () => {
      clearTimeout(t);
    };
  }, [flashing?.creatureId, flashing?.to, reduced]);

  if (moment === null || !('creatureId' in moment)) return null;
  const c = creatureOf(state.world, moment.creatureId);
  const name = creatureName(c);
  const big = scale * 3;
  const close = (): void => {
    setState((s) => ({ ...s, moment: null }));
  };

  if (moment.kind === 'evolved') {
    return (
      <section class="pp-evolve is-done" aria-label={`${name} evolved`}>
        <div class="pp-evolve-mid">
          <span class="pp-burst" aria-hidden="true">
            {Array.from({ length: SPARKS }, (_, i) => (
              <Sprite
                key={i}
                sprite={glyphOrUnknown('sparkle')}
                scale={2}
                class={`pp-ray pp-ray-${String(i)}`}
              />
            ))}
          </span>
          <Sprite
            sprite={creatureSpriteOrFallback(c.species)}
            scale={big}
            alt={speciesName(c.species)}
          />
        </div>
        <p class="pp-evolve-name">{speciesName(c.species)}!</p>
        <button
          type="button"
          class="pp-done"
          onClick={() => {
            setState((s) => ({ ...s, moment: null, held: c.id }));
          }}
        >
          Back to camp
        </button>
      </section>
    );
  }

  const evo = c.evolution;
  if (evo === undefined) return null;
  const branches = [evo.toSpecies, ...(evo.alt === undefined ? [] : [evo.alt.toSpecies])];
  const afford = state.world.balances.essence >= evo.essence;
  return (
    <section
      class={flashing === null ? 'pp-evolve' : 'pp-evolve is-flash'}
      aria-label={`Evolve ${name}`}
    >
      <button type="button" class="pp-x pp-evolve-x" aria-label="Not now" onClick={close}>
        <CloseGlyph />
      </button>
      <div class="pp-evolve-row">
        {branches.map((to, i) => (
          <button
            key={to}
            type="button"
            class={`pp-branch pp-branch-${String(i)}${flashing?.to === to ? ' is-picked' : ''}`}
            disabled={!afford || flashing !== null}
            aria-label={`Evolve into ${speciesName(to)}, ${String(evo.essence)} Essence`}
            onClick={() => {
              setState((s) => ({ ...s, moment: { kind: 'evolving', creatureId: c.id, to } }));
            }}
          >
            <Sprite sprite={creatureSpriteOrFallback(to)} scale={scale * 2} />
            <span class="pp-branch-name">{speciesName(to)}</span>
            <span class="pp-branch-cost">
              <Sprite sprite={glyphOrUnknown('gem')} scale={2} />
              {String(evo.essence)}
            </span>
          </button>
        ))}
        <div class="pp-evolve-mid" aria-hidden="true">
          <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={big} class="pp-evolver" />
        </div>
      </div>
      <p class="pp-evolve-name">{name}</p>
    </section>
  );
}
