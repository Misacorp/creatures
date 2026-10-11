/**
 * Text of the messages the game posts to Discord. Pure functions: no storage, no clock, no I/O.
 *
 * Every piece of player-provided text (display names, nicknames) goes through `safeName` or
 * `escapeMarkdown` before it is put into a message, so markdown, mentions, channel links, custom
 * emoji and timestamps typed by a player stay inert text. The sender also always sends
 * `allowed_mentions: { parse: [] }`, so nothing can ping; the escaping keeps the text clean as well.
 * Messages never exceed Discord's 2,000 character limit (`truncateMessage`).
 */
import type { Gimmick, TurnOrder } from '@creatures/game';

/** Discord's message length limit, in UTF-16 code units. */
export const MAX_MESSAGE_CHARS = 2000;
/** Names are cut to this many code points before they are escaped (display names are at most 32). */
export const MAX_NAME_CODE_POINTS = 32;

const ZERO_WIDTH_SPACE = '\u200B';
const ELLIPSIS = '\u2026';

/**
 * Makes player text inert in a Discord message. Backslash-escapes `\ * _ ~ ` | > # - [ ] ( ) :` and
 * inserts a zero-width space after every `@`, so `@everyone`, `@here`, `<@id>`, `<@&id>` never
 * resolve (`<#id>` and `<:emoji:id>` are broken by the escaped `#` and `:`). Line breaks become
 * spaces, so a name can never start a new markdown line.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[\\*_~`|>#[\]():-]/g, '\\$&')
    .replace(/@/g, `@${ZERO_WIDTH_SPACE}`);
}

/** A player name for a message: cut to a safe length (by code points), then escaped. */
export function safeName(raw: string, maxCodePoints: number = MAX_NAME_CODE_POINTS): string {
  const points = Array.from(raw.trim());
  if (points.length === 0) return 'Unknown';
  const cut =
    points.length > maxCodePoints
      ? `${points.slice(0, maxCodePoints - 1).join('')}${ELLIPSIS}`
      : raw.trim();
  return escapeMarkdown(cut);
}

/**
 * Cuts a finished message to `max` UTF-16 units, ending with an ellipsis. Never cuts inside a
 * surrogate pair, an escape (a backslash and the character it protects) or a Discord timestamp.
 */
export function truncateMessage(text: string, max: number = MAX_MESSAGE_CHARS): string {
  if (text.length <= max) return text;
  let cut = '';
  for (const point of text) {
    if (cut.length + point.length > max - ELLIPSIS.length) break;
    cut += point;
  }
  // An odd number of trailing backslashes means the last one escapes a character that was cut off.
  const trailing = /\\+$/.exec(cut)?.[0].length ?? 0;
  if (trailing % 2 === 1) cut = cut.slice(0, -1);
  // An unfinished `<t:...>` timestamp would show as raw text.
  const open = cut.lastIndexOf('<t:');
  if (open !== -1 && cut.indexOf('>', open) === -1) cut = cut.slice(0, open);
  return `${cut.trimEnd()}${ELLIPSIS}`;
}

