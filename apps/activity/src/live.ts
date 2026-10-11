/**
 * Pure helpers for the live finale: when to show it, when to poll, what the texts say. Nothing here
 * touches the DOM, the network or the clock (callers pass the time in), and all text it returns is
 * plain text (it can contain player names). The server decides every outcome; these helpers only
 * decide what to show and which buttons to offer.
 */
import { content, RULES, type FinaleAbilityDef } from '@creatures/game';
import { describeEvent, type EventNames, type FightEvent } from '@creatures/engine';
import type { LiveAbility, LiveActionRequest, LiveFight, LiveSnapshot } from './live-api';
import type { RaidReveal } from './raid-api';
import { formatCountdown } from './game';

// --- When the finale is on ---

/** The lobby opens this long before the start. */
export const LOBBY_MS = 5 * 60_000;
/** The round length of a finale (the server sends the real one with every snapshot). */
export const DEFAULT_ROUND_MS = 10_000;
/** How long after the last round the Raid tab keeps the finale view open for a result to show up. */
export const FINISH_GRACE_MS = 30_000;

export type FinaleWindow = 'before' | 'lobby' | 'live' | 'after';

/** Where `serverNow` is relative to the scheduled finale, from the Raid view's own times. */
export function finaleWindow(finaleAt: number, rounds: number, serverNow: number): FinaleWindow {
  if (serverNow < finaleAt - LOBBY_MS) return 'before';
  if (serverNow < finaleAt) return 'lobby';
  if (serverNow < finaleAt + rounds * DEFAULT_ROUND_MS + FINISH_GRACE_MS) return 'live';
  return 'after';
}

/** "4:12" for 252 000 ms. Rounds up, never negative. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

/** The text of the Raid tab banner. */
export function bannerText(window: FinaleWindow, finaleAt: number, serverNow: number): string {
  if (window === 'lobby') return `Finale starts in ${formatClock(finaleAt - serverNow)}`;
  if (window === 'live') return 'The finale is on now';
  return '';
}

// --- Polling ---

export const POLL_MS = 2000;
/** Wait this long after a round boundary before asking, so the server has moved on. */
export const BOUNDARY_SLACK_MS = 300;
export const MIN_POLL_MS = 250;
/** Stop asking this long after the fight should have ended, even if no "done" ever arrives. */
export const GIVE_UP_MS = 60_000;
export const MAX_RETRY_MS = 15_000;

/** The next moment the fight's state changes: the start, then the end of every round. */
export function nextBoundaryAt(
  startsAt: number,
  roundMs: number,
  rounds: number,
  serverNow: number,
): number | null {
  if (serverNow < startsAt) return startsAt;
  const k = Math.floor((serverNow - startsAt) / roundMs) + 1;
  return k <= rounds ? startsAt + k * roundMs : null;
}

/**
 * Milliseconds until the next poll, or null to stop. Polls every 2 s, and once more just after
 * each round boundary, using the server's clock (`serverNow` here is the estimated server time).
 */
export function nextPollDelay(snapshot: LiveSnapshot, serverNow: number): number | null {
  if (snapshot.status === 'none' || snapshot.status === 'done') return null;
  const { startsAt, roundMs, rounds } = snapshot;
  if (serverNow > startsAt + rounds * roundMs + GIVE_UP_MS) return null;
  let delay = POLL_MS;
  const boundary = nextBoundaryAt(startsAt, roundMs, rounds, serverNow);
  if (boundary !== null) delay = Math.min(delay, boundary + BOUNDARY_SLACK_MS - serverNow);
  return Math.max(MIN_POLL_MS, delay);
}

/** Back-off after failed polls: 2 s, 4 s, 8 s, then 15 s. */
export function errorRetryDelayMs(failures: number): number {
  const n = Math.max(1, Math.trunc(failures));
  return Math.min(MAX_RETRY_MS, POLL_MS * 2 ** Math.min(n - 1, 10));
}

/** A network failure, a 429 and server errors are worth retrying; other client errors are not. */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true;
  return status === 429 || status >= 500;
}

/** Keeps the newer of two snapshots, so a slow poll never overwrites a fresher action result. */
export function pickNewer(current: LiveSnapshot | null, next: LiveSnapshot): LiveSnapshot {
  if (current === null) return next;
  return next.serverNow >= current.serverNow ? next : current;
}

