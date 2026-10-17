import { GlossaryTag } from './Glossary';
import { SKY_GLYPHS } from './sprites/data/weather-sprites';
import { Sprite } from './sprites/Sprite';
import { skyLine } from './weather-view';
import type { Forecast } from './weather-types';

/**
 * The one compact line about the sky on the raid card and the dungeon card: a small sun, cloud or storm
 * and "Sky today: Fair Winds and Heavy Rain." (the raid card names the stage's day when the next stage is
 * tomorrow), with a "?" for what a Boon and an Omen are. Nothing when there is no forecast. Text only.
 */
export function SkyLine({
  forecast,
  stage,
}: {
  forecast: Forecast | null;
  /** The raid's next stage (its time and name), when the line is for one. */
  stage?: { at: number; name: string } | null;
}) {
  const line = skyLine(forecast, stage ?? null);
  if (line === null || line.kind === 'blank') return null;
  return (
    <p class="sky-line">
      <Sprite sprite={SKY_GLYPHS[line.kind]} scale={2} />
      <span>
        {line.label}: <strong>{line.names}</strong>.
      </span>
      <GlossaryTag entry="forecast" look="help" />
    </p>
  );
}
