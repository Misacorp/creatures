import { Fragment, type ComponentChildren } from 'preact';
import { GamesActor, GamesScene, GamesSprite, type ActorState } from '../../games/art/GamesScene';
import { FLOE_MAX_RADIUS, FLOE_MIN_RADIUS, floeRy } from '../../games/art/drawn';
import { GAMES_PROPS, PROP_NAMES, PROP_TINTS, propTinted } from '../../games/art/props';
import {
  GAMES_SCENES,
  GAMES_SCENE_IDS,
  MELON_LANES,
  PEPPER_TABLE_TOP,
  floeSpots,
  sceneWidthFor,
  standsSeats,
  trackPoint,
  type GamesSceneId,
  type ScenePoint,
} from '../../games/art/scenes';
import { GAMES_TILES, TILE_NAMES, tileFrame, type TileName } from '../../games/art/tiles';
import { RAMPS, TEAM_RAMPS, maybeTint, type RampName } from '../../games/art/tint';
import { Sprite } from '../../sprites/Sprite';
import type { SpriteDef } from '../../sprites/sprite-data';
import { BUNDLED_CREATURE_SPRITES } from '../../sprites/creature-sprites';
import { bool, num, str } from '../props';
import type { Entry, Props } from '../types';

const PAGES = ['scene', 'with creatures', 'stands', 'floe radii', 'tiles', 'props'] as const;
type Page = (typeof PAGES)[number];

const SPECIES = Object.keys(BUNDLED_CREATURE_SPRITES);

/** The nth sample creature (the bundled species in turn). */
function creature(i: number): SpriteDef {
  const id = SPECIES[(i * 7) % SPECIES.length] ?? '';
  const sprite = BUNDLED_CREATURE_SPRITES[id];
  if (sprite === undefined) throw new Error('No creature sprites');
  return sprite;
}

function sceneLabel(id: GamesSceneId): string {
  return id.replace('-', ' ');
}

/** Sample creatures at a scene's anchors, in the states the playback will use. */
function Cast({ scene, camera }: { scene: GamesSceneId; camera: number }) {
  const a = GAMES_SCENES[scene].anchors;
  const states: ActorState[] = [
    'none',
    'sweat',
    'none',
    'flame',
    'none',
    'dizzy',
    'none',
    'zap',
    'heal',
  ];
  const row = (points: readonly ScenePoint[] | undefined, offset: number, every = 1) =>
    (points ?? [])
      .filter((_, i) => i % every === 0)
      .map((p, i) => (
        <GamesActor
          key={`${String(offset)}-${String(i)}`}
          x={p.x}
          y={p.y}
          sprite={creature(i + offset)}
          state={states[(i + offset) % states.length] ?? 'none'}
          meter={(((i + offset) * 37) % 100) / 100}
          meterTint={(i + offset) % 3 === 0 ? 'red' : 'gold'}
          flip={(i + offset) % 4 === 1}
        />
      ));
  switch (scene) {
    case 'sauna':
    case 'frost-bath':
      return (
        <>
          {row(a['upper'], 0)}
          {row(a['lower'], 9)}
          {row(a['exit'], 3)}
        </>
      );
    case 'pepper-table':
      return (
        <>
          {row(a['back'], 0)}
          {row(a['front'], 9)}
        </>
      );
    case 'melon-hill':
      return (
        <>
          {MELON_LANES.map((y, i) => (
            <GamesActor
              key={y}
              x={camera + 70 + ((i * 53) % 100)}
              y={y}
              sprite={creature(i + 2)}
              state={i === 3 ? 'flat' : i === 1 ? 'sweat' : 'none'}
            />
          ))}
        </>
      );
    case 'shark-lake':
      return (
        <>
          {[0, 0.08, 0.16, 0.3, 0.45, 0.6, 0.72, 0.86].map((t, i) => {
            const p = trackPoint(t);
            return (
              <GamesActor
                key={t}
                x={p.x}
                y={p.y + 4}
                sprite={creature(i)}
                flip={t > 0.5}
                state={i === 4 ? 'dizzy' : 'swim'}
              />
            );
          })}
          {row(a['shore'], 4, 4).map((el) => el)}
        </>
      );
    case 'ice-floe':
      return <>{row(floeSpots(80, 10), 0)}</>;
  }
}

