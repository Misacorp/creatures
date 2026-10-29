/**
 * Inside the forge (the Workshop): the stone back wall with the fire, the parts on a shelf (the game's count
 * badges), two anvils on the floor (the job slots) and the chest (the bag). A job running shows its worker
 * at the anvil and a timer bar under it; a ready one shows the made item glinting on the anvil with a "!";
 * an empty anvil shows a dashed outline and a "+". Tap a ready anvil: the item hops into the chest and the
 * reveal rises on the floor (the item's `FindItem`, the worker's Crafting `XpGain`). Tap an empty anvil: pick
 * a blueprint off the wall and a free creature from the line-up, and start.
 */
import { useEffect, useState } from 'preact/hooks';
import { creatureName } from '../../game';
import { jobTitle } from '../../gear-view';
import { ItemSprite } from '../../GearArt';
import { usePrefersReducedMotion } from '../../hooks';
import { partCountItems } from '../../count-items';
import { formatCountdown } from '../../time-format';
import { ActionButton } from '../../ui/ActionButton';
import { CountBadge } from '../../ui/CountBadge';
import { FindItem } from '../../ui/FindItem';
import { FindList } from '../../ui/FindRow';
import { TimerBar } from '../../ui/TimerBar';
import { XpGain, XpList } from '../../ui/XpGain';
import { GlossaryTag } from '../../Glossary';
import { craftingGain } from '../../xp-gain';
import { gearName } from '../../gear-view';
import type { Job } from '../../gear-types';
import {
  TOUR,
  claimJob,
  creatureOf,
  freeCreatures,
  startJob,
  type ProtoWorld,
} from '../world';
import { LineUp } from './LineUp';
import { At, CreatureSprite, Pic, SpeechBubble, isStill } from './parts';
import { SceneFrame } from './SceneFrame';
import { FORGE_ANVILS, FORGE_CHEST, FORGE_SHELF, FORGE_SIZE, forgeDraw } from './scene-art';
import { CHEST_FRAMES } from './valley-art';

export type ForgeMoment = 'reveal' | null;

/** The open jobs on the anvils, oldest first: anvil i holds the i-th (or nothing). */
export function anvilJobs(jobs: readonly Job[], slots: number): (string | null)[] {
  const open = jobs
    .filter((j) => j.status !== 'claimed')
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((j) => j.id);
  return Array.from({ length: slots }, (_, i) => open[i] ?? null);
}

