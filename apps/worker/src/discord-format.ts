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

type PatternGimmick = Extract<Gimmick, { op: 'sweep' | 'barrage' | 'slam' | 'lance' | 'pincer' }>;
/** The patterns a charge can carry have the same fields as the plain ones, without id and trigger. */
type PatternBody = PatternGimmick | Extract<Gimmick, { op: 'charge' }>['then'];

const ROW_WORDS = { front: 'front', middle: 'middle', back: 'back' } as const;
const SLAM_AIM_WORDS = {
  front: 'the front creature',
  strongest: 'your highest Attack creature',
  left: 'the left-most creature',
  random: 'a random creature',
} as const;

/** What a pattern does, without when ("sweeps the front row, then the middle row"). */
function patternWords(p: PatternBody): string {
  switch (p.op) {
    case 'sweep': {
      const walk = p.rows.map((r) => (r === 'all' ? 'every row' : `the ${ROW_WORDS[r]} row`));
      return `sweeps ${walk.join(', then ')}`;
    }
    case 'barrage': {
      const n = p.shells.max;
      return `rains shells on up to ${String(n)} random ${plural(n, 'creature', 'creatures')}`;
    }
    case 'slam':
      return `slams ${SLAM_AIM_WORDS[p.aim]}, and the blow splashes the creatures beside it`;
    case 'lance':
      return p.lane === 'strongest'
        ? 'drives a lance down the lane of your highest Attack creature'
        : 'drives a lance down a random lane, front to back';
    case 'pincer':
      return p.scope === 'rows'
        ? 'pinches the first and last creature of every row'
        : 'pinches the first and last creature of the row';
  }
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
    case 'strike_highest_atk': {
      const jumps = gimmick.jumps ?? 0;
      const more = jumps > 0 ? `, then jumps on to ${String(jumps)} more` : '';
      return `strikes your highest Attack creature${more} ${when}`;
    }
    case 'sweep':
    case 'barrage':
    case 'slam':
    case 'lance':
    case 'pincer':
      return `${patternWords(gimmick)} ${when}`;
    case 'charge':
      return `winds up one round ahead, then ${patternWords(gimmick.then)}, ${when}`;
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
  /** The server's Boss Rank this week; null when the week has none (an old week, or nobody in yet). */
  rank: number | null;
  /** Set in a Festival week: the name of the Festival creature every winner gets. */
  festivalCreature: string | null;
}

/** Monday: the week's boss. */
export function formatBossReveal(post: RevealPost): string {
  const lines = [
    `**A new raid week begins: ${escapeMarkdown(post.bossName)}**`,
    `Element: ${escapeMarkdown(post.elementName)}. ${TURN_ORDER_WORDS[post.turnOrder]}`,
  ];
  if (post.rank !== null) lines.push(`Boss Rank ${String(post.rank)}.`);
  if (post.festivalCreature !== null) {
    lines.push(
      `Festival week: ${escapeMarkdown(post.festivalCreature)} for every winner, bonus Essence.`,
    );
  }
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

/** The server's rank move after a finale. */
export interface RankPost {
  before: number;
  after: number;
  festival: boolean;
  /** Parties that played, and how many of them won. */
  parties: number;
  partiesWon: number;
}

export interface PhasePost {
  phase: 'phase1' | 'phase2' | 'finale';
  bossName: string;
  /** The party number when the week has more than one party, otherwise null. */
  party: number | null;
  cleared: boolean;
  /** A cleared Phase 1 or 2: the boss reached its floor and retreated. */
  retreated?: boolean;
  /** The finale went into enrage rounds. */
  enraged?: boolean;
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
    firsts: readonly { label: string; names: readonly string[] }[];
    /** Where the server's rank went; null until the ladder has moved (not every party has finished). */
    rank?: RankPost | null;
    /** Festival week only: the creature and the members of this party who got it. */
    festival?: { creature: string; winners: readonly string[] } | null;
  };
}

/** The sentence about the server's rank after a finale. */
function rankLine(rank: RankPost): string {
  const lead =
    rank.parties > 1 ? `${String(rank.partiesWon)} / ${String(rank.parties)} parties won. ` : '';
  if (rank.after > rank.before) return `${lead}The server climbs to Rank ${String(rank.after)}.`;
  if (rank.after < rank.before) {
    return `${lead}${rank.festival ? 'The Festival is over. ' : ''}The server eases to Rank ${String(rank.after)}.`;
  }
  return `${lead}Rank ${String(rank.after)} stays.`;
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
  const boss = escapeMarkdown(post.bossName);
  if (post.cleared && post.retreated === true && post.phase !== 'finale') {
    lines.push(
      `${PHASE_TITLES[post.phase]} cleared: ${boss} retreated.`,
      `The boss has ${String(post.hpLeftPercent)}% HP left.`,
    );
  } else if (post.enraged === true && post.phase === 'finale') {
    lines.push(
      post.cleared
        ? `Cleared, but only after ${boss} flew into a rage. The boss is defeated.`
        : `Not cleared. ${boss} flew into a rage when time ran out. The boss has ${String(post.hpLeftPercent)}% HP left.`,
    );
  } else if (post.cleared && post.hpLeftPercent === 0) {
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
    const { firsts } = post.finale;
    if (post.finale.festival != null && post.finale.festival.winners.length > 0) {
      lines.push(
        `Festival creature: ${escapeMarkdown(post.finale.festival.creature)} for ${post.finale.festival.winners.map((n) => safeName(n)).join(', ')}.`,
      );
    }
    if (post.finale.rank != null) lines.push(rankLine(post.finale.rank));
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
