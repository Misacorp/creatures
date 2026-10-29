/**
 * Inside the house (the living room): the game's own living room art (`roomScene`, drawn in two layers like
 * `LivingRoom`), the other players' creatures in their spots, and yours on the couch. A creature that can
 * evolve has its bubble (its face and an up arrow). Tap it: its forms stand on the floor to pick from, and a
 * gold Evolve. Then the moment: the old and the new form flash in turn, white, faster and faster, the new one
 * lands with a bounce and four sparkles pop. The bookshelf is the Journal and the trophy shelf the Stats
 * (both stubs here).
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
import { Drawer } from '../../ui/Drawer';
import { TOUR, creatureOf, evolvers, type ProtoWorld } from '../world';
import { paint } from './paint';
import { At, CreatureSprite, SpeechBubble, UpArrow, isStill } from './parts';
import { SceneFrame } from './SceneFrame';
import { HOUSE_SIZE, ROOM_TOP, houseDraw, houseFront } from './scene-art';
import { EVOLVE_FLASH_MS, evolveInto } from './valley-logic';
import { CreatureIcon } from '../../CreatureIcon';

const PHASE: RoomPhase = 'day';
const DRAW = houseDraw(PHASE);
const WHITE = '#ffffff';

/** Every colour of a sprite turned white: the flash of the evolution. */
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
  onProgress,
}: {
  world: ProtoWorld;
  setWorld: (w: ProtoWorld) => void;
  /** The evolution's choice is open at first (the step's moment). */
  choosing: boolean;
  onLeave: () => void;
  onProgress: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const still = reduced || isStill();
  const ready = evolvers(world)[0];
  const ownId = ready?.id ?? TOUR.evolveId;
  const own = world.creatures.find((c) => c.id === ownId);
  const [evo, setEvo] = useState<Evo | null>(choosing && ready !== undefined ? { phase: 'choose' } : null);
  const forms = ready === undefined ? [] : evolveForms(ready);
  const [picked, setPicked] = useState<string | null>(choosing ? (forms[0]?.species ?? null) : null);
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

  // Who sits where: your creature on the couch's middle, the other players' in the next spots.
  const spots = ROOM_SPOTS.filter((s) => s.id !== 'couch-middle');
  const others = world.residents.slice(1, 6).flatMap((r, i) => {
    const spot = [spots[3], spots[0], spots[6], spots[10], spots[13]][i];
    return r.creature === null || spot === undefined ? [] : [{ r, spot }];
  });
  const couch = ROOM_SPOTS.find((s) => s.id === 'couch-middle') ?? { x: 72, y: 28 };

  const floor =
    evo?.phase === 'choose' && ready !== undefined ? (
      <div class="pv-setup">
        <ul class="pv-forms" aria-label={`What ${creatureName(ready)} becomes`}>
          {forms.map((f) => (
            <li key={f.species}>
              <button
                type="button"
                class={`pv-pick${picked === f.species ? ' on' : ''}`}
                aria-pressed={picked === f.species}
                aria-label={`${f.name}, ${f.element}`}
                onClick={() => {
                  setPicked(f.species);
                }}
              >
                <CreatureSprite creature={{ species: f.species, shiny: ready.shiny }} scale={4} />
                <span class="pv-pick-name pix" aria-hidden="true">
                  {f.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <ActionButton
          label={picked === null ? 'Pick a form' : 'Evolve'}
          detail={`${String(ready.evolution?.essence ?? 0)} Essence`}
          wide
          large
          disabled={picked === null}
          onClick={go}
        />
      </div>
    ) : evo?.phase === 'done' && own !== undefined ? (
      <p class="pv-evolved pix" role="status">
        <CreatureIcon creature={own} /> {creatureName(own)}!
      </p>
    ) : null;

  return (
    <>
      <SceneFrame
        id="house"
        label="House, living room"
        width={HOUSE_SIZE.width}
        height={HOUSE_SIZE.height}
        draw={DRAW}
        onLeave={onLeave}
        floor={floor}
        start={couch.x + 8}
        phoneScale={4}
        ground="#2a1e2e"
      >
        {({ s, X, Y }) => {
          const ox = X(0) / s;
          return (
            <>
              {others.map(({ r, spot }) => (
                <At key={r.userId} x={X(spot.x)} y={Y(ROOM_TOP + spot.y)}>
                  <CreatureSprite
                    creature={{ species: r.creature?.species ?? 'cindle', shiny: r.creature?.shiny ?? false }}
                    scale={s}
                  />
                </At>
              ))}
              {own !== undefined && (
                <OwnOnCouch
                  x={X(couch.x)}
                  y={Y(ROOM_TOP + couch.y)}
                  s={s}
                  evo={evo}
                  species={own.species}
                  shiny={own.shiny}
                  canEvolve={ready !== undefined}
                  label={
                    ready !== undefined
                      ? `${creatureName(ready)}, on the couch. Can evolve`
                      : `${creatureName(own)}, on the couch`
                  }
                  onTap={() => {
                    if (ready !== undefined) {
                      setEvo({ phase: 'choose' });
                      setPicked(forms[0]?.species ?? null);
                    }
                  }}
                />
              )}
              <FrontLayer ox={ox} s={s} />
              <button
                type="button"
                class="pv-thing"
                aria-label="Bookshelf: the Journal"
                ref={cssVars({
                  '--x': `${String(X(240))}px`,
                  '--y': `${String(Y(ROOM_TOP + 18))}px`,
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
                  '--x': `${String(X(168))}px`,
                  '--y': `${String(Y(ROOM_TOP + 17))}px`,
                  '--pw': `${String(14 * s)}px`,
                  '--ph': `${String(12 * s)}px`,
                })}
                onClick={() => {
                  setStub('Stats');
                }}
              />
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
        <p class="pv-stub">
          In the game this opens the {stub}. It is not part of this prototype.
        </p>
      </Drawer>
    </>
  );
}

/** Your creature on the couch: a button, with its bubble while it can evolve, flashing while it does. */
function OwnOnCouch({
  x,
  y,
  s,
  evo,
  species,
  shiny,
  canEvolve,
  label,
  onTap,
}: {
  x: number;
  y: number;
  s: number;
  evo: Evo | null;
  species: string;
  shiny: boolean;
  canEvolve: boolean;
  label: string;
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
          '--x': `${String(x)}px`,
          '--y': `${String(y - lift * s)}px`,
          '--pw': `${String(16 * s)}px`,
          '--ph': `${String(16 * s)}px`,
        })}
        onClick={onTap}
      >
        <Sprite
          sprite={creatureSpriteOrFallback(shown)}
          scale={s}
          {...(palette !== undefined
            ? { palette }
            : shiny
              ? {}
              : {})}
        />
        {canEvolve && evo === null && (
          <SpeechBubble>
            <CreatureIcon creature={{ species, shiny }} />
            <UpArrow />
          </SpeechBubble>
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

/** The room's front props (couch arms, the table) over the creatures: a second canvas, like `LivingRoom`. */
function FrontLayer({ ox, s }: { ox: number; s: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = (HOUSE_SIZE.width + ox * 2) * s;
  const h = HOUSE_SIZE.height * s;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paint(ctx, houseFront(PHASE, ox), s);
  }, [ox, s]);
  return <canvas ref={ref} class="pv-front" width={w} height={h} aria-hidden="true" />;
}

export { creatureOf };
