/**
 * "Return walk" (prototype, dev only): coming back to the valley as a short walk (`systems/return.md`), played
 * from the economy lab's journeys. Step 1 is the daily player's four weeks, step 2 the weekly player's; the
 * strip's picker replays any visit of the step. The valley prototype's own tour is untouched.
 */
import { registerProto } from '../registry';
import { Valley } from '../valley/Valley';
import '../valley/valley.css';
import '../valley/valley-scenes.css';
import './walk.css';
import { DAILY, WEEKLY, replayTitle, type Journey } from './journey';
import { planOf } from './walk-plan';
import { castOf, walkWorld } from './walk-world';

const JOURNEYS: readonly { id: string; title: string; journey: Journey }[] = [
  { id: 'daily', title: 'Daily player', journey: DAILY },
  { id: 'weekly', title: 'Weekly player', journey: WEEKLY },
];

registerProto({
  id: 'walk',
  title: 'Return walk',
  steps: JOURNEYS.map(({ id, title }) => ({ id, title })),
  visits: (step) => {
    const found = JOURNEYS[step - 1]?.journey ?? DAILY;
    return found.visits.map((_, i) => replayTitle(found, i));
  },
  render: ({ step, visit }) => {
    const journey = JOURNEYS[step - 1]?.journey ?? DAILY;
    const index = Math.min(visit, journey.visits.length) - 1;
    const world = walkWorld();
    const plan = planOf(journey, index, castOf(world));
    return (
      <Valley
        key={`${journey.id}-${String(index)}`}
        step={1}
        setStep={() => undefined}
        walk={{ world, cast: castOf(world), plan }}
      />
    );
  },
});
