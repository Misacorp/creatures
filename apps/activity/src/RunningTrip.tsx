import { GLOSSARY_IDS, expeditionContent, goalDef } from '@creatures/game';
import type { Creature } from './api';
import { Banner } from './Banner';
import { cssVars } from './css-vars';
import type { Trip } from './expedition-types';
import { ExpIcon } from './ExpeditionIcons';
import { creatureName, formatCountdown, getSpecies } from './game';
import { GlossaryTag } from './Glossary';
import { PushOnChoice } from './PushOnChoice';
import { riskWord } from './push-on-view';
import { explorerInfo } from './send-view';
import { ElementChip } from './sprites/ElementChip';
import {
  destinationName,
  fillPct,
  goalName,
  lengthLabel,
  recallKeeps,
  supplyKindOf,
  supplyName,
  tripStatus,
} from './trip-view';

/** The words under the banner: where the trip is, and the timer. */
function statusText(trip: Trip, status: ReturnType<typeof tripStatus>): string {
  switch (status.phase) {
    case 'out':
      return `Back in ${formatCountdown(status.remainingMs)}`;
    case 'pushing':
      return `Pushing on${trip.pushOn === null ? '' : `: ${goalName(trip.pushOn.goalId)}`}. Back in ${formatCountdown(status.remainingMs)}`;
    case 'choice':
      return 'Waiting for your choice';
    case 'ready':
      return 'Home, ready to claim';
  }
}

/**
 * A trip that is out: the destination's banner with the explorer walking across it from left to right
 * (its place is the progress; with reduced motion it stands still there), the timer below, and what to do
 * next: recall, wait, choose a push-on goal or claim. A running push-on shows its own progress with its
 * goal and its risk in words. `serverNow` is server time.
 */
export function RunningTrip({
  trip,
  creature,
  serverNow,
  busy,
  onClaim,
  onPushOn,
}: {
  trip: Trip;
  creature: Creature | undefined;
  serverNow: number;
  busy: boolean;
  onClaim: (trip: Trip) => void;
  onPushOn: (trip: Trip, goalId: string) => void;
}) {
  const status = tripStatus(trip, serverNow);
  const species = creature === undefined ? undefined : getSpecies(creature.species);
  const info = creature === undefined ? null : explorerInfo(creature);
  const keeps = recallKeeps(trip, serverNow);
  const pct = fillPct(status.fraction);
  const pushing = status.phase === 'pushing' && trip.pushOn !== null;
  const risky =
    pushing && trip.pushOn !== null ? goalDef(trip.pushOn.goalId)?.risk === 'risky' : false;
  const risk =
    pushing && trip.pushOn !== null
      ? riskWord(risky ? 'risky' : 'safe', trip.pushOn.oddsBp)
      : 'Safe';
  const twist =
    trip.twist === null ? null : expeditionContent.specials.twists.find((t) => t.id === trip.twist);
  const name = creature === undefined ? 'Explorer' : creatureName(creature);
  return (
    <li class="card-item trip-card">
      <Banner
        destination={trip.destination}
        {...(creature === undefined
          ? {}
          : {
              walker: {
                species: creature.species,
                shiny: creature.shiny,
                fraction: status.fraction,
                info,
                id: creature.id,
              },
            })}
      />
      <div class="trip-body">
        <h4 class="pix trip-title">
          {name} at {destinationName(trip.destination)}
        </h4>
        <p class="tags">
          {species !== undefined && <ElementChip element={species.element} />}
          {creature !== undefined && (
            <GlossaryTag entry="explorer-rank" look="chip" class="tag">
              {`Rank ${String(creature.explorer.rank)}`}
            </GlossaryTag>
          )}
          <span class="tag">{lengthLabel(trip.duration)} trip</span>
          {twist !== null && twist !== undefined && (
            <GlossaryTag entry="weekly-special" look="chip" class="badge shiny">
              {twist.name}
            </GlossaryTag>
          )}
        </p>
        {trip.kit.length > 0 && (
          <ul class="kit-line" aria-label="Supplies carried">
            {trip.kit.map((id) => (
              <li key={id}>
                <ExpIcon icon={{ kind: 'supply', id: supplyKindOf(id) ?? 'unknown' }} scale={2} />
                <span>{supplyName(id)}</span>
              </li>
            ))}
          </ul>
        )}
        <div
          class={`xp trip-bar${pushing ? ' pushing' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={`${name}'s ${pushing ? 'push-on' : 'trip'}: ${String(Math.floor(pct))}% done`}
        >
          <span ref={cssVars({ '--pct': `${String(pct)}%` })} />
        </div>
        <p class={`trip-timer${status.phase === 'ready' ? ' ready' : ''}`} aria-live="off">
          {statusText(trip, status)}
        </p>
        {pushing && trip.pushOn !== null && (
          <p class={`push-line${risky ? ' risky' : ''}`}>
            <GlossaryTag
              entry={GLOSSARY_IDS.goal(risky ? 'risky' : 'safe')}
              look="chip"
              class="tag"
            >
              {risk}
            </GlossaryTag>{' '}
            {risky ? 'If it fails, the whole trip brings nothing back.' : 'It always works.'}
          </p>
        )}
        {status.phase === 'choice' && trip.offer !== null ? (
          <PushOnChoice
            goals={trip.offer.goals}
            busy={busy}
            onPick={(goalId) => {
              onPushOn(trip, goalId);
            }}
            onHome={() => {
              onClaim(trip);
            }}
          />
        ) : (
          <button
            type="button"
            class={status.claim === 'claim' ? 'primary' : ''}
            disabled={busy}
            onClick={() => {
              onClaim(trip);
            }}
          >
            {status.claim === 'claim'
              ? 'Claim'
              : status.claim === 'early'
                ? 'Come home now (skips the push-on)'
                : `Recall (keeps ${String(keeps)} ${keeps === 1 ? 'catch' : 'catches'})`}
          </button>
        )}
      </div>
    </li>
  );
}
