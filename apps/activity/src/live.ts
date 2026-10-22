/**
 * Pure helpers for the live finale: when to show it, when to poll, what the texts say. Nothing here
 * touches the DOM, the network or the clock (callers pass the time in), and all text it returns is
 * plain text (it can contain player names). The server decides every outcome; these helpers only
 * decide what to show and which buttons to offer.
 */
import { content, RULES, type FinaleAbilityDef } from '@creatures/game';
import { MAX_ROUND_MS, describeEvent, type EventNames, type FightEvent } from '@creatures/engine';
import type { LiveAbility, LiveActionRequest, LiveFight, LiveSnapshot } from './live-api';
import type { AbilityPreview, RaidReveal, TeamCreatureView } from './raid-api';
import { formatCountdown } from './time-format';
import { festivalGrantText, rankChangeText } from './raid-progress';

// --- When the finale is on ---

/** The lobby opens this long before the start. */
export const LOBBY_MS = 5 * 60_000;
/**
 * The longest a round of a finale can take (the engine's pacing, 6 to 22 seconds, is what the server
 * schedules by): only used to know when the Raid tab can stop expecting a result.
 */
const LONGEST_ROUND_MS = MAX_ROUND_MS;
/** How long after the last round the Raid tab keeps the finale view open for a result to show up. */
const FINISH_GRACE_MS = 30_000;

export type FinaleWindow = 'before' | 'lobby' | 'live' | 'after';

/** Where `serverNow` is relative to the scheduled finale, from the Raid view's own times. */
export function finaleWindow(finaleAt: number, rounds: number, serverNow: number): FinaleWindow {
  if (serverNow < finaleAt - LOBBY_MS) return 'before';
  if (serverNow < finaleAt) return 'lobby';
  if (serverNow < finaleAt + rounds * LONGEST_ROUND_MS + FINISH_GRACE_MS) return 'live';
  return 'after';
}

/** The text of the Raid tab banner. */
export function bannerText(window: FinaleWindow, finaleAt: number, serverNow: number): string {
  if (window === 'lobby')
    return `Finale starts in ${formatCountdown(finaleAt - serverNow, 'clock')}`;
  if (window === 'live') return 'The finale is on now';
  return '';
}

// --- Polling ---

const POLL_MS = 2000;
/** Wait this long after a round boundary before asking, so the server has moved on. */
const BOUNDARY_SLACK_MS = 300;
const MIN_POLL_MS = 250;
/** Stop asking this long after the fight should have ended, even if no "done" ever arrives. */
export const GIVE_UP_MS = 60_000;
const MAX_RETRY_MS = 15_000;

/**
 * The next moment the fight's state changes, from the server's schedule: the start, then each
 * round's start (and finally the end of the fight). Null when there is nothing to wait for.
 */
export function nextBoundaryAt(
  snapshot: Pick<LiveFight, 'startsAt' | 'nextRoundAt'>,
  serverNow: number,
): number | null {
  if (serverNow < snapshot.startsAt) return snapshot.startsAt;
  return snapshot.nextRoundAt;
}

/**
 * Milliseconds until the next poll, or null to stop. Polls every 2 s, and once more just after
 * the server's next round start (`nextRoundAt`), using the server's clock (`serverNow` here is the
 * estimated server time).
 */
export function nextPollDelay(snapshot: LiveSnapshot, serverNow: number): number | null {
  if (snapshot.status === 'none' || snapshot.status === 'done') return null;
  const { startsAt, rounds } = snapshot;
  if (serverNow > startsAt + rounds * LONGEST_ROUND_MS + GIVE_UP_MS) return null;
  let delay = POLL_MS;
  const boundary = nextBoundaryAt(snapshot, serverNow);
  if (boundary !== null) {
    const wait = boundary + BOUNDARY_SLACK_MS - serverNow;
    if (wait >= MIN_POLL_MS) delay = Math.min(delay, wait);
    // Just past the boundary and no news yet: ask again soon. Long past it, the snapshot is stale
    // (or the clock estimate is off): do not hammer, go back to the normal pace.
    else if (serverNow - boundary < POLL_MS) delay = MIN_POLL_MS;
  }
  return Math.max(MIN_POLL_MS, delay);
}

/**
 * The party whose finale the live socket should listen to, or null for no socket: the server offers it
 * (`finaleLive` of `/api/config`) and the screen shows a lobby or a fight (not "nothing soon" and not a
 * finished fight, where nothing more will be pushed). Practice fights count.
 */
