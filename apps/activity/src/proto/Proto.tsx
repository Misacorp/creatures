import { Fragment, type JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getProto, listProtos, type Prototype } from './registry';
import { parseRoute, routeHash, type Route } from './route';

/** The route in the address now; it follows the back button and edits to the hash. */
function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  const go = (next: Route): void => {
    window.location.hash = routeHash(next);
  };
  return [route, go];
}

/** The chooser's own route fields: no prototype, step 1, the strip showing. */
const START: Route = { proto: null, step: 1, bare: false, visit: 1, replay: 0 };

/** Two big buttons: one per prototype. */
function Chooser(): JSX.Element {
  return (
    <main class="proto-chooser">
      <h1>Prototypes</h1>
      <p>Clickable concepts on sample data. Nothing here is saved.</p>
      <div class="proto-chooser-buttons">
        {listProtos().map((proto) => (
          <a
            key={proto.id}
            class="proto-chooser-button"
            href={routeHash({ ...START, proto: proto.id })}
          >
            {proto.title}
          </a>
        ))}
      </div>
    </main>
  );
}

/**
 * The tour strip: a small dev control at the bottom corner (not a game menu): back to the chooser,
 * and the previous and next step of the tour. Hidden with `&bare=1`.
 */
function TourStrip({
  route,
  proto,
  go,
}: {
  route: Route;
  proto: Prototype;
  go: (route: Route) => void;
}): JSX.Element {
  const last = lastStep(proto);
  const title = proto.steps[route.step - 1]?.title ?? '';
  const visits = proto.visits?.(route.step) ?? [];
  // A prototype with a sheet over its bottom (the welcome-back popup) keeps its controls at the top, folded
  // away behind one small "Dev" button, so they never cover the sheet's own button.
  const folds = visits.length > 0;
  const [open, setOpen] = useState(!folds);
  const to = (step: number): void => {
    go({ ...route, step: Math.min(Math.max(step, 1), last), replay: 0 });
  };
  if (folds && !open) {
    return (
      <nav class="proto-strip proto-strip-top proto-strip-folded" aria-label="Tour">
        <button
          type="button"
          aria-expanded="false"
          onClick={() => {
            setOpen(true);
          }}
        >
          Dev
        </button>
      </nav>
    );
  }
  return (
    <nav class={`proto-strip${folds ? ' proto-strip-top' : ''}`} aria-label="Tour">
      {folds && (
        <button
          type="button"
          aria-expanded="true"
          aria-label="Fold the dev controls"
          onClick={() => {
            setOpen(false);
          }}
        >
          {'▲'}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          go(START);
        }}
      >
        Prototypes
      </button>
      <button
        type="button"
        disabled={route.step <= 1}
        aria-label="Previous step"
        onClick={() => {
          to(route.step - 1);
        }}
      >
        {'◀'}
      </button>
      <span class="proto-strip-step">
        {String(route.step)}/{String(last)} {title}
      </span>
      <button
        type="button"
        disabled={route.step >= last}
        aria-label="Next step"
        onClick={() => {
          to(route.step + 1);
        }}
      >
        {'▶'}
      </button>
      {visits.length > 0 && (
        <>
          <select
            class="proto-strip-visit"
            aria-label="Visit to replay"
            value={String(route.visit)}
            onChange={(e) => {
              go({ ...route, visit: Number.parseInt(e.currentTarget.value, 10), replay: 0 });
            }}
          >
            {visits.map((label, i) => (
              <option key={label} value={String(i + 1)}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              go({ ...route, replay: route.replay + 1 });
            }}
          >
            Replay
          </button>
        </>
      )}
    </nav>
  );
}

/** The number of the last step of a prototype (its own list; the shared tour has seven). */
function lastStep(proto: Prototype): number {
  return Math.max(1, proto.steps.length);
}

export function Proto(): JSX.Element {
  const [routeRead, go] = useRoute();
  const proto = routeRead.proto === null ? undefined : getProto(routeRead.proto);
  if (proto === undefined) return <Chooser />;
  const last = lastStep(proto);
  const route = { ...routeRead, step: Math.min(routeRead.step, last) };
  const visits = proto.visits?.(route.step).length ?? 0;
  const visit = Math.min(route.visit, Math.max(1, visits));
  return (
    <>
      {/* A replay (or another visit) remounts the prototype, so it starts from its first moment. */}
      <Fragment key={`${String(visit)}-${String(route.replay)}`}>
        {proto.render({
          step: route.step,
          visit,
          setStep: (step) => {
            go({ ...route, step: Math.min(Math.max(step, 1), last) });
          },
        })}
      </Fragment>
      {route.bare ? null : <TourStrip route={{ ...route, visit }} proto={proto} go={go} />}
    </>
  );
}
