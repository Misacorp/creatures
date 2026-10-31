/**
 * The return walk, on the valley (`systems/return.md`): one creature walks the valley's places with the
 * finds of each place on its back (count badges over it, growing as it takes them up), the camera travelling
 * from place to place (on a wide window zoomed in, framing a region), each story line a pixel speech bubble
 * over it, the surprise popping out beside it with a hard outline, then the badges dropping into the HUD's
 * purse and the valley as it stays. About ten seconds; one tap anywhere (or Enter on the focused skip
 * button) goes straight to the valley.
 *
 * Reduced motion: the camera cuts, the walker stands at each place instead of travelling, a line stays until
 * the next one with no fade, and the pile appears once in place; the counts land in the purse at once.
 * A screenshot (`&bare=1`) holds still at `&t=<ms>` into the walk.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { usePrefersReducedMotion } from '../../hooks';
import { PACK_ART } from '../../sprites/pack-art';
import { CountBadgeList } from '../../ui/CountBadge';
import type { ProtoWorld } from '../world';
import { At, CreatureSprite, Glyph, Pic, SpeechBubble, isStill, useTick } from '../valley/parts';
import { ValleyMap } from '../valley/ValleyMap';
import { decisionBubbles, withoutCast } from './walk-world';
import {
  START_PLACE,
  TUMBLE_STEPS,
  frameAt,
  frozenAt,
  placeOfFrame,
  walkerAt,
  type Frame,
} from './walk-time';
import type { CastMember, Pile, Who, WalkPlan } from './walk-plan';

/** The walker stands this far above a door (valley pixels), clear of the place's name plate. */
const STAND_UP = 9;

/** The walk's clock ticks this often (ms). */
const TICK_MS = 100;

/** On a window this wide the walk zooms in (pixel scale 4, not 2) and the camera frames a region. */
const WIDE_PX = 900;
const ZOOM = 4;

/** What a line's `who` looks like on screen: a species (a new friend) or a member of the cast. */
function whoSprite(
  who: Who,
  cast: readonly CastMember[],
): { species: string; shiny: boolean; slot: number | null } | null {
  if (who === null) return null;
  if (who.kind === 'species') return { species: who.species, shiny: false, slot: null };
  const member = cast[who.slot % Math.max(1, cast.length)];
  return member === undefined
    ? null
    : { species: member.species, shiny: member.shiny, slot: who.slot };
}

/** What assistive technology hears now: the welcome, the line, or what came home. */
function spokenNow(plan: WalkPlan, frame: Frame, line: Frame['line']): string {
  if (frame.welcome && plan.welcome !== null) return plan.welcome;
  if (line !== null) return line.text;
  if (frame.tumble >= 0) {
    return `Came home: ${plan.piles.map((p) => `${String(p.amount)} ${p.label}`).join(', ')}`;
  }
  return '';
}

/** The piles as count badges (icon and number: the purse says their names). */
function Badges({ piles, class: extra }: { piles: readonly Pile[]; class: string }) {
  return (
    <CountBadgeList
      class={extra}
      label="Carried home"
      items={piles.map((p) => ({ key: p.key, icon: p.icon, amount: p.amount, label: p.label }))}
    />
  );
}

/** A spot on the page, relative to the layer the pile tumbles in. */
interface Spot {
  x: number;
  y: number;
}

