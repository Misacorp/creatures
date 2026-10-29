import { GLOSSARY_IDS } from '@creatures/game';
import { markFreshReveal } from './reveal-arrive';
import type { Creature } from './api';
import { creatureName } from './game';
import { GlossaryTag } from './Glossary';
import type { GearState, Job } from './gear-types';
import { jobProgress, jobTitle, jobVerb, openJobs } from './gear-view';
import { glyphOrUnknown } from './glyphs';
import { useServerNow } from './hooks';
import { formatCountdown } from './time-format';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { TimerBar } from './ui/TimerBar';

function RunningSlot({
  job,
  creature,
  serverNow,
  busy,
  onClaim,
}: {
  job: Job;
  creature: Creature | undefined;
  serverNow: number;
  busy: boolean;
  onClaim: (job: Job) => void;
}) {
  const progress = jobProgress(job, serverNow);
  const title = jobTitle(job);
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
              {jobVerb(job.kind, job.input)}
            </GlossaryTag>
            {title.slice(jobVerb(job.kind, job.input).length)}
          </p>
          <p class="muted">{creature === undefined ? 'A creature' : creatureName(creature)}</p>
        </div>
      </div>
      <TimerBar
        class="job-bar"
        startedAt={job.startedAt}
        endsAt={job.endsAt}
        now={serverNow}
        ready={progress.ready}
        label={`${title}: ${String(Math.floor(progress.pct))}% done`}
        state={
          progress.ready ? (
            <>
              <strong>Ready</strong>
            </>
          ) : (
            `${formatCountdown(progress.remainingMs, 'days')} left`
          )
        }
      />
      <button
        type="button"
        class="primary"
        disabled={busy || !progress.ready}
        onClick={() => {
          markFreshReveal();
          onClaim(job);
        }}
      >
        Claim
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
  const serverNow = useServerNow(offset, open.length > 0);
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
              creature={creatures.find((c) => c.id === job.creatureId)}
              serverNow={serverNow}
              busy={busy}
              onClaim={onClaim}
            />
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${String(i)}`} class="card-item job-slot empty-slot">
            <h4 class="label">Slot {open.length + i + 1}</h4>
            <p class="muted">Empty</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