// --- Round progress ---

export interface Progress {
  /** "Round 5 of 12". */
  headline: string;
  /** "Next round in 7s". Empty when there is nothing to count down to. */
  countdown: string;
}

/** The round counter and the countdown, from the snapshot and the estimated server time. */
export function progressText(fight: LiveFight, serverNow: number): Progress {
  const { status, round, rounds, startsAt, roundMs } = fight;
  if (status === 'done') return { headline: 'The fight is over', countdown: '' };
  if (status === 'lobby' || round < 1) {
    return {
      headline: 'Waiting for the finale to start',
      countdown: `Starts in ${formatClock(startsAt - serverNow)}`,
    };
  }
  if (round >= rounds) {
    return {
      headline: `Last round (${String(round)} of ${String(rounds)})`,
      countdown: `Ends in ${formatCountdown(startsAt + rounds * roundMs - serverNow)}`,
    };
  }
  return {
    headline: `Round ${String(round)} of ${String(rounds)}`,
    countdown: `Next round in ${formatCountdown(startsAt + round * roundMs - serverNow)}`,
  };
}

// --- Abilities ---

const ABILITIES = new Map<string, FinaleAbilityDef>(content.finaleAbilities.map((a) => [a.id, a]));

export function abilityDef(id: string): FinaleAbilityDef | undefined {
  return ABILITIES.get(id);
}

export function abilityName(id: string): string {
  return ABILITIES.get(id)?.name ?? id;
}

/** What a finale ability asks for when it is fired by hand. */
export type ParamKind = 'zone' | 'element' | null;

export function abilityParamKind(id: string): ParamKind {
  const effects = ABILITIES.get(id)?.effects ?? [];
  if (effects.some((e) => e.op === 'shield_wall' && e.zone === 'choose')) return 'zone';
  if (effects.some((e) => e.op === 're_mark' && e.element === 'choose')) return 'element';
  return null;
}

/** For the ability card: when it fires on its own, in plain words. */
export function abilityPlanText(def: FinaleAbilityDef): string {
  const round = String(def.defaultRound);
  if (def.defaultAtZoneHit === true) {
    return `Fires on its own when the boss first attacks a zone (round ${round} if it never does) unless you take control in the live finale`;
  }
  return `Fires on its own in round ${round} unless you take control in the live finale`;
}

/**
 * The round an ability fires in if nobody touches it. That is the server's own number (the engine's
 * default, which for Shield Wall depends on the boss); 0 means the server does not know the ability.
 */
export function defaultRoundOf(ability: LiveAbility): number | null {
  return ability.defaultRound > 0 ? ability.defaultRound : null;
}

/** One line about an ability's state. `mine` words it for the player's own ability. */
export function abilityStateText(ability: LiveAbility, rounds: number, mine: boolean): string {
  const used = ability.firedAtRound;
  if (ability.fired) {
    return used === null ? 'Used' : `Used in round ${String(used)}`;
  }
  switch (ability.mode) {
    case 'fired':
      return ability.fireAtRound === null
        ? 'Fires at the start of the next round'
        : `Fires at the start of round ${String(ability.fireAtRound)}`;
    case 'held':
      return mine
        ? "Held: fires in the last round if you don't"
        : `Held: fires in the last round (round ${String(rounds)}) at the latest`;
    case 'default': {
      const round = defaultRoundOf(ability);
      return round === null ? 'Fires on its own' : `Fires on its own in round ${String(round)}`;
    }
  }
}

export interface AbilityControls {
  canFire: boolean;
  canHold: boolean;
  /** Why the buttons are off, or an empty string. */
  note: string;
}

/**
 * Which buttons to offer. This only mirrors the server's rules for display (Fire until the last
 * round, Hold before the default round); the server decides, and a stale screen gets a friendly
 * error from it.
 */