export function WalkStage({
  world,
  cast,
  plan,
  onDone,
  onLand,
}: {
  world: ProtoWorld;
  cast: readonly CastMember[];
  plan: WalkPlan;
  onDone: () => void;
  /** The counts have dropped into the purse. */
  onLand: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const frozen = typeof window === 'undefined' ? null : frozenAt(window.location.hash);
  const held = frozen !== null || isStill();
  const tick = useTick(TICK_MS, !held);
  const ms = frozen ?? tick * TICK_MS;
  const frame = frameAt(plan, ms);
  const [firstCamera] = useState(() => frameAt(plan, ms).camera);
  const [zoom] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= WIDE_PX ? ZOOM : undefined,
  );

  const finished = useRef(false);
  useEffect(() => {
    if (!frame.done || finished.current) return;
    finished.current = true;
    onDone();
  }, [frame.done, onDone]);

  // The counts drop into the purse when the badges arrive (at once under reduced motion).
  const landed = useRef(false);
  const arrived = reduced ? frame.tumble >= 0 : frame.tumble >= TUMBLE_STEPS - 1;
  useEffect(() => {
    if (landed.current || !(arrived || frame.done)) return;
    landed.current = true;
    onLand();
  }, [arrived, frame.done, onLand]);

  const carrier = cast[plan.carrier % Math.max(1, cast.length)];
  const place = placeOfFrame(plan, frame);
  const from = frame.stop < 0 ? START_PLACE : frame.from;
  const walker = walkerAt(from, place, reduced ? 1 : frame.progress);
  // Under reduced motion a line stays until the next one.
  const line = reduced ? frame.held : frame.line;
  const friend = line === null ? null : whoSprite(line.who, cast);
  const bubbles = frame.decision ? decisionBubbles(plan) : [];
  const tumbling = !reduced && frame.tumble >= 0;

  // What it carries: the finds of the places it has taken up so far; under reduced motion the pile appears
  // once, in place, when the places are done.
  const carried =
    frame.stop < 0
      ? []
      : plan.piles.filter((p) =>
          reduced
            ? frame.tumble >= 0 || frame.done
            : p.stop < frame.stop || (p.stop === frame.stop && frame.progress >= 1),
        );
  // The sack is on its back from the start until the counts drop; the badges ride while it carries any.
  const sack = !frame.done && !(tumbling && frame.tumble > 0);

  // The tumble: from where the badges rode, in steps, to the purse.
  const layerRef = useRef<HTMLDivElement>(null);
  const carryRef = useRef<HTMLSpanElement>(null);
  const start = useRef<Spot | null>(null);
  const [target, setTarget] = useState<Spot | null>(null);
  useLayoutEffect(() => {
    const layer = layerRef.current?.getBoundingClientRect();
    if (layer === undefined) return;
    const row = carryRef.current?.getBoundingClientRect();
    if (row !== undefined && row.width > 0) {
      start.current = { x: row.left - layer.left, y: row.top - layer.top };
    }
    const purse = document.querySelector('.currency-pile')?.getBoundingClientRect();
    if (purse !== undefined && row !== undefined && row.width > 0) {
      setTarget((was) => {
        const next = {
          x: purse.left - layer.left + purse.width / 2 - row.width / 2,
          y: purse.top - layer.top,
        };
        return was !== null && was.x === next.x && was.y === next.y ? was : next;
      });
    }
  });
  const step = Math.min(1, Math.max(0, frame.tumble / (TUMBLE_STEPS - 1)));
  const from0 = start.current;
  const spot =
    from0 === null || target === null
      ? null
      : {
          x: Math.round(from0.x + (target.x - from0.x) * step),
          y: Math.round(from0.y + (target.y - from0.y) * step),
        };

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
        zoom={zoom}
        edges={false}
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
              {sack && (
                <span class="pv-sack">
                  <Pic sprite={PACK_ART} scale={g.s} />
                </span>
              )}
              {line !== null && (
                <SpeechBubble class="pw-say">
                  {line.faces !== undefined && line.faces.length > 0 && (
                    <span class="pw-faces">
                      {line.faces.slice(0, 3).map((face, i) => (
                        <CreatureSprite key={i} creature={face} scale={2} />
                      ))}
                    </span>
                  )}
                  <span key={line.text} class="pw-say-text">
                    {line.text}
                  </span>
                </SpeechBubble>
              )}
              {carried.length > 0 && !frame.done && (
                // While the badges tumble this one stays, unseen, so the tumble starts from where it rode.
                <span class={`pw-carry${tumbling ? ' pw-carry-ghost' : ''}`} ref={carryRef}>
                  <Badges piles={carried} class="pw-carry-list" />
                </span>
              )}
            </At>
            {friend !== null && line !== null && friend.slot !== plan.carrier && (
              <At
                x={g.X(walker.x + 20)}
                y={g.Y(walker.y - STAND_UP) - 15 * g.s - (line.surprise ? g.s * 5 : 0)}
                class={`pv-person pw-friend${line.surprise ? ' pw-find pw-pop' : ''}`}
              >
                <CreatureSprite creature={friend} scale={line.surprise ? g.s + 1 : g.s} />
                {line.surprise && (
                  <span class="pw-sparkle">
                    <Glyph id="sparkle" scale={g.s + 2} />
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
      <div class="pw-layer" ref={layerRef} aria-hidden="true">
        {tumbling && spot !== null && (
          <div
            class="pw-pile"
            ref={cssVars({ '--x': `${String(spot.x)}px`, '--y': `${String(spot.y)}px` })}
          >
            <Badges piles={carried} class="pw-pile-list" />
          </div>
        )}
      </div>
      <p class="visually-hidden" role="status">
        {spokenNow(plan, frame, line)}
      </p>
      <button type="button" class="pw-skip" aria-label="Skip to the valley" onClick={onDone} />
    </>
  );
}
