/**
 * The bonfire, full screen (prototype): the communal fire in its ring. Creatures sit where the art has places
 * for them (three on the logs, two on the grass; `glowLayout` spots): the player's resting creatures, a pair of
 * them sharing a small moment in a bubble between them, one warming up (a small flame over it: it is catching
 * up, there is no meter), and friends who are online (named under them, never ranked). The rest of the
 * resting creatures are behind "+N" (a tap lists them). While the hearth is not built its stones lie in a row
 * under the fire (hollow outlines for those to come) and go up as gifts come in; the one button opens the
 * hearth sheet (the stones with yours marked, what it still needs, one give button). Stories that wait here
 * show as the place's slim strip above it.
 */
import { useMemo, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { CreatureList } from '../../ui/CreatureList';
import { ActionButton } from '../../ui/ActionButton';
import { CountBadge } from '../../ui/CountBadge';
import { Drawer } from '../../ui/Drawer';
import { baseOption } from '../../roster-picker';
import { usePrefersReducedMotion } from '../../hooks';
import { freeCreatures } from '../world';
import {
  GIFT_STONES,
  SAMPLE_ACORNS,
  SAMPLE_FRIENDS,
  SAMPLE_HEARTH,
  SAMPLE_MOMENTS,
  SERVER_MIDDLE_LEVEL,
  STONE_TO_COME,
  STONE_UP,
  STONE_YOURS,
  WARMING_FLAME,
  sampleName,
} from './bonfire-sample';
import {
  catchUpTarget,
  crowd,
  facesLeft,
  giveToHearth,
  hearthBuilt,
  hearthNeeds,
  isWarmingUp,
  momentPair,
  seatedFew,
  type Hearth,
} from './bonfire-logic';
import './bonfire.css';
import {
  glowLayout,
  glowScale,
  glowNameOf,
  glowSceneDraw,
  type PlaceSceneProps,
} from './glow-scene-art';
import { At, CreatureSprite, Glyph, Pic, Plate, SpeechBubble, isStill } from './parts';
import { PinnedAct } from './PinnedAct';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK, GRAND_LEVEL } from './valley-places';

const DAY = 86_400_000;
/** A creature's feet stand this far below its top (scene pixels): a seated one sinks a little into its log. */
const SPRITE = 16;
const SINK = 2;

/**
 * The hearth's stones as one row: laid ones solid, those to come hollow ink outlines. With `mark`, the stones
 * you laid (the latest ones) are gold, your share shown the way the others are.
 */
export function StoneRow({
  hearth,
  scale,
  mark = false,
}: {
  hearth: Hearth;
  scale: number;
  mark?: boolean;
}) {
  return (
    <span class="bf-stones" aria-hidden="true">
      {Array.from({ length: hearth.total }, (_, i) => {
        const laid = i < hearth.placed;
        const yours = mark && laid && i >= hearth.placed - hearth.yours;
        return (
          <Pic
            key={i}
            sprite={yours ? STONE_YOURS : laid ? STONE_UP : STONE_TO_COME}
            scale={scale}
          />
        );
      })}
    </span>
  );
}

