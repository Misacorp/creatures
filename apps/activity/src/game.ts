/**
 * Display helpers for the collection UI. Names, elements and odds come from the shared game
 * content; every number that matters (costs, levels, catches) comes from the server.
 */
import {
  GLOSSARY_IDS,
  RULES,
  content,
  fuseInto,
  fusionLevel,
  fusionProgress,
  fusionThreshold,
  lore,
  quirkText,
  type CreatureSpecies,
  type Rarity,
} from '@creatures/game';
import { ApiError, type CatchResult, type Creature, type ServerFirst } from './api';

const SPECIES = new Map<string, CreatureSpecies>(content.creatures.map((c) => [c.id, c]));
const ELEMENT_NAMES = new Map<string, string>(content.elements.map((e) => [e.id, e.name]));

export function getSpecies(id: string): CreatureSpecies | undefined {
  return SPECIES.get(id);
}

/** True for a Festival species: only ever won in a Festival week, never found on expeditions. */
export function isFestivalSpecies(id: string): boolean {
  return SPECIES.get(id)?.festival === true;
}

/**
 * What players may read about a species: its description and behavioural traits. The visual brief
 * (`appearance`) is for art and is never shown.
 */
export function speciesAbout(
  id: string,
): { description: string; traits: readonly string[] } | null {
  const entry = lore.species[id];
  return entry === undefined ? null : { description: entry.description, traits: entry.traits };
}

