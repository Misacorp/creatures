/**
 * The Market, full screen (prototype, step 3b; sample data in `market-sample.ts`, rules in `forge-post.ts`).
 *
 * Before it is built: its plot, where the stall goes up plank by plank as the server's gifts come in (laid
 * planks solid, planks to come hollow ink outlines, the same pattern as the hearth's stones). Nothing is written
 * on the grass. The plot and the one button open the give sheet: the planks in a row, what it still needs, what
 * it will do (a picture and a line), your own share (only you see it) and the gift. It never fails or expires.
 *
 * Built (the `valley-glow` market): the broker's one home. Pick a creature in the tray and seat it at the
 * counter; it trades your spare shards for the ones the Forge waits on, all the time. Its rate shows here as a
 * picture ("3 for 1" and a spark for the lucky ones); a tap on the seat says it in words and what Skilled would
 * change it to. `&market=built` opens it built with a broker, `&market=seat` with the seat empty,
 * `&market=almost` nearly paid.
 */
import { useMemo, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { creatureName } from '../../game';
import { CountBadge } from '../../ui/CountBadge';
import { Drawer } from '../../ui/Drawer';
import { ActionButton } from '../../ui/ActionButton';
import { GameIcon } from '../../ui/GameIcon';
import type { ProtoWorld } from '../world';
import { postRoles } from './ForgeScene';
import { getNeed, surplusOf } from './forge-post';
import { glowLayout, glowScale, type PlaceSceneProps } from './glow-scene-art';
import { PLANK_TO_COME, PLANK_UP, marketDraw } from './market-art';
import {
  STAGES,
  SAMPLE_BROKER,
  brokerRate,
  getMarket,
  giftFor,
  give,
  isBuilt,
  rateWords,
  setMarket,
  shareOf,
  stageOf,
  stillNeeds,
  type MarketState,
} from './market-sample';
import { MASTERY_WORDS, masteryOf } from './mastery';
import { At, CreatureSprite, Glyph, Pic, SpeechBubble } from './parts';
import { PinnedAct } from './PinnedAct';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK } from './valley-places';
import './forge-market.css';

/** The stall's planks as one row (laid ones solid, the rest hollow), like the hearth's stones. */
export function PlankRow({ laid, scale }: { laid: number; scale: number }) {
  return (
    <span class="pv-planks" aria-hidden="true">
      {Array.from({ length: STAGES }, (_, i) => (
        <Pic key={i} sprite={i < laid ? PLANK_UP : PLANK_TO_COME} scale={scale} />
      ))}
    </span>
  );
}