export function ForgeScene({
  world,
  setWorld,
  moment,
  onLeave,
  onProgress,
}: {
  world: ProtoWorld;
  setWorld: (w: ProtoWorld) => void;
  moment: ForgeMoment;
  onLeave: () => void;
  onProgress: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const still = reduced || isStill();
  const [anvils, setAnvils] = useState<(string | null)[]>(() =>
    anvilJobs(world.jobs, world.jobSlots.total),
  );
  /** The claimed job whose reveal is on the floor. */
  const [revealed, setRevealed] = useState<string | null>(
    moment === 'reveal' ? TOUR.claimJobId : null,
  );
  /** The empty anvil being set up, and the picks. */
  const [setting, setSetting] = useState<number | null>(null);
  const [worker, setWorker] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<string>(TOUR.job.baseId);
  /** The chest's frame (0 shut, 2 open) and the strike frame of the hammer (the item bounces). */
  const [chest, setChest] = useState(moment === 'reveal' ? 2 : 0);
  const [strike, setStrike] = useState<{ anvil: number; frame: number } | null>(null);

  useEffect(() => {
    if (strike === null) return undefined;
    const id = window.setTimeout(() => {
      if (strike.frame < 3) setStrike({ ...strike, frame: strike.frame + 1 });
      else if (chest < 2) setChest((c) => c + 1);
      else {
        const job = anvils[strike.anvil];
        setStrike(null);
        if (job != null) finishClaim(strike.anvil, job);
      }
    }, strike.frame < 3 ? 120 : 100);
    return () => {
      window.clearTimeout(id);
    };
  }, [strike, chest]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishClaim = (anvil: number, jobId: string): void => {
    setWorld(claimJob(world, jobId));
    setAnvils(anvils.map((a, i) => (i === anvil ? null : a)));
    setRevealed(jobId);
  };

  const tapAnvil = (i: number): void => {
    const jobId = anvils[i] ?? null;
    const job = jobId === null ? undefined : world.jobs.find((j) => j.id === jobId);
    if (job === undefined) {
      setRevealed(null);
      setSetting(i);
      setWorker(null);
      return;
    }
    if (job.status === 'ready') {
      if (still) {
        setChest(2);
        finishClaim(i, job.id);
      } else setStrike({ anvil: i, frame: 0 });
    }
  };

  const start = (): void => {
    if (setting === null || worker === null) return;
    const next = startJob(world, { creatureId: worker, baseId: blueprint, reach: TOUR.job.reach });
    const id = next.jobs[0]?.id ?? null;
    setWorld(next);
    setAnvils(anvils.map((a, i) => (i === setting ? id : a)));
    setSetting(null);
    setChest(0);
    onProgress();
  };

  const free = freeCreatures(world);
  const known = world.blueprints.slice(0, 4);
  const claimed = revealed === null ? undefined : world.jobs.find((j) => j.id === revealed);
  const made =
    claimed?.result?.kind === 'craft'
      ? world.items.find((i) => i.id === (claimed.result as { gearId: string }).gearId)
      : undefined;

  const floor =
    claimed !== undefined && claimed.result !== null && claimed.result.kind === 'craft' ? (
      <div class="pv-reveal" role="status">
        <FindList label="Made at the forge">
          <FindItem
            card={made}
            baseId={claimed.result.baseId}
            rarity={claimed.result.rarity}
            level={claimed.result.itemLevel}
            motion={!still}
            scale={3}
          />
        </FindList>
        <XpList label="Crafting">
          <XpGain
            change={craftingGain(claimed.result, creatureName(creatureOf(world, claimed.creatureId)))}
            what="Crafting XP"
            label={<GlossaryTag entry="crafting">Crafting</GlossaryTag>}
            who={creatureOf(world, claimed.creatureId)}
          />
        </XpList>
      </div>
    ) : setting !== null ? (
      <div class="pv-setup">
        <ul class="pv-blueprints" aria-label="What to make">
          {known.map((b) => (
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
                <ItemSprite baseId={b} scale={3} />
              </button>
            </li>
          ))}
        </ul>
        <LineUp
          label="Who works the anvil?"
          creatures={free}
          picked={worker}
          onPick={setWorker}
        />
        <ActionButton
          label={worker === null ? 'Pick a worker' : `Craft ${gearName(blueprint)}`}
          detail="6 scrap · 3 h"
          wide
          large
          disabled={worker === null}
          onClick={start}
        />
      </div>
    ) : null;

  return (
    <SceneFrame
      id="forge"
      label="Forge, Workshop"
      width={FORGE_SIZE.width}
      height={FORGE_SIZE.height}
      draw={forgeDraw}
      onLeave={onLeave}
      floor={floor}
      ground="#3a2a24"
    >
      {({ s, X, Y }) => (
        <>
          <At x={X(FORGE_SHELF.x)} y={Y(FORGE_SHELF.y)} class="pv-shelf" hidden={false}>
            <span class="pv-shelf-parts" role="group" aria-label="Parts">
              {partCountItems(world.parts)
                .slice(0, 3)
                .map(({ key, ...b }) => (
                  <CountBadge key={key} {...b} />
                ))}
            </span>
          </At>
          {FORGE_ANVILS.map((a, i) => {
            const jobId = anvils[i] ?? null;
            const job = jobId === null ? undefined : world.jobs.find((j) => j.id === jobId);
            const who = job === undefined ? undefined : creatureOf(world, job.creatureId);
            const ready = job?.status === 'ready';
            const bounce = strike?.anvil === i ? (strike.frame % 2 === 1 ? 2 : 0) : 0;
            const label =
              job === undefined
                ? `Anvil ${String(i + 1)}, free. Start a job`
                : ready
                  ? `Anvil ${String(i + 1)}: ${jobTitle(job)} is ready. Claim`
                  : `Anvil ${String(i + 1)}: ${who === undefined ? '' : creatureName(who)} is on ${jobTitle(job)}, ${formatCountdown(job.endsAt - world.now, 'short')} left`;
            return (
              <div key={i}>
                {who !== undefined && strike?.anvil !== i && (
                  <At x={X(a.x - 14)} y={Y(a.y - 2)}>
                    <CreatureSprite creature={who} scale={s} />
                  </At>
                )}
                {ready && job !== undefined && (strike?.anvil !== i || chest === 0) && (
                  <At x={X(a.x + 2)} y={Y(a.y - 8 - bounce)} class="pv-glint">
                    <ItemSprite baseId={job.input.baseId ?? 'kelp-cap'} scale={s} />
                  </At>
                )}
                <button
                  type="button"
                  class={`pv-anvil${job === undefined ? ' empty' : ''}${setting === i ? ' on' : ''}`}
                  aria-label={label}
                  ref={(el) => {
                    if (el === null) return;
                    el.style.setProperty('--x', `${String(X(a.x - 14))}px`);
                    el.style.setProperty('--y', `${String(Y(a.y - 12))}px`);
                    el.style.setProperty('--pw', `${String(32 * s)}px`);
                    el.style.setProperty('--ph', `${String(30 * s)}px`);
                  }}
                  onClick={() => {
                    tapAnvil(i);
                  }}
                >
                  {job === undefined && (
                    <span class="pv-plus pix" aria-hidden="true">
                      +
                    </span>
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
          <button
            type="button"
            class="pv-chest"
            aria-label={`Chest: your bag, ${String(world.items.length)} items (not in this prototype)`}
            ref={(el) => {
              if (el === null) return;
              el.style.setProperty('--x', `${String(X(FORGE_CHEST.x))}px`);
              el.style.setProperty('--y', `${String(Y(FORGE_CHEST.y))}px`);
            }}
          >
            <Pic sprite={CHEST_FRAMES[chest] ?? CHEST_FRAMES[0]!} scale={s} />
          </button>
        </>
      )}
    </SceneFrame>
  );
}
