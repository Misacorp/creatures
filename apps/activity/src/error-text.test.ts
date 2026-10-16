/**
 * The error messages players see, pinned word for word. Changing a message (or losing a code) must
 * be a deliberate edit of this file.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { DUNGEON_ERROR_TEXT, dungeonErrorText } from './dungeon-text';
import { errorText } from './game';

const GAME_MESSAGES: Readonly<Record<string, string>> = {
  insufficient_funds: 'Not enough Bait.',
  creature_away: 'That creature is away on an expedition.',
  slots_full: 'All expedition slots are in use.',
  starter_already_chosen: 'You already chose a starter.',
  level_cap: 'That creature is at its level cap.',
  key_conflict: 'That action clashed with an earlier one. Try again.',
  not_found: 'That no longer exists. The page was refreshed.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  invalid_session: 'Your session ended. Close and reopen the Activity.',
  not_evolvable: 'That creature cannot evolve.',
  level_too_low: 'That creature is not high enough level to evolve yet.',
  locked: 'The raid is locked. Changes are closed for this week.',
  slot_taken: 'Someone else already has that slot.',
  not_your_creature: 'That is not one of your creatures.',
  not_in_team: 'Only creatures in your team can be placed. Choose your team first.',
  not_in_roster: "You are not in this week's raid.",
  duplicate_creatures: 'Pick three different creatures.',
  invalid_slot: 'That slot does not exist.',
  already_fired: 'Your ability has already been used.',
  not_your_ability: 'That ability is not yours. The screen was out of date.',
  too_late: 'Too late: the fight is in its last round or already over.',
  not_in_fight: 'You are not in this fight.',
  hold_too_late: 'Too late to change auto fire: your ability is already due.',
  not_held: 'Auto fire is already on for that ability.',
  not_started: 'The fight has not started yet. Set auto fire in the lobby.',
  practice_blocked:
    'Practice fights are closed from 30 minutes before the finale until it has finished.',
  practice_cooldown: 'Your party already had a practice fight in the last 10 minutes.',
  forbidden: 'Only the server owner, or people who can manage the server, can change this.',
  discord_unavailable: 'Discord did not answer. Try again in a moment.',
  channel_unknown: 'The game does not know which channel this was opened in. Reopen the Activity.',
  insufficient_parts: 'You do not have the parts for that.',
  creature_on_job: 'That creature is on a job in the Workshop. Claim it first.',
  creature_not_found: 'That creature no longer exists. The page was refreshed.',
  creature_busy: 'That creature is out working, so it cannot lounge. The page was refreshed.',
  workshop_full: 'All Workshop slots are in use. Claim a finished job or wait for one to end.',
  inventory_full: 'Your bag is full. Dismantle an item to make room.',
  item_busy: 'That item is in a Workshop job. Claim the job first.',
  not_ready: 'That is not finished yet.',
  max_level: 'That item is already at its top level.',
  same_enchant: 'That item already has that enchant.',
  blueprint_unknown: 'You have not learned that blueprint.',
  nothing_to_improve: 'That item has no extra stat to improve.',
  invalid_secondary: 'That item has no such extra stat.',
  invalid_blueprint: 'That blueprint cannot be crafted.',
  invalid_enchant: 'That enchant does not exist.',
  item_gone: 'The item for that job is gone.',
  skill_too_low: 'That creature needs a higher Crafting level for this supply.',
  invalid_supply: 'That supply cannot be crafted.',
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
  cancelled: 'That trip was called home when the slots were reset.',
  invalid_body:
    'The server did not understand that. Close and reopen the Activity if it keeps happening.',
  invalid_id: 'The server did not understand that. Close and reopen the Activity.',
  internal_error: 'The server had a problem. Try again in a moment.',
};

const DUNGEON_MESSAGES: Readonly<Record<string, string>> = {
  invalid_body:
    'The server did not understand that run. Close and reopen the Activity if it keeps happening.',
  duplicate_creature: 'Pick three different creatures.',
  invalid_id: 'That run could not be found. Close and reopen the Activity.',
  not_found:
    'One of those creatures, or that run, could not be found. The screen was out of date, so it was refreshed.',
  already_run: "You already used today's run. A new one opens when the day resets.",
  key_conflict: 'That run clashed with an earlier one. Check your picks and try again.',
};

describe('error messages', () => {
  it.each(Object.entries(GAME_MESSAGES))('says the same words for "%s"', (code, text) => {
    expect(errorText(new ApiError(409, code))).toBe(text);
  });

  it('pins every code of the table', () => {
    expect(Object.keys(GAME_MESSAGES)).toHaveLength(62);
  });

  it('says the same words for every dungeon code', () => {
    expect({ ...DUNGEON_ERROR_TEXT }).toEqual(DUNGEON_MESSAGES);
    for (const [code, text] of Object.entries(DUNGEON_MESSAGES)) {
      expect(dungeonErrorText(new ApiError(409, code))).toBe(text);
    }
  });

  it('falls back to the game text for a code the dungeon table does not have', () => {
    expect(dungeonErrorText(new ApiError(409, 'insufficient_funds'))).toBe('Not enough Bait.');
    expect(dungeonErrorText(new ApiError(429, 'rate_limited'))).toBe(GAME_MESSAGES['rate_limited']);
  });

  it('names the currency that ran out', () => {
    expect(errorText(new ApiError(409, 'insufficient_funds'))).toBe('Not enough Bait.');
    expect(errorText(new ApiError(409, 'insufficient_funds'), 'Essence')).toBe(
      'Not enough Essence.',
    );
  });

  it('explains nickname refusals by reason', () => {
    expect(errorText(new ApiError(400, 'invalid_nickname', 'too_long'))).toBe(
      'Nicknames can be at most 20 characters.',
    );
    expect(errorText(new ApiError(400, 'invalid_nickname', 'forbidden_characters'))).toBe(
      'That nickname has characters that are not allowed.',
    );
    expect(errorText(new ApiError(400, 'invalid_nickname', 'no_visible_characters'))).toBe(
      'That nickname has nothing visible in it.',
    );
    expect(errorText(new ApiError(400, 'invalid_nickname', 'other'))).toBe(
      'That nickname is not allowed.',
    );
    expect(errorText(new ApiError(400, 'invalid_nickname'))).toBe('That nickname is not allowed.');
  });

  it('explains closed places by reason', () => {
    expect(errorText(new ApiError(409, 'destination_closed', 'rank'))).toBe(
      'That explorer is not a high enough rank for that place yet.',
    );
    expect(errorText(new ApiError(409, 'destination_closed', 'night'))).toBe(
      'That place only opens at night.',
    );
    expect(errorText(new ApiError(409, 'destination_closed', 'festival'))).toBe(
      'That place only opens in Festival weeks.',
    );
    expect(errorText(new ApiError(409, 'destination_closed', 'unknown'))).toBe(
      GAME_MESSAGES['destination_closed'],
    );
  });

  it('explains a trip that is too long for the rank', () => {
    expect(errorText(new ApiError(409, 'rank_too_low', 'length'))).toBe(
      'That explorer is not a high enough rank for a trip that long.',
    );
    expect(errorText(new ApiError(409, 'rank_too_low', null))).toBe(GAME_MESSAGES['rank_too_low']);
  });

  it('has a fallback for an unknown code and for no server answer', () => {
    expect(errorText(new ApiError(418, 'teapot'))).toBe('Something went wrong (teapot).');
    expect(errorText(new ApiError(502, null))).toBe('Something went wrong (502).');
    expect(errorText(new TypeError('Failed to fetch'))).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
  });
});
