/**
 * Display helpers for the collection UI. Names, elements and odds come from the shared game
 * content; every number that matters (costs, levels, catches) comes from the server.
 */
import { RULES, content, type CreatureSpecies } from '@creatures/game';
import {
  ApiError,
  type CatchResult,
  type Creature,
  type ServerFirst,
  type SuppliesId,
  type DurationId,
} from './api';

const SPECIES = new Map<string, CreatureSpecies>(content.creatures.map((c) => [c.id, c]));
const ELEMENT_NAMES = new Map<string, string>(content.elements.map((e) => [e.id, e.name]));

export function getSpecies(id: string): CreatureSpecies | undefined {
  return SPECIES.get(id);
}

/** True for a Festival species: only ever won in a Festival week, never found on expeditions. */
export function isFestivalSpecies(id: string): boolean {
  return SPECIES.get(id)?.festival === true;
}

export function speciesName(id: string): string {
  return SPECIES.get(id)?.name ?? id;
}

export function elementName(id: string): string {
  return ELEMENT_NAMES.get(id) ?? id;
}

export function capitalize(text: string): string {
  return text === '' ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** The nickname if there is one, otherwise the species name. */
export function creatureName(creature: Pick<Creature, 'nickname' | 'species'>): string {
  return creature.nickname ?? speciesName(creature.species);
}

/** Difference between the server's clock and this device's clock, to apply to local time. */
export function clockOffset(serverNow: number, clientNow: number): number {
  return serverNow - clientNow;
}

/** "1h 02m 03s", "4m 05s" or "12s". Never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (hours > 0) return `${String(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${String(minutes)}m ${pad(seconds)}s`;
  return `${String(seconds)}s`;
}

export interface CreatureAbilityText {
  /** "Flare Strike: Hits the boss at once..." or "Finale ability: unlocks at level 10". */
  line: string;
  unlocked: boolean;
  /** "Evolves into: Pyrelynx (Inferno Strike)" when the creature can evolve into a stronger version. */
  teaser: string | null;
}

/**
 * What a creature card says about its finale ability: the ability and what it does once unlocked,
 * the unlock level before, and a teaser for the evolved form's stronger ability. Null when the
 * species has no ability. Names and descriptions come from the content.
 */
export function creatureAbilityText(
  creature: Pick<Creature, 'ability' | 'evolution'>,
  abilityById: (id: string) => { name: string; description: string } | undefined,
): CreatureAbilityText | null {
  const { ability } = creature;
  if (ability === null) return null;
  const def = abilityById(ability.id);
  let teaser: string | null = null;
  if (ability.nextId !== undefined) {
    const next = abilityById(ability.nextId)?.name ?? ability.nextId;
    teaser =
      creature.evolution === undefined
        ? `Evolves into: ${next}`
        : `Evolves into: ${speciesName(creature.evolution.toSpecies)} (${next})`;
  }
  if (!ability.unlocked) {
    return {
      line: `Finale ability: unlocks at level ${String(ability.unlockLevel)}`,
      unlocked: false,
      teaser,
    };
  }
  return {
    line: def === undefined ? ability.id : `${def.name}: ${def.description}`,
    unlocked: true,
    teaser,
  };
}

/** What the evolve control of a creature card shows. */
export function evolutionText(
  level: number,
  evolution: NonNullable<Creature['evolution']>,
  essence: number,
): { available: boolean; label: string } {
  const target = speciesName(evolution.toSpecies);
  if (evolution.available) {
    return {
      available: true,
      label: `Evolve into ${target} (${String(evolution.essence)} Essence)`,
    };
  }
  const needs: string[] = [];
  if (level < evolution.level) needs.push(`level ${String(evolution.level)}`);
  if (essence < evolution.essence) needs.push(`${String(evolution.essence)} Essence`);
  const raids = essence < evolution.essence ? ' (Essence comes from raids)' : '';
  return {
    available: false,
    label: `Locked: evolving into ${target} needs ${needs.length === 0 ? 'more progress' : needs.join(' and ')}${raids}`,
  };
}

/** Filled and empty stars for the fusion count (0 to 5). */
export function fusionStars(count: number): string {
  const filled = Math.min(Math.max(count, 0), RULES.fusion.maxFusions);
  return '★'.repeat(filled) + '☆'.repeat(RULES.fusion.maxFusions - filled);
}

function percent(bp: number): string {
  return `${String(bp / 100)}%`;
}

/** "Common 72% / Rare 25% / Epic 3%" from the shared rules. */
export function oddsText(supplies: SuppliesId): string {
  const odds = RULES.expedition.supplies[supplies].oddsBp;
  return `Common ${percent(odds.common)} / Rare ${percent(odds.rare)} / Epic ${percent(odds.epic)}`;
}

