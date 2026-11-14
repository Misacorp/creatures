/**
 * The combat v2 part of the raid week view and the swap requests (apps/worker/src/raid-v2-view.ts, raid-swap.ts;
 * docs/design/combat/integration.md, sections 4 and 9). A v2 week says `rules: 2` and carries this part; a v1 week has
 * neither. Every name, label and sentence is the server's, drawn as text; the server worked out the move preview with the
 * engine's own targeting, so the client does no fight maths. Parsing is strict like the rest of `raid-api.ts`.
 */
import { apiFetch, jsonRequest } from './api';
import {
  isArrayOf,
  isBool,
  isCount,
  isInt,
  isNullableInt,
  isNullableStr,
  isRecord,
  isStr,
} from './parse-core';

/** One move of the boss as its tile shows it. */
export interface BossMoveV2 {
  id: string;
  /** The themed name ("Deepwater Spear"). */
  name: string;
  /** The plain label of its behaviour ("Nemesis Lance"). */
  label: string;
  /** The library's shape word, for its picture; `silences` and `oneShot` pick Hush and One-shot. */
  shape: string;
  silences: boolean;
  oneShot: boolean;
  /** Fizzle: no targets; the boss is immune to reactions until its next turn. */
  fizzles: boolean;
  /** Due every this many rounds. */
  every: number;
  /** The boss turn it lands on (0 is after row 1). */
  turn: number;
  windUp: boolean;
  /** Added by the boss's change of pattern, once it begins. */
  later: boolean;
}

/** The boss card of a v2 week. */
export interface BossCardV2 {
  armour: number;
  cards: { id: string; name: string; asks: string }[];
  /** The strength all the rule cards share (basis points of the full card). */
  strengthBp: number;
  escalation: { name: string; cap: number; step: number } | null;
  plain: { label: string; shape: string; hits: number };
  moves: BossMoveV2[];
}

export interface TrackV2 {
  /** The lap's bosses in track order. */
  order: { id: string; name: string }[];
  /** Where the week's boss stands among them (from 0). */
  index: number;
}

/** The slots each fixed-rule move hits and the plain attack's target, now; null for a move aimed when it comes. */
export interface MovePreviewV2 {
  plain: number | null;
  moves: Record<string, number[] | null>;
}

export interface BoardCreatureV2 {
  creatureId: string;
  slot: number;
  row: number;
  col: number;
  /** Its HP carried from the stages played; null: it has not fought yet. */
  hp: number | null;
  hpMax: number | null;
  knack: string | null;
  knackName: string | null;
}

export interface OutCreatureV2 {
  creatureId: string;
  species: string;
  name: string;
  owner: string;
  mine: boolean;
}

/** A creature named in a swap request (null: an empty slot). */
export type SwapCreatureV2 = { species: string; name: string; level: number } | null;

export interface SwapV2 {
  id: string;
  from: string;
  to: string;
  slotA: number;
  slotB: number;
  creatureA: SwapCreatureV2;
  creatureB: SwapCreatureV2;
  createdAt: number;
}

/** A request you made that has been answered or has ended (newest last); the creatures are named as they were asked. */
export interface SettledSwapV2 extends SwapV2 {
  status: 'accepted' | 'declined' | 'ended';
}

export interface SwapsV2 {
  incoming: SwapV2[];
  outgoing: SwapV2[];
  /** How your earlier requests went: the asker sees each once (the screen remembers which it showed). */
  settled: SettledSwapV2[];
}

/** The v2 part of a raid week view. */
export interface RaidV2View {
  slot: number;
  bestShareBp: number;
  failedWeekends: number;
  determinationBp: number;
  /** The stages the party has played (0 to 3) and the next to play (1 to 3; 4: none left). */
  stagesPlayed: number;
  nextStage: number;
  joiningOpen: boolean;
  /** The arena: rows of the boss, columns of the party; a slot is `col * rows + row`. */
  rows: number;
  cols: number;
  /** The creatures one player brings: the seats of the boss's arena piece. */
  seats: number;
  /** The board includes the spare piece (one free column) until stage 1 locks the players. */
  spare: boolean;
  players: number;
  card: BossCardV2;
  track: TrackV2;
  preview: MovePreviewV2 | null;
  out: OutCreatureV2[];
  creatures: BoardCreatureV2[];
  swaps: SwapsV2;
}

const isMove = (value: unknown): value is BossMoveV2 =>
  isRecord(value) &&
  isStr(value['id']) &&
  isStr(value['name']) &&
  isStr(value['label']) &&
  isStr(value['shape']) &&
  isBool(value['silences']) &&
  isBool(value['oneShot']) &&
  isBool(value['fizzles']) &&
  isCount(value['every']) &&
  isCount(value['turn']) &&
  isBool(value['windUp']) &&
  isBool(value['later']);

