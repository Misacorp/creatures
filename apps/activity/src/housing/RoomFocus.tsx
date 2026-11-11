/**
 * One room at a larger scale (`docs/design/housing.md` 4.4 and 4.5): the room drawn on the same two canvases as the
 * overview, with the housemate between them as a creature button (it breathes, and tapping it opens the creature popover). In
 * your own house every spot is a button over the picture (spoken name "Window: Tidepool Curtains", "Small floor: empty"); an
 * empty spot draws a dashed outline, a filled one nothing extra, and a tap asks for the spot's picker (`onSpot`). Displays are
 * buttons that open a popover listing what they show. In a visit (`mode: 'visit'`) nothing can be changed: the pieces and
 * displays are tappable pictures that open a popover with the name, the set and a line. The wallpaper and the floor are two
 * small dropdown triggers under the room (own house) that ask for the skin picker (`onSkin`).
 */
import { useMemo, useRef } from 'preact/hooks';
import { type HousemateView, type HouseView, type RoomPhase } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { cssVars } from '../css-vars';
import { creatureName, getSpecies } from '../game';
import { useElementWidth } from '../hooks';
import { shinyPalette } from '../art';
import { SmallCreature } from '../SmallCreature';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { Sprite } from '../sprites/Sprite';
import { usePopoverTrigger } from '../PopoverHost';
import type { CreatureInfo } from '../creature-info';
import { PopoverCard, popupProps } from '../ui/Popover';
import { PanHint } from '../ui/PanHint';
import { Tag } from '../ui/Tag';
import { useDragScroll } from '../ui/use-drag-scroll';
import { pieceArt, shellArt } from './house-art';
import { composeRoom, type SceneCreature, type SceneSpot } from './house-scene';
import { levelMap, tintSprite } from './house-light';
import { useHousePhase } from './house-phase';
import { swapPalette } from '../sprites/sprite-data';
import { displayText, itemName, spotLabel } from './house-text';
import { boxVars, HOUSE_DRAWING, SceneLayer } from './HouseScene';
import { SkinTrigger } from './SkinTrigger';

const FALLBACK_WIDTH = 390;
/** The focus view's biggest scale; a room is drawn at the largest integer up to it that fits (never less than 2). */
export const FOCUS_MAX_SCALE = 4;
export const FOCUS_MIN_SCALE = 2;
/** The focused room's picture may reach this far past the page's padding on both sides together (CSS px): a one-cell room is scale 3 on a 390 px phone. */
export const FOCUS_BLEED = 12;

/** The integer scale of a focused room `roomWidth` scene px wide in a box `boxWidth` CSS px wide. */
export function focusScale(boxWidth: number, roomWidth: number): number {
  return Math.min(
    FOCUS_MAX_SCALE,
    Math.max(FOCUS_MIN_SCALE, Math.floor(boxWidth / Math.max(1, roomWidth))),
  );
}

/** Each spot's stacking layer: the biggest box lowest, so what is small (and what hangs in front of something big) is the one that is tapped. */
export function spotLayers(
  spots: readonly { spotId: string; w: number; h: number }[],
): Map<string, number> {
  const bySize = [...spots].sort((a, b) => b.w * b.h - a.w * a.h);
  return new Map(bySize.map((s, i) => [s.spotId, i]));
}

/** The popover info of a housemate; the owner's name is shown only on someone else's. */
export function housemateInfo(mate: HousemateView, owner: string | null): CreatureInfo {
  const species = getSpecies(mate.creature.species);
  return {
    name: creatureName({ nickname: mate.creature.nickname, species: mate.creature.species }),
    species: mate.creature.species,
    level: mate.creature.level,
    element: species?.element ?? 'tide',
    role: species?.role ?? 'guard',
    shiny: mate.creature.shiny,
    ...(owner === null ? { creatureId: mate.creature.id } : { ownerName: owner }),
  };
}

