/**
 * Inside the forge (the Workshop), full screen: the stone wall with the fire and the parts on a shelf (the
 * game's count badges), two anvils on the floor (the job slots), the chest (the bag) and a workbench. A job
 * running shows its worker at the anvil with a timer bar; a ready one shows the made item on the anvil,
 * bouncing, with a "!"; an empty anvil shows a "+" bubble. Collect: the item hops into the chest and lands on
 * the floor before it, the worker's Crafting XP under it. A new job: tap the empty anvil, the blueprints lie on
 * the workbench as item sprites, the worker comes from the tray, and Start is pinned at the bottom.
 *
 * The post (step 3b, sample rules in `forge-post.ts`): a smith between the two anvils works an order and the
 * finished pieces stand on two planks beside the chimney (the shelf shows what is there, no clock). When the
 * order waits for a shard the bag lacks, the smith's anvil shows that shard's own picture and the main button
 * is the exchange: one tap trades the spare shards for it. With a broker on duty at the Market the wait never
 * happens: the broker is seen trading beside the chimney.
 */
import { useEffect, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { partCountItems } from '../../count-items';
import { creatureName } from '../../game';
import { ItemSprite } from '../../GearArt';
import type { Job } from '../../gear-types';
import { gearName, jobTitle } from '../../gear-view';
import { GlossaryTag } from '../../Glossary';
import { usePrefersReducedMotion } from '../../hooks';
import { formatCountdown } from '../../time-format';
import { ActionButton } from '../../ui/ActionButton';
import { CountBadge } from '../../ui/CountBadge';
import { TimerBar } from '../../ui/TimerBar';
import { XpGain, XpList } from '../../ui/XpGain';
import { craftingGain } from '../../xp-gain';
import type { Waiting } from '../welcome/PlaceStories';
import { TOUR, claimJob, creatureOf, isFree, startJob, type ProtoWorld } from '../world';
import { At, CreatureSprite, Pic, Plate, SpeechBubble, isStill } from './parts';
import { SceneFrame } from './SceneFrame';
import { forgeSpots } from './scene-art';
import { forgePostDraw, postSpots, PIECES_PER_PLANK, PLANKS } from './forge-post-art';
import type { Creature } from '../../api';
import {
  ORDER_OF,
  applyTrades,
  brokerKeepsStocked,
  finishPieces,
  getMade,
  planTrades,
  summarize,
  postStatus,
  setMade,
  shardWord,
  getNeed,
  surplusOf,
  type ForgeOrder,
} from './forge-post';
import { brokerOnDuty, getMarket, setMarket } from './market-sample';
import { GameIcon } from '../../ui/GameIcon';
import { CHEST_FRAMES } from './valley-art';
import './forge-market.css';

export type ForgeMoment = 'reveal' | null;

/** The open jobs on the anvils, oldest first: anvil i holds the i-th (or nothing). */
export function anvilJobs(jobs: readonly Job[], slots: number): (string | null)[] {
  const open = jobs
    .filter((j) => j.status !== 'claimed')
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((j) => j.id);
  return Array.from({ length: slots }, (_, i) => open[i] ?? null);
}

/**
 * Who stands at the post (sample): the smith is the highest-level free creature; the broker is the creature
 * seated at the Market, else the next one (a stand-in when the sample opens with a broker already seated).
 */
export function postRoles(world: ProtoWorld): { smith?: Creature; broker?: Creature } {
  const free = world.creatures
    .filter((c) => isFree(world, c))
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
  const seated = world.creatures.find((c) => c.id === getMarket().broker);
  const smith = free[0];
  const broker = seated ?? free.find((c) => c.id !== smith?.id);
  return {
    ...(smith === undefined ? {} : { smith }),
    ...(broker === undefined ? {} : { broker }),
  };
}

export function ForgeScene({
  world,
  setWorld,
  moment,
  held,
  setHeld,
  onLeave,
  onProgress,
  waiting,
}: {
  world: ProtoWorld;
  setWorld: (w: ProtoWorld) => void;
  moment: ForgeMoment;
  /** The creature picked in the tray: the worker for a new job. */
  held: string | null;
  setHeld: (id: string | null) => void;
  onLeave: () => void;
  onProgress: () => void;
  /** Stories a welcome-back marker led here with. */
  waiting?: Waiting | undefined;
}) {
  const reduced = usePrefersReducedMotion();
  const still = reduced || isStill();
  const [anvils, setAnvils] = useState<(string | null)[]>(() =>
    anvilJobs(world.jobs, world.jobSlots.total),
  );
  const [revealed, setRevealed] = useState<string | null>(
    moment === 'reveal' ? TOUR.claimJobId : null,
  );
  /** The empty anvil being set up. */
  const [setting, setSetting] = useState<number | null>(null);
  const [blueprint, setBlueprint] = useState<string>(TOUR.job.baseId);
  const [chest, setChest] = useState(moment === 'reveal' ? 2 : 0);
  const [strike, setStrike] = useState<{ anvil: number; frame: number } | null>(null);

  // The post: the order on the smith's anvil, the exchange's result, and a piece being finished.
  const [postMade, setPostMade] = useState(getMade);
  const [traded, setTraded] = useState<ReturnType<typeof summarize>>(null);
  const [resume, setResume] = useState(false);
  const need = getNeed(world.parts);
  const order: ForgeOrder = {
    baseId: world.blueprints[0] ?? 'kelp-cap',
    made: postMade,
    of: ORDER_OF,
    need,
  };
  const status = postStatus(order, world.parts);
  const { smith, broker } = postRoles(world);

  const finishClaim = (anvil: number, jobId: string): void => {
    setWorld(claimJob(world, jobId));
    setAnvils((list) => list.map((a, i) => (i === anvil ? null : a)));
    setRevealed(jobId);
  };

  // A broker on duty has traded for the shard before the smith needs it.
  useEffect(() => {
    const market = getMarket();
    if (!brokerOnDuty(market) || status !== 'waiting') return;
    const stocked = brokerKeepsStocked(world.parts, order, market.trades);
    if (stocked.trades.length === 0) return;
    setMarket({ ...market, trades: market.trades + stocked.trades.length });
    setWorld({ ...world, parts: stocked.parts as ProtoWorld['parts'] });
  }, []);

  // The smith picks the shard up and finishes a piece a beat after the exchange.
  useEffect(() => {
    if (!resume) return undefined;
    const id = window.setTimeout(
      () => {
        const done = finishPieces(order, world.parts);
        setMade(done.order.made);
        setPostMade(done.order.made);
        setWorld({ ...world, parts: done.parts as ProtoWorld['parts'] });
        setResume(false);
      },
      still ? 0 : 700,
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [resume]);

  useEffect(() => {
    if (strike === null) return undefined;
    const id = window.setTimeout(
      () => {
        if (strike.frame < 3) setStrike({ ...strike, frame: strike.frame + 1 });
        else if (chest < 2) setChest((c) => c + 1);
        else {
          const job = anvils[strike.anvil];
          setStrike(null);
          if (job != null) finishClaim(strike.anvil, job);
        }
      },
      strike.frame < 3 ? 120 : 100,
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [strike, chest]);

  const jobOn = (i: number): Job | undefined => {
    const id = anvils[i] ?? null;
    return id === null ? undefined : world.jobs.find((j) => j.id === id);
  };
  const emptyAnvil = anvils.findIndex((a) => a === null);

  const tapAnvil = (i: number): void => {
    const job = jobOn(i);
    if (job === undefined) {
      setRevealed(null);
      setSetting(i);
      return;
    }
    if (job.status === 'ready') {
      if (still) {
        setChest(2);
        finishClaim(i, job.id);
      } else setStrike({ anvil: i, frame: 0 });
    }
  };

  const worker =
    held === null ? undefined : world.creatures.find((c) => c.id === held && isFree(world, c));

  const start = (): void => {
    if (setting === null || worker === undefined) return;
    const next = startJob(world, {
      creatureId: worker.id,
      baseId: blueprint,
      reach: TOUR.job.reach,
    });
    const id = next.jobs[0]?.id ?? null;
    setWorld(next);
    setAnvils(anvils.map((a, i) => (i === setting ? id : a)));
    setSetting(null);
    setChest(0);
    setHeld(null);
    onProgress();
  };

  const market = getMarket();
  const brokerHere = brokerOnDuty(market);
  const plan =
    status === 'waiting' ? planTrades(world.parts, need, market.trades, order.of - order.made) : [];
  const trade = summarize(plan);
  const exchange = (): void => {
    if (trade === null) return;
    setMarket({ ...market, trades: market.trades + plan.length });
    setWorld({ ...world, parts: applyTrades(world.parts, plan) as ProtoWorld['parts'] });
    setTraded(trade);
    setResume(true);
  };

  const readyAt = anvils.findIndex((_, i) => jobOn(i)?.status === 'ready');
  const claimed = revealed === null ? undefined : world.jobs.find((j) => j.id === revealed);
  const result = claimed?.result?.kind === 'craft' ? claimed.result : null;

  let act;
  if (setting !== null) {
    act = (
      <ActionButton
        label={
          worker === undefined
            ? 'Pick a worker below'
            : `Start: ${creatureName(worker)} crafts ${gearName(blueprint)}`
        }
        detail="6 scrap · 3 h"
        wide
        large
        disabled={worker === undefined}
        onClick={start}
      />
    );
  } else if (readyAt >= 0) {
    const job = jobOn(readyAt);
    act = (
      <ActionButton
        label={`Collect ${job === undefined ? '' : gearName(job.input.baseId ?? 'kelp-cap')}`}
        wide
        large
        onClick={() => {
          tapAnvil(readyAt);
        }}
      />
    );
  } else if (status === 'waiting' && !brokerHere) {
    act = (
      <ActionButton
        label={
          trade === null
            ? `Waiting for ${shardWord(need)} shards`
            : `Trade for a ${shardWord(need)} shard`
        }
        detail={
          trade === null
            ? 'your scouts will bring them'
            : `${String(trade.spent)} ${shardWord(trade.from)} for ${String(trade.base)}`
        }
        wide
        large
        disabled={trade === null}
        onClick={exchange}
      />
    );
  } else if (result !== null && claimed !== undefined) {
    act = (
      <>
        <XpList label="Crafting" class="pv-act-xp">
          <XpGain
            change={craftingGain(result, creatureName(creatureOf(world, claimed.creatureId)))}
            what="Crafting XP"
            label={<GlossaryTag entry="crafting">Crafting</GlossaryTag>}
            who={creatureOf(world, claimed.creatureId)}
          />
        </XpList>
        {emptyAnvil >= 0 && (
          <ActionButton
            label="New job"
            wide
            large
            onClick={() => {
              tapAnvil(emptyAnvil);
            }}
          />
        )}
      </>
    );
  } else if (emptyAnvil >= 0) {
    act = (
      <ActionButton
        label="New job"
        wide
        large
        onClick={() => {
          tapAnvil(emptyAnvil);
        }}
      />
    );
  }

  return (
    <SceneFrame
      id="forge"
      label="Forge, Workshop"
      draw={forgePostDraw}
      onLeave={onLeave}
      act={act}
      waiting={waiting}
      ground="#3a2a24"
    >
      {(g) => {
        const { s, X, Y } = g;
        const at = forgeSpots(g);
        return (
          <>
            <At x={X(at.shelf.x)} y={Y(at.shelf.y)} class="pv-shelf" hidden={false}>
              <span class="pv-shelf-parts" role="group" aria-label="Parts">
                {partCountItems(world.parts)
                  .slice(0, 3)
                  .map(({ key, ...b }) => (
                    <CountBadge key={key} {...b} />
                  ))}
              </span>
            </At>
            {(() => {
              const pa = postSpots(g);
              const waiting = status === 'waiting';
              const shelfLabel = `${String(postMade)} of ${String(ORDER_OF)} pieces on the shelf`;
              const shardIcon = { kind: 'part', part: need } as const;
              const postLabel = waiting
                ? `The smith waits for a ${shardWord(need)} shard${trade === null ? '' : '. Trade for one'}`
                : status === 'done'
                  ? 'The smith has finished the order'
                  : 'The smith is working an order';
              return (
                <>
                  <span class="visually-hidden">{shelfLabel}</span>
                  {Array.from({ length: Math.min(postMade, PLANKS * PIECES_PER_PLANK) }, (_, i) => {
                    const p = pa.planks[Math.floor(i / PIECES_PER_PLANK)];
                    if (p === undefined) return null;
                    return (
                      <At
                        key={i}
                        x={X(p.x + (i % PIECES_PER_PLANK) * 17)}
                        y={Y(p.y - 16)}
                        class="pv-piece"
                      >
                        <ItemSprite baseId={order.baseId} scale={s} />
                      </At>
                    );
                  })}
                  {smith !== undefined && (
                    <At x={X(pa.smith.x)} y={Y(pa.smith.y)}>
                      <CreatureSprite
                        creature={smith}
                        scale={s}
                        class={status === 'working' && !still ? 'pv-hammer' : ''}
                      />
                    </At>
                  )}
                  {status === 'working' && (
                    <At
                      x={X(pa.anvil.x)}
                      y={Y(pa.anvil.y - 9)}
                      class={still ? undefined : 'pv-bounce'}
                    >
                      <ItemSprite baseId={order.baseId} scale={s} />
                    </At>
                  )}
                  {traded !== null && !waiting && (
                    <At
                      x={X(pa.anvil.x - 4)}
                      y={Y(pa.anvil.y + 18)}
                      class="pv-found"
                      hidden={false}
                    >
                      <span
                        class="pv-got"
                        role="img"
                        aria-label={`Got ${String(traded.got)} ${shardWord(traded.to)} shards${traded.lucky ? ', a lucky extra' : ''}`}
                      >
                        {Array.from({ length: traded.got }, (_, i) => (
                          <GameIcon key={i} icon={{ kind: 'part', part: traded.to }} scale={s} />
                        ))}
                      </span>
                      {traded.lucky && <Plate>Lucky!</Plate>}
                    </At>
                  )}
                  <button
                    type="button"
                    class="pv-anvil pv-post"
                    aria-label={postLabel}
                    disabled={!(waiting && trade !== null && !brokerHere)}
                    ref={cssVars({
                      '--x': `${String(X(pa.anvil.x - 8))}px`,
                      '--y': `${String(Y(pa.anvil.y - 12))}px`,
                      '--pw': `${String(32 * s)}px`,
                      '--ph': `${String(28 * s)}px`,
                    })}
                    onClick={exchange}
                  >
                    {waiting && !brokerHere && (
                      <SpeechBubble>
                        <GameIcon icon={shardIcon} scale={3} />
                      </SpeechBubble>
                    )}
                  </button>
                  {brokerHere && broker !== undefined && (
                    <At x={X(pa.broker.x)} y={Y(pa.broker.y)} class="pv-broker" hidden={false}>
                      <span
                        class="pv-broker-mark"
                        role="img"
                        aria-label={`${creatureName(broker)} is at the broker's seat, trading shards`}
                      >
                        <SpeechBubble>
                          <GameIcon
                            icon={{
                              kind: 'part',
                              part: surplusOf(world.parts, need)[0]?.kind ?? 'tide-shard',
                            }}
                            scale={2}
                          />
                          <span class="pix">→</span>
                          <GameIcon icon={shardIcon} scale={2} />
                        </SpeechBubble>
                        <CreatureSprite creature={broker} scale={s} />
                      </span>
                    </At>
                  )}
                </>
              );
            })()}
            {at.anvils.map((a, i) => {
              const job = jobOn(i);
              const who = job === undefined ? undefined : creatureOf(world, job.creatureId);
              const ready = job?.status === 'ready';
              const bounce = strike?.anvil === i ? (strike.frame % 2 === 1 ? 3 : 0) : 0;
              const hopping = strike?.anvil === i && chest > 0;
              const label =
                job === undefined
                  ? `Anvil ${String(i + 1)}, free. Start a job`
                  : ready
                    ? `Anvil ${String(i + 1)}: ${jobTitle(job)} is ready. Collect`
                    : `Anvil ${String(i + 1)}: ${who === undefined ? '' : creatureName(who)} is on ${jobTitle(job)}, ${formatCountdown(job.endsAt - world.now, 'short')} left`;
              // The worker picked for this anvil walks over while it is being set up.
              const standing = who ?? (setting === i ? worker : undefined);
              return (
                <div key={i}>
                  {standing !== undefined && (
                    <At x={X(a.x - 16)} y={Y(a.y - 1)}>
                      <CreatureSprite creature={standing} scale={s} />
                    </At>
                  )}
                  {ready && job !== undefined && !hopping && (
                    <At
                      x={X(a.x + 2)}
                      y={Y(a.y - 9 - bounce)}
                      class={still ? undefined : 'pv-bounce'}
                    >
                      <ItemSprite baseId={job.input.baseId ?? 'kelp-cap'} scale={s} />
                    </At>
                  )}
                  <button
                    type="button"
                    class={`pv-anvil${job === undefined ? ' empty' : ''}${setting === i ? ' on' : ''}`}
                    aria-label={label}
                    ref={cssVars({
                      '--x': `${String(X(a.x - 18))}px`,
                      '--y': `${String(Y(a.y - 14))}px`,
                      '--pw': `${String(38 * s)}px`,
                      '--ph': `${String(32 * s)}px`,
                    })}
                    onClick={() => {
                      tapAnvil(i);
                    }}
                  >
                    {job === undefined && setting !== i && (
                      <SpeechBubble>
                        <span class="pv-bang pix">+</span>
                      </SpeechBubble>
                    )}
                    {ready && (
                      <SpeechBubble>
                        <span class="pv-bang pix">!</span>
                      </SpeechBubble>
                    )}
                    {job !== undefined && !ready && (
                      <span class="pv-anvil-timer" aria-hidden="true">
                        <TimerBar
                          startedAt={job.startedAt}
                          endsAt={job.endsAt}
                          now={world.now}
                          label={jobTitle(job)}
                          state={formatCountdown(job.endsAt - world.now, 'short')}
                        />
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
            {setting !== null && (
              <ul
                class="pv-bench"
                aria-label="Blueprints on the workbench: what to make"
                ref={cssVars({
                  '--x': `${String(X(at.bench.x))}px`,
                  '--y': `${String(Y(at.bench.y - 8))}px`,
                  '--pw': `${String(at.bench.width * s)}px`,
                })}
              >
                {world.blueprints.slice(0, 4).map((b) => (
                  <li key={b}>
                    <button
                      type="button"
                      class={`pv-blueprint${b === blueprint ? ' on' : ''}`}
                      aria-pressed={b === blueprint}
                      aria-label={`Craft ${gearName(b)}`}
                      onClick={() => {
                        setBlueprint(b);
                      }}
                    >
                      <ItemSprite baseId={b} scale={s - 1} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {result !== null && (
              <At x={X(at.chest.x - 4)} y={Y(at.chest.y + 40)} class="pv-found" hidden={false}>
                <ItemSprite baseId={result.baseId} scale={s} alt={gearName(result.baseId)} />
                <Plate>{gearName(result.baseId)}</Plate>
              </At>
            )}
            <button
              type="button"
              class="pv-chest"
              aria-label={`Chest: your bag, ${String(world.items.length)} items (not in this prototype)`}
              ref={cssVars({
                '--x': `${String(X(at.chest.x))}px`,
                '--y': `${String(Y(at.chest.y))}px`,
              })}
            >
              <Pic sprite={CHEST_FRAMES[chest] ?? CHEST_FRAMES[0]!} scale={s} />
            </button>
          </>
        );
      }}
    </SceneFrame>
  );
}