/** "Personality: ..." for a creature's quirk id, or null when it has none or the id is unknown. */
export function personalityLine(quirk: string | null): string | null {
  if (quirk === null) return null;
  const text = quirkText(quirk);
  return text === undefined ? null : `Personality: ${text}`;
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

interface CreatureAbilityText {
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
    const evolution = creature.evolution;
    teaser =
      evolution === undefined
        ? `Evolves into: ${next}`
        : evolution.alt === undefined
          ? `Evolves into: ${speciesName(evolution.toSpecies)} (${next})`
          : // Two forms, each with its own ability: the screen that chooses shows them.
            `Evolves into: ${speciesName(evolution.toSpecies)} or ${speciesName(evolution.alt.toSpecies)}`;
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
  const target =
    evolution.alt === undefined
      ? speciesName(evolution.toSpecies)
      : `${speciesName(evolution.toSpecies)} or ${speciesName(evolution.alt.toSpecies)}`;
  if (evolution.available) {
    return {
      available: true,
      label: `Evolve (${String(evolution.essence)} Essence)`,
    };
  }
  const needs: string[] = [];
  if (level < evolution.level) needs.push(`level ${String(evolution.level)}`);
  if (essence < evolution.essence) needs.push(`${String(evolution.essence)} Essence`);
  return {
    available: false,
    label: `Evolve into ${target}: needs ${needs.length === 0 ? 'more progress' : needs.join(' and ')}`,
  };
}

/** Filled and empty stars for the fusion count (0 to 5). */
export function fusionStars(count: number): string {
  const filled = Math.min(Math.max(count, 0), RULES.fusion.maxFusions);
  return '★'.repeat(filled) + '☆'.repeat(RULES.fusion.maxFusions - filled);
}

/**
 * A creature's fusion in a few words: "Fusion 2 · 4/6" (level, then points toward the next level) or
 * "Fusion 5 · max". Fusion stays quiet: the level and the progress, nothing more.
 */
export function fusionProgressText(points: number): string {
  const { level, into, need } = fusionProgress(points);
  if (need === null) return `Fusion ${String(level)} · max`;
  const floor = fusionThreshold(level);
  return `Fusion ${String(level)} · ${String(floor + into)}/${String(floor + need)}`;
}

/** What fusing a duplicate of `rarity` into a creature with `points` gives: "+2 fusion", "+2 fusion · level up". */
export function fusionGain(
  points: number,
  rarity: Rarity,
): { points: number; levelsUp: boolean; text: string } {
  const gained = fuseInto(points, rarity);
  const added = gained === null ? 0 : gained - points;
  const levelsUp = gained !== null && fusionLevel(gained) > fusionLevel(points);
  return {
    points: added,
    levelsUp,
    text: `+${String(added)} fusion${levelsUp ? ' · level up' : ''}`,
  };
}

/** The badges of a catch, in display order, with the glossary entry each one explains (null: nothing to explain). */
export function catchBadgeTags(entry: CatchResult): { text: string; entry: string | null }[] {
  const badges: { text: string; entry: string | null }[] = [];
  if (entry.outcome === 'new') badges.push({ text: 'New!', entry: null });
  if (entry.outcome === 'duplicate') {
    badges.push({ text: 'Duplicate', entry: 'duplicate-choice' });
  }
  if (entry.outcome === 'fused') {
    badges.push({ text: `Fused ★${String(entry.fusionCount ?? 0)}`, entry: 'fusion' });
  }
  if (entry.outcome === 'converted') {
    badges.push({ text: `+${String(entry.bait ?? 0)} Bait`, entry: 'bait' });
  }
  if (entry.shiny) badges.push({ text: 'Shiny!', entry: 'shiny' });
  if (entry.firstOnServer) badges.push({ text: 'First on server!', entry: 'first-on-server' });
  // Second look: the explorer's gear rolled this duplicate's talent twice and kept the better.
  if (entry.secondLook === true) {
    badges.push({ text: 'Second look', entry: GLOSSARY_IDS.gearLine('second-look') });
  }
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
  not_a_branch: 'That creature cannot grow into that form.',
  // The raid.
  locked: 'The raid is locked. Changes are closed for this week.',
  slot_taken: 'Someone else already has that slot.',
  not_your_creature: 'That is not one of your creatures.',
  not_in_team: 'Only creatures in your team can be placed. Choose your team first.',
  not_in_roster: "You are not in this week's raid.",
  not_away: 'They are back in the game, so only they can move their creatures now.',
  not_in_party: 'That player is not in your party.',
  not_movable: 'They placed that one themselves, so only they can move it.',
  duplicate_creatures: 'Pick three different creatures.',
  invalid_slot: 'That slot does not exist.',
  // The live finale.
  already_fired: 'Your ability has already been used.',
  not_your_ability: 'That ability is not yours. The screen was out of date.',
  too_late: 'Too late: the fight is in its last round or already over.',
  not_in_fight: 'You are not in this fight.',
  hold_too_late: 'Too late to change auto fire: your ability is already due.',
  not_held: 'Auto fire is already on for that ability.',
  not_started: 'The fight has not started yet. Set auto fire in the lobby.',
  // Practice fights (the test server only).
  practice_blocked:
    'Practice fights are closed from 30 minutes before the finale until it has finished.',
  practice_cooldown: 'Your party already had a practice fight in the last 10 minutes.',
  // Raid news channel (server admins only).
  forbidden: 'Only the server owner, or people who can manage the server, can change this.',
  discord_unavailable: 'Discord did not answer. Try again in a moment.',
  channel_unknown: 'The game does not know which channel this was opened in. Reopen the Activity.',
  // Gear and the Workshop.
  insufficient_parts: 'You do not have the parts for that.',
  creature_on_job: 'That creature is on a job in the Workshop. Claim it first.',
  // The living room.
  creature_not_found: 'That creature no longer exists. The page was refreshed.',
  creature_busy: 'That creature is out working, so it cannot lounge. The page was refreshed.',
  workshop_full: 'All Workshop slots are in use. Claim a finished job or wait for one to end.',
  inventory_full: 'Your bag is full. Dismantle an item to make room.',
  item_busy: 'That item is in a Workshop job. Claim the job first.',
  not_ready: 'That is not finished yet.',
  wrong_role: 'Only a creature of the role that Charm is made for can wear it.',
  slot_locked: 'That creature is not high enough level for that slot yet.',
  item_level_too_high: 'That item is higher level than that creature.',
  gear_upgrade_removed: 'Gear is not upgraded any more. Use the new items instead.',
  job_kind_removed: 'That kind of job is not in the Workshop any more.',
  dismantle_is_a_job:
    'Dismantling is a Workshop job now. Pick the items and a creature in the Workshop.',
  invalid_bundle:
    'Up to 5 Commons can go in one dismantle job; anything rarer goes alone, and an item cannot repeat.',
  insufficient_essence: 'You do not have enough Essence for that.',
  gear_conversion_pending:
    'Your old gear is still being converted to the new gear. Try again in a little while.',
  blueprint_unknown: 'You have not learned that blueprint.',
  invalid_blueprint: 'That blueprint cannot be crafted.',
  item_gone: 'The item for that job is gone.',
  skill_too_low: 'That creature needs a higher Crafting level for this supply.',
  base_locked: 'That creature needs a higher Crafting level to make this item.',
  invalid_supply: 'That supply cannot be crafted.',
  invalid_recipe: 'That recipe does not exist.',
  insufficient_supplies: 'You do not have the supplies for that.',
  // Expeditions.
  destination_closed: 'That place is closed to this explorer right now.',
  rank_too_low: 'That explorer is not a high enough rank for that.',
  supply_missing: 'You do not have that supply in stock any more.',
  invalid_supplies: 'Those supplies cannot go together: at most two, never two of the same kind.',
  supplies_not_for_sale:
    'Supplies cannot be bought any more. Take one from your stock, or craft one in the Workshop.',
  invalid_destination: 'That place does not exist.',
  not_active: 'That trip is already over.',
  no_offer: 'That trip has no choice to make.',
  not_offered: 'That goal was not on offer.',
  already_chosen: 'You already chose a goal for that trip.',
  // Duplicates and the Talent Book.
  teach_not_offered: 'That creature cannot learn that talent: it has it already.',
  keep_not_offered: 'You cannot keep that one: there is no second branch to keep it for.',
  max_fusions: 'That creature is fully fused already.',
  not_in_book: 'That talent is not in that creature\u2019s Talent Book.',
  already_slotted: 'That talent is already in that slot.',
  cancelled: 'That trip was called home when the slots were reset.',
  // Any request.
  invalid_body:
    'The server did not understand that. Close and reopen the Activity if it keeps happening.',
  invalid_id: 'The server did not understand that. Close and reopen the Activity.',
  internal_error: 'The server had a problem. Try again in a moment.',
};

/** Why a place refused a trip (the server's `reason` of `destination_closed`). */
const DESTINATION_CLOSED_REASONS: Record<string, string> = {
  rank: 'That explorer is not a high enough rank for that place yet.',
  night: 'That place only opens at night.',
  festival: 'That place only opens in Festival weeks.',
};

const NICKNAME_REASONS: Record<string, string> = {
  too_long: 'Nicknames can be at most 20 characters.',
  forbidden_characters: 'That nickname has characters that are not allowed.',
  no_visible_characters: 'That nickname has nothing visible in it.',
};

/**
 * Plain-text message for a failed action. `currency` names what ran out when the server says
 * `insufficient_funds` (Bait by default; Essence for evolving). `table` holds the words of one
 * screen (the dungeon's): a code that is in it wins over the shared text.
 */
export function errorText(
  err: unknown,
  currency = 'Bait',
  table?: Readonly<Record<string, string>>,
): string {
  if (err instanceof ApiError) {
    if (table !== undefined && err.code !== null && Object.hasOwn(table, err.code)) {
      return table[err.code] as string;
    }
    if (err.code === 'invalid_nickname') {
      return NICKNAME_REASONS[err.reason ?? ''] ?? 'That nickname is not allowed.';
    }
    if (err.code === 'insufficient_funds') return `Not enough ${currency}.`;
    if (err.code === 'destination_closed' && DESTINATION_CLOSED_REASONS[err.reason ?? '']) {
      return DESTINATION_CLOSED_REASONS[err.reason ?? ''] as string;
    }
    // The wear rule: the reason is the creature level it needs, or the role of a role-locked Charm.
    if (err.code === 'slot_locked' && err.reason !== null && /^\d+$/.test(err.reason)) {
      return `That slot opens at creature level ${err.reason}.`;
    }
    if (err.code === 'item_level_too_high' && err.reason !== null && /^\d+$/.test(err.reason)) {
      return `That item needs creature level ${err.reason}.`;
    }
    if (err.code === 'wrong_role' && err.reason !== null && /^[a-z]{3,10}$/.test(err.reason)) {
      return `Only a ${capitalize(err.reason)} can wear that Charm.`;
    }
    // A talent slot opens at a creature level: the reason is `needs_level_N`.
    if (err.code === 'slot_closed') {
      const level = /^needs_level_(\d+)$/.exec(err.reason ?? '')?.[1];
      return level === undefined
        ? 'That creature has no such talent slot.'
        : `That talent slot opens at creature level ${level}.`;
    }
    if (err.code === 'rank_too_low' && err.reason === 'length') {
      return 'That explorer is not a high enough rank for a trip that long.';
    }
    return (
      ERROR_TEXT[err.code ?? ''] ?? `Something went wrong (${err.code ?? String(err.status)}).`
    );
  }
  return 'Could not reach the server. Check your connection and try again.';
}
