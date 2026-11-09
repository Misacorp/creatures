/**
 * One room at a larger scale (`docs/design/housing.md` 4.4 and 4.5): the room drawn on the same two canvases as the
 * overview, with the housemate between them as a creature button (it breathes, and tapping it opens the creature popover). In
 * your own house every spot is a button over the picture (spoken name "Window: Tidepool Curtains", "Small floor: empty"); an
 * empty spot draws a dashed outline, a filled one nothing extra, and a tap asks for the spot's picker (`onSpot`). Displays are
 * buttons that open a popover listing what they show. In a visit (`mode: 'visit'`) nothing can be changed: the pieces and
 * displays are tappable pictures that open a popover with the name, the set and a line. The wallpaper and the floor are two
 * small chips under the room (own house) that ask for the skin picker (`onSkin`).
 */
import { useMemo, useRef } from 'preact/hooks';
import { housing, type HousemateView, type HouseView } from '@creatures/game';
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
import { pieceArt } from './house-art';
import { composeRoom, type SceneCreature, type SceneSpot } from './house-scene';
import { displayText, itemName, spotLabel } from './house-text';
import { boxVars, HOUSE_DRAWING, SceneLayer } from './HouseScene';

const FALLBACK_WIDTH = 390;
/** The focus view's biggest scale; a room is drawn at the largest integer up to it that fits (never less than 2). */
export const FOCUS_MAX_SCALE = 4;
export const FOCUS_MIN_SCALE = 2;

/** The integer scale of a focused room `roomWidth` scene px wide in a box `boxWidth` CSS px wide. */
export function focusScale(boxWidth: number, roomWidth: number): number {
  return Math.min(
    FOCUS_MAX_SCALE,
    Math.max(FOCUS_MIN_SCALE, Math.floor(boxWidth / Math.max(1, roomWidth))),
  );
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
  label,
  selected,
  onPick,
  peek,
}: {
  spot: SceneSpot;
  scale: number;
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

/** A housemate asleep in its bed: the creature as a button, breathing. */
function Sleeper({
  mate,
  at,
  scale,
  owner,
}: {
  mate: SceneCreature;
  at: { x: number; y: number };
  scale: number;
  owner: string | null;
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
        <Sprite
          sprite={creatureSpriteOrFallback(mate.housemate.creature.species)}
          scale={scale}
          bob
          {...(palette === undefined ? {} : { palette })}
        />
      </SmallCreature>
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
  const model = useMemo(
    () =>
      composeRoom(house, roomId, { content: housing, creatures: 'skip', drawing: HOUSE_DRAWING }),
    [house, roomId],
  );
  if (model === null) return <p class="muted">That room is gone.</p>;
  const scale = focusScale(boxWidth, model.width);
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
          />
          {model.creatures.map((c) => (
            <Sleeper key={c.spotId} mate={c} at={c} scale={scale} owner={owner} />
          ))}
          <SceneLayer
            placements={model.front}
            width={model.width}
            height={model.height}
            layer="front"
          />
          {model.spots.map((spot) => {
            if (spot.type === 'display') {
              const text = displayText(spot.display, 'Display');
              return (
                <SpotButton
                  key={spot.spotId}
                  spot={spot}
                  scale={scale}
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
          <Tag
            kind="chip"
            label={`Wallpaper: ${itemName(view.wall)}`}
            onClick={() => {
              onSkin('wall');
            }}
          >
            {itemName(view.wall)}
          </Tag>
          <Tag
            kind="chip"
            label={`Floor: ${itemName(view.floor)}`}
            onClick={() => {
              onSkin('floor');
            }}
          >
            {itemName(view.floor)}
          </Tag>
        </div>
      )}
    </div>
  );
}