export function MarketScene({
  world,
  setWorld,
  held,
  setHeld,
  onLeave,
  waiting,
  look = DEFAULT_LOOK,
}: PlaceSceneProps & {
  setWorld: (w: ProtoWorld) => void;
  /** The creature picked in the tray: the one to seat as broker. */
  held: string | null;
  setHeld: (id: string | null) => void;
}) {
  const [state, setState] = useState<MarketState>(getMarket);
  /** The give sheet and the broker's sheet. */
  const [giving, setGiving] = useState(false);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const commit = (next: MarketState): void => {
    setMarket(next);
    setState(next);
  };
  const built = isBuilt(state.given);
  const stage = stageOf(state.given);
  const draw = useMemo(
    () => marketDraw({ time: look.time, built, stage }),
    [look.time, built, stage],
  );

  const gift = giftFor(state, world.parts.scrap);
  const hasGift = gift.acorns + gift.scrap > 0;
  const giveGift = (): void => {
    if (!hasGift) return;
    commit(give(state, gift));
    setWorld({ ...world, parts: { ...world.parts, scrap: world.parts.scrap - gift.scrap } });
  };

  const picked = held === null ? undefined : world.creatures.find((c) => c.id === held);
  const seated =
    state.broker === SAMPLE_BROKER
      ? postRoles(world).broker
      : world.creatures.find((c) => c.id === state.broker);
  const seat = (): void => {
    if (picked === undefined) return;
    commit({ ...state, broker: picked.id });
    setHeld(null);
  };

  const step = seated === undefined ? 0 : masteryOf(seated, 'trading');
  const rate = brokerRate(step);
  const need = getNeed(world.parts);
  const from = surplusOf(world.parts, need)[0]?.kind ?? 'tide-shard';
  const share = shareOf(state.mine);
  const left = stillNeeds(state.given);

  let act;
  if (!built) {
    act = (
      <PinnedAct
        label="Add to the stall"
        onClick={() => {
          setGiving(true);
        }}
      />
    );
  } else if (picked !== undefined && picked.id !== seated?.id) {
    act = <PinnedAct label={`Seat ${creatureName(picked)} as broker`} onClick={seat} />;
  } else if (seated !== undefined) {
    act = <PinnedAct calm={`${creatureName(seated)} is trading shards for you`} />;
  } else {
    act = <PinnedAct calm="Pick a creature below to trade for you" />;
  }

  return (
    <>
      <SceneFrame
        id="market"
        label="Market, shards"
        draw={draw}
        onLeave={onLeave}
        waiting={waiting}
        ground="#2c4d34"
        scaleFor={(w, h) => glowScale(w, h, 'market')}
        act={act}
      >
        {(g) => {
          const layout = glowLayout(g, 'market');
          const { s, X, Y } = g;
          const counter = layout.spots['counter'] ?? layout.at(24, 30);
          return (
            <>
              {!built && (
                <button
                  type="button"
                  class="pv-thing pv-market-hit"
                  aria-label={`The Market's stall, ${String(stage)} / ${String(STAGES)} planks. Open`}
                  ref={cssVars({
                    '--x': `${String(X(layout.art.x))}px`,
                    '--y': `${String(Y(layout.art.y))}px`,
                    '--pw': `${String(layout.art.width * s)}px`,
                    '--ph': `${String(layout.art.height * s)}px`,
                  })}
                  onClick={() => {
                    setGiving(true);
                  }}
                />
              )}
              {built && (
                <>
                  <button
                    type="button"
                    class="pv-thing pv-market-hit"
                    aria-label={
                      seated === undefined
                        ? "The broker's counter, empty. What it does"
                        : `${creatureName(seated)} is the broker. Its rate`
                    }
                    ref={cssVars({
                      '--x': `${String(X(counter.x - 14))}px`,
                      '--y': `${String(Y(counter.y - 22))}px`,
                      '--pw': `${String(28 * s)}px`,
                      '--ph': `${String(26 * s)}px`,
                    })}
                    onClick={() => {
                      setBrokerOpen(true);
                    }}
                  >
                    {seated === undefined && (
                      <SpeechBubble>
                        <span class="pv-bang pix">+</span>
                      </SpeechBubble>
                    )}
                  </button>
                  {seated !== undefined && (
                    <At x={X(counter.x - 8)} y={Y(counter.y - 16)}>
                      <CreatureSprite creature={seated} scale={s} />
                    </At>
                  )}
                  <At x={X(g.cx)} y={Y(layout.below + 4)} class="pv-centred" hidden={false}>
                    <span class="pv-market-row" role="img" aria-label={`Trades ${rateWords(rate)}`}>
                      <span class="pv-rate pix">{rate.give}</span>
                      <GameIcon icon={{ kind: 'part', part: from }} scale={s} />
                      <span class="pix">→</span>
                      <span class="pv-rate pix">{rate.get}</span>
                      <GameIcon icon={{ kind: 'part', part: need }} scale={s} />
                      <Glyph id="sparkle" scale={s} />
                    </span>
                  </At>
                </>
              )}
            </>
          );
        }}
      </SceneFrame>
      <Drawer
        open={giving}
        onClose={() => {
          setGiving(false);
        }}
        title="The Market"
        meta={`${String(stage)} / ${String(STAGES)} planks`}
      >
        <div class="dr-stack pv-market-sheet">
          <PlankRow laid={built ? STAGES : stage} scale={3} />
          {built ? (
            <p>The stalls are up. A creature at the counter trades shards for you.</p>
          ) : (
            <>
              <p class="pv-market-needs">
                <span>The stalls would love</span>
                {left.acorns > 0 && (
                  <CountBadge
                    icon={{ kind: 'glyph', id: 'gift' }}
                    amount={left.acorns}
                    label="Acorns"
                    name="Acorns"
                  />
                )}
                {left.scrap > 0 && (
                  <CountBadge
                    icon={{ kind: 'part', part: 'scrap' }}
                    amount={left.scrap}
                    label="Scrap"
                    name="scrap"
                  />
                )}
                <span>whenever you like.</span>
              </p>
              <p class="pv-market-does">
                <GameIcon icon={{ kind: 'part', part: from }} scale={3} />
                <span class="pix">→</span>
                <GameIcon icon={{ kind: 'part', part: need }} scale={3} />
                <span>Once built, it trades the shards you don't need for the ones you do.</span>
              </p>
            </>
          )}
          {share > 0 && <p class="muted">You laid {share}% of it. Only you see this.</p>}
          {!built && (
            <ActionButton
              label="Give"
              detail={[
                gift.acorns > 0 ? `${String(gift.acorns)} Acorns` : '',
                gift.scrap > 0 ? `${String(gift.scrap)} scrap` : '',
              ]
                .filter((b) => b !== '')
                .join(' · ')}
              wide
              disabled={!hasGift}
              onClick={giveGift}
            />
          )}
        </div>
      </Drawer>
      <Drawer
        open={brokerOpen}
        onClose={() => {
          setBrokerOpen(false);
        }}
        title="The broker"
      >
        <div class="dr-stack pv-market-sheet">
          <p>
            {seated === undefined
              ? 'Seat a creature at the counter: it trades your spare shards for the ones the Forge waits on, all the time.'
              : `${creatureName(seated)} trades your spare shards for the ones the Forge waits on, all the time.`}
          </p>
          <p>Now: {rateWords(rate)}</p>
          {step < 1 && (
            <p class="muted">
              {MASTERY_WORDS[1]}: {rateWords(brokerRate(1))}
            </p>
          )}
          {step < 3 && (
            <p class="muted">
              {MASTERY_WORDS[3]}: {rateWords(brokerRate(3))}
            </p>
          )}
        </div>
      </Drawer>
    </>
  );
}
