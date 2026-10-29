import { clampStep } from './tour';

/** Where the prototype page is: the chooser (no prototype), or one prototype at a step. */
export interface Route {
  proto: string | null;
  step: number;
  /** `bare=1`: no tour strip (the screenshots). */
  bare: boolean;
}

/**
 * Reads `location.hash`: `#<proto>?step=<n>` (and `&bare=1`). An empty hash is the chooser; a bad or missing
 * step is 1. The prototype id is not checked here (the page shows the chooser for an unknown one).
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
  };
}

/** The hash for a route. */
export function routeHash(route: Route): string {
  if (route.proto === null) return '';
  const bare = route.bare ? '&bare=1' : '';
  return `#${route.proto}?step=${String(route.step)}${bare}`;
}
