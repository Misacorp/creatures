/**
 * "Welcome back" (prototype, dev only): the popup the player meets after a while away (`systems/return.md`,
 * V-RET-0), played from the economy lab's journeys: two or three highlights of what happened, told as the Valley
 * Gazette, then "...and N more things" onto the valley, where the rest waits as markers. The tour strip's steps
 * are the daily player and the weekly player; its picker replays any visit, and Replay starts the popup again.
 */
import { registerProto } from '../registry';
import { Valley } from '../valley/Valley';
import '../valley/valley.css';
import '../valley/valley-scenes.css';
import './welcome.css';
import { DAILY, WEEKLY, replayTitle, type Journey } from './journey';
import { welcomeOf } from './highlights';
import { castOf, welcomeWorld } from './welcome-world';

const STEPS: readonly { id: string; title: string; journey: Journey }[] = [
  { id: 'daily', title: 'Gazette, daily player', journey: DAILY },
  { id: 'weekly', title: 'Gazette, weekly player', journey: WEEKLY },
];

registerProto({
  id: 'welcome',
  title: 'Welcome back',
  steps: STEPS.map(({ id, title }) => ({ id, title })),
  visits: (step) => {
    const found = STEPS[step - 1]?.journey ?? DAILY;
    return found.visits.map((_, i) => replayTitle(found, i));
  },
  render: ({ step, visit }) => {
    const chosen = STEPS[step - 1] ?? STEPS[0];
    if (chosen === undefined) return null;
    const index = Math.min(visit, chosen.journey.visits.length) - 1;
    const world = welcomeWorld();
    const cast = castOf(world);
    return (
      <Valley
        key={`${chosen.journey.id}-${String(index)}`}
        step={1}
        setStep={() => undefined}
        welcome={{
          world,
          cast,
          welcome: welcomeOf(chosen.journey, index, cast),
        }}
      />
    );
  },
});
