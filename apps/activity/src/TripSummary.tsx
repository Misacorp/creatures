import type { ComponentChildren } from 'preact';
import { usePopoverHost } from './PopoverHost';
import { SupplyCard } from './SupplyCard';
import { backAtText } from './time-format';
import { supplyOptions } from './trip-view';
import type { WeatherEntry } from './weather-types';

/** One supply of the summary: a dotted-underline button that opens that supply's item card in a popover. */
function SupplyLink({ id }: { id: string }) {
  const host = usePopoverHost();
  const view = supplyOptions({}).find((o) => o.id === id);
  if (view === undefined) return <span>{id}</span>;
  if (host === null) return <span>{view.name}</span>;
  return (
    <button
      type="button"
      class="gtag"
      onClick={(event) => {
        host.openCustom(`trip-summary-${id}`, event.currentTarget, {
          label: view.name,
          body: <SupplyCard view={view} />,
        });
      }}
    >
      {view.name}
    </button>
  );
}

/** A word that opens a small popover with a name and its lines (a Boon, an Omen, the week's twist). */
function NoteLink({
  id,
  label,
  name,
  lines,
}: {
  id: string;
  label: string;
  name: string;
  lines: readonly string[];
}) {
  const host = usePopoverHost();
  if (host === null) return <span>{label}</span>;
  return (
    <button
      type="button"
      class="gtag"
      onClick={(event) => {
        host.openCustom(`trip-note-${id}`, event.currentTarget, {
          label: name,
          body: (
            <div class="trip-note">
              <p class="pix">{name}</p>
              {lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ),
        });
      }}
    >
      {label}
    </button>
  );
}

/** "A and B", "A, B and C". */
function joined(items: readonly ComponentChildren[]): ComponentChildren {
  return items.map((item, i) => (
    <>
      {i > 0 && (i === items.length - 1 ? ' and ' : ', ')}
      {item}
    </>
  ));
}

/**
 * The trip's settings in one short line of body text: how long, where, who, the packed supplies (each a
 * button for its card) and a treat, then when it is back in the guild's local time. The treat is only read
 * from the send screen's state (`treat`), not worked out here.
 */
export function TripSummary({
  duration,
  place,
  explorer,
  supplies,
  treat,
  now,
  endsAt,
  timezone,
  boon = null,
  omen = null,
  twist = null,
}: {
  /** "12 h". */
  duration: string;
  place: string | null;
  explorer: string | null;
  /** The packed supplies' ids. */
  supplies: readonly string[];
  treat: boolean;
  now: number;
  /** When the trip would end if sent now; null when it is not known. */
  endsAt: number | null;
  timezone: string | null;
  /** Today's Boon and Omen; shown only when they change trips. */
  boon?: WeatherEntry | null;
  omen?: WeatherEntry | null;
  /** The week's twist, when the trip goes to this week's special place. */
  twist?: { name: string; description: string } | null;
}) {
  const back = endsAt !== null && timezone !== null ? backAtText(now, endsAt, timezone) : null;
  const extras = [
    ...supplies.map((id) => <SupplyLink key={id} id={id} />),
    ...(treat ? ['a treat'] : []),
  ];
  const notes = [
    ...(boon !== null && boon.trips.length > 0
      ? [
          <NoteLink
            key="boon"
            id="boon"
            label={`Boon: ${boon.name}`}
            name={boon.name}
            lines={boon.trips}
          />,
        ]
      : []),
    ...(omen !== null && omen.trips.length > 0
      ? [
          <NoteLink
            key="omen"
            id="omen"
            label={`Omen: ${omen.name}`}
            name={omen.name}
            lines={omen.trips}
          />,
        ]
      : []),
    ...(twist === null
      ? []
      : [
          <NoteLink
            key="twist"
            id="twist"
            label={`Weekly twist: ${twist.name}`}
            name={twist.name}
            lines={[twist.description]}
          />,
        ]),
  ];
  return (
    <p class="trip-summary">
      {duration} trip{place === null ? '' : ` to ${place}`}
      {explorer === null ? '' : ` with ${explorer}`}
      {extras.length > 0 && <>, carrying {joined(extras)}</>}
      {back === null ? '.' : `. ${back.charAt(0).toUpperCase()}${back.slice(1)}.`}
      {notes.length > 0 && <> Also in play: {joined(notes)}.</>}
    </p>
  );
}
