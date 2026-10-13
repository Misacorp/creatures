import { GLOSSARY_IDS } from '@creatures/game';
import type { Creature } from './api';
import { cssVars } from './css-vars';
import { creatureName, formatCountdown } from './game';
import { GlossaryTag } from './Glossary';
import type { GearState, Job } from './gear-types';
import { jobProgress, jobTitle, jobVerb, openJobs } from './gear-view';
import { glyphOrUnknown } from './glyphs';
import { useNow } from './hooks';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** A job's timer bar: it fills smoothly (a one second linear step each second, none with reduced motion). */
function JobBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      class="xp job-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <span ref={cssVars({ '--pct': `${String(pct)}%` })} />
    </div>
  );
}

function RunningSlot({
  job,
  gear,
  creature,
  serverNow,
  busy,
  onClaim,
}: {
  job: Job;
  gear: GearState;
  creature: Creature | undefined;
  serverNow: number;
  busy: boolean;
  onClaim: (job: Job) => void;
}) {
  const progress = jobProgress(job, serverNow);
  const title = jobTitle(job, gear.items);
  return (
    <>
      <div class="job-head">
        {creature !== undefined && (
          <Sprite
            sprite={creatureSpriteOrFallback(creature.species)}
            scale={3}
            bob={!progress.ready}
          />
        )}
        <div class="job-text">
          <p class="pix job-title">
            <GlossaryTag entry={GLOSSARY_IDS.job(job.kind)} look="text">
              {jobVerb(job.kind)}
            </GlossaryTag>
            {title.slice(jobVerb(job.kind).length)}
          </p>
          <p class="muted">
            {creature === undefined ? 'A creature' : creatureName(creature)} is working
          </p>
        </div>
      </div>
      <JobBar pct={progress.pct} label={`${title}: ${String(Math.floor(progress.pct))}% done`} />
      <p class={progress.ready ? 'job-state ready' : 'job-state'} aria-live="off">
        {progress.ready ? (
          <>
            <strong>Ready</strong> to claim
          </>
        ) : (
          `${formatCountdown(progress.remainingMs)} left`
        )}
      </p>
      <button
        type="button"
        class="primary"
        disabled={busy || !progress.ready}
        onClick={() => {
          onClaim(job);
        }}
      >
        {progress.ready ? 'Claim' : 'Claim when ready'}
      </button>
    </>
  );
}

/**
 * The Workshop's job slots: each running job with a smooth timer bar, a Ready state and a Claim
 * button, and empty slots with a nudge. `offset` is the server clock minus this device's clock.
 */
export function JobSlots({
  gear,
  creatures,
  offset,
  busy,
  onClaim,
}: {
  gear: GearState;
  creatures: readonly Creature[];
  offset: number;
  busy: boolean;
  onClaim: (job: Job) => void;
}) {
  const open = openJobs(gear.jobs);
  const now = useNow(open.length > 0);
  const empty = Math.max(0, gear.slots.total - open.length);
  const anvil = glyphOrUnknown('anvil');
  return (
    <section class="ws-section" aria-labelledby="ws-jobs">
      <h3 id="ws-jobs">
        <Sprite sprite={anvil} scale={2} class="inline-glyph" /> Jobs{' '}
        <GlossaryTag entry="workshop" look="help" />
      </h3>
      <ul class="cards job-slots">
        {open.map((job, index) => (
          <li key={job.id} class="card-item job-slot">
            <h4 class="label">Slot {index + 1}</h4>
            <RunningSlot
              job={job}
              gear={gear}
              creature={creatures.find((c) => c.id === job.creatureId)}
              serverNow={now + offset}
              busy={busy}
              onClaim={onClaim}
            />
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${String(i)}`} class="card-item job-slot empty-slot">
            <h4 class="label">Slot {open.length + i + 1}</h4>
            <p class="muted">
              Empty. Craft something from a blueprint or a supply below, or improve or enchant an
              item.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
