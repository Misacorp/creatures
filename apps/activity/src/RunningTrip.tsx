import { Tag } from './ui/Tag';
import { GLOSSARY_IDS, expeditionContent, goalDef } from '@creatures/game';
import type { Creature } from './api';
import { Banner } from './Banner';
import type { Trip } from './expedition-types';
import { percent } from './progress-math';
import { GameIcon } from './ui/GameIcon';
import { TimerBar } from './ui/TimerBar';
import { creatureName, getSpecies } from './game';
import { PushOnChoice } from './PushOnChoice';
import { riskWord } from './push-on-view';
import { explorerInfo } from './send-view';
import { ElementChip } from './sprites/ElementChip';
import { formatCountdown } from './time-format';
import {
  destinationName,
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
      return `Back in ${formatCountdown(status.remainingMs, 'hms')}`;
    case 'pushing':
      return `Pushing on${trip.pushOn === null ? '' : `: ${goalName(trip.pushOn.goalId)}`}. Back in ${formatCountdown(status.remainingMs, 'hms')}`;
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
  const pct = percent(status.fraction, 1);
  const pushing = status.phase === 'pushing' && trip.pushOn !== null;
  // The leg the bar times: the push-on while it runs, the trip itself otherwise.
  const leg = pushing && trip.pushOn !== null ? trip.pushOn : trip;
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
            <Tag entry="explorer-rank">{`Rank ${String(creature.explorer.rank)}`}</Tag>
          )}
          <Tag>{lengthLabel(trip.duration)} trip</Tag>
          {twist !== null && twist !== undefined && (
            <Tag kind="badge" tone="shiny" entry="weekly-special">
              {twist.name}
            </Tag>
          )}
        </p>
        {trip.kit.length > 0 && (
          <ul class="kit-line" aria-label="Supplies carried">
            {trip.kit.map((id) => (
              <li key={id}>
                <GameIcon icon={{ kind: 'supply', id: supplyKindOf(id) ?? 'unknown' }} scale={2} />
                <span>{supplyName(id)}</span>
              </li>
            ))}
          </ul>
        )}
        <TimerBar
          class="trip-bar"
          startedAt={leg.startedAt}
          endsAt={leg.endsAt}
          now={serverNow}
          ready={status.phase === 'ready'}
          tone={pushing ? 'spark' : undefined}
          label={`${name}'s ${pushing ? 'push-on' : 'trip'}: ${String(Math.floor(pct))}% done`}
          state={statusText(trip, status)}
        />
        {pushing && trip.pushOn !== null && (
          <p class={`push-line${risky ? ' risky' : ''}`}>
            <Tag entry={GLOSSARY_IDS.goal(risky ? 'risky' : 'safe')}>{risk}</Tag>{' '}
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
