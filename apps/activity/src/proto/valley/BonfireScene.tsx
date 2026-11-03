/**
 * The bonfire, full screen (prototype): the communal fire in its ring under its poster, grown into the grand
 * hearth from place level 2. Round it sit the player's resting creatures (a rotating few, "+N" for the rest on a
 * tap), a pair of them sharing a small moment in a bubble, one creature warming up (a small flame over it: it is
 * catching up, there is no meter), and the creatures of friends who are online (their names under them, in
 * alphabetical order, never ranked). While the hearth is not built, its stones lie in a row under the fire and
 * go up as gifts come in; the one button opens the invitation (what it still needs, your own share, privately).
 * Stories that wait here show as the place's slim strip above it.
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
  WARMING_FLAME,
  sampleName,
} from './bonfire-sample';
import {
  arcSeats,
  catchUpTarget,
  giveToHearth,
  hearthBuilt,
  hearthNeeds,
  isWarmingUp,
  momentPair,
  seatedFew,
  yourSharePercent,
  type Hearth,
} from './bonfire-logic';
import './bonfire.css';
import { glowNameOf, glowSceneDraw, glowSceneSpots, type PlaceSceneProps } from './glow-scene-art';
import { At, CreatureSprite, Glyph, Pic, Plate, SpeechBubble, isStill } from './parts';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK, GRAND_LEVEL } from './valley-places';

const DAY = 86_400_000;
/** Seats round the fire: the fewest that look like a gathering on a phone. */
const SEATS = 5;

/** The hearth's stones as one row (laid ones solid, the rest hollow), as a picture in CSS px. */
export function StoneRow({ hearth, scale }: { hearth: Hearth; scale: number }) {
  return (
    <span class="bf-stones" aria-hidden="true">
      {Array.from({ length: hearth.total }, (_, i) => (
        <Pic key={i} sprite={i < hearth.placed ? STONE_UP : STONE_TO_COME} scale={scale} />
      ))}
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
  const { seated, more } = seatedFew(resting, day, SEATS);
  const seats = arcSeats(seated.length);
  const pair = momentPair(seated.length, day);
  const moment = SAMPLE_MOMENTS[day % SAMPLE_MOMENTS.length] ?? SAMPLE_MOMENTS[0];
  const nameOf = (id: string): string => {
    const at = world.creatures.findIndex((c) => c.id === id);
    const c = world.creatures[at];
    return c === undefined ? '' : sampleName(c, at);
  };
  const friends = [...SAMPLE_FRIENDS].sort((a, b) => a.owner.localeCompare(b.owner));
  // The hearth is the first guided project until the bonfire reaches the grand hearth's level.
  const projectOpen = look.bonfireLevel < GRAND_LEVEL && !hearthBuilt(hearth);
  const needs = hearthNeeds(hearth);
  const gift = (): void => {
    const cost = GIFT_STONES * hearth.stoneCost;
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
        act={
          look.bonfireLevel < GRAND_LEVEL ? (
            <ActionButton
              label={hearthBuilt(hearth) ? 'The hearth is built' : 'Add to the hearth'}
              wide
              large
              onClick={() => {
                setHearthOpen(true);
              }}
            />
          ) : undefined
        }
      >
        {(g) => {
          const spot = glowSceneSpots(g);
          const px = (n: number): number => g.X(n);
          const py = (n: number): number => g.Y(n);
          const rowTop = spot.place.y;
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
                const seat = seats[i];
                if (seat === undefined) return null;
                const warm = isWarmingUp(c.level, target);
                return (
                  <At key={c.id} x={px(g.cx + seat.dx)} y={py(rowTop + seat.dy)}>
                    <CreatureSprite creature={c} scale={g.s} flip={seat.flip} />
                    {warm && (
                      <span class={still ? 'bf-flame' : 'bf-flame flicker'}>
                        <Pic sprite={WARMING_FLAME} scale={g.s} />
                      </span>
                    )}
                  </At>
                );
              })}
              {pair !== null && moment !== undefined && (
                <At
                  x={px(g.cx + (seats[pair[0]]?.dx ?? 0))}
                  y={py(rowTop + Math.min(seats[pair[0]]?.dy ?? 30, seats[pair[1]]?.dy ?? 30) - 2)}
                >
                  {/* As wide as the two creatures, so the bubble stands between them. */}
                  <span
                    class="bf-pair"
                    ref={cssVars({
                      '--pw': `${String(px((seats[pair[1]]?.dx ?? 0) - (seats[pair[0]]?.dx ?? 0) + 16))}px`,
                    })}
                  />
                  <SpeechBubble>
                    <Glyph id={moment.glyph} scale={3} />
                  </SpeechBubble>
                </At>
              )}
              {more > 0 && (
                <At x={px(g.cx + 44)} y={py(rowTop + 46)} class="bf-more" hidden={false}>
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
              {friends.map((f, i) => {
                const x = g.cx + (i - (friends.length - 1) / 2) * 30 - 8;
                return (
                  <At key={f.owner} x={px(x)} y={py(rowTop + 61)} class="bf-friend">
                    <CreatureSprite
                      creature={{ species: f.species, shiny: false }}
                      scale={g.s}
                      flip={i === friends.length - 1}
                    />
                    <Plate>{f.owner}</Plate>
                  </At>
                );
              })}
              {projectOpen && (
                <At x={px(g.cx)} y={py(rowTop + 87)} class="pv-centred bf-hearth">
                  <StoneRow hearth={hearth} scale={g.s} />
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
        meta={`${String(hearth.placed)} / ${String(hearth.total)} stones`}
      >
        <div class="dr-stack bf-hearth-panel">
          <StoneRow hearth={hearth} scale={3} />
          {hearthBuilt(hearth) ? (
            <p>The hearth is built. Every creature by the fire grows a little faster.</p>
          ) : (
            <>
              <p>The hearth is the valley's first building. Anyone can add Acorns.</p>
              <p class="bf-needs">
                <span>Still needs</span>
                <CountBadge
                  icon={{ kind: 'glyph', id: 'gift' }}
                  amount={needs.acorns}
                  label="Acorns"
                  name="Acorns"
                />
              </p>
            </>
          )}
          {hearth.yours > 0 && (
            <p class="muted">You laid {yourSharePercent(hearth)}% of it. Only you see this.</p>
          )}
          {!hearthBuilt(hearth) && (
            <ActionButton
              label="Give Acorns"
              detail={`${String(GIFT_STONES * hearth.stoneCost)} Acorns`}
              wide
              disabled={acorns < GIFT_STONES * hearth.stoneCost}
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