export const DURATION_OPTIONS: readonly { id: DurationId; label: string }[] = (
  Object.keys(RULES.expedition.durations) as DurationId[]
).map((id) => {
  const { ms, rolls } = RULES.expedition.durations[id];
  const hours = ms / 3_600_000;
  return {
    id,
    label: `${capitalize(id)} (${String(hours)} h, ${String(rolls)} ${rolls === 1 ? 'catch' : 'catches'})`,
  };
});

export const SUPPLIES_OPTIONS: readonly { id: SuppliesId; label: string }[] = (
  Object.keys(RULES.expedition.supplies) as SuppliesId[]
).map((id) => ({
  id,
  label: `${capitalize(id)} (${String(RULES.expedition.supplies[id].costPerRoll)} Bait per catch): ${oddsText(id)}`,
}));

export function durationLabel(id: DurationId): string {
  return DURATION_OPTIONS.find((d) => d.id === id)?.label ?? id;
}

/** Short badges for one reveal row, in display order. */
export function catchBadges(entry: CatchResult): string[] {
  const badges: string[] = [];
  if (entry.outcome === 'new') badges.push('New!');
  if (entry.outcome === 'fused') badges.push(`Fused ★${String(entry.fusionCount ?? 0)}`);
  if (entry.outcome === 'converted') badges.push(`+${String(entry.bait ?? 0)} Bait`);
  if (entry.shiny) badges.push('Shiny!');
  if (entry.firstOnServer) badges.push('First on server!');
  return badges;
}

/** True if this player holds the "first on server" record for the creature's species or line. */
export function isFirstOnServer(creature: Creature, firsts: readonly ServerFirst[]): boolean {
  const stageOne = content.creatures.find((c) => c.line === creature.line && c.stage === 1)?.id;
  return firsts.some((f) => f.mine && (f.species === creature.species || f.species === stageOne));
}

const ERROR_TEXT: Record<string, string> = {
  insufficient_funds: 'Not enough Bait.',
  creature_away: 'That creature is away on an expedition.',
  slots_full: 'All expedition slots are in use.',
  starter_already_chosen: 'You already chose a starter.',
  level_cap: 'That creature is at its level cap.',
  key_conflict: 'That action clashed with an earlier one. Try again.',
  not_found: 'That no longer exists. The page was refreshed.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  invalid_session: 'Your session ended. Close and reopen the Activity.',
  // Evolution.
  not_evolvable: 'That creature cannot evolve.',
  level_too_low: 'That creature is not high enough level to evolve yet.',
  // The raid.
  locked: 'The raid is locked. Changes are closed for this week.',
  slot_taken: 'Someone else already has that slot.',
  not_your_creature: 'That is not one of your creatures.',
  not_in_team: 'Only creatures in your team can be placed. Choose your team first.',
  not_in_roster: "You are not in this week's raid.",
  duplicate_creatures: 'Pick three different creatures.',
  invalid_slot: 'That slot does not exist.',
  // The live finale.
  already_fired: 'Your ability has already been used.',
  not_your_ability: 'That ability is not yours. The screen was out of date.',
  too_late: 'Too late: the fight is in its last round or already over.',
  not_in_fight: 'You are not in this fight.',
  hold_too_late: 'Too late to hold: your ability is already due.',
  // Practice fights (the test server only).
  practice_blocked:
    'Practice fights are closed from 30 minutes before the finale until it has finished.',
  practice_cooldown: 'Your party already had a practice fight in the last 10 minutes.',
  // Raid news channel (server admins only).
  forbidden: 'Only the server owner, or people who can manage the server, can change this.',
  discord_unavailable: 'Discord did not answer. Try again in a moment.',
  channel_unknown: 'The game does not know which channel this was opened in. Reopen the Activity.',
  // Any request.
  invalid_body:
    'The server did not understand that. Close and reopen the Activity if it keeps happening.',
  invalid_id: 'The server did not understand that. Close and reopen the Activity.',
  internal_error: 'The server had a problem. Try again in a moment.',
};

const NICKNAME_REASONS: Record<string, string> = {
  too_long: 'Nicknames can be at most 20 characters.',
  forbidden_characters: 'That nickname has characters that are not allowed.',
  no_visible_characters: 'That nickname has nothing visible in it.',
};

/**
 * Plain-text message for a failed action. `currency` names what ran out when the server says
 * `insufficient_funds` (Bait by default; Essence for evolving).
 */
export function errorText(err: unknown, currency = 'Bait'): string {
  if (err instanceof ApiError) {
    if (err.code === 'invalid_nickname') {
      return NICKNAME_REASONS[err.reason ?? ''] ?? 'That nickname is not allowed.';
    }
    if (err.code === 'insufficient_funds') return `Not enough ${currency}.`;
    return (
      ERROR_TEXT[err.code ?? ''] ?? `Something went wrong (${err.code ?? String(err.status)}).`
    );
  }
  return 'Could not reach the server. Check your connection and try again.';
}
