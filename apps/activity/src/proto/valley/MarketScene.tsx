/**
 * The Market, full screen (prototype, step 3b; sample data in `market-sample.ts`, rules in `forge-post.ts`).
 *
 * Before it is built: its plot under the poster, a wooden frame that rises one stage at a time as the server's
 * gifts come in (nobody's name, no amounts per person), a tap on the plot says what it still needs as an
 * invitation, and what it will do shows as a picture (any shard becomes the one you need). One button gives a
 * small gift of Acorns and scrap; your own share shows only to you ("You laid 12%"). It never fails or expires.
 *
 * Built (the `valley-glow` market): a broker's seat in front of it. Pick a creature in the tray and seat it;
 * it trades your spare shards for the ones the Forge waits on, all the time (the Forge shows it at work).
 * `&market=built` opens it built with a broker, `&market=almost` nearly paid.
 */
import { useMemo, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { creatureName } from '../../game';
import { ActionButton } from '../../ui/ActionButton';
import { GameIcon } from '../../ui/GameIcon';
import type { ProtoWorld } from '../world';
import { postRoles } from './ForgeScene';
import { getNeed, surplusOf } from './forge-post';
import { glowSceneSpots, type PlaceSceneProps } from './glow-scene-art';
import { marketDraw } from './market-art';
import {
  SAMPLE_BROKER,
  getMarket,
  giftFor,
  give,
  invitation,
  isBuilt,
  setMarket,
  shareOf,
  stageOf,
  type MarketState,
} from './market-sample';
import { At, CreatureSprite, SpeechBubble } from './parts';
import { SceneFrame } from './SceneFrame';
import { DEFAULT_LOOK } from './valley-places';
import './forge-market.css';

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
  /** The invitation's bubble over the plot is open. */
  const [asking, setAsking] = useState(false);
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
    setAsking(false);
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

  let act;
  if (!built) {
    const parts = [
      gift.acorns > 0 ? `${String(gift.acorns)} Acorns` : null,
      gift.scrap > 0 ? `${String(gift.scrap)} scrap` : null,
    ].filter((p): p is string => p !== null);
    act = (
      <ActionButton
        label="Give to the Market"
        detail={hasGift ? parts.join(' · ') : 'nothing to spare right now'}
        wide
        large
        disabled={!hasGift}
        onClick={giveGift}
      />
    );
  } else if (picked !== undefined && picked.id !== seated?.id) {
    act = (
      <ActionButton
        label={`Seat ${creatureName(picked)} at the broker's post`}
        wide
        large
        onClick={seat}
      />
    );
  } else if (seated === undefined) {
    act = (
      <ActionButton label="Pick a broker below" wide large disabled onClick={() => undefined} />
    );
  }

  const need = getNeed(world.parts);
  const from = surplusOf(world.parts, need)[0]?.kind ?? 'tide-shard';
  const share = shareOf(state.mine);

  return (
    <SceneFrame
      id="market"
      label="Market, shards"
      draw={draw}
      onLeave={onLeave}
      waiting={waiting}
      ground="#2c4d34"
      act={act}
    >
      {(g) => {
        const at = glowSceneSpots(g);
        const { s, X, Y } = g;
        return (
          <>
            {!built && (
              <button
                type="button"
                class="pv-thing pv-market-hit"
                aria-expanded={asking}
                aria-label={`The Market's plot, stage ${String(stage)} / 4. What it still needs`}
                ref={cssVars({
                  '--x': `${String(X(at.place.x))}px`,
                  '--y': `${String(Y(at.place.y))}px`,
                  '--pw': `${String(60 * s)}px`,
                  '--ph': `${String(48 * s)}px`,
                })}
                onClick={() => {
                  setAsking((a) => !a);
                }}
              >
                {asking && (
                  <SpeechBubble>
                    <span class="pix">{invitation(state.given)}</span>
                  </SpeechBubble>
                )}
              </button>
            )}
            <At x={X(g.cx)} y={Y(at.below + (built ? 20 : 24))} class="pv-centred" hidden={false}>
              <span class="pv-market-plot">
                {!built && share > 0 && (
                  <span
                    class="pv-plate pix pv-market-plate"
                    aria-label={`You laid ${String(share)} percent of the Market. Only you see this`}
                  >
                    {`You laid ${String(share)}%`}
                  </span>
                )}
                {!built && (
                  <span
                    class="pv-market-row"
                    role="img"
                    aria-label="Any shard becomes the one you need"
                  >
                    <GameIcon icon={{ kind: 'part', part: from }} scale={s} />
                    <span class="pix">→</span>
                    <GameIcon icon={{ kind: 'part', part: need }} scale={s} />
                  </span>
                )}
                {!built && (
                  <span class="pv-plate pix pv-market-plate wide">
                    Trade the shards you don't need for the ones you do
                  </span>
                )}
                {built && <span class="pv-plate pix pv-market-plate">Built together</span>}
              </span>
            </At>
            {built && (
              <>
                {seated !== undefined && (
                  <At x={X(g.cx - 8)} y={Y(at.place.y + 50)} hidden={false}>
                    <span
                      class="pv-broker-mark"
                      role="img"
                      aria-label={`${creatureName(seated)} is the broker, trading shards`}
                    >
                      <SpeechBubble>
                        <GameIcon icon={{ kind: 'part', part: from }} scale={2} />
                        <span class="pix">→</span>
                        <GameIcon icon={{ kind: 'part', part: need }} scale={2} />
                      </SpeechBubble>
                      <CreatureSprite creature={seated} scale={s} />
                    </span>
                  </At>
                )}
                {seated === undefined && (
                  <At x={X(g.cx - 8)} y={Y(at.place.y + 50)}>
                    <span class="pv-broker-mark pv-seat-empty">
                      <SpeechBubble>
                        <span class="pv-bang pix">+</span>
                      </SpeechBubble>
                    </span>
                  </At>
                )}
              </>
            )}
          </>
        );
      }}
    </SceneFrame>
  );
}
