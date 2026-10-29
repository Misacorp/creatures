/**
 * The places step 7 peeks into, and the paddock: the cave (the Dungeon: a slate stair going down, a lantern on
 * the first step, today's team on the landing, the pack leaning on the wall, and today's map drawn in the dark
 * below, the game's own `DungeonMap` in preview), the fairground (the Valley Games: today's events as stalls,
 * each the event's own `GamesScene`, your entered creature standing in its stall) and the paddock (your
 * creatures in the grass). Setting off into the dungeon and entering an event are stubs here.
 */
import { useState } from 'preact/hooks';
import { DungeonMap } from '../../DungeonMap';
import { creatureName } from '../../game';
import { GamesScene } from '../../games/art/GamesScene';
import type { GamesSceneId } from '../../games/art/scenes';
import { whenText } from '../../home-view';
import { PACK_ART } from '../../sprites/pack-art';
import { ActionButton } from '../../ui/ActionButton';
import { Drawer } from '../../ui/Drawer';
import { freeCreatures, type ProtoWorld } from '../world';
import { At, CreatureSprite, Glyph, Pic } from './parts';
import { SceneFrame } from './SceneFrame';
import {
  CAVE_LANDING,
  CAVE_LANTERN,
  CAVE_SIZE,
  FAIR_SIZE,
  PADDOCK_SIZE,
  caveDraw,
  fairDraw,
  paddockDraw,
} from './scene-art';

function Stub({ what, onClose }: { what: string | null; onClose: () => void }) {
  return (
    <Drawer open={what !== null} onClose={onClose} title={what ?? ''}>
      <p class="pv-stub">In the game this opens {what}. It is not part of this prototype.</p>
    </Drawer>
  );
}

export function CaveScene({ world, onLeave }: { world: ProtoWorld; onLeave: () => void }) {
  const [stub, setStub] = useState<string | null>(null);
  const team = freeCreatures(world).slice(0, 3);
  const map = world.dungeon.map;
  return (
    <>
      <SceneFrame
        id="cave"
        label="Cave, Dungeon"
        width={CAVE_SIZE.width}
        height={CAVE_SIZE.height}
        draw={caveDraw}
        onLeave={onLeave}
        ground="#0b0818"
        floor={
          <div class="pv-setup pv-under">
            {map != null && (
              <div class="pv-dungeon-map">
                <DungeonMap
                  map={map}
                  state={null}
                  landmark={world.dungeon.landmark}
                  depth={world.dungeon.depth}
                />
              </div>
            )}
            <ActionButton
              label="Go down"
              detail={`Depth ${String(world.dungeon.depth)}`}
              wide
              large
              onClick={() => {
                setStub("the dungeon's setup (team and supplies)");
              }}
            />
          </div>
        }
      >
        {({ s, X, Y }) => (
          <>
            {team.map((c, i) => (
              <At key={c.id} x={X(CAVE_LANDING.x + i * 10)} y={Y(CAVE_LANDING.y + 4 + (i % 2) * 2)}>
                <CreatureSprite creature={c} scale={s} />
              </At>
            ))}
            <At x={X(CAVE_LANTERN.x)} y={Y(CAVE_LANTERN.y)}>
              <Glyph id="lantern" scale={s} />
            </At>
            <At x={X(104)} y={Y(18)}>
              <Pic sprite={PACK_ART} scale={s} />
            </At>
          </>
        )}
      </SceneFrame>
      <Stub
        what={stub}
        onClose={() => {
          setStub(null);
        }}
      />
    </>
  );
}

export function FairScene({ world, onLeave }: { world: ProtoWorld; onLeave: () => void }) {
  const [stub, setStub] = useState<string | null>(null);
  const next = world.games.next;
  const entries = next.entries;
  return (
    <>
      <SceneFrame
        id="fair"
        label="Fairground, Valley Games"
        width={FAIR_SIZE.width}
        height={FAIR_SIZE.height}
        draw={fairDraw}
        onLeave={onLeave}
        ground="#3a8346"
        floor={
          <ul class="pv-stalls" aria-label="Today's events">
            {next.lineup.map((ev) => {
              const ids = entries[ev.id] ?? [];
              const entered = world.creatures.find((c) => ids.includes(c.id));
              return (
                <li key={ev.id} class="pv-stall">
                  <button
                    type="button"
                    class="pv-stall-button"
                    aria-label={`${ev.name}: ${entered === undefined ? 'nobody entered. Enter a creature' : `${creatureName(entered)} entered`}`}
                    onClick={() => {
                      setStub(`the entry picker for ${ev.name}`);
                    }}
                  >
                    <GamesScene scene={ev.scene as GamesSceneId} scale={2} frame={0} />
                    <span class="pv-stall-name pix" aria-hidden="true">
                      {ev.name}
                    </span>
                    {entered !== undefined && (
                      <span class="pv-stall-who" aria-hidden="true">
                        <CreatureSprite creature={entered} scale={3} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        }
      >
        {({ X, Y }) => (
          <At x={X(4)} y={Y(4)} class="pv-sign-at">
            <span class="pv-sign pix">
              <Glyph id="clock" scale={2} />
              <span>{whenText(world.now, next.lockAt, world.timezone)}</span>
            </span>
          </At>
        )}
      </SceneFrame>
      <Stub
        what={stub}
        onClose={() => {
          setStub(null);
        }}
      />
    </>
  );
}

export function PaddockScene({ world, onLeave }: { world: ProtoWorld; onLeave: () => void }) {
  const home = world.creatures.filter((c) => !c.away);
  return (
    <SceneFrame
      id="paddock"
      label="Paddock, your creatures"
      width={PADDOCK_SIZE.width}
      height={PADDOCK_SIZE.height}
      draw={paddockDraw}
      onLeave={onLeave}
      ground="#3a8346"
      floor={
        <p class="pv-floor-note">
          {String(world.creatures.length)} creatures. In the game the gate opens the Creatures list.
        </p>
      }
    >
      {({ s, X, Y }) => (
        <>
          {home.map((c, i) => (
            <At key={c.id} x={X(8 + (i % 6) * 20)} y={Y(18 + Math.floor(i / 6) * 20)}>
              <CreatureSprite creature={c} scale={s} flip={i % 2 === 1} />
            </At>
          ))}
        </>
      )}
    </SceneFrame>
  );
}
