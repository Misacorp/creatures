/**
 * "Welcome back" (prototype, dev only): the popup the player meets after a while away (`systems/return.md`,
 * V-RET-0), played from the economy lab's journeys: two or three highlights of what happened, told as a comic
 * strip or as the Valley Gazette, then "...and N more things" onto the valley, where the rest waits as markers.
 * The tour strip's steps are the two looks of the daily player and of the weekly player (so the same visit
 * can be compared in both); its picker replays any visit, and Replay starts the popup again.
 */
import { registerProto } from '../registry';
import { Valley } from '../valley/Valley';
import '../valley/valley.css';
import '../valley/valley-scenes.css';
import './welcome.css';
import { DAILY, WEEKLY, replayTitle, type Journey } from './journey';
import { welcomeOf } from './highlights';
import type { Look } from './WelcomeSheet';
import { castOf, welcomeWorld } from './welcome-world';

const STEPS: readonly { id: string; title: string; journey: Journey; look: Look }[] = [
  { id: 'comic-daily', title: 'Comic strip, daily player', journey: DAILY, look: 'comic' },
  { id: 'gazette-daily', title: 'Gazette, daily player', journey: DAILY, look: 'gazette' },
  { id: 'comic-weekly', title: 'Comic strip, weekly player', journey: WEEKLY, look: 'comic' },
  { id: 'gazette-weekly', title: 'Gazette, weekly player', journey: WEEKLY, look: 'gazette' },
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
        key={`${chosen.journey.id}-${String(index)}-${chosen.look}`}
        step={1}
        setStep={() => undefined}
        welcome={{
          world,
          cast,
          welcome: welcomeOf(chosen.journey, index, cast),
          look: chosen.look,
        }}
      />
    );
  },
});
