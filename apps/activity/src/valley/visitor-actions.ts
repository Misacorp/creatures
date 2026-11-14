/**
 * What the visitor's buttons do (phase 5 step 8b): the read of him, a reroll and the week's blueprint. The two spends carry an idempotency
 * key from the runner (the same one while the outcome is unknown, so a retry can never spend twice; `actions.ts`), and the server decides
 * everything. A reroll changed one piece's lines, so the gear view is fetched fresh inside the same keyed call (a failed fetch then keeps
 * the key, and the retry returns the stored result and takes nothing more). When he has left (409 `visitor_away`, before any spend) his
 * view turns to away and his place becomes his shuttered spot. Plain code with injected parts, so it is tested without the game screen.
 */
import { ActionIds } from '../actions';
import type { ActionRunner } from '../action-runner';
import {
  ApiError,
  buyVisitorBlueprint,
  fetchVisitor,
  rerollWithVisitor,
  type GameState,
  type ValleyAnswer,
  type VisitorState,
} from '../api';
import { fetchGear } from '../gear-api';
import type { GearItem, GearState } from '../gear-types';
import type { BlueprintDone, RerollDone, VisitorActions } from './VisitorPage';
import { isHere, type VisitorHere } from './visitor-view';

/** What `Game` gives the actions. */
export interface VisitorDeps {
  run: ActionRunner['run'];
  runKeyed: ActionRunner['runKeyed'];
  /** The bag as the screen holds it now (the piece's lines before a reroll). */
  items: () => readonly GearItem[];
  /** The player's rerolls so far this week, from the last read of him (the next one is another action: its price rose). */
  rerolls: () => number;
  /** Takes in an answer's valley and state; false when there was none. */
  takeValley: (answer: { valley: ValleyAnswer['valley']; state: GameState } | undefined) => boolean;
  /** Puts a fresh gear view on screen. */
  replaceGear: (gear: GearState) => void;
  /** Changes what the screen holds of him. */
  setVisitor: (update: (now: VisitorState | null) => VisitorState | null) => void;
  /** Shows a line of error (a failed read; spends show theirs through the runner). */
  setError: (text: string | null) => void;
  /** The server calls, replaceable in tests. */
  server?: {
    fetchVisitor: typeof fetchVisitor;
    rerollWithVisitor: typeof rerollWithVisitor;
    buyVisitorBlueprint: typeof buyVisitorBlueprint;
    fetchGear: typeof fetchGear;
  };
}

/** True when an error is the server saying he has left. */
export const isAway = (err: unknown): boolean =>
  err instanceof ApiError && err.status === 409 && err.code === 'visitor_away';

export function createVisitorActions(deps: VisitorDeps): VisitorActions {
  const server = deps.server ?? { fetchVisitor, rerollWithVisitor, buyVisitorBlueprint, fetchGear };
  return {
    look: async (itemId): Promise<VisitorHere | undefined> => {
      try {
        const view = await server.fetchVisitor(itemId);
        if (isHere(view)) return view;
        deps.setVisitor(() => view);
      } catch (err) {
        if (isAway(err)) deps.setVisitor(() => ({ here: false }));
        else deps.setError('Could not read his price. Try again.');
      }
      return undefined;
    },
    reroll: async (itemId): Promise<RerollDone | undefined> => {
      const before = deps.items().find((i) => i.id === itemId);
      if (before === undefined) return undefined;
      const done = await deps.runKeyed(
        ActionIds.visitorReroll(itemId, deps.rerolls()),
        async (key) => {
          const answer = await server.rerollWithVisitor({ itemId, idempotencyKey: key });
          return { answer, gear: await server.fetchGear() };
        },
      );
      if (done === undefined) return undefined;
      deps.takeValley(done.answer);
      deps.replaceGear(done.gear);
      const { reroll } = done.answer;
      deps.setVisitor((now) => (isHere(now) ? { ...now, rerolls: reroll.rerolls } : now));
      const after = done.gear.items.find((i) => i.id === itemId);
      if (after === undefined) return undefined;
      return { before, after, paid: reroll.paid, next: reroll.next };
    },
    buy: async (): Promise<BlueprintDone | undefined> => {
      const done = await deps.runKeyed(ActionIds.visitorBlueprint(), (key) =>
        server.buyVisitorBlueprint(key).then(async (answer) => ({
          answer,
          // A blueprint was learned or marked: the blueprints list is the gear view's.
          gear: await server.fetchGear(),
        })),
      );
      if (done === undefined) return undefined;
      deps.takeValley(done.answer);
      deps.replaceGear(done.gear);
      deps.setVisitor((now) =>
        isHere(now) ? { ...now, blueprint: { ...now.blueprint, bought: true } } : now,
      );
      const { blueprint } = done.answer;
      return { baseId: blueprint.baseId, duplicate: blueprint.duplicate, marks: blueprint.marks };
    },
  };
}
