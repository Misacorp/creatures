import { PopoverCard } from './ui/Popover';
import { Sprite } from './sprites/Sprite';
import { calendarSprite } from './sprites/data/weather-sprites';
import { entryLines, skyKind, skyNames } from './weather-view';
import type { Forecast, WeatherDay, WeatherEntry } from './weather-types';

/** One Boon or Omen: what it is, and what it does, in the server's own words (the numbers are real). */
function Entry({ kind, entry }: { kind: 'Boon' | 'Omen'; entry: WeatherEntry }) {
  const lines = entryLines(entry);
  return (
    <div class={`sky-entry sky-${kind.toLowerCase()}`}>
      <p class="sky-name">
        <span class="sky-kind pix">{kind}</span> <strong>{entry.name}</strong>
      </p>
      {lines.length > 0 && (
        <ul class="sky-lines">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Day({ title, day }: { title: string; day: WeatherDay | null }) {
  return (
    <section class="sky-day" aria-label={title}>
      <p class="sky-day-title pix">{title}</p>
      {day === null ? (
        <p class="muted">Not known yet.</p>
      ) : (
        <>
          <Entry kind="Boon" entry={day.boon} />
          {day.omen === null ? (
            <p class="muted sky-none">No Omen.</p>
          ) : (
            <Entry kind="Omen" entry={day.omen} />
          )}
        </>
      )}
    </section>
  );
}

/**
 * What the wall calendar opens: today's and tomorrow's Boon and Omen of the whole valley. Lean: the names
 * and what they do, nothing else (the flavour is for the compendium and the calendar's bubbles). A wild
 * Omen says so, so nobody is surprised by a bad Sunday.
 */
export function ForecastCard({ forecast }: { forecast: Forecast | null }) {
  const today = forecast?.today ?? null;
  return (
    <PopoverCard
      visual={<Sprite sprite={calendarSprite(skyKind(today))} scale={4} />}
      title="Forecast"
      short={today === null ? 'No forecast yet.' : skyNames(today)}
    >
      <div class="sky-days">
        <Day title="Today" day={today} />
        <Day title="Tomorrow" day={forecast?.tomorrow ?? null} />
      </div>
      {forecast?.tomorrow?.wild === true && (
        <p class="sky-wild">A wild Omen is coming tomorrow. Plan for it.</p>
      )}
    </PopoverCard>
  );
}
