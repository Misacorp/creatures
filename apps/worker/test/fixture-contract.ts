/**
 * What the five contract-fixture pairs (`*-fixtures.test.ts` and `*-scenario.ts`) share: the shape
 * comparison and the recorder that collects a scenario's responses, errors and request bodies.
 */
import { PART_KINDS } from '@creatures/game';
import { expect } from 'vitest';

/** What a scenario hands back: the raw material of the fixture files (see `fixture-sets.ts`). */
export interface Captured {
  /** Named responses: bodies of successful calls. */
  responses: Record<string, unknown>;
  /** Real error bodies: `{ route, status, body }`. */
  errors: { route: string; status: number; body: unknown }[];
  /** Request bodies the client sends, `{ path, method, body }`, with real ids. */
  requests: Record<string, { path: string; method: string; body: unknown }>;
}

/** A call's answer: the HTTP status and the parsed body. */
export interface Json {
  status: number;
  body: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const PART_KIND_SET: ReadonlySet<string> = new Set(PART_KINDS);

/**
 * Keys and value types, recursively; arrays are the set of their elements' shapes. A map keyed by
 * ids (the creatures' HP by creature id) or by part kinds (what a grant paid) is one entry whatever
 * the keys are: those keys are data, not shape.
 */
export function shape(value: unknown): unknown {
  if (Array.isArray(value)) {
    const shapes = new Set(value.map((x) => JSON.stringify(shape(x))));
    return [...shapes].sort().map((s) => JSON.parse(s) as unknown);
  }
  if (value === null) return 'null';
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const keys = entries.map(([k]) => k);
    if (
      keys.length > 0 &&
      (keys.every((k) => UUID.test(k)) || keys.every((k) => PART_KIND_SET.has(k)))
    ) {
      const shapes = new Set(entries.map(([, x]) => JSON.stringify(shape(x))));
      return { '*': [...shapes].sort().map((s) => JSON.parse(s) as unknown) };
    }
    return Object.fromEntries(
      entries.sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, shape(x)]),
    );
  }
  return typeof value;
}

/** The live response has the fixture's shape; `hint` tells the reader what to do when it does not. */
export function expectSameShape(live: unknown, fixture: unknown, hint: string): void {
  expect(shape(live), hint).toEqual(shape(fixture));
}

export interface RecorderOptions {
  /** Where the results go; pass one object to several recorders (one per player) to share it. */
  captured?: Captured;
  /**
   * What `record` does with an answer that is not a 200: `throw` (the default; the scenario
   * expected it to work) or `collect` it as an error row.
   */
  failedRecord?: 'throw' | 'collect';
  /** Remember the request of every recorded call, with `null` for a call without a body. */
  everyRequest?: boolean;
}

/** `GET /api/x/<uuid>` as `GET /api/x/:id`. */
export const routeOf = (method: string, path: string): string =>
  `${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}`;

/**
 * The recorder of a scenario. `record` calls a route, remembers the request and stores the response
 * under `name`; `refuse` calls a route that must not answer 200 and stores the error row.
 */
export function createRecorder(
  call: (method: string, path: string, body?: unknown) => Promise<Json>,
  options: RecorderOptions = {},
) {
  const captured: Captured = options.captured ?? { responses: {}, errors: [], requests: {} };
  const failedRecord = options.failedRecord ?? 'throw';
  const errorRow = (method: string, path: string, res: Json): void => {
    captured.errors.push({ route: routeOf(method, path), status: res.status, body: res.body });
  };
  const record = async (
    name: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Json> => {
    const res = await call(method, path, body);
    if (res.status === 200) {
      captured.responses[name] = res.body;
      if (body !== undefined || options.everyRequest === true) {
        captured.requests[name] = { path, method, body: body ?? null };
      }
    } else if (failedRecord === 'throw') {
      throw new Error(`${method} ${path} failed: ${JSON.stringify(res.body)}`);
    } else {
      errorRow(method, path, res);
    }
    return res;
  };
  const refuse = async (method: string, path: string, body?: unknown): Promise<Json> => {
    const res = await call(method, path, body);
    if (res.status === 200) throw new Error(`${method} ${path} was meant to fail`);
    errorRow(method, path, res);
    return res;
  };
  return { record, refuse, captured };
}
