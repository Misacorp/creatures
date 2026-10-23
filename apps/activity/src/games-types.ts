/**
 * What the Valley Games routes answer (`apps/worker/src/games-view.ts`, `games-routes.ts`,
 * docs/design/valley-games.md), as the client reads it. Checked by `games-parse.ts`.
 */
import type { GamesEventResult } from '@creatures/engine';
import type { GamesFavour, GamesKind } from '@creatures/game';
import type { GrantLoot } from './gear-types';

export type GamesMedal = 'gold' | 'silver' | 'bronze';

/** One event of a day's lineup. */
export interface LineupEvent {
  id: string;
  name: string;
  kind: GamesKind;
  scene: string;
  team: 1 | 3;
  /** The event's teaser line (content text, shown as text). */
  line: string;
  /** What helps, as tags (stats, size, roles, elements). */
  favours: GamesFavour[];
}

/** The part of a show's length one event takes (ms from the show's start). */
export interface ShowSegmentView {
  eventId: string;
  introMs: number;
  startMs: number;
  endMs: number;
  podiumEndMs: number;
  skipped: boolean;
}

export interface GamesShowView {
  day: string;
  showAt: number;
  endsAt: number;
  lineup: LineupEvent[];
  timeline: ShowSegmentView[];
  events: GamesEventResult[];
  skipped: string[];
  players: { id: string; name: string; bot: boolean }[];
}

export interface GamesNext {
  day: string;
  lockAt: number;
  showAt: number;
  open: boolean;
  lineup: LineupEvent[];
  /** Event id to the player's creatures in it, in slot order. */
  entries: Record<string, string[]>;
  joined: boolean;
  auto: boolean;
  /** Event id to creature id to 1..5 pips. */
  fit: Record<string, Record<string, number>>;
}

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
  pins: number;
}

export interface GamesResult {
  eventId: string;
  creatureIds: string[];
  place: number;
  medal: GamesMedal | null;
  pin: boolean;
  pins: string[];
  /** Experience the entry's creatures earned, together. */
  xp: number;
}

export interface GamesYou {
  medals: MedalCounts;
  pocket: number;
  lastResults?: { day: string; results: GamesResult[] };
}

export type StallOfferKind = 'gear' | 'supply' | 'bait' | 'shards' | 'glimmer';

export interface StallOffer {
  id: string;
  kind: StallOfferKind;
  name: string;
  price: number;
  weeklyLimit: number;
  left: number;
  params: Record<string, string | number>;
}

export interface StallView {
  open: boolean;
  week: string;
  opensAt: number;
  closesAt: number;
  offers: StallOffer[];
}

export interface BoardRow {
  userId: string;
  name: string;
  gold: number;
  silver: number;
  bronze: number;
}

export type GamesPhase = 'entries' | 'locked' | 'show' | 'after';

/** `GET /api/games`. */
export interface GamesView {
  serverNow: number;
  timezone: string;
  phase: GamesPhase;
  next: GamesNext;
  show: GamesShowView | null;
  you: GamesYou;
  stall: StallView;
  board: BoardRow[];
}

/** `POST /api/games/stall/buy`. */
export interface StallPurchase {
  purchase: { offerId: string; price: number; grant: GrantLoot; bait?: number };
  you: GamesYou;
  stall: StallView;
}

/** `GET /api/games/creature/:id`: a creature's medals and best scores. */
export interface CreatureGames {
  medals: MedalCounts;
  records: { eventId: string; name: string; best: number; unit: string; day: string }[];
}
