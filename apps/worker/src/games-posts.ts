/**
 * The Valley Games' Discord post: one message per show day with each event's podium, queued by the award
 * at the show's end (never before: it would spoil the show). Names are cut and escaped (`safeName`);
 * the sender always sends `allowed_mentions: { parse: [] }`. A post never blocks the award: errors are
 * logged by type only.
 */
import { gamesEventDef, placesToMedals } from '@creatures/game';
import type { GamesEventResult } from '@creatures/engine';
import {
  PLAY_BUTTON_ID,
  PLAY_BUTTON_LABEL,
  escapeMarkdown,
  safeName,
  truncateMessage,
  type PostMessage,
} from './discord-format';
import { enqueuePost } from './discord-posts';
import { isBot, playerNames, type StoredEvent } from './games-store';
import { dateToUtcMs } from './time';

const MEDAL_EMOJI = { gold: '🥇', silver: '🥈', bronze: '🥉' } as const;
/** The Games' embed colour (a festive teal). */
const GAMES_COLOUR = 0x2bb3a3;
const DESCRIPTION_MAX = 4096;

/** "Thu 22 Oct": a show day's date (a calendar date, read as UTC). */
function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dateToUtcMs(day));
}

/** One podium line: "🥇 Pepperwick (Misa)", a team "🥇 Misa: Pepperwick, Fizz", a bot "(bot)". */
function podiumLine(
  result: GamesEventResult,
  names: Map<string, string>,
  standing: GamesEventResult['standings'][number],
  medal: keyof typeof MEDAL_EMOJI,
): string {
  const creatures = standing.actors.map((a) => safeName(result.actors[a]?.name ?? 'Unknown', 20));
  const owner = `${safeName(names.get(standing.teamId) ?? 'Unknown')}${isBot(standing.teamId) ? ' (bot)' : ''}`;
  return result.team === 3
    ? `${MEDAL_EMOJI[medal]} ${owner}: ${creatures.join(', ')}`
    : `${MEDAL_EMOJI[medal]} ${creatures.join(', ')} (${owner})`;
}

/** The podium post of a day's show. Pure, given the names. */
export function formatGamesPost(
  day: string,
  events: readonly StoredEvent[],
  names: Map<string, string>,
): PostMessage {
  const blocks = events.map((e) => {
    const title = `**${escapeMarkdown(gamesEventDef(e.eventId)?.name ?? e.eventId)}**`;
    if (e.result === null) return `${title}\nNobody entered.`;
    const result = e.result;
    const medals = placesToMedals(result.standings);
    const lines = result.standings.flatMap((s, i) => {
      const medal = medals[i];
      return medal === null || medal === undefined ? [] : [podiumLine(result, names, s, medal)];
    });
    return `${title}\n${lines.join('\n')}`;
  });
  return {
    embeds: [
      {
        author: { name: 'Valley Games' },
        title: `The podiums of ${dayLabel(day)}`,
        description: truncateMessage(blocks.join('\n\n'), DESCRIPTION_MAX),
        color: GAMES_COLOUR,
        fields: [],
      },
    ],
    components: [
      {
        type: 1,
        components: [{ type: 2, style: 1, label: PLAY_BUTTON_LABEL, custom_id: PLAY_BUTTON_ID }],
      },
    ],
  };
}

/** Queues a day's podium post once (key `games:<day>:podium`). Skipped when nobody entered anything. */
export function queueGamesPost(
  sql: SqlStorage,
  day: string,
  events: readonly StoredEvent[],
  now: number,
): void {
  try {
    if (events.every((e) => e.result === null)) return;
    const ids = events.flatMap((e) => e.result?.standings.map((s) => s.teamId) ?? []);
    const post = formatGamesPost(day, events, playerNames(sql, ids));
    enqueuePost(sql, { key: gamesPostKey(day), content: JSON.stringify(post) }, now);
  } catch (err) {
    console.error('queueing the games post failed', err instanceof Error ? err.name : 'unknown');
  }
}

export const gamesPostKey = (day: string): string => `games:${day}:podium`;
