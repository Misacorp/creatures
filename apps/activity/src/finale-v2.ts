/**
 * The words and rules of the live finale's one input on combat v2 (docs/design/combat/integration.md, section 4): each member has one
 * action, Rally, Shield Wall (with a row) or Purge, that takes effect in the round after it is pressed, or by itself in its default round
 * (Auto fire; held when Auto fire is off, and then it still acts in the last round). Pure. The server decides every outcome; these helpers
 * only say what the screen shows and which buttons it offers. The numbers in the lines mirror `rules.json` (a test holds them together).
 */
import type { FinaleActionKind } from '@creatures/engine/v2';
import type { LiveAbilityV2, LiveSnapshotV2 } from './fight-v2-api';

/** The ability ids the server deals for each kind of action (`raid-v2-live.ts`). */
export const ABILITY_OF_KIND: Readonly<Record<FinaleActionKind, string>> = {
  rally: 'rally',
  shieldWall: 'shield-wall',
  purge: 'purge',
};

/** The three actions in the order a player who picked none is dealt them. */
export const ACTION_IDS = ['rally', 'shield-wall', 'purge'] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export const ACTION_NAME: Readonly<Record<ActionId, string>> = {
  rally: 'Rally',
  'shield-wall': 'Shield Wall',
  purge: 'Purge',
};

/** What each does, in one line; the shares are `rallyBp`, `shieldWallBp` and `purgeRounds` of the rules. */
export const ACTION_LINE: Readonly<Record<ActionId, string>> = {
  rally: 'Every creature hits 10% harder this round.',
  'shield-wall': 'One row takes 50% less this round.',
  purge: 'The boss resists no element or reaction for 2 rounds.',
};

export const isActionId = (id: string): id is ActionId => (ACTION_IDS as readonly string[]).includes(id);

/** Where the caller's input stands. */
export type InputPhase = 'auto' | 'held' | 'queued' | 'acted';

export interface InputStatus {
  phase: InputPhase;
  /** The round it acts in (or acted in); null while it waits for its owner. */
  round: number | null;
  /** The words under the button: "Acts in round 4", "Acted in round 6", "Waits for you". */
  text: string;
}

/** The status of the caller's input, from the snapshot's own numbers. */
export function inputStatus(ability: LiveAbilityV2, rounds: number): InputStatus {
  if (ability.fired && ability.firedAtRound !== null) {
    return { phase: 'acted', round: ability.firedAtRound, text: `Acted in round ${String(ability.firedAtRound)}` };
  }
  if (ability.mode === 'fired' && ability.fireAtRound !== null) {
    return { phase: 'queued', round: ability.fireAtRound, text: `Acts in round ${String(ability.fireAtRound)}` };
  }
  if (ability.mode === 'held') {
    return { phase: 'held', round: null, text: `Waits for you, acts in round ${String(rounds)} at the latest` };
  }
  return { phase: 'auto', round: ability.defaultRound, text: `Acts by itself in round ${String(ability.defaultRound)}` };
}

/** Whether the Fire button works: the fight is on, the input has not acted or been pressed, and a round is left for it to take effect in. */
export function canFire(snapshot: Pick<LiveSnapshotV2, 'status' | 'round' | 'rounds'>, ability: LiveAbilityV2): boolean {
  return (
    snapshot.status === 'live' &&
    snapshot.round >= 1 &&
    snapshot.round < snapshot.rounds &&
    !ability.fired &&
    ability.mode !== 'fired'
  );
}

/** Whether Auto fire can be switched: until the input acts or is pressed. */
export function canToggleAuto(snapshot: Pick<LiveSnapshotV2, 'status'>, ability: LiveAbilityV2): boolean {
  return snapshot.status === 'live' && !ability.fired && ability.mode !== 'fired';
}

/** The caller's own input in a snapshot, or null (not in the fight, or no input dealt). */
export function ownInput(snapshot: Pick<LiveSnapshotV2, 'abilities' | 'you'>): LiveAbilityV2 | null {
  return snapshot.you === null ? null : (snapshot.abilities.find((a) => a.alias === snapshot.you) ?? null);
}

/** A row's name for the Shield Wall picker. */
export const wallRowName = (row: number): string => `Row ${String(row + 1)}`;

/** What the lobby says while the finale waits for its start. */
export const LOBBY_LINE = 'Waiting for the finale to start';

/** The words over a finished finale. */
export const DONE_LINE = 'The fight is over';
