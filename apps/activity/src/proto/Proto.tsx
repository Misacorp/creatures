import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getProto, listProtos } from './registry';
import { parseRoute, routeHash, type Route } from './route';
import { LAST_STEP, TOUR_STEPS, clampStep } from './tour';

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

/** Two big buttons: one per prototype. */
function Chooser(): JSX.Element {
  return (
    <main class="proto-chooser">
      <h1>Prototypes</h1>
      <p>
        Two clickable concepts of the same Saturday morning, on sample data. Nothing here is saved.
      </p>
      <div class="proto-chooser-buttons">
        {listProtos().map((proto) => (
          <a
            key={proto.id}
            class="proto-chooser-button"
            href={routeHash({ proto: proto.id, step: 1, bare: false })}
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
  title,
  go,
}: {
  route: Route;
  title: string;
  go: (route: Route) => void;
}): JSX.Element {
  const to = (step: number): void => {
    go({ ...route, step: clampStep(step) });
  };
  return (
    <nav class="proto-strip" aria-label="Tour">
      <button
        type="button"
        onClick={() => {
          go({ proto: null, step: 1, bare: false });
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
        {String(route.step)}/{String(LAST_STEP)} {title}
      </span>
      <button
        type="button"
        disabled={route.step >= LAST_STEP}
        aria-label="Next step"
        onClick={() => {
          to(route.step + 1);
        }}
      >
        {'▶'}
      </button>
    </nav>
  );
}

export function Proto(): JSX.Element {
  const [route, go] = useRoute();
  const proto = route.proto === null ? undefined : getProto(route.proto);
  if (proto === undefined) return <Chooser />;
  const title = TOUR_STEPS[route.step - 1]?.title ?? '';
  return (
    <>
      {proto.render({
        step: route.step,
        setStep: (step) => {
          go({ ...route, step: clampStep(step) });
        },
      })}
      {route.bare ? null : <TourStrip route={route} title={title} go={go} />}
    </>
  );
}