/** A spot as a tappable picture or an empty frame: asks `onPick` (own), or opens a popover about what is there. */
function SpotButton({
  spot,
  scale,
  layer,
  label,
  selected,
  onPick,
  peek,
}: {
  spot: SceneSpot;
  scale: number;
  /** Stacking above the other spots: the smaller a spot's box, the higher, so a lamp over a shelf cannot hide the shelf. */
  layer: number;
  label: string;
  selected: boolean;
  /** Own house: the tap asks for the spot's picker. Absent: the tap opens a popover (`peek`). */
  onPick: (() => void) | undefined;
  peek: { title: string; short: string | undefined; lines: string[]; piece: string | null } | null;
}) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  const empty = spot.pieceId === null && spot.type !== 'display';
  return (
    <button
      ref={(el) => {
        ref.current = el;
        boxVars(spot, scale)(el);
        el?.style.setProperty('z-index', String(3 + layer));
      }}
      type="button"
      class="house-spot"
      data-empty={empty ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-type={spot.type}
      aria-label={label}
      {...(onPick === undefined ? popupProps(open) : {})}
      onClick={() => {
        if (onPick !== undefined) {
          onPick();
          return;
        }
        if (host === null || ref.current === null || peek === null) return;
        host.openCustom(`house-spot:${spot.roomId}:${spot.spotId}`, ref.current, {
          label: peek.title,
          body: (
            <PopoverCard
              {...(peek.piece === null
                ? {}
                : { visual: <Sprite sprite={pieceArt(peek.piece).sprite} scale={2} /> })}
              title={peek.title}
              {...(peek.short === undefined ? {} : { short: peek.short })}
              {...(peek.lines.length === 0 ? {} : { lines: peek.lines })}
            >
              {peek.piece !== null && setNameOf(peek.piece) !== null && (
                <Tag>{setNameOf(peek.piece)}</Tag>
              )}
            </PopoverCard>
          ),
        });
      }}
    />
  );
}

/** The name of the set a piece belongs to, or null for a wild piece. */
function setNameOf(pieceId: string): string | null {
  const piece = housing.pieces.find((p) => p.id === pieceId);
  const set =
    piece?.set === undefined || piece.set === null
      ? undefined
      : housing.sets.find((s) => s.id === piece.set);
  return set?.name ?? null;
}

/** The light level (0 to 3) under a scene pixel. */
function levelAt(levels: Uint8Array | null, width: number, x: number, y: number): 0 | 1 | 2 | 3 {
  const v = levels?.[Math.floor(y) * width + Math.floor(x)] ?? 0;
  return v >= 3 ? 3 : v === 2 ? 2 : v === 1 ? 1 : 0;
}

/** A housemate asleep in its bed: the creature as a button, breathing. */
function Sleeper({
  mate,
  at,
  scale,
  owner,
  phase,
  level,
}: {
  mate: SceneCreature;
  at: { x: number; y: number };
  scale: number;
  owner: string | null;
  phase: RoomPhase;
  level: 0 | 1 | 2 | 3;
}) {
  const info = housemateInfo(mate.housemate, owner);
  const palette = mate.housemate.creature.shiny
    ? shinyPalette(mate.housemate.creature.species)
    : undefined;
  return (
    <div
      class="house-sleeper"
      ref={cssVars({ '--x': `${String(at.x * scale)}px`, '--y': `${String(at.y * scale)}px` })}
    >
      <SmallCreature
        id={mate.housemate.creature.id}
        info={info}
        label={`${info.name}, level ${String(info.level)}, asleep`}
        class="house-creature"
      >
        {phase === 'day' ? (
          <Sprite
            sprite={creatureSpriteOrFallback(mate.housemate.creature.species)}
            scale={scale}
            bob
            {...(palette === undefined ? {} : { palette })}
          />
        ) : (
          <Sprite
            sprite={tintSprite(
              palette === undefined
                ? creatureSpriteOrFallback(mate.housemate.creature.species)
                : swapPalette(creatureSpriteOrFallback(mate.housemate.creature.species), palette),
              'creature',
              phase,
              level,
            )}
            scale={scale}
            bob
          />
        )}
      </SmallCreature>
      {/* The "z" over the sleeper, as the house view draws it. */}
      <span
        class="house-z"
        aria-hidden="true"
        ref={cssVars({ '--zx': `${String(12 * scale)}px`, '--zy': `${String(-8 * scale)}px` })}
      >
        <Sprite sprite={shellArt('z')} scale={scale} />
      </span>
    </div>
  );
}