export const isCard = (value: unknown): value is BossCardV2 => {
  if (!isRecord(value)) return false;
  const escalation = value['escalation'];
  const plain = value['plain'];
  return (
    isCount(value['armour']) &&
    isArrayOf(
      value['cards'],
      (c): c is BossCardV2['cards'][number] =>
        isRecord(c) && isStr(c['id']) && isStr(c['name']) && isStr(c['asks']),
    ) &&
    isCount(value['strengthBp']) &&
    (escalation === null ||
      (isRecord(escalation) &&
        isStr(escalation['name']) &&
        isCount(escalation['cap']) &&
        isCount(escalation['step']))) &&
    isRecord(plain) &&
    isStr(plain['label']) &&
    isStr(plain['shape']) &&
    isCount(plain['hits']) &&
    isArrayOf(value['moves'], isMove)
  );
};

const isTrack = (value: unknown): value is TrackV2 =>
  isRecord(value) &&
  isCount(value['index']) &&
  isArrayOf(
    value['order'],
    (b): b is TrackV2['order'][number] => isRecord(b) && isStr(b['id']) && isStr(b['name']),
  );

const isPreview = (value: unknown): value is MovePreviewV2 => {
  if (!isRecord(value) || !(value['plain'] === null || isCount(value['plain']))) return false;
  const moves = value['moves'];
  return (
    isRecord(moves) &&
    Object.values(moves).every((slots) => slots === null || isArrayOf(slots, isCount))
  );
};

const isBoardCreature = (value: unknown): value is BoardCreatureV2 =>
  isRecord(value) &&
  isStr(value['creatureId']) &&
  isCount(value['slot']) &&
  isCount(value['row']) &&
  isCount(value['col']) &&
  isNullableInt(value['hp']) &&
  isNullableInt(value['hpMax']) &&
  isNullableStr(value['knack']) &&
  isNullableStr(value['knackName']);

const isOut = (value: unknown): value is OutCreatureV2 =>
  isRecord(value) &&
  isStr(value['creatureId']) &&
  isStr(value['species']) &&
  isStr(value['name']) &&
  isStr(value['owner']) &&
  isBool(value['mine']);

const isSwapCreature = (value: unknown): value is SwapCreatureV2 =>
  value === null ||
  (isRecord(value) && isStr(value['species']) && isStr(value['name']) && isInt(value['level']));

const isSwap = (value: unknown): value is SwapV2 =>
  isRecord(value) &&
  isStr(value['id']) &&
  isStr(value['from']) &&
  isStr(value['to']) &&
  isCount(value['slotA']) &&
  isCount(value['slotB']) &&
  isSwapCreature(value['creatureA']) &&
  isSwapCreature(value['creatureB']) &&
  isInt(value['createdAt']);

const isSettledSwap = (value: unknown): value is SettledSwapV2 =>
  isSwap(value) &&
  isRecord(value) &&
  (value['status'] === 'accepted' || value['status'] === 'declined' || value['status'] === 'ended');

export const isSwaps = (value: unknown): value is SwapsV2 =>
  isRecord(value) &&
  isArrayOf(value['incoming'], isSwap) &&
  isArrayOf(value['outgoing'], isSwap) &&
  isArrayOf(value['settled'], isSettledSwap);

/** Whether the v2 part of a week view reads right. */
export function isRaidV2View(value: unknown): value is RaidV2View {
  return (
    isRecord(value) &&
    isCount(value['slot']) &&
    isCount(value['bestShareBp']) &&
    isCount(value['failedWeekends']) &&
    isCount(value['determinationBp']) &&
    isCount(value['stagesPlayed']) &&
    isCount(value['nextStage']) &&
    isBool(value['joiningOpen']) &&
    isCount(value['rows']) &&
    value['rows'] >= 1 &&
    isCount(value['cols']) &&
    isCount(value['seats']) &&
    value['seats'] >= 1 &&
    isBool(value['spare']) &&
    isCount(value['players']) &&
    isCard(value['card']) &&
    isTrack(value['track']) &&
    (value['preview'] === null || isPreview(value['preview'])) &&
    isArrayOf(value['out'], isOut) &&
    isArrayOf(value['creatures'], isBoardCreature) &&
    isSwaps(value['swaps'])
  );
}

// --- Swap requests (`GET/POST /api/raid/swap`, `POST /api/raid/swap/:id/accept|decline`) ---

function parseSwaps(data: unknown): SwapsV2 {
  if (!isSwaps(data)) throw new Error('the server returned unexpected swap requests');
  return data;
}

/** The caller's open swap requests this week. */
export async function fetchSwaps(): Promise<SwapsV2> {
  return parseSwaps(await apiFetch('/api/raid/swap'));
}

/**
 * Asks the owner of another creature on the board to swap places: `slotA` and `slotB` are two slots of the caller's party (the server
 * finds the player to ask). Answers the caller's open requests.
 */
export async function askSwap(slotA: number, slotB: number): Promise<SwapsV2> {
  return parseSwaps(await apiFetch('/api/raid/swap', jsonRequest('POST', { slotA, slotB })));
}

/** Accepts or declines a request addressed to the caller. Answers the caller's open requests. */
export async function answerSwap(id: string, answer: 'accept' | 'decline'): Promise<SwapsV2> {
  return parseSwaps(
    await apiFetch(`/api/raid/swap/${encodeURIComponent(id)}/${answer}`, { method: 'POST' }),
  );
}
