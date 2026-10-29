/**
 * Inside the house (the living room), full screen: the game's own living room art along the top (two layers,
 * like `LivingRoom`), the other players' creatures in their spots, and the floor running on below it with a
 * rug in the middle. The creature that can evolve sits on the rug with its bubble and its Essence cost; it is
 * the button. Tap it and its two forms stand either side of it; tap a form, then the one big Evolve pinned at
 * the bottom (evolving is permanent, so it is a second press). Then the moment: the old and the new form flash
 * in turn, white, faster and faster, the new one lands with a bounce and four sparkles pop. The bookshelf is
 * the Journal and the trophy shelf the Stats (stubs here).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RoomPhase } from '@creatures/game';
import { cssVars } from '../../css-vars';
import { evolveForms } from '../../evolve-view';
import { creatureName } from '../../game';
import { usePrefersReducedMotion } from '../../hooks';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { ROOM_SPOTS } from '../../sprites/room-art';
import { Sprite } from '../../sprites/Sprite';
import { ActionButton } from '../../ui/ActionButton';
import { CountBadge } from '../../ui/CountBadge';
import { Drawer } from '../../ui/Drawer';
import { TOUR, evolvers, type ProtoWorld } from '../world';
import { paint } from './paint';
import { At, CreatureSprite, Plate, SpeechBubble, UpArrow, isStill } from './parts';
import { SceneFrame, type SceneGeometry } from './SceneFrame';
import { houseDraw, houseFloor, houseFront, houseSpots, roomLeft } from './scene-art';
import { EVOLVE_FLASH_MS, evolveInto } from './valley-logic';

const PHASE: RoomPhase = 'day';
const DRAW = houseDraw(PHASE);
const WHITE = '#ffffff';

function whitePalette(species: string): Record<string, string> {
  const def = creatureSpriteOrFallback(species);
  return Object.fromEntries(Object.keys(def.palette).map((k) => [k, WHITE]));
}

type Evo =
  | { phase: 'choose' }
  | { phase: 'flash'; frame: number; from: string; to: string }
  | { phase: 'land'; frame: number; to: string }
  | { phase: 'done'; to: string };

export function HouseScene({
  world,
  setWorld,
  choosing,
  onLeave,
  onDone,
  onProgress,
}: {
  world: ProtoWorld;
  setWorld: (w: ProtoWorld) => void;
  /** The evolution's choice is open at first (the step's moment). */
  choosing: boolean;
  onLeave: () => void;
  onDone: () => void;
  onProgress: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const still = reduced || isStill();
  const ready = evolvers(world)[0];
  const ownId = ready?.id ?? TOUR.evolveId;
  const own = world.creatures.find((c) => c.id === ownId);
  const forms = ready === undefined ? [] : evolveForms(ready);
  const [evo, setEvo] = useState<Evo | null>(
    choosing && ready !== undefined ? { phase: 'choose' } : null,
  );
  const [picked, setPicked] = useState<string | null>(
    choosing ? (forms[0]?.species ?? null) : null,
  );
  const [stub, setStub] = useState<string | null>(null);

  useEffect(() => {
    if (evo === null || evo.phase === 'choose' || evo.phase === 'done') return undefined;
    const ms = evo.phase === 'flash' ? (EVOLVE_FLASH_MS[evo.frame] ?? 40) : 120;
    const id = window.setTimeout(() => {
      if (evo.phase === 'flash') {
        setEvo(
          evo.frame + 1 >= EVOLVE_FLASH_MS.length
            ? { phase: 'land', frame: 0, to: evo.to }
            : { ...evo, frame: evo.frame + 1 },
        );
      } else if (evo.frame >= 4) setEvo({ phase: 'done', to: evo.to });
      else setEvo({ ...evo, frame: evo.frame + 1 });
    }, ms);
    return () => {
      window.clearTimeout(id);
    };
  }, [evo]);

  const go = (): void => {
    if (ready === undefined || picked === null) return;
    const from = ready.species;
    setWorld(evolveInto(world, ready.id, picked));
    setEvo(still ? { phase: 'done', to: picked } : { phase: 'flash', frame: 0, from, to: picked });
    onProgress();
  };

  const essence = ready?.evolution?.essence ?? 0;
  const form = forms.find((f) => f.species === picked);
  let act;
  if (evo?.phase === 'choose') {
    act = (
      <ActionButton
        label={form === undefined ? 'Pick a form' : `Evolve into ${form.name}`}
        detail={`${String(essence)} Essence`}
        wide
        large
        disabled={form === undefined}
        onClick={go}
      />
    );
  } else if (evo?.phase === 'done') {
    act = <ActionButton label="Back to the valley" wide large onClick={onDone} />;
  } else if (ready !== undefined) {
    act = (
      <ActionButton
        label={`Evolve ${creatureName(ready)}`}
        detail={`${String(essence)} Essence`}
        wide
        large
        onClick={() => {
          setEvo({ phase: 'choose' });
          setPicked(forms[0]?.species ?? null);
        }}
      />
    );
  }

  // The other players' creatures in their spots (never the rug).
  const spots = ROOM_SPOTS.filter((s) => s.id !== 'couch-middle');
  const others = world.residents.slice(1, 6).flatMap((r, i) => {
    const spot = [spots[3], spots[0], spots[6], spots[10], spots[13]][i];
    return r.creature === null || spot === undefined ? [] : [{ r, spot }];
  });

  return (
    <>
      <SceneFrame
        id="house"
        label="House, living room"
        draw={DRAW}
        onLeave={onLeave}
        act={act}
        ground="#9a6036"
      >
        {(g) => {
          const { s, X, Y } = g;
          const left = roomLeft(g);
          const top = houseFloor(g) - 50;
          const at = houseSpots(g);
          return (
            <>
              {others.map(({ r, spot }) => (
                <At key={r.userId} x={X(left + spot.x)} y={Y(top + spot.y)}>
                  <CreatureSprite
                    creature={{
                      species: r.creature?.species ?? 'cindle',
                      shiny: r.creature?.shiny ?? false,
                    }}
                    scale={s}
                  />
                </At>
              ))}
              <FrontLayer g={g} />
              <button
                type="button"
                class="pv-thing"
                aria-label="Bookshelf: the Journal"
                ref={cssVars({
                  '--x': `${String(X(left + 240))}px`,
                  '--y': `${String(Y(top + 18))}px`,
                  '--pw': `${String(28 * s)}px`,
                  '--ph': `${String(24 * s)}px`,
                })}
                onClick={() => {
                  setStub('Journal');
                }}
              />
              <button
                type="button"
                class="pv-thing"
                aria-label="Trophy shelf: your Stats"
                ref={cssVars({
                  '--x': `${String(X(left + 168))}px`,
                  '--y': `${String(Y(top + 17))}px`,
                  '--pw': `${String(14 * s)}px`,
                  '--ph': `${String(12 * s)}px`,
                })}
                onClick={() => {
                  setStub('Stats');
                }}
              />
              {evo?.phase === 'choose' &&
                forms.map((f, i) => {
                  const spot = i === 0 ? at.left : at.right;
                  const on = picked === f.species;
                  return (
                    <button
                      key={f.species}
                      type="button"
                      class={`pv-form${on ? ' on' : ''}`}
                      aria-pressed={on}
                      aria-label={`Evolve into ${f.name}, ${f.element}`}
                      ref={cssVars({
                        '--x': `${String(X(spot.x - 4))}px`,
                        '--y': `${String(Y(spot.y - 4))}px`,
                        '--pw': `${String(24 * s)}px`,
                        '--ph': `${String(24 * s)}px`,
                      })}
                      onClick={() => {
                        setPicked(f.species);
                      }}
                    >
                      <CreatureSprite creature={{ species: f.species, shiny: false }} scale={s} />
                      <span class="pv-under">
                        <Plate>{f.name}</Plate>
                      </span>
                    </button>
                  );
                })}
              {own !== undefined && (
                <OnTheRug
                  x={X(at.centre.x)}
                  y={Y(at.centre.y)}
                  s={s}
                  evo={evo}
                  species={own.species}
                  shiny={own.shiny}
                  canEvolve={ready !== undefined}
                  essence={essence}
                  label={
                    ready !== undefined
                      ? `${creatureName(ready)}, on the rug. Can evolve for ${String(essence)} Essence`
                      : `${creatureName(own)}, on the rug`
                  }
                  name={creatureName(own)}
                  onTap={() => {
                    if (ready !== undefined && evo === null) {
                      setEvo({ phase: 'choose' });
                      setPicked(forms[0]?.species ?? null);
                    }
                  }}
                />
              )}
            </>
          );
        }}
      </SceneFrame>
      <Drawer
        open={stub !== null}
        onClose={() => {
          setStub(null);
        }}
        title={stub ?? ''}
      >
        <p class="pv-stub">In the game this opens the {stub}. It is not part of this prototype.</p>
      </Drawer>
    </>
  );
}