export function finaleSocketTarget(
  offered: boolean,
  snapshot: LiveSnapshot | null,
): { week: string; party: number } | null {
  if (!offered || snapshot === null) return null;
  if (snapshot.status !== 'lobby' && snapshot.status !== 'live') return null;
  return { week: snapshot.week, party: snapshot.party };
}

/** While the live socket delivers, the poll only guards against a push that never came. */
export const SAFETY_POLL_MS = 15_000;
/** With the socket live, a push is awaited this long after a round boundary before the poll asks. */
export const PUSH_GRACE_MS = 2500;

/**
 * Milliseconds until the next poll while the live socket delivers, or null to stop. The server pushes
 * a snapshot at every round start, so the poll is a slow safety net (every `SAFETY_POLL_MS`), with one
 * earlier look `PUSH_GRACE_MS` after the next boundary: a missed alarm or push then costs a few seconds,
 * never a frozen fight. Stops where `nextPollDelay` stops.
 */
export function nextLiveDelay(snapshot: LiveSnapshot, serverNow: number): number | null {
  if (nextPollDelay(snapshot, serverNow) === null) return null;
  let delay = SAFETY_POLL_MS;
  if (snapshot.status !== 'none' && snapshot.status !== 'done') {
    const boundary = nextBoundaryAt(snapshot, serverNow);
    if (boundary === null) {
      // The server says the fight is over but "done" has not come: the normal pace until it does.
      delay = POLL_MS;
    } else {
      const wait = boundary + PUSH_GRACE_MS - serverNow;
      // Already past the grace with no news: the safety pace, not a hammer.
      if (wait > 0) delay = Math.min(delay, wait);
    }
  }
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
  /** "Round 5 / 12". */
  headline: string;
  /** "Next round in 7s". Empty when there is nothing to count down to. */
  countdown: string;
}

