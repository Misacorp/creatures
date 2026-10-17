import { ForecastCard } from './ForecastCard';
import { cssVars } from './css-vars';
import { usePopoverTrigger } from './PopoverHost';
import { CALENDAR_SPOT } from './sprites/room-art';
import { Sprite } from './sprites/Sprite';
import { calendarSprite } from './sprites/data/weather-sprites';
import { popupProps } from './ui/Popover';
import { useCalendarBubble } from './use-calendar-bubble';
import { calendarLabel, skyKind } from './weather-view';
import type { Forecast } from './weather-types';

/**
 * The wall calendar of the living room: one page of it, with the weather picture of today (a sun, a
 * cloud with an Omen, a storm with a wild one). It hangs on the wall, sways a little, pops out of the
 * background when the pointer or the keyboard is on it and settles back; tapping opens the forecast
 * (today's and tomorrow's Boon and Omen), and now and then it says a short line about the day in a bubble,
 * like the creatures do. Everything moves with CSS only and stops when the player prefers reduced motion
 * (`living-room.css`). The words are the server's, shown as text.
 */
export function WeatherCalendar({
  forecast,
  scale,
  originX,
}: {
  /** Null until the first forecast arrives: the page is blank. */
  forecast: Forecast | null;
  /** Screen pixels per room pixel, and where the room starts in the stage (as the creatures' spots use them). */
  scale: number;
  originX: number;
}) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  const line = useCalendarBubble(forecast);
  const picture = skyKind(forecast?.today ?? null);
  const label = calendarLabel(forecast);
  return (
    <div
      class="room-calendar"
      data-sky={picture}
      ref={cssVars({
        '--x': `${String(originX + CALENDAR_SPOT.x * scale)}px`,
        '--y': `${String(CALENDAR_SPOT.y * scale)}px`,
      })}
    >
      <button
        ref={ref}
        type="button"
        class="calendar-button"
        {...popupProps(open)}
        aria-label={label}
        onClick={() => {
          if (ref.current === null) return;
          host?.openCustom('room-calendar', ref.current, {
            label: 'Forecast',
            body: <ForecastCard forecast={forecast} />,
          });
        }}
      >
        <Sprite sprite={calendarSprite(picture)} scale={scale} class="calendar-page" />
      </button>
      {line !== null && (
        <span class="room-bubble calendar-bubble" aria-hidden="true">
          {line}
        </span>
      )}
    </div>
  );
}