/** Props that sit over the front layer in the creature samples (plates, the melon, a fin, a splash). */
function CastOverlay({
  scene,
  frame,
  camera,
}: {
  scene: GamesSceneId;
  frame: number;
  camera: number;
}) {
  const a = GAMES_SCENES[scene].anchors;
  switch (scene) {
    case 'pepper-table': {
      const tints: RampName[] = ['red', 'green', 'ghost', 'orange'];
      const plates = [...(a['backPlates'] ?? []), ...(a['frontPlates'] ?? [])];
      return (
        <>
          {plates.map((p, i) => (
            <Fragment key={i}>
              <GamesSprite x={p.x} y={p.y} sprite={propTinted('plate', undefined)} />
              {i % 3 !== 2 && (
                <GamesSprite
                  x={p.x + (i % 2 === 0 ? -2 : 2)}
                  y={p.y - 2}
                  sprite={propTinted('pepper', tints[i % tints.length])}
                  flip={i % 2 === 1}
                />
              )}
            </Fragment>
          ))}
          <GamesSprite
            x={a['back']?.[2]?.x ?? 60}
            y={PEPPER_TABLE_TOP.back - 14}
            sprite={propTinted('gulp', undefined)}
            anchor="centre"
          />
        </>
      );
    }
    case 'melon-hill':
      return (
        <>
          <GamesSprite x={camera + 34} y={96} sprite={propTinted('melon', undefined, frame)} />
          <GamesSprite x={camera + 26} y={98} sprite={propTinted('dust', undefined, frame)} />
        </>
      );
    case 'shark-lake':
      return (
        <>
          <GamesSprite x={128} y={50} sprite={propTinted('sharkFin', undefined, frame)} />
          <GamesSprite x={60} y={40} sprite={propTinted('sharkLeap', undefined)} />
          <GamesSprite x={150} y={84} sprite={propTinted('splash', undefined, frame)} />
        </>
      );
    case 'ice-floe':
      return (
        <>
          <GamesSprite
            x={a['splash']?.[0]?.x ?? 180}
            y={a['splash']?.[0]?.y ?? 70}
            sprite={propTinted('splash', undefined, frame)}
          />
          <GamesSprite
            x={96}
            y={36}
            sprite={propTinted('confetti', ['pink', 'teal'], frame)}
            anchor="centre"
          />
        </>
      );
    default:
      return null;
  }
}

function Caption({ children }: { children: ComponentChildren }) {
  return <p class="wb-games-caption">{children}</p>;
}

function ScenePage({ p, cast }: { p: Props; cast: boolean }) {
  const scene = str(p, 'scene') as GamesSceneId;
  const fixed = num(p, 'frame');
  const frame = fixed < 0 ? undefined : fixed;
  const camera = num(p, 'cameraX');
  const world = sceneWidthFor(camera + 192);
  return (
    <div class="wb-games">
      <GamesScene variant="stands" scene={scene} frame={frame} animate={bool(p, 'animate')} />
      <GamesScene
        scene={scene}
        heat={num(p, 'heat')}
        floeRadius={num(p, 'floeRadius')}
        cameraX={camera}
        worldWidth={world}
        frame={frame}
        animate={bool(p, 'animate')}
        label={sceneLabel(scene)}
        overlay={
          cast ? <CastOverlay scene={scene} frame={frame ?? 0} camera={camera} /> : undefined
        }
      >
        {cast && <Cast scene={scene} camera={camera} />}
      </GamesScene>
      <Caption>
        {sceneLabel(scene)}: 192 x 112 scene pixels; the stands strip above it is 192 x 48.
        {scene === 'melon-hill'
          ? ` World ${String(world)} px wide, camera at ${String(camera)}.`
          : ''}
      </Caption>
    </div>
  );
}