/** The round counter and the countdown, from the snapshot and the estimated server time. */
export function progressText(fight: LiveFight, serverNow: number): Progress {
  const { status, round, rounds, startsAt, nextRoundAt } = fight;
  if (status === 'done') return { headline: 'The fight is over', countdown: '' };
  if (status === 'lobby' || round < 1) {
    return {
      headline: 'Waiting for the finale to start',
      countdown: `Starts in ${formatCountdown(startsAt - serverNow, 'clock')}`,
    };
  }
  // The last round is the final one, or the one the boss has just fallen in.
  const last = round >= rounds || fight.bossHp === 0;
  const wait = nextRoundAt === null ? '' : formatCountdown(nextRoundAt - serverNow, 'hms');
  if (last) {
    return {
      headline: `Last round (${String(round)} / ${String(rounds)})`,
      countdown: wait === '' ? '' : `Ends in ${wait}`,
    };
  }
  return {
    headline: `Round ${String(round)} / ${String(rounds)}`,
    countdown: wait === '' ? '' : `Next round in ${wait}`,
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

/** The one-line effect text of an ability (from the content), or an empty string. */
export function abilityEffectLine(id: string): string {
  return ABILITIES.get(id)?.description ?? '';
}

/**
 * What to call one use of an ability: "Cindle's Flare Strike" for a creature ability (the creature
 * name comes from the fight's names, so a nickname shows as the player set it), and "Rally (basic)"
 * for a basic ability. Plain text.
 */
export function abilityTitle(
  ability: Pick<LiveAbility, 'abilityId' | 'creature'>,
  names: Pick<EventNames, 'creatures'>,
): string {
  const name = abilityName(ability.abilityId);
  if (ability.creature === null) return `${name} (basic)`;
  const creature = names.creatures[ability.creature];
  return creature === undefined ? name : `${creature}'s ${name}`;
}

/** The caller's own abilities, in the server's order (basic first). */
export function ownAbilities(abilities: readonly LiveAbility[], you: string | null): LiveAbility[] {
  return you === null ? [] : abilities.filter((a) => a.alias === you);
}

export interface OtherUsage {
  alias: string;
  total: number;
  used: number;
  /** The ability that took effect most recently (the later round, then the later in the list). */
  latest: LiveAbility | null;
}

/** For each other player: how many of their abilities have been used, and the latest one. */
export function otherUsage(abilities: readonly LiveAbility[], you: string | null): OtherUsage[] {
  const byAlias = new Map<string, OtherUsage>();
  for (const a of abilities) {
    if (a.alias === you) continue;
    const entry = byAlias.get(a.alias) ?? { alias: a.alias, total: 0, used: 0, latest: null };
    entry.total += 1;
    if (a.fired) {
      entry.used += 1;
      if (entry.latest === null || (a.firedAtRound ?? 0) >= (entry.latest.firedAtRound ?? 0)) {
        entry.latest = a;
      }
    }
    byAlias.set(a.alias, entry);
  }
  return [...byAlias.values()];
}

/** The closed summary of the other players' abilities: "Others' abilities (3/7 used)". */
export function othersSummary(others: readonly OtherUsage[]): string {
  const used = others.reduce((sum, o) => sum + o.used, 0);
  const total = others.reduce((sum, o) => sum + o.total, 0);
  return `Others' abilities (${String(used)} / ${String(total)} used)`;
}

/** "2 / 4 used. Latest: Cindle's Flare Strike (round 5)". */
export function otherUsageText(usage: OtherUsage, names: Pick<EventNames, 'creatures'>): string {
  const head = `${String(usage.used)} / ${String(usage.total)} used`;
  if (usage.latest === null) return head;
  const round = usage.latest.firedAtRound;
  return `${head}. Latest: ${abilityTitle(usage.latest, names)}${
    round === null ? '' : ` (round ${String(round)})`
  }`;
}

interface CreatureAbilityRow {
  /** The creature it belongs to. */
  creatureId: string;
  /** The ability's content id, so its name can open the glossary popover. */
  abilityId: string;
  /** "Cindle's Flare Strike". */
  title: string;
  /** One line about what it does. */
  effect: string;
  unlocked: boolean;
  /** "Ready for the finale" or "Unlocks at level 10 (now level 7)". */
  status: string;
  /** The caller's Auto fire setting (on unless they turned it off). */
  autoFire: boolean;
}

/**
 * The Raid tab's creature abilities: one row for each team creature that has one, unlocked or not
 * (the basic ability is picked in the picker, so it is not listed here). The level of a locked one
 * comes from the team list.
 */
export function creatureAbilityRows(
  preview: readonly AbilityPreview[],
  team: readonly TeamCreatureView[],
): CreatureAbilityRow[] {
  const rows: CreatureAbilityRow[] = [];
  for (const entry of preview) {
    if (entry.creatureId === null) continue;
    const creature = team.find((c) => c.creatureId === entry.creatureId);
    const name = abilityName(entry.abilityId);
    let status = 'Ready for the finale';
    if (!entry.unlocked) {
      status =
        creature === undefined
          ? `Unlocks at level ${String(entry.unlockLevel)}`
          : `Unlocks at level ${String(entry.unlockLevel)} (now level ${String(creature.level)})`;
    }
    rows.push({
      creatureId: entry.creatureId,
      abilityId: entry.abilityId,
      title: creature === undefined ? name : `${creature.name}'s ${name}`,
      effect: abilityEffectLine(entry.abilityId),
      unlocked: entry.unlocked,
      status,
      autoFire: entry.autoFire,
    });
  }
  return rows;
}

/** The target of the Auto fire preference of an ability: its creature's id, or `basic`. */
export function autoFireTarget(ability: Pick<LiveAbility, 'creature'>): string {
  return ability.creature ?? 'basic';
}

/**
 * What a tap on one of the player's own creatures that has no ability in this fight says: it is
 * below the unlock level, or its species has no finale ability. Plain text.
 */
export function noAbilityText(speciesId: string, level: number): string {
  const species = content.creatures.find((c) => c.id === speciesId);
  if (species?.ability === undefined) return 'This creature has no finale ability.';
  const unlock = RULES.abilities.unlockLevel;
  if (level < unlock) {
    return `Its ability unlocks at level ${String(unlock)}. It is level ${String(level)} now.`;
  }
  return 'Its ability is not part of this fight.';
}

/** What a finale ability asks for when it is fired by hand. */
type ParamKind = 'zone' | 'element' | null;

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
export function defaultRoundOf(ability: Pick<LiveAbility, 'defaultRound'>): number | null {
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
        ? "Auto fire is off: it fires in the last round if you don't"
        : `Auto fire is off: it fires in the last round (round ${String(rounds)}) at the latest`;
    case 'default': {
      const round = defaultRoundOf(ability);
      return round === null ? 'Fires on its own' : `Fires on its own in round ${String(round)}`;
    }
  }
}

interface AbilityControls {
  canFire: boolean;
  /** The Auto fire toggle is on offer (before the ability's default round, while unused). */
  canToggle: boolean;
  /** True while the ability fires by itself at its default round; false once auto fire is off. */
  autoOn: boolean;
  /** Why the buttons are off, or an empty string. */
  note: string;
}

/**
 * Which buttons to offer. This only mirrors the server's rules for display (Fire until the last
 * round, the Auto fire toggle before the default round); the server decides, and a stale screen
 * gets a friendly error from it.
 */
export function abilityControls(
  fight: Pick<LiveFight, 'status' | 'round' | 'rounds'>,
  ability: LiveAbility,
): AbilityControls {
  const autoOn = ability.mode !== 'held';
  const off = { canFire: false, canToggle: false, autoOn };
  if (fight.status === 'lobby') {
    // Before the start there is no Fire; the toggle sets the default Auto fire for the start.
    return { canFire: false, canToggle: true, autoOn, note: '' };
  }
  if (fight.status === 'done') return { ...off, note: '' };
  if (ability.fired) return { ...off, note: '' };
  if (ability.mode === 'fired') return { ...off, note: '' };
  if (fight.round >= fight.rounds) {
    return { ...off, note: 'It is too late to use it by hand now.' };
  }
  const defaultRound = defaultRoundOf(ability);
  const canToggle =
    (ability.mode === 'default' || ability.mode === 'held') &&
    defaultRound !== null &&
    fight.round < defaultRound;
  return { canFire: true, canToggle, autoOn, note: '' };
}

/**
 * The request body for Fire or the Auto fire toggle (`hold` is auto fire off, `unhold` is on again)
 * of one ability, named by its `key`. Only the parameter that
 * belongs to the ability is sent (none for creature abilities, whose effects never ask).
 */
export function buildAction(
  key: string,
  abilityId: string,
  action: 'fire' | 'hold' | 'unhold',
  zone: string,
  element: string,
): LiveActionRequest {
  if (action === 'hold' || action === 'unhold') return { key, action };
  const kind = abilityParamKind(abilityId);
  if (kind === 'zone' && (zone === 'front' || zone === 'middle' || zone === 'back')) {
    return { key, action: 'fire', zone };
  }
  const chosen = content.elements.find((e) => e.id === element);
  if (kind === 'element' && chosen !== undefined) {
    return { key, action: 'fire', element: chosen.id };
  }
  return { key, action: 'fire' };
}

/**
 * A lock per ability key, so a double tap on one ability sends one request while another ability
 * can still be pressed. `acquire` is true for the first caller until `release`.
 */
interface KeyLock {
  acquire(key: string): boolean;
  release(key: string): void;
  has(key: string): boolean;
}

export function createKeyLock(): KeyLock {
  const held = new Set<string>();
  return {
    acquire(key) {
      if (held.has(key)) return false;
      held.add(key);
      return true;
    },
    release(key) {
      held.delete(key);
    },
    has: (key) => held.has(key),
  };
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
    case 'charge':
    case 'retreat':
    case 'enrage':
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
    if (!match(e) || !isShown(e)) continue;
    // An event this client does not know describes as nothing: it gets no line.
    const text = describeEvent(e, names);
    if (text !== '') out.push({ text, key: isKeyEvent(e) });
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

interface RevealSummary {
  outcome: string;
  cleared: boolean;
  /** One figure: everything the finale paid the player. */
  essence: string;
  /** Where the server's rank went; null until the ladder has moved (and for old weeks). */
  rank: string | null;
  /** The Festival creature the player got; null if none. */
  festival: { text: string; firstOnServer: boolean } | null;
}

/** Plain words for a finale reveal. */
export function revealSummary(
  reveal: Pick<RaidReveal, 'cleared' | 'essence'> &
    Partial<Pick<RaidReveal, 'rankChange' | 'festivalGrant' | 'enraged'>>,
): RevealSummary {
  const rank = reveal.rankChange == null ? null : rankChangeText(reveal.rankChange);
  const festival =
    reveal.festivalGrant == null
      ? null
      : {
          text: festivalGrantText(reveal.festivalGrant),
          firstOnServer: reveal.festivalGrant.firstOnServer,
        };
  return {
    outcome: reveal.cleared
      ? reveal.enraged === true
        ? 'The boss fell, even enraged. Finale cleared!'
        : 'The boss fell. Finale cleared!'
      : reveal.enraged === true
        ? 'The boss held on. Out of time, it enraged. Not cleared.'
        : 'The boss held on. Not cleared.',
    cleared: reveal.cleared,
    essence: `You got ${String(reveal.essence)} Essence`,
    rank,
    festival,
  };
}

export const PRACTICE_LABEL = 'Practice fight: no rewards';
