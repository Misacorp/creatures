import { ForecastCard } from '../../ForecastCard';
import { LivingRoom, sceneOf } from '../../LivingRoom';
import { SkyLine } from '../../SkyLine';
import { ROOM_SELF_ID, SKY_STATES, sampleForecast, sampleResidents } from '../data';
import { bool, str } from '../props';
import type { Entry } from '../types';

const SKY_OPTIONS: readonly string[] = SKY_STATES;

const forecastOf = (state: string) => sampleForecast(state);

const forecastCard: Entry = {
  name: 'ForecastCard',
  file: 'apps/activity/src/ForecastCard.tsx',
  group: 'Popovers',
  description:
    'What the wall calendar opens: today and tomorrow, each with its Boon and its Omen by name and what they do, in the server’s own words with the real numbers at the day’s strength. A wild Omen tomorrow gets a warning line.',
  controls: { sky: { kind: 'select', options: SKY_OPTIONS } },
  defaults: { sky: 'boon and omen' },
  presets: [
    { name: 'A Boon and an Omen (rank 6 to 9)', props: {} },
    { name: 'A Boon only (no Omens yet, or a Festival)', props: { sky: 'boon only' } },
    { name: 'A wild Omen tomorrow', props: { sky: 'wild omen tomorrow' } },
    { name: 'Rank 14 (the strongest)', props: { sky: 'rank 14 (strong)' } },
    { name: 'No forecast yet', props: { sky: 'loading' } },
  ],
  render: (p) => (
    <div class="popover popover-wide wb-static-popover">
      <ForecastCard forecast={forecastOf(str(p, 'sky'))} />
    </div>
  ),
};

const skyLine: Entry = {
  name: 'SkyLine',
  file: 'apps/activity/src/SkyLine.tsx',
  group: 'Creatures & game pieces',
  description:
    'The one compact line about the sky on the raid card and on the dungeon card: a small sun, cloud or storm and "Sky today: Fair Winds and Heavy Rain.", with a "?" for what a Boon and an Omen are. On the raid card it names the stage when the next stage runs tomorrow.',
  controls: {
    sky: { kind: 'select', options: SKY_OPTIONS },
    stageTomorrow: { kind: 'toggle' },
  },
  defaults: { sky: 'boon and omen', stageTomorrow: false },
  presets: [
    { name: 'Today (a Boon and an Omen)', props: {} },
    { name: 'A Boon only', props: { sky: 'boon only' } },
    { name: 'The next stage is tomorrow', props: { stageTomorrow: true } },
    {
      name: 'A wild Omen tomorrow, for the stage',
      props: { sky: 'wild omen tomorrow', stageTomorrow: true },
    },
    { name: 'No forecast (nothing is drawn)', props: { sky: 'loading' } },
  ],
  render: (p) => {
    const forecast = forecastOf(str(p, 'sky'));
    const stage =
      bool(p, 'stageTomorrow') && forecast?.tomorrow != null
        ? { at: forecast.tomorrow.startsAt + 3_600_000, name: 'Phase 2' }
        : null;
    return <SkyLine forecast={forecast} stage={stage} />;
  },
};

const weatherCalendar: Entry = {
  name: 'WeatherCalendar',
  file: 'apps/activity/src/WeatherCalendar.tsx',
  group: 'Creatures & game pieces',
  description:
    'The wall calendar of the living room: a paper page with today’s weather picture that sways a little, comes off the wall when the pointer or the keyboard is on it, opens the forecast when tapped and now and then says a short line about the day in a bubble. With reduced motion it keeps still. Shown in the room, between the lamp and the fireplace.',
  controls: { sky: { kind: 'select', options: SKY_OPTIONS }, night: { kind: 'toggle' } },
  defaults: { sky: 'boon and omen', night: true },
  presets: [
    { name: 'A Boon and an Omen', props: {} },
    { name: 'A Boon only (a sun)', props: { sky: 'boon only' } },
    { name: 'A wild Omen tomorrow', props: { sky: 'wild omen tomorrow' } },
    { name: 'Blank page (no forecast yet)', props: { sky: 'loading' } },
    { name: 'By day', props: { night: false } },
  ],
  render: (p) => (
    <LivingRoom
      residents={sampleResidents(3, false)}
      selfId={ROOM_SELF_ID}
      instanceId="workbench-sky"
      scene={sceneOf(bool(p, 'night') ? 'night' : 'day')}
      forecast={forecastOf(str(p, 'sky'))}
    />
  ),
};

export const skyEntries: readonly Entry[] = [forecastCard, skyLine, weatherCalendar];