/** A Discord timestamp: the full date and time, and the relative time ("in 3 days"). */
export function discordTime(epochMs: number): string {
  const seconds = String(Math.floor(epochMs / 1000));
  return `<t:${seconds}:F> (<t:${seconds}:R>)`;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

function everyWords(trigger: Gimmick['trigger']): string {
  return 'every' in trigger ? `every ${String(trigger.every)} rounds` : 'every round';
}

/** A boss gimmick in plain words, for example "hits the front zone every 3 rounds". */
export function describeGimmick(gimmick: Gimmick): string {
  const when = everyWords(gimmick.trigger);
  switch (gimmick.op) {
    case 'hit_zone':
      return `hits the ${gimmick.zone} zone ${when}`;
    case 'silence_ends':
      return `silences the creatures at both ends of the row for ${String(gimmick.turns)} ${plural(gimmick.turns, 'turn', 'turns')}, ${when}`;
    case 'reflect_first_reaction':
      return `throws the first reaction back at your team, ${when}`;
    case 'strike_highest_atk':
      return `strikes your highest Attack creature ${when}`;
  }
}

const TURN_ORDER_WORDS: Record<TurnOrder, string> = {
  left_to_right: 'Creatures act from left to right.',
  right_to_left: 'Creatures act from right to left.',
  speed: 'Creatures act fastest first.',
};

export interface RevealPost {
  bossName: string;
  elementName: string;
  gimmicks: readonly { name: string; text: string }[];
  turnOrder: TurnOrder;
  /** UTC epoch milliseconds of the three fights. */
  schedule: { phase1: number; phase2: number; finale: number };
  players: number;
  parties: number;
}

/** Monday: the week's boss. */
export function formatBossReveal(post: RevealPost): string {
  const lines = [
    `**A new raid week begins: ${escapeMarkdown(post.bossName)}**`,
    `Element: ${escapeMarkdown(post.elementName)}. ${TURN_ORDER_WORDS[post.turnOrder]}`,
  ];
  for (const g of post.gimmicks) {
    lines.push(`${escapeMarkdown(g.name)}: ${escapeMarkdown(g.text)}.`);
  }
  lines.push(
    `Phase 1: ${discordTime(post.schedule.phase1)}`,
    `Phase 2: ${discordTime(post.schedule.phase2)}`,
    `Finale: ${discordTime(post.schedule.finale)}`,
    `${String(post.players)} ${plural(post.players, 'player is', 'players are')} in this week${
      post.parties > 1 ? `, in ${String(post.parties)} parties` : ''
    }.`,
  );
  return truncateMessage(lines.join('\n'));
}

export type KeyMoment =
  | { kind: 'hit'; round: number; creature: string; owner: string | null; damage: number }
  | {
      kind: 'reaction';
      round: number;
      creature: string;
      owner: string | null;
      reaction: string;
      bonus: number;
    };

export interface PhasePost {
  phase: 'phase1' | 'phase2' | 'finale';
  bossName: string;
  /** The party number when the week has more than one party, otherwise null. */
  party: number | null;
  cleared: boolean;
  /** Whole percent of the boss's HP left, 0 to 100. */
  hpLeftPercent: number;
  /** Best first, by contribution (damage plus setup, support and guard credit). */
  top: readonly { name: string; contribution: number }[];
  reaction: { name: string; count: number } | null;
  keyMoment: KeyMoment | null;
  /** The flat Essence every player got, or null when the stage was not cleared. */
  essenceFlat: number | null;
  /** Phase 1 only: the boss's counter-move for phase 2, in plain words. */
  counterMove: string | null;
  /** Finale only. */
  finale?: {
    jackpot: readonly string[];
    firsts: readonly { label: string; names: readonly string[] }[];
  };
}

const PHASE_TITLES = { phase1: 'Phase 1', phase2: 'Phase 2', finale: 'Finale' } as const;
/** How many first-on-server records one message lists. */
const MAX_FIRSTS_LISTED = 5;

function ownedBy(creature: string, owner: string | null): string {
  return owner === null ? safeName(creature) : `${safeName(creature)} (${safeName(owner)})`;
}

function keyMomentLine(moment: KeyMoment): string {
  return moment.kind === 'hit'
    ? `Key moment: in round ${String(moment.round)}, ${ownedBy(moment.creature, moment.owner)} hit for ${String(moment.damage)} damage.`
    : `Key moment: in round ${String(moment.round)}, ${ownedBy(moment.creature, moment.owner)} set off ${escapeMarkdown(moment.reaction)} for ${String(moment.bonus)} bonus damage.`;
}

/** Friday, Saturday and Sunday: one party's result. */
export function formatPhasePost(post: PhasePost): string {
  const party = post.party === null ? '' : ` (party ${String(post.party)})`;
  const lines = [`**${PHASE_TITLES[post.phase]}: ${escapeMarkdown(post.bossName)}${party}**`];
  if (post.cleared && post.hpLeftPercent === 0) {
    lines.push('Cleared. The boss is defeated.');
  } else {
    lines.push(
      `${post.cleared ? 'Cleared' : 'Not cleared'}. The boss has ${String(post.hpLeftPercent)}% HP left.`,
    );
  }
  if (post.top.length > 0) {
    lines.push(
      `Top contributors: ${post.top
        .slice(0, 3)
        .map((c) => `${safeName(c.name)} (${String(c.contribution)} contribution)`)
        .join(', ')}.`,
    );
  }
  lines.push(
    post.reaction === null
      ? 'No reactions were triggered.'
      : `Most used reaction: ${escapeMarkdown(post.reaction.name)} (${String(post.reaction.count)} ${plural(post.reaction.count, 'time', 'times')}).`,
  );
  if (post.keyMoment !== null) lines.push(keyMomentLine(post.keyMoment));
  if (post.essenceFlat !== null) {
    lines.push(
      `Essence: every player earned ${String(post.essenceFlat)}, plus a bonus share by contribution.`,
    );
  }
  if (post.counterMove !== null) {
    lines.push(`The boss's counter-move for Phase 2: ${escapeMarkdown(post.counterMove)}`);
  }
  if (post.finale !== undefined) {
    const { jackpot, firsts } = post.finale;
    if (jackpot.length > 0) {
      lines.push(`Jackpot: ${jackpot.map((n) => safeName(n)).join(', ')}.`);
    } else if (post.cleared) {
      lines.push('No jackpot this week.');
    }
    if (firsts.length > 0) {
      lines.push('First on the server this week:');
      for (const f of firsts.slice(0, MAX_FIRSTS_LISTED)) {
        lines.push(`${escapeMarkdown(f.label)}: ${f.names.map((n) => safeName(n)).join(', ')}`);
      }
      if (firsts.length > MAX_FIRSTS_LISTED) {
        lines.push(`and ${String(firsts.length - MAX_FIRSTS_LISTED)} more.`);
      }
    }
  }
  return truncateMessage(lines.join('\n'));
}