function StandsPage({ p }: { p: Props }) {
  const count = num(p, 'crowd');
  const fixed = num(p, 'frame');
  return (
    <div class="wb-games">
      {GAMES_SCENE_IDS.map((id) => (
        <div key={id}>
          <Caption>{sceneLabel(id)}</Caption>
          <GamesScene
            variant="stands"
            scene={id}
            frame={fixed < 0 ? undefined : fixed}
            animate={bool(p, 'animate')}
          >
            {standsSeats(count).map((s, i) => (
              <GamesActor key={i} x={s.x} y={s.y} sprite={creature(i)} flip={i % 2 === 1} />
            ))}
          </GamesScene>
        </div>
      ))}
    </div>
  );
}

function FloePage({ p }: { p: Props }) {
  const fixed = num(p, 'frame');
  return (
    <div class="wb-games">
      {[80, 52, 26].map((rx, n) => (
        <div key={rx}>
          <Caption>
            Floe radius {String(rx)} x {String(Math.round(floeRy(rx)))}
          </Caption>
          <GamesScene
            scene="ice-floe"
            floeRadius={rx}
            frame={fixed < 0 ? undefined : fixed}
            animate={bool(p, 'animate')}
          >
            {floeSpots(rx, n === 2 ? 3 : n === 1 ? 6 : 10).map((s, i) => (
              <GamesActor
                key={i}
                x={s.x}
                y={s.y}
                sprite={creature(i + n)}
                state={i === 1 ? 'dizzy' : 'none'}
              />
            ))}
          </GamesScene>
        </div>
      ))}
    </div>
  );
}

