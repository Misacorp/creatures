import { clampStep } from './tour';

/** Where the prototype page is: the chooser (no prototype), or one prototype at a step. */
export interface Route {
  proto: string | null;
  step: number;
  /** `bare=1`: no tour strip (the screenshots). */
  bare: boolean;
  /** The visit within the step, from 1 (`visit=<n>`; the return walk's day picker). Others ignore it. */
  visit: number;
  /** How many times the step was replayed (`n=<count>`): a different value remounts the prototype. */
  replay: number;
}

/** A whole number from `min` to 999, else `fallback`. */
function wholeNumber(text: string | null, min: number, fallback: number): number {
  const n = Number.parseInt(text ?? '', 10);
  return Number.isInteger(n) && n >= min && n <= 999 ? n : fallback;
}

/**
 * Reads `location.hash`: `#<proto>?step=<n>` (and `&visit=<n>`, `&n=<count>`, `&bare=1`). An empty hash is
 * the chooser; a bad or missing step is 1. The prototype id is not checked here (the page shows the chooser
 * for an unknown one).
 */
export function parseRoute(hash: string): Route {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const [name = '', query = ''] = text.split('?', 2);
  const params = new URLSearchParams(query);
  const step = clampStep(Number.parseInt(params.get('step') ?? '1', 10));
  return {
    proto: /^[a-z][a-z0-9-]{0,30}$/.test(name) ? name : null,
    step,
    bare: params.get('bare') === '1',
    visit: wholeNumber(params.get('visit'), 1, 1),
    replay: wholeNumber(params.get('n'), 0, 0),
  };
}

/** The hash for a route. */
export function routeHash(route: Route): string {
  if (route.proto === null) return '';
  const visit = route.visit > 1 ? `&visit=${String(route.visit)}` : '';
  const replay = route.replay > 0 ? `&n=${String(route.replay)}` : '';
  const bare = route.bare ? '&bare=1' : '';
  return `#${route.proto}?step=${String(route.step)}${visit}${replay}${bare}`;
}