/** The creature on the rug: the button, its bubble and cost while it can evolve, flashing while it does. */
function OnTheRug({
  x,
  y,
  s,
  evo,
  species,
  shiny,
  canEvolve,
  essence,
  label,
  name,
  onTap,
}: {
  x: number;
  y: number;
  s: number;
  evo: Evo | null;
  species: string;
  shiny: boolean;
  canEvolve: boolean;
  essence: number;
  label: string;
  name: string;
  onTap: () => void;
}) {
  let shown = species;
  let palette: Record<string, string> | undefined;
  let lift = 0;
  if (evo?.phase === 'flash') {
    shown = evo.frame % 2 === 0 ? evo.from : evo.to;
    palette = whitePalette(shown);
  } else if (evo?.phase === 'land') {
    shown = evo.to;
    lift = evo.frame === 0 ? 2 : 0;
  }
  const sparkles = evo?.phase === 'land' || (evo?.phase === 'done' && isStill());
  const spark = evo?.phase === 'land' ? evo.frame : 2;
  return (
    <>
      <button
        type="button"
        class="pv-own"
        aria-label={label}
        ref={cssVars({
          '--x': `${String(x - 4 * s)}px`,
          '--y': `${String(y - (4 + lift) * s)}px`,
          '--pw': `${String(24 * s)}px`,
          '--ph': `${String(24 * s)}px`,
        })}
        onClick={onTap}
      >
        <span class="pv-own-sprite">
          {palette === undefined ? (
            <CreatureSprite creature={{ species: shown, shiny }} scale={s} />
          ) : (
            <Sprite sprite={creatureSpriteOrFallback(shown)} scale={s} palette={palette} />
          )}
        </span>
        {canEvolve && evo === null && (
          <SpeechBubble>
            <UpArrow />
            <CountBadge icon={{ kind: 'glyph', id: 'gem' }} amount={essence} />
          </SpeechBubble>
        )}
        {evo?.phase === 'done' && (
          <span class="pv-under">
            <Plate>{name}</Plate>
          </span>
        )}
      </button>
      {sparkles && (
        <At x={x} y={y} class={`pv-sparkles f${String(Math.min(spark, 2))}`}>
          <span class="pv-spark a" />
          <span class="pv-spark b" />
          <span class="pv-spark c" />
          <span class="pv-spark d" />
        </At>
      )}
    </>
  );
}

/** The room's front props over the creatures: a second canvas, like `LivingRoom`. */
function FrontLayer({ g }: { g: SceneGeometry }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paint(ctx, houseFront(PHASE, g), g.s);
  }, [g.W, g.H, g.s]);
  return (
    <canvas ref={ref} class="pv-front" width={g.W * g.s} height={g.H * g.s} aria-hidden="true" />
  );
}
