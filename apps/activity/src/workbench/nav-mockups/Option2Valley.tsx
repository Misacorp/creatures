import { useEffect, useRef, useState } from 'preact/hooks';
import { cssVars } from '../../css-vars';
import { drawSprites } from '../../room-canvas';
import type { Tab } from '../../tabs';
import { DataTable } from '../../ui/DataTable';
import { SidePanel } from '../../ui/SidePanel';
import { WideLayout } from '../../ui/WideLayout';
import { MOCK_ALERTS, pipCount, tabLabel } from './nav-data';
import { HudTools } from './NavParts';
import { NavPanel, NavScreen, ownsPanel } from './NavScreens';
import {
  VALLEY_PHONE,
  VALLEY_WIDE,
  placeSize,
  valleyPieces,
  type ValleyLayout,
  type ValleyPlace,
} from './valley-art';

/**
 * Option 2, "The valley is the menu": the home screen is a pixel valley (the world map's art) with a
 * landmark for each place. Tap one to go in. Inside, a slim HUD keeps the currencies and a "Valley" button
 * that goes home; it shows how many other places have something waiting. On a wide window the valley is the
 * main area and a tapped place opens in the side panel first (as on the Expeditions map); its gold button
 * goes in.
 */

const SCALE = 2;

/** What a place's name plate says under its name when something waits there (the pip's reason). */
const WAITING: Readonly<Record<string, string>> = {
  workshop: 'Job ready',
  expeditions: 'Trip is home',
  games: 'Events to enter',
  dungeon: 'Run is open',
};

function ValleyScene({
  layout,
  selected,
  onPick,
}: {
  layout: ValleyLayout;
  selected: Tab | null;
  onPick: (tab: Tab) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = layout.width * SCALE;
  const height = layout.height * SCALE;
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawSprites(ctx, valleyPieces(layout), SCALE, 0, { width, height });
  }, [layout, width, height]);
  return (
    <div
      class="nm-valley"
      ref={cssVars({ '--vw': `${String(width)}px`, '--vh': `${String(height)}px` })}
    >
      <canvas
        ref={canvas}
        class="nm-valley-canvas"
        width={width}
        height={height}
        aria-hidden="true"
      />
      <ul class="nm-places" aria-label="Places in the valley">
        {layout.places.map((place) => (
          <li key={place.tab}>
            <Place place={place} selected={place.tab === selected} onPick={onPick} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Place({
  place,
  selected,
  onPick,
}: {
  place: ValleyPlace;
  selected: boolean;
  onPick: (tab: Tab) => void;
}) {
  const size = placeSize(place);
  const waiting = WAITING[place.tab];
  const reason = MOCK_ALERTS[place.tab];
  return (
    <button
      type="button"
      class={selected ? 'nm-place selected' : 'nm-place'}
      data-place={place.tab}
      ref={cssVars({
        '--px-x': `${String(place.x * SCALE)}px`,
        '--px-y': `${String(place.y * SCALE)}px`,
        '--px-w': `${String(size.width * SCALE)}px`,
        '--px-h': `${String(size.height * SCALE)}px`,
      })}
      onClick={() => {
        onPick(place.tab);
      }}
    >
      <span class="nm-plate pix">
        {tabLabel(place.tab)}
        {waiting !== undefined && <span class="nm-plate-note">{waiting}</span>}
      </span>
      {reason !== null && (
        <>
          <span class="tab-pip" aria-hidden="true" />
          <span class="visually-hidden">, {reason}</span>
        </>
      )}
    </button>
  );
}

function BackButton({ from, onBack }: { from: Tab; onBack: () => void }) {
  const others = pipCount(MOCK_ALERTS, from);
  return (
    <button type="button" class="nm-back" aria-label="Back to the valley" onClick={onBack}>
      <span class="nm-back-arrow" aria-hidden="true">
        {'<'}
      </span>
      <span class="nm-back-word">Valley</span>
      {others > 0 && (
        <span class="nm-back-count" aria-label={`${String(others)} places need you`}>
          {others}
        </span>
      )}
    </button>
  );
}

function PlaceSummary({ tab, onEnter }: { tab: Tab; onEnter: () => void }) {
  return (
    <SidePanel
      title={tabLabel(tab)}
      titleId="nm-panel-title"
      footer={
        <button type="button" class="primary" onClick={onEnter}>
          Enter {tabLabel(tab)}
        </button>
      }
    >
      <p class="nm-panel-note">
        {MOCK_ALERTS[tab] === null ? 'Nothing is waiting.' : `Waiting: ${MOCK_ALERTS[tab] ?? ''}.`}
      </p>
      <DataTable rows={FACTS[tab].map(([label, value]) => ({ label, value }))} />
    </SidePanel>
  );
}

/** A few facts for the side panel of each place (sample numbers). */
const FACTS: Readonly<Record<Tab, readonly (readonly [string, string])[]>> = {
  collection: [
    ['Creatures', '9'],
    ['Need you', '2'],
    ['Lounging', 'Lanternfin'],
  ],
  workshop: [
    ['Jobs running', '2 / 3'],
    ['Ready to claim', '1'],
    ['Bag', '38 / 60'],
  ],
  expeditions: [
    ['Trips out', '3 / 4'],
    ['Home now', '1'],
    ['Explorer rank', '3'],
  ],
  games: [
    ['Events entered', '1 / 4'],
    ['Show starts in', '3h 12m'],
    ['Medals', '7'],
  ],
  dungeon: [
    ["Today's run", 'Open'],
    ['Streak', '4 days'],
    ['Deepest floor', '9'],
  ],
  raid: [
    ['Boss', 'Old Bogback'],
    ['Team placed', '3 / 5'],
    ['Finale in', '2 days'],
  ],
};

export function Option2Valley({ wide, start }: { wide: boolean; start: Tab | null }) {
  // `open` is the place whose screen is showing; null is the valley itself.
  const [open, setOpen] = useState<Tab | null>(start);
  const [selected, setSelected] = useState<Tab | null>(wide ? 'games' : null);
  const hud = (
    <header class="nm-hud">
      {open === null ? (
        <h1 class="nm-hud-title pix">The Valley</h1>
      ) : (
        <>
          <BackButton
            from={open}
            onBack={() => {
              setOpen(null);
            }}
          />
          <h1 class="nm-hud-title pix">{tabLabel(open)}</h1>
        </>
      )}
      <HudTools />
    </header>
  );
  if (wide) {
    return (
      <div class="nm nm-wide-top nm-o2">
        {hud}
        <div class="nm-scroll">
          {open === null ? (
            <WideLayout
              wide
              class="nm-valley-layout"
              main={<ValleyScene layout={VALLEY_WIDE} selected={selected} onPick={setSelected} />}
              panel={
                selected === null ? null : (
                  <PlaceSummary
                    tab={selected}
                    onEnter={() => {
                      setOpen(selected);
                    }}
                  />
                )
              }
            />
          ) : ownsPanel(open) ? (
            <NavScreen tab={open} wide />
          ) : (
            <WideLayout wide main={<NavScreen tab={open} wide />} panel={<NavPanel tab={open} />} />
          )}
        </div>
      </div>
    );
  }
  return (
    <div class="nm nm-phone-top nm-o2">
      {hud}
      <div class="nm-scroll">
        {open === null ? (
          <ValleyScene layout={VALLEY_PHONE} selected={null} onPick={setOpen} />
        ) : (
          <NavScreen tab={open} wide={false} />
        )}
      </div>
    </div>
  );
}