export interface RoomFocusProps {
  house: HouseView;
  roomId: string;
  mode: 'own' | 'visit';
  /** Own house: a spot was tapped (its picker opens). */
  onSpot?: (spotId: string) => void;
  /** Own house: the wallpaper or the floor chip was tapped. */
  onSkin?: (kind: 'wall' | 'floor') => void;
  /** The spot whose picker is open (it keeps a ring). */
  selectedSpot?: string | null;
}

export function RoomFocus({
  house,
  roomId,
  mode,
  onSpot,
  onSkin,
  selectedSpot = null,
}: RoomFocusProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  useDragScroll(viewRef);
  const boxWidth = useElementWidth(rootRef, FALLBACK_WIDTH);
  const phase = useHousePhase();
  const model = useMemo(
    () =>
      composeRoom(house, roomId, {
        content: housing,
        creatures: 'skip',
        drawing: HOUSE_DRAWING,
        phase,
      }),
    [house, roomId, phase],
  );
  // How lit each sleeper's bed is, so the creature is tinted like the room around it.
  const levels = useMemo(
    () => (model === null ? null : levelMap(model.lighting.lights, model.width, model.height)),
    [model],
  );
  if (model === null) return <p class="muted">That room is gone.</p>;
  const scale = focusScale(boxWidth + FOCUS_BLEED, model.width);
  const layers = spotLayers(model.spots);
  const view = house.rooms.find((r) => r.id === roomId);
  const own = mode === 'own';
  const owner = own ? null : house.owner.name;
  return (
    <div class="house-focus" data-mode={mode} data-scale={scale} ref={rootRef}>
      <div class="house-focus-view" ref={viewRef} data-audit-clip>
        <div
          class="house-stage"
          role="group"
          aria-label={model.rooms[0]?.name ?? 'Room'}
          ref={cssVars({
            '--hw': `${String(model.width * scale)}px`,
            '--hh': `${String(model.height * scale)}px`,
          })}
        >
          <SceneLayer
            placements={model.back}
            width={model.width}
            height={model.height}
            layer="back"
            lighting={model.lighting}
          />
          {model.creatures.map((c) => (
            <Sleeper
              key={c.spotId}
              mate={c}
              at={c}
              scale={scale}
              owner={owner}
              phase={phase}
              level={levelAt(levels, model.width, c.x + 8, c.y + 8)}
            />
          ))}
          <SceneLayer
            placements={model.front}
            width={model.width}
            height={model.height}
            layer="front"
            lighting={model.lighting}
          />
          {model.spots.map((spot) => {
            if (spot.type === 'display') {
              const text = displayText(spot.display, 'Display');
              return (
                <SpotButton
                  key={spot.spotId}
                  spot={spot}
                  scale={scale}
                  layer={layers.get(spot.spotId) ?? 0}
                  label={`${text.title}: ${text.lines[0] ?? 'nothing yet'}`}
                  selected={false}
                  onPick={undefined}
                  peek={{ title: text.title, short: undefined, lines: text.lines, piece: null }}
                />
              );
            }
            if (!own && spot.pieceId === null) return null;
            const piece =
              spot.pieceId === null ? null : housing.pieces.find((p) => p.id === spot.pieceId);
            return (
              <SpotButton
                key={spot.spotId}
                spot={spot}
                scale={scale}
                layer={layers.get(spot.spotId) ?? 0}
                label={spotLabel(spot.type, spot.pieceId)}
                selected={selectedSpot === spot.spotId}
                onPick={
                  own
                    ? () => {
                        onSpot?.(spot.spotId);
                      }
                    : undefined
                }
                peek={
                  spot.pieceId === null
                    ? null
                    : {
                        title: itemName(spot.pieceId),
                        short: piece?.line,
                        lines: [],
                        piece: spot.pieceId,
                      }
                }
              />
            );
          })}
        </div>
      </div>
      <PanHint target={viewRef} id="house-room" />
      {own && view !== undefined && onSkin !== undefined && !(model.rooms[0]?.outdoor ?? false) && (
        <div class="house-chips">
          <SkinTrigger
            kind="wall"
            id={view.wall}
            onOpen={() => {
              onSkin('wall');
            }}
          />
          <SkinTrigger
            kind="floor"
            id={view.floor}
            onOpen={() => {
              onSkin('floor');
            }}
          />
        </div>
      )}
    </div>
  );
}
