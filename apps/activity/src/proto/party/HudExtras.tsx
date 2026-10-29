import { useRef, useState } from 'preact/hooks';
import { ForecastCard } from '../../ForecastCard';
import { Sprite } from '../../sprites/Sprite';
import { calendarSprite } from '../../sprites/data/weather-sprites';
import { Popover, popupProps } from '../../ui/Popover';
import { skyKind } from '../../weather-view';
import { sampleForecast } from '../../workbench/data';
import type { PartyState, StationId } from './party-state';
import { STATIONS } from './stations';

const forecast = sampleForecast('boon and omen');

/**
 * The HUD's left end: today's weather (opens the forecast) and the cog. The cog holds Settings and How
 * to play; with `&hatch=1` it also lists the places, one button each (the optional escape hatch).
 */
export function HudExtras({
  state,
  hatch,
  onPlace,
}: {
  state: PartyState;
  hatch: boolean;
  onPlace: (id: StationId) => void;
}) {
  const skyRef = useRef<HTMLButtonElement>(null);
  const cogRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<'sky' | 'cog' | null>(null);
  void state;
  return (
    <>
      <button
        ref={skyRef}
        type="button"
        class="pp-hud-btn"
        aria-label="Today's weather"
        {...popupProps(open === 'sky')}
        onClick={() => {
          setOpen((o) => (o === 'sky' ? null : 'sky'));
        }}
      >
        <Sprite sprite={calendarSprite(skyKind(forecast?.today ?? null))} scale={2} />
      </button>
      <span class="pp-hud-gap" />
      <button
        ref={cogRef}
        type="button"
        class="pp-hud-btn pp-cog"
        aria-label="Menu"
        {...popupProps(open === 'cog')}
        onClick={() => {
          setOpen((o) => (o === 'cog' ? null : 'cog'));
        }}
      >
        <svg viewBox="0 0 9 9" aria-hidden="true" shape-rendering="crispEdges">
          <path d="M3 0h3v1h1v1h1v1h1v3h-1v1h-1v1h-1v1h-3v-1h-1v-1h-1v-1h-1v-3h1v-1h1v-1h1zM4 3v3h1v-3z" />
        </svg>
      </button>
      {open === 'sky' && (
        <Popover
          layer="page"
          size="compact"
          anchor={() => skyRef.current}
          label="Forecast"
          onClose={() => {
            setOpen(null);
          }}
        >
          <ForecastCard forecast={forecast} />
        </Popover>
      )}
      {open === 'cog' && (
        <Popover
          layer="page"
          size="compact"
          anchor={() => cogRef.current}
          label="Menu"
          onClose={() => {
            setOpen(null);
          }}
        >
          <div class="pp-menu pix-panel">
            {hatch && (
              <ul class="pp-places" aria-label="Places">
                {STATIONS.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(null);
                        onPlace(s.id);
                      }}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p class="pp-menu-note">Settings and How to play live here (not in this prototype).</p>
          </div>
        </Popover>
      )}
    </>
  );
}
