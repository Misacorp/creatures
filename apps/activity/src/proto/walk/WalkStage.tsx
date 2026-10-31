/**
 * The return walk, on the valley (`systems/return.md`): one creature walks the valley's places with the
 * sack on its back, the camera easing from place to place, each story line a speech bubble over it, the
 * surprise popping out beside it, then the count badges tumbling into the purse and the valley as it stays.
 * About ten seconds; one tap anywhere (or Enter on the focused skip button) goes straight to the valley.
 *
 * Reduced motion: the camera cuts instead of easing, the walker does not travel (it stands at each place)
 * and bubbles only fade in. A screenshot (`&bare=1`) holds still at `&t=<ms>` into the walk.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { usePrefersReducedMotion } from '../../hooks';
import { PACK_ART } from '../../sprites/pack-art';
import { CountBadgeList } from '../../ui/CountBadge';
import type { ProtoWorld } from '../world';
import { At, CreatureSprite, Glyph, Pic, SpeechBubble, isStill, useTick } from '../valley/parts';
import { ValleyMap } from '../valley/ValleyMap';
import { decisionBubbles, withoutCast } from './walk-world';
import { START_PLACE, frameAt, frozenAt, placeOfFrame, walkerAt, type Frame } from './walk-time';
import type { CastMember, Who, WalkPlan } from './walk-plan';

/** The walker stands this far above a door (valley pixels), clear of the place's name plate. */
const STAND_UP = 9;

/** The walk's clock ticks this often (ms). */
const TICK_MS = 100;

/** What a line's `who` looks like on screen: a species (a new friend) or a member of the cast. */
function whoSprite(
  who: Who,
  cast: readonly CastMember[],
): { species: string; shiny: boolean } | null {
  if (who === null) return null;
  if (who.kind === 'species') return { species: who.species, shiny: false };
  const member = cast[who.slot % Math.max(1, cast.length)];
  return member === undefined ? null : { species: member.species, shiny: member.shiny };
}

/** What assistive technology hears now: the welcome, the line, or what came home. */
function spokenNow(plan: WalkPlan, frame: Frame): string {
  if (frame.welcome && plan.welcome !== null) return plan.welcome;
  if (frame.line !== null) return frame.line.text;
  if (frame.tumble >= 0) {
    return `Came home: ${plan.piles.map((p) => `${String(p.amount)} ${p.label}`).join(', ')}`;
  }
  return '';
}

export function WalkStage({
  world,
  cast,
  plan,
  onDone,
}: {
  world: ProtoWorld;
  cast: readonly CastMember[];
  plan: WalkPlan;
  onDone: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const frozen = typeof window === 'undefined' ? null : frozenAt(window.location.hash);
  const held = frozen !== null || isStill();
  const tick = useTick(TICK_MS, !held);
  const ms = frozen ?? tick * TICK_MS;
  const frame = frameAt(plan, ms);
  const [firstCamera] = useState(() => frameAt(plan, ms).camera);

  const finished = useRef(false);
  useEffect(() => {
    if (!frame.done || finished.current) return;
    finished.current = true;
    onDone();
  }, [frame.done, onDone]);

  const carrier = cast[0];
  const place = placeOfFrame(plan, frame);
  const from = frame.stop < 0 ? START_PLACE : frame.from;
  const walker = walkerAt(from, place, reduced ? 1 : frame.progress);
  const line = frame.line;
  const friend = line === null ? null : whoSprite(line.who, cast);
  const bubbles = frame.decision ? decisionBubbles(plan) : [];
  const carrying = frame.tumble < 0 && !frame.welcome;

  return (
    <>
      <ValleyMap
        world={withoutCast(world)}
        at={firstCamera}
        focus={null}
        departing={null}
        onPlace={() => undefined}
        bubbles={bubbles}
        camera={frame.camera}
        cut={reduced || held}
        overlay={(g) => (
          <>
            <At
              x={g.X(walker.x)}
              y={g.Y(walker.y - STAND_UP) - 15 * g.s}
              class="pv-person pw-walker"
            >
              {carrier !== undefined && (
                <CreatureSprite creature={carrier} scale={g.s} flip={walker.flip} />
              )}
              {carrying && (
                <span class="pv-sack">
                  <Pic sprite={PACK_ART} scale={g.s} />
                </span>
              )}
              {line !== null && (
                <SpeechBubble class="pw-say">
                  <span key={line.text} class="pw-say-text">
                    {line.text}
                  </span>
                </SpeechBubble>
              )}
            </At>
            {friend !== null && line !== null && (
              <At
                x={g.X(walker.x + 20)}
                y={g.Y(walker.y - STAND_UP) - 15 * g.s}
                class={`pv-person pw-friend${line.surprise ? ' pw-pop' : ''}`}
              >
                <CreatureSprite creature={friend} scale={g.s} />
                {line.surprise && (
                  <span class="pw-sparkle">
                    <Glyph id="sparkle" scale={g.s} />
                  </span>
                )}
              </At>
            )}
          </>
        )}
      />
      {frame.welcome && plan.welcome !== null && (
        <section class="pv-caption pw-welcome" aria-hidden="true">
          <p class="pv-caption-title pix">{plan.welcome}</p>
        </section>
      )}
      {frame.tumble >= 0 && (
        <div class={`pw-pile pw-pile-${String(frame.tumble)}`} aria-hidden="true">
          <CountBadgeList
            class="pw-pile-list"
            label="Came home"
            items={plan.piles.map((p) => ({
              key: p.key,
              icon: p.icon,
              amount: p.amount,
              name: p.label,
            }))}
          />
        </div>
      )}
      <p class="visually-hidden" role="status">
        {spokenNow(plan, frame)}
      </p>
      <button type="button" class="pw-skip" aria-label="Skip to the valley" onClick={onDone} />
    </>
  );
}
