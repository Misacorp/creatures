/**
 * The places step 7 peeks into, and the paddock, full screen. The cave (the Dungeon): a slate stair going down,
 * a lantern on the first step, today's team on the landing, the pack on the wall, and today's map drawn in the
 * dark below (the game's own `DungeonMap` in preview), with Go down pinned at the bottom. The fairground (the
 * Valley Games): the podium and tents, and today's events as stalls along the grass, each the event's own
 * `GamesScene`. The paddock: your creatures in the grass (the tray is the list of them all). Setting off into
 * the dungeon and entering an event are stubs here.
 */
import { useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { DungeonMap } from '../../DungeonMap';
import { GamesScene } from '../../games/art/GamesScene';
import type { GamesSceneId } from '../../games/art/scenes';
import { whenText } from '../../home-view';
import { PACK_ART } from '../../sprites/pack-art';
import { ActionButton } from '../../ui/ActionButton';
import { Drawer } from '../../ui/Drawer';
import { freeCreatures, type ProtoWorld } from '../world';
import { At, CreatureSprite, Glyph, Pic, Plate } from './parts';
import { SceneFrame } from './SceneFrame';
import { caveDraw, caveSpots, fairDraw, paddockDraw } from './scene-art';

function Stub({ what, onClose }: { what: string | null; onClose: () => void }) {
  return (
    <Drawer open={what !== null} onClose={onClose} title="Not in this prototype">
      <p class="pv-stub">In the game this opens {what}.</p>
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
        draw={caveDraw}
        onLeave={onLeave}
        ground="#0b0818"
        act={
          <ActionButton
            label="Go down"
            detail={`Depth ${String(world.dungeon.depth)}`}
            wide
            large
            onClick={() => {
              setStub("the dungeon's setup (team and supplies)");
            }}
          />
        }
      >
        {(g) => {
          const { s, X, Y } = g;
          const at = caveSpots(g);
          return (
            <>
              {team.map((c, i) => (
                <At key={c.id} x={X(at.landing.x + i * 10)} y={Y(at.landing.y + (i % 2) * 2)}>
                  <CreatureSprite creature={c} scale={s} />
                </At>
              ))}
              <At x={X(at.lantern.x)} y={Y(at.lantern.y)}>
                <Glyph id="lantern" scale={s} />
              </At>
              <At x={X(at.pack.x)} y={Y(at.pack.y)}>
                <Pic sprite={PACK_ART} scale={s} />
              </At>
              {map != null && (
                <div class="pv-dungeon-map" ref={cssVars({ '--y': `${String(Y(at.dark))}px` })}>
                  <DungeonMap
                    map={map}
                    state={null}
                    landmark={world.dungeon.landmark}
                    depth={world.dungeon.depth}
                  />
                </div>
              )}
            </>
          );
        }}
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
  return (
    <>
      <SceneFrame
        id="fair"
        label="Fairground, Valley Games"
        draw={fairDraw}
        onLeave={onLeave}
        ground="#57ad52"
      >
        {(g) => (
          <>
            <At x={g.X(g.cx + 2)} y={g.Y(g.top + 50)} hidden={false}>
              <span class="pv-sign pix">
                <Glyph id="clock" scale={2} />
                <span>{whenText(world.now, next.lockAt, world.timezone)}</span>
              </span>
            </At>
            <ul
              class="pv-stalls"
              aria-label="Today's events"
              ref={cssVars({ '--y': `${String(g.Y(g.top + 66))}px` })}
            >
              {next.lineup.map((ev) => (
                <li key={ev.id} class="pv-stall">
                  <button
                    type="button"
                    class="pv-stall-button"
                    aria-label={`${ev.name}. Enter a creature`}
                    onClick={() => {
                      setStub(`the entry picker for ${ev.name}`);
                    }}
                  >
                    <GamesScene scene={ev.scene as GamesSceneId} scale={g.s - 1} frame={0} />
                    <span class="pv-stall-name">
                      <Plate>{ev.name}</Plate>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
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

export function PaddockScene({ world, onLeave }: { world: ProtoWorld; onLeave: () => void }) {
  const home = world.creatures.filter((c) => !c.away);
  return (
    <SceneFrame id="paddock" label="Paddock, your creatures" draw={paddockDraw} onLeave={onLeave}>
      {(g) => {
        const cols = Math.max(3, Math.floor((g.W - 16) / 24));
        const x0 = g.cx - Math.floor((Math.min(cols, home.length) * 24) / 2);
        return (
          <>
            {home.map((c, i) => (
              <At
                key={c.id}
                x={g.X(x0 + (i % cols) * 24 + 4)}
                y={g.Y(g.top + 34 + Math.floor(i / cols) * 28 + (i % 2) * 3)}
              >
                <CreatureSprite creature={c} scale={g.s} flip={i % 2 === 1} />
              </At>
            ))}
          </>
        );
      }}
    </SceneFrame>
  );
}
