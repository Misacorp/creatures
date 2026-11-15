/**
 * What stands in the Forge's scene, over its canvas (`ForgeCanvas.tsx` holds the state and the drawers): the targets, the creatures
 * and their small bubbles. The place opens straight on its interior (Misa, 2026-11-15; there is no outside view).
 *
 * - `ForgeInside` (Misa, 2026-11-11, "the interior of a workshop"): the player's smiths at their anvils with the dashed outline of the
 *   next, the furnace with its fire (opens the project board), the plans board, the chest (the bag) and the crate of finished pieces
 *   (the floor), the door (back to the valley), and at the back benches other players' smiths at work, small, each a tap that shows its
 *   creature's plate with the owner's name (never a list of everyone). With nobody else's, a couple of ambient workers keep the room
 *   alive. Small idle motions step (hammering, carrying) and stop for reduced motion (`canvas.css`).
 * - One cue for every clickable thing, none for decoration (Misa, 2026-11-15: "It was also inconsistent which elements were actually
 *   clickable and I didn't find any kind of visual cue"): each target has a `plate` (its short name, always shown under it). The racks, shelf, trough, coal, cat, rug and the rest of the dressing are canvas art only: no target, no plate.
 */
import { useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { cssVars } from '../css-vars';
import { PriceLine } from '../ui/CountBadge';
import { Nameplate } from '../ui/Nameplate';
import { CanvasTarget, type Opener } from './PlaceCanvas';
import type { SceneGeometry } from './SceneFrame';
import { At, CreatureSprite, Pic, SpeechBubble } from './parts';
import { ANVIL_PROP } from './forge-props';
import { PROP, anvilGlyph, anvilLabel, anvilWorking } from './forge-canvas';
import { interiorLayout } from './forge-interior';
import { CrateProp } from './CrateProp';
import { CrateReveal } from './CrateReveal';
import type { CrateOpened, CrateState } from './crate-view';
import { interiorSprite } from './forge-interior-art';
import { WARMING_FLAME } from './valley-art';

/** The flame's top-left over the furnace's mouth, from the furnace's top-left (the art's fire is at x 14 to 33). */
const FLAME_AT = { x: 22, y: 36 } as const;
import { anvilName, anvilPrice } from './forge-view';

/** Where an anvil cell's plate sits, scene pixels down from the cell's top: under the anvil. */
const PLATE_AT = 28;

/** The two ambient workers (decoration when no one else's smith is at work): species and motion. */
export const AMBIENT = [
  { species: 'cindle', motion: 'fi-carry' },
  { species: 'splashet', motion: 'fi-hammer' },
] as const;

/** How many ambient workers a room with `others` of other players' smiths shows: enough for two workers in all. */
export function ambientCount(others: number): number {
  return Math.max(0, Math.min(AMBIENT.length, 2 - others));
}

/**
 * The back spot of each ambient worker: other players' smiths stand at the first spots, so the ambient ones take the spots left,
 * the first from the far end and the second from the near end of what is free.
 */
export function ambientSpots(others: number, spots: number): number[] {
  const free = Array.from({ length: Math.max(0, spots - others) }, (_, i) => others + i);
  const out: number[] = [];
  const count = Math.min(ambientCount(others), free.length);
  if (count >= 1) out.push(free[free.length - 1] as number);
  if (count >= 2) out.push(free[0] as number);
  return out;
}

/** A bubble over a spot, `PROP` pixels wide. */
function Bubble({
  g,
  x,
  y,
  glyph,
  count,
}: {
  g: SceneGeometry;
  x: number;
  y: number;
  glyph: string;
  count: number | null;
}) {
  return (
    <At x={g.X(x)} y={g.Y(y)} class="vy-over">
      <span
        class="vy-region-box"
        ref={cssVars({ '--pw': `${String(PROP * g.s)}px`, '--ph': '0px' })}
      />
      <SpeechBubble glyph={glyph} count={count} />
    </At>
  );
}

/** The sealed crate being opened: the glow it had (the valley's crate is empty once the server has opened it) and, when it has answered, what it held. */
export interface CrateRun {
  best: 'rare' | 'epic' | null;
  count: number;
  /** Null while the crate rattles and the server is asked; set when the reveal starts. */
  answer: CrateOpened | null;
}

/** The inside's state of the drawers, as the targets need it. */
export interface InsideOpen {
  /** The anvil whose drawer is open (its wizard or its order), or null. */
  anvilId: string | null;
  buy: boolean;
  left: 'bag' | 'floor' | 'plans' | 'board' | null;
}

export function ForgeInside({
  g,
  visit,
  creatureOf,
  busy,
  marketBuilt,
  slots,
  waiting,
  bagFull,
  bagAttention,
  open,
  overSeat,
  crate,
  crateRun,
  onCrate,
  onCrateDone,
  crateFailed,
  onAnvil,
  onBuy,
  onLeft,
  onOut,
}: {
  g: SceneGeometry;
  visit: ValleyVisit;
  creatureOf: (id: string | null) => Creature | undefined;
  busy: boolean;
  marketBuilt: boolean;
  slots: number;
  waiting: number;
  bagFull: boolean;
  bagAttention: boolean;
  open: InsideOpen;
  /** A hand carrying a creature is over this seat (an anvil's id). */
  overSeat: string | null;
  /** The sealed crate as the valley says it, and the one being opened now (null: none). */
  crate: CrateState;
  crateRun: CrateRun | null;
  onCrate: (opener: Opener) => void;
  onCrateDone: () => void;
  /** The crate would not open (the server said no, or nothing came back): a line over it. */
  crateFailed: string | null;
  onAnvil: (anvilId: string, hasSmith: boolean, opener: Opener) => void;
  onBuy: (opener: Opener) => void;
  onLeft: (kind: 'bag' | 'floor' | 'plans' | 'board', opener: Opener) => void;
  onOut: (opener: Opener) => void;
}) {
  const [peek, setPeek] = useState<number | null>(null);
  const lay = interiorLayout(g, slots);
  const owned = visit.anvils.length;
  const nextPrice = visit.anvilPrices.next;
  const night = visit.night;
  const others = visit.smiths;
  const bs = Math.max(1, g.s - 1);
  const benchSprite = interiorSprite('workbench', night);
  // The far smiths: small, behind the benches (the benches come after them, so they stand over their feet).
  const backTop = (spot: { y: number }): number => g.Y(spot.y) - 16 * bs;
  const backLeft = (spot: { x: number }): number => g.X(spot.x) - 8 * bs;
  return (
    <>
      <At x={g.X(lay.furnace.x + FLAME_AT.x)} y={g.Y(lay.furnace.y + FLAME_AT.y)} class="fi-fire">
        <Pic sprite={WARMING_FLAME} scale={g.s} />
      </At>
      {ambientSpots(others.length, lay.backSpots.length).map((at, i) => {
        const spot = lay.backSpots[at];
        const worker = AMBIENT[i];
        if (spot === undefined || worker === undefined) return null;
        return (
          <At key={worker.species} x={backLeft(spot)} y={backTop(spot)}>
            <CreatureSprite
              creature={{ species: worker.species, shiny: false }}
              scale={bs}
              flip={at % 2 === 1}
              class={worker.motion}
            />
          </At>
        );
      })}
      {others.map((other, i) => {
        const spot = lay.backSpots[i];
        if (spot === undefined) return null;
        return (
          <At key={other.creature.id} x={backLeft(spot)} y={backTop(spot)}>
            <CreatureSprite
              creature={other.creature}
              scale={bs}
              flip={i % 2 === 1}
              class={other.working ? `fi-hammer fi-d${String(i % 3)}` : undefined}
            />
          </At>
        );
      })}
      {lay.benches.map((b, i) => (
        <At key={i === 0 ? 'bench-a' : 'bench-b'} x={g.X(b.x)} y={g.Y(b.y)}>
          <Pic sprite={benchSprite} scale={g.s} />
        </At>
      ))}
      {visit.anvils.map((anvil, i) => {
        const cell = lay.cells[i];
        const smith = creatureOf(anvil.creatureId);
        const glyph = anvilGlyph(anvil);
        if (cell === undefined || smith === undefined) return null;
        return (
          <span key={anvil.id}>
            <At x={g.X(cell.smith.x)} y={g.Y(cell.smith.y)} class="vy-stand">
              <CreatureSprite
                creature={smith}
                scale={g.s}
                flip={i % 2 === 1}
                class={anvilWorking(anvil) ? `fi-hammer fi-d${String(i % 3)}` : undefined}
              />
            </At>
            {glyph !== null && (
              <Bubble g={g} x={cell.smith.x} y={cell.smith.y} glyph={glyph} count={null} />
            )}
          </span>
        );
      })}
      {waiting > 0 && <Bubble g={g} x={lay.crate.x} y={lay.crate.y} glyph="gift" count={waiting} />}
      {crateFailed !== null && crateRun === null && (
        <At
          x={g.X(lay.sealed.x + lay.sealed.w / 2)}
          y={g.Y(lay.sealed.y - 20)}
          class="vy-feet-plate vy-over"
        >
          <span class="cr-fail pix" role="alert">
            {crateFailed}
          </span>
        </At>
      )}
      {(crate.count > 0 || crateRun !== null) &&
        (crateRun === null || crateRun.answer === null) && (
          <CrateProp
            g={g}
            box={lay.sealed}
            crate={crate}
            best={crateRun?.best ?? crate.best}
            night={night}
            phase={crateRun === null ? 'idle' : 'rattle'}
            disabled={busy || crateRun !== null}
            onOpen={onCrate}
          />
        )}
      {(bagFull || bagAttention) && (
        <Bubble g={g} x={lay.chest.x} y={lay.chest.y} glyph="warning" count={null} />
      )}

      {/* The targets, over everything above: each a real button. */}
      {others.map((other, i) => {
        const spot = lay.backSpots[i];
        if (spot === undefined) return null;
        const who = `${other.owner}'s ${creatureName({ nickname: other.creature.name, species: other.creature.species })}`;
        return (
          <span key={other.creature.id}>
            <CanvasTarget
              g={g}
              x={spot.x - 7}
              y={spot.y - 14}
              w={14}
              h={16}
              label={`${who}, ${other.working ? 'at work' : 'at the bench'}. Show who`}
              {...(peek === i
                ? {}
                : {
                    plate: creatureName({
                      nickname: other.creature.name,
                      species: other.creature.species,
                    }),
                    plateAt: i % 2 === 0 ? -6 : -12,
                  })}
              expanded={peek === i}
              onClick={() => {
                setPeek(peek === i ? null : i);
              }}
            />
            {peek === i && (
              <At x={g.X(spot.x)} y={backTop(spot) - 4} class="vy-feet-plate vy-over">
                <Nameplate size="sm" level={other.creature.level} owner={other.owner}>
                  {creatureName({ nickname: other.creature.name, species: other.creature.species })}
                </Nameplate>
              </At>
            )}
          </span>
        );
      })}
      <CanvasTarget
        g={g}
        x={lay.furnace.x}
        y={lay.furnace.y}
        w={lay.furnace.w}
        h={lay.furnace.h}
        label="The furnace: the fire and the project board. Open"
        plate="Furnace"
        plateAt={lay.furnace.h}
        expanded={open.left === 'board'}
        onClick={(opener) => {
          onLeft('board', opener);
        }}
      />
      <CanvasTarget
        g={g}
        x={lay.door.x}
        y={lay.door.y}
        w={lay.door.w}
        h={lay.door.h}
        label="The door. Back to the valley"
        plate="Valley"
        onClick={onOut}
      />
      {visit.anvils.map((anvil, i) => {
        const cell = lay.cells[i];
        if (cell === undefined) return null;
        const smith = creatureOf(anvil.creatureId);
        const name = anvilName(visit, anvil);
        return (
          <CanvasTarget
            key={anvil.id}
            g={g}
            x={cell.x}
            y={cell.y}
            w={cell.w}
            h={cell.h}
            seat={anvil.id}
            over={overSeat === anvil.id}
            label={anvilLabel(
              name,
              smith === undefined ? undefined : { name: creatureName(smith), level: smith.level },
              anvil,
              marketBuilt,
            )}
            plate={smith === undefined ? name : creatureName(smith)}
            plateAt={PLATE_AT}
            expanded={open.anvilId === anvil.id}
            disabled={busy}
            onClick={(opener) => {
              onAnvil(anvil.id, smith !== undefined, opener);
            }}
          />
        );
      })}
      {nextPrice !== null && lay.cells[owned] !== undefined && (
        <CanvasTarget
          g={g}
          x={lay.cells[owned].x}
          y={lay.cells[owned].y}
          w={lay.cells[owned].w}
          h={lay.cells[owned].h}
          slot
          label="A new anvil. Buy it"
          plate="New anvil"
          plateAt={PLATE_AT}
          expanded={open.buy}
          disabled={busy}
          onClick={onBuy}
        >
          <span
            class="cv-ghost"
            aria-hidden="true"
            ref={cssVars({ '--gy': `${String(12 * g.s)}px` })}
          >
            <Pic sprite={ANVIL_PROP} scale={g.s} />
          </span>
          <span class="cv-price">
            <PriceLine price={anvilPrice(nextPrice)} />
          </span>
        </CanvasTarget>
      )}
      <CanvasTarget
        g={g}
        {...lay.plans}
        label="The plans: the blueprints you know. Open"
        plate="Plans"
        expanded={open.left === 'plans'}
        onClick={(opener) => {
          onLeft('plans', opener);
        }}
      />
      <CanvasTarget
        g={g}
        {...lay.chest}
        label={`The bag${bagFull ? ', full' : ''}. Open`}
        plate="Bag"
        expanded={open.left === 'bag'}
        onClick={(opener) => {
          onLeft('bag', opener);
        }}
      />
      <CanvasTarget
        g={g}
        {...lay.crate}
        label={`The floor: ${waiting === 0 ? 'nothing waiting' : `${String(waiting)} pieces waiting`}. Open`}
        plate="Floor"
        expanded={open.left === 'floor'}
        onClick={(opener) => {
          onLeft('floor', opener);
        }}
      />
      {crateRun !== null && crateRun.answer !== null && (
        <CrateReveal
          g={g}
          best={crateRun.best}
          night={night}
          answer={crateRun.answer}
          nameOf={(id) => {
            const c = creatureOf(id);
            return c === undefined ? undefined : creatureName(c);
          }}
          onDone={onCrateDone}
        />
      )}
    </>
  );
}