export function BonfireScene({ world, onLeave, waiting, look = DEFAULT_LOOK }: PlaceSceneProps) {
  const reduced = usePrefersReducedMotion();
  const still = isStill() || reduced;
  const [hearth, setHearth] = useState<Hearth>(SAMPLE_HEARTH);
  const [acorns, setAcorns] = useState(SAMPLE_ACORNS);
  const [hearthOpen, setHearthOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const name = glowNameOf('bonfire', { bonfireLevel: look.bonfireLevel });
  const draw = useMemo(() => glowSceneDraw({ name, time: look.time }), [name, look.time]);

  const day = Math.floor(world.now / DAY);
  const resting = freeCreatures(world);
  const target = catchUpTarget(
    world.creatures.map((c) => c.level),
    SERVER_MIDDLE_LEVEL,
  );
  const friends = [...SAMPLE_FRIENDS].sort((a, b) => a.owner.localeCompare(b.owner));
  const places = crowd(Math.min(resting.length, 3), friends.length);
  const { seated } = seatedFew(resting, day, places.own.length);
  const more = Math.max(0, resting.length - seated.length);
  const pair = momentPair(seated.length);
  const moment = SAMPLE_MOMENTS[day % SAMPLE_MOMENTS.length] ?? SAMPLE_MOMENTS[0];
  const nameOf = (id: string): string => {
    const at = world.creatures.findIndex((c) => c.id === id);
    const c = world.creatures[at];
    return c === undefined ? '' : sampleName(c, at);
  };
  // The hearth is the first guided project until the bonfire reaches the grand hearth's level.
  const projectOpen = look.bonfireLevel < GRAND_LEVEL && !hearthBuilt(hearth);
  const needs = hearthNeeds(hearth);
  const cost = GIFT_STONES * hearth.stoneCost;
  const gift = (): void => {
    if (acorns < cost) return;
    setAcorns(acorns - cost);
    setHearth(giveToHearth(hearth, GIFT_STONES));
  };

  return (
    <>
      <SceneFrame
        id="bonfire"
        label="Bonfire, resting creatures"
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        scaleFor={(w, h) => glowScale(w, h, name)}
        act={
          projectOpen ? (
            <PinnedAct
              label="Add to the hearth"
              onClick={() => {
                setHearthOpen(true);
              }}
            />
          ) : (
            <PinnedAct
              calm={
                look.bonfireLevel >= GRAND_LEVEL ? 'The grand hearth is lit' : 'The hearth is built'
              }
            />
          )
        }
      >
        {(g) => {
          const layout = glowLayout(g, name);
          const px = (n: number): number => g.X(n);
          const py = (n: number): number => g.Y(n);
          const spot = (slot: string): { x: number; y: number } =>
            layout.spots[slot] ?? { x: layout.art.x, y: layout.art.y };
          // A creature's top-left from its feet spot.
          const topLeft = (slot: string): { x: number; y: number } => {
            const p = spot(slot);
            return { x: p.x - SPRITE / 2, y: p.y - SPRITE + SINK };
          };
          const first = pair === null ? null : topLeft(places.own[pair[0]] ?? 'seatLeft');
          const second = pair === null ? null : topLeft(places.own[pair[1]] ?? 'seatFront');
          const more44 = spot('groundRight');
          return (
            <>
              <ul class="visually-hidden" aria-label="Resting by the fire">
                {seated.map((c) => (
                  <li key={c.id}>
                    {nameOf(c.id)}
                    {isWarmingUp(c.level, target) ? ', warming up' : ''}
                  </li>
                ))}
                {friends.map((f) => (
                  <li key={f.owner}>{`${f.owner}'s creature, online`}</li>
                ))}
                {pair !== null && moment !== undefined && (
                  <li>
                    {moment.says(
                      nameOf(seated[pair[0]]?.id ?? ''),
                      nameOf(seated[pair[1]]?.id ?? ''),
                    )}
                  </li>
                )}
              </ul>
              {seated.map((c, i) => {
                const slot = places.own[i];
                if (slot === undefined) return null;
                const at = topLeft(slot);
                const warm = isWarmingUp(c.level, target);
                return (
                  <At key={c.id} x={px(at.x)} y={py(at.y)}>
                    <CreatureSprite creature={c} scale={g.s} flip={facesLeft(slot)} />
                    {warm && (
                      <span class={still ? 'bf-flame' : 'bf-flame flicker'}>
                        <Pic sprite={WARMING_FLAME} scale={g.s} />
                      </span>
                    )}
                  </At>
                );
              })}
              {friends.map((f, i) => {
                const slot = places.friends[i];
                if (slot === undefined) return null;
                const at = topLeft(slot);
                return (
                  <At key={f.owner} x={px(at.x)} y={py(at.y)} class="bf-friend">
                    <CreatureSprite
                      creature={{ species: f.species, shiny: false }}
                      scale={g.s}
                      flip={facesLeft(slot)}
                    />
                    <Plate>{f.owner}</Plate>
                  </At>
                );
              })}
              {first !== null && second !== null && moment !== undefined && (
                <At x={px(first.x)} y={py(Math.min(first.y, second.y) - 1)}>
                  {/* As wide as the two creatures, so the bubble stands between them. */}
                  <span
                    class="bf-pair"
                    ref={cssVars({
                      '--pw': `${String(px(second.x - first.x + SPRITE))}px`,
                    })}
                  />
                  <SpeechBubble>
                    <Glyph id={moment.glyph} scale={3} />
                  </SpeechBubble>
                </At>
              )}
              {more > 0 && (
                <At
                  x={px(Math.min(more44.x + 10, g.W - Math.ceil(52 / g.s)))}
                  y={py(more44.y - SPRITE)}
                  class="bf-more"
                  hidden={false}
                >
                  <button
                    type="button"
                    class="bf-more-btn pix"
                    aria-label={`${String(more)} more resting. Show all`}
                    onClick={() => {
                      setAllOpen(true);
                    }}
                  >
                    +{more}
                  </button>
                </At>
              )}
              {projectOpen && (
                <At x={px(g.cx)} y={py(layout.below + 10)} class="pv-centred bf-hearth">
                  <StoneRow
                    hearth={hearth}
                    // The row is a meter: the scene's scale, or smaller when its stones would not fit the screen.
                    scale={Math.max(
                      2,
                      Math.min(g.s, Math.floor(((g.W * g.s - 16) / hearth.total - 3) / 7)),
                    )}
                  />
                </At>
              )}
            </>
          );
        }}
      </SceneFrame>
      <Drawer
        open={hearthOpen}
        onClose={() => {
          setHearthOpen(false);
        }}
        title="The hearth"
      >
        <div class="dr-stack bf-hearth-panel">
          <StoneRow hearth={hearth} scale={3} mark />
          <p class="bf-needs">
            {hearthBuilt(hearth) ? (
              <>
                <Glyph id="check" scale={2} />
                <span>Built</span>
              </>
            ) : (
              <CountBadge
                icon={{ kind: 'glyph', id: 'gift' }}
                amount={needs.acorns}
                label="Acorns still needed"
                name="Acorns"
              />
            )}
            {hearth.yours > 0 && (
              <span class="bf-yours" role="img" aria-label={`Your stones: ${String(hearth.yours)}`}>
                <Pic sprite={STONE_YOURS} scale={3} />
                <span class="pix">{hearth.yours}</span>
              </span>
            )}
          </p>
          {!hearthBuilt(hearth) && (
            <ActionButton
              label="Give"
              detail={`${String(cost)} Acorns`}
              wide
              disabled={acorns < cost}
              onClick={gift}
            />
          )}
        </div>
      </Drawer>
      <Drawer
        open={allOpen}
        onClose={() => {
          setAllOpen(false);
        }}
        title="Resting by the fire"
        meta={String(resting.length)}
      >
        <CreatureList
          options={resting.map((c) => ({
            ...baseOption(c),
            name: nameOf(c.id),
          }))}
          selection={{ mode: 'show', label: 'Resting creatures' }}
          class="flat"
        />
      </Drawer>
    </>
  );
}
