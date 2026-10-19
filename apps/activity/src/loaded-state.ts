import type { GameState } from './api';
import { clockOffset } from './game';

/** The state on screen with how far the server's clock is from ours. */
export interface Loaded {
  game: GameState;
  /** Server clock minus local clock at the moment the state arrived. */
  offset: number;
}

export function loaded(game: GameState): Loaded {
  return { game, offset: clockOffset(game.serverNow, Date.now()) };
}