/** Each tile, every frame, at 3x; then a few tiles re-themed by tinting. */
function TilesPage() {
  const tinted: { tile: TileName; tints: readonly (readonly [RampName, RampName?])[] }[] = [
    { tile: 'woodWall', tints: [['pine'], ['frost'], ['red'], ['cream'], ['night']] },
    {
      tile: 'bleacher',
      tints: [
        ['wood', 'red'],
        ['frost', 'tide'],
        ['pine', 'green'],
        ['wood', 'purple'],
      ],
    },
    {
      tile: 'bunting',
      tints: [
        ['red', 'yellow'],
        ['blue', 'pink'],
        ['green', 'orange'],
        ['tide', 'ghost'],
      ],
    },
    { tile: 'cloth', tints: [['red'], ['blue'], ['green'], ['purple']] },
    { tile: 'grass', tints: [['grass'], ['hill'], ['snow'], ['mire']] },
    { tile: 'deepWater', tints: [['deep'], ['arctic'], ['purple']] },
    { tile: 'benchSeat', tints: [['pine'], ['wood'], ['frost']] },
  ];
  return (
    <div class="wb-games">
      <div class="wb-games-grid">
        {TILE_NAMES.map((name) => (
          <figure key={name} class="wb-games-cell">
            <div class="wb-games-frames">
              {GAMES_TILES[name].map((_, f) => (
                <Sprite key={f} sprite={tileFrame(name, f)} scale={3} />
              ))}
            </div>
            <figcaption>{name}</figcaption>
          </figure>
        ))}
      </div>
      <Caption>Tinted: one drawing, many materials.</Caption>
      {tinted.map(({ tile, tints }) => (
        <div key={tile} class="wb-games-tints">
          {tints.map(([a, b]) => (
            <figure key={`${a}${b ?? ''}`} class="wb-games-cell">
              <Sprite sprite={maybeTint(tileFrame(tile), a, b)} scale={3} />
              <figcaption>
                {tile} {a}
                {b === undefined ? '' : ` / ${b}`}
              </figcaption>
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Every prop in every tint and every frame. */
function PropsPage({ p }: { p: Props }) {
  const only = str(p, 'prop');
  const names = only === 'all' ? PROP_NAMES : PROP_NAMES.filter((n) => n === only);
  const scale = only === 'all' ? 2 : 6;
  return (
    <div class="wb-games">
      <div class="wb-games-grid wb-games-props">
        {names.map((name) => {
          const tints = PROP_TINTS[name] ?? [undefined];
          return tints.map((tint, t) => (
            <figure key={`${name}-${String(t)}`} class="wb-games-cell">
              <div class="wb-games-frames">
                {GAMES_PROPS[name].map((_, f) => (
                  <Sprite key={f} sprite={propTinted(name, tint, f)} scale={scale} />
                ))}
              </div>
              <figcaption>
                {name}
                {tint === undefined ? '' : ` ${typeof tint === 'string' ? tint : tint.join('/')}`}
              </figcaption>
            </figure>
          ));
        })}
      </div>
      <Caption>Team colours: {TEAM_RAMPS.join(', ')}.</Caption>
      <div class="wb-games-tints">
        {TEAM_RAMPS.map((r) => (
          <span key={r} class="wb-games-swatches">
            {RAMPS[r].map((c) => (
              <Sprite key={c} sprite={{ rows: ['xx', 'xx'], palette: { x: c } }} scale={6} />
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

const PROP_OPTIONS: readonly string[] = ['all', ...PROP_NAMES];

const gamesScene: Entry = {
  name: 'GamesScene',
  file: 'apps/activity/src/games/art/GamesScene.tsx',
  group: 'Creatures & game pieces',
  covers: ['GamesActor', 'GamesSprite'],
  description:
    'The Valley Games art kit: the six event scenes (sauna, cold plunge, pepper table, melon hill, shark lake, ice floe) drawn from 16x16 tiles and tintable props on a back and a front canvas, each with its stands strip, plus GamesActor (a creature placed by its feet with a state over it and a tiny meter) and GamesSprite (any prop placed in scene pixels). Pages: a scene alone, a scene with sample creatures at its anchors, every stands strip with a crowd, the floe at three radii, the tileset with tints, and every prop in every tint and frame. Check it at 390 px, where scenes draw at 2x.',
  controls: {
    page: { kind: 'select', options: PAGES },
    scene: { kind: 'select', options: GAMES_SCENE_IDS },
    heat: { kind: 'number', min: 0, max: 100 },
    floeRadius: { kind: 'number', min: FLOE_MIN_RADIUS, max: FLOE_MAX_RADIUS },
    cameraX: { kind: 'number', min: 0, max: 960, step: 8 },
    crowd: { kind: 'number', min: 0, max: 16 },
    prop: { kind: 'select', options: PROP_OPTIONS },
    frame: { kind: 'number', min: -1, max: 11 },
    animate: { kind: 'toggle' },
  },
  defaults: {
    page: 'with creatures',
    scene: 'sauna',
    heat: 60,
    floeRadius: 80,
    cameraX: 0,
    crowd: 15,
    prop: 'all',
    frame: -1,
    animate: true,
  },
  presets: [
    { name: 'Sauna full of creatures, heat 60', props: {} },
    { name: 'Sauna, empty, heat 100', props: { page: 'scene', heat: 100 } },
    { name: 'Cold plunge with creatures', props: { scene: 'frost-bath', heat: 30 } },
    { name: 'Pepper table: eaters, plates and peppers', props: { scene: 'pepper-table' } },
    { name: 'Melon hill: runners and the melon', props: { scene: 'melon-hill' } },
    { name: 'Melon hill scrolled to 400', props: { scene: 'melon-hill', cameraX: 400 } },
    { name: 'Shark lake: swimmers on the track', props: { scene: 'shark-lake' } },
    { name: 'Ice floe with creatures', props: { scene: 'ice-floe' } },
    { name: 'The floe at three radii', props: { page: 'floe radii' } },
    { name: 'Every stands strip, 15 creatures', props: { page: 'stands' } },
    { name: 'Tileset', props: { page: 'tiles' } },
    { name: 'Every prop and tint', props: { page: 'props' } },
    { name: 'Still (frame 0, no animation)', props: { frame: 0, animate: false } },
  ],
  render: (p) => {
    const page = str(p, 'page') as Page;
    switch (page) {
      case 'scene':
        return <ScenePage p={p} cast={false} />;
      case 'with creatures':
        return <ScenePage p={p} cast />;
      case 'stands':
        return <StandsPage p={p} />;
      case 'floe radii':
        return <FloePage p={p} />;
      case 'tiles':
        return <TilesPage />;
      case 'props':
        return <PropsPage p={p} />;
    }
  },
};

export const gamesArtEntries: readonly Entry[] = [gamesScene];