export function abilityControls(
  fight: Pick<LiveFight, 'status' | 'round' | 'rounds'>,
  ability: LiveAbility,
): AbilityControls {
  if (fight.status === 'lobby') {
    return {
      canFire: false,
      canHold: false,
      note: 'You can use your ability once the fight starts.',
    };
  }
  if (fight.status === 'done') return { canFire: false, canHold: false, note: '' };
  if (ability.fired) return { canFire: false, canHold: false, note: '' };
  if (ability.mode === 'fired') return { canFire: false, canHold: false, note: '' };
  if (fight.round >= fight.rounds) {
    return { canFire: false, canHold: false, note: 'It is too late to use it by hand now.' };
  }
  const defaultRound = defaultRoundOf(ability);
  const canHold = ability.mode === 'default' && defaultRound !== null && fight.round < defaultRound;
  return { canFire: true, canHold, note: '' };
}

/** The request body for Fire or Hold. Only the parameter that belongs to the ability is sent. */
export function buildAction(
  abilityId: string,
  action: 'fire' | 'hold',
  zone: string,
  element: string,
): LiveActionRequest {
  if (action === 'hold') return { action: 'hold' };
  const kind = abilityParamKind(abilityId);
  if (kind === 'zone' && (zone === 'front' || zone === 'middle' || zone === 'back')) {
    return { action: 'fire', zone };
  }
  const chosen = content.elements.find((e) => e.id === element);
  if (kind === 'element' && chosen !== undefined) return { action: 'fire', element: chosen.id };
  return { action: 'fire' };
}

// --- The event feed ---

export interface FeedLine {
  text: string;
  /** A moment worth noticing: an ability, a reaction, a knockout, a boss trick. */
  key: boolean;
}

/** True for the events players care about most. */
export function isKeyEvent(event: FightEvent): boolean {
  switch (event.t) {
    case 'ability':
    case 'reaction':
    case 'knockout':
    case 'gimmick':
    case 'silence':
    case 'adaptation':
      return true;
    case 'boss_hit':
      return event.shielded === true;
    default:
      return false;
  }
}

/** Every "X acts." line is noise next to the hit that follows it, and the round end repeats the HP. */
function isShown(event: FightEvent): boolean {
  return event.t !== 'turn' && event.t !== 'round_end';
}

/** The highest round in the log, or 0. */
export function newestRound(events: readonly FightEvent[]): number {
  let out = 0;
  for (const e of events) if (e.round > out) out = e.round;
  return out;
}

function lines(
  events: readonly FightEvent[],
  names: EventNames,
  match: (e: FightEvent) => boolean,
): FeedLine[] {
  const out: FeedLine[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as FightEvent;
    if (match(e) && isShown(e)) out.push({ text: describeEvent(e, names), key: isKeyEvent(e) });
  }
  return out;
}

/** The newest round's events, newest first. */
export function feedLines(events: readonly FightEvent[], names: EventNames): FeedLine[] {
  const round = newestRound(events);
  return lines(events, names, (e) => e.round === round);
}

/** Everything before the newest round, newest first. */
export function earlierLines(events: readonly FightEvent[], names: EventNames): FeedLine[] {
  const round = newestRound(events);
  return lines(events, names, (e) => e.round < round);
}

// --- The loot reveal ---

export interface RevealSummary {
  outcome: string;
  cleared: boolean;
  essence: string;
  jackpot: { hit: boolean; text: string; firstOnServer: boolean };
}

/** Plain words for a finale reveal. `pity` is the counter after the fight, when known. */
export function revealSummary(
  reveal: Pick<RaidReveal, 'cleared' | 'essence' | 'jackpot'>,
  pity: number | null,
): RevealSummary {
  const { jackpot } = reveal;
  const outcome = reveal.cleared
    ? 'The boss fell. Finale cleared!'
    : 'The boss held on. Not cleared.';
  const essence = `You got ${String(reveal.essence)} Essence`;
  if (jackpot !== null) {
    return {
      outcome,
      cleared: reveal.cleared,
      essence,
      jackpot: {
        hit: true,
        text: `Jackpot! +${String(jackpot.essence)} Essence`,
        firstOnServer: jackpot.firstOnServer,
      },
    };
  }
  const max = RULES.raid.jackpot.hardPityRaid;
  return {
    outcome,
    cleared: reveal.cleared,
    essence,
    jackpot: {
      hit: false,
      text:
        pity === null
          ? 'No jackpot this time'
          : `No jackpot this time (pity ${String(pity)}/${String(max)})`,
      firstOnServer: false,
    },
  };
}

export const PRACTICE_LABEL = 'Practice fight: no rewards';
