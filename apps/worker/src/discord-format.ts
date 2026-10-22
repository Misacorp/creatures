/**
 * Text of the messages the game posts to Discord. Pure functions: no storage, no clock, no I/O.
 *
 * Every piece of player-provided text (display names, nicknames) goes through `safeName` or
 * `escapeMarkdown` before it is put into a message, so markdown, mentions, channel links, custom
 * emoji and timestamps typed by a player stay inert text. The sender also always sends
 * `allowed_mentions: { parse: [] }`, so nothing can ping; the escaping keeps the text clean as well.
 * Text never exceeds Discord's limits (`truncateMessage`): 2,000 characters for a plain message, and
 * the embed limits for the raid posts, which are embeds with the boss's portrait and a play button.
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

/** Basis points as a whole percent, "15%". */
function percentOfBp(bp: number): string {
  return `${String(Math.round(bp / 100))}%`;
}

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
  payoff: 'your highest Attack Payoff',
} as const;

/** What a pattern does, without when ("sweeps the front row, then the middle row"). */
function patternWords(p: PatternBody): string {
  switch (p.op) {
    case 'sweep': {
      const walk = p.rows.map((r) =>
        r === 'all'
          ? 'every row'
          : r === 'payoffs'
            ? 'the row with the most Payoffs'
            : `the ${ROW_WORDS[r]} row`,
      );
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
      return `silences the creatures at ${gimmick.scope === 'rows' ? 'both ends of each row' : 'both ends of the row'} for ${String(gimmick.turns)} ${plural(gimmick.turns, 'turn', 'turns')}, ${when}`;
    case 'reflect_first_reaction':
      return `throws the first reaction back at your team, ${when}`;
    case 'backlash':
      return `burns the creature that sets off a reaction for ${percentOfBp(gimmick.shareBp)} of its bonus (${percentOfBp(gimmick.chanceBp)} of the time), ${when}`;
    case 'spikes':
      return `pricks every creature that hits it with ${percentOfBp(gimmick.bp)} of the damage, ${when}`;
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
    case 'purge':
      return `shakes off every debuff on itself, ${when}`;
  }
}

// --- Raid posts: one embed each, the boss's portrait in the corner, and a button to play ---

/** The custom id of the button that launches the game (the lounge message and the raid posts). */
export const PLAY_BUTTON_ID = 'lounge:play';
/** The label of the raid posts' button. */
export const PLAY_BUTTON_LABEL = 'Play Leet Creatures';

// Discord's embed limits (characters).
const EMBED_TITLE_MAX = 256;
const EMBED_TEXT_MAX = 4096;
const FIELD_NAME_MAX = 256;
const FIELD_VALUE_MAX = 1024;
const FOOTER_MAX = 2048;

export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface PostEmbed {
  /** The small line above the title ("Raid finale · Party 2"). */
  author?: { name: string };
  title: string;
  description?: string;
  color: number;
  /**
   * The boss's portrait. A path on the game's own site (`/discord/bosses/<id>.png`): the sender makes
   * it absolute for the environment it runs in, or leaves the thumbnail out when it has no site.
   */
  thumbnail?: { url: string };
  fields: EmbedField[];
  footer?: { text: string };
}

export interface PostButtonRow {
  type: 1;
  components: { type: 2; style: 1; label: string; custom_id: string }[];
}

/** A queued post's message: embeds and the play button. Stored as JSON (`discord-posts.ts`). */
export interface PostMessage {
  embeds: PostEmbed[];
  components: PostButtonRow[];
}

/** The site path of a boss's portrait (drawn by `apps/activity/scripts/boss-portraits.mts`). */
export function bossPortraitPath(bossId: string): string {
  return `/discord/bosses/${encodeURIComponent(bossId)}.png`;
}

/** Embed colours: a won finale, a cleared phase, a lost stage, and each element for the reveal. */
export const POST_COLOURS = {
  won: 0xf2b33d,
  cleared: 0x57a85a,
  lost: 0xc0504d,
  element: {
    tide: 0x3fa7d6,
    ember: 0xe8743b,
    grove: 0x5fae4e,
    spark: 0xf2c94c,
    mire: 0x7a5a3a,
  } as Record<string, number>,
  plain: 0x6b3fa0,
} as const;

const ELEMENT_EMOJI: Record<string, string> = {
  tide: '🌊',
  ember: '🔥',
  grove: '🌿',
  spark: '⚡',
  mire: '🟤',
};

const cut = (text: string, max: number): string => truncateMessage(text, max);

function playRow(): PostButtonRow {
  return {
    type: 1,
    components: [{ type: 2, style: 1, label: PLAY_BUTTON_LABEL, custom_id: PLAY_BUTTON_ID }],
  };
}

function field(name: string, value: string, inline = true): EmbedField {
  return { name: cut(name, FIELD_NAME_MAX), value: cut(value, FIELD_VALUE_MAX), inline };
}

function message(embed: PostEmbed): PostMessage {
  const limited: PostEmbed = {
    ...embed,
    title: cut(embed.title, EMBED_TITLE_MAX),
    ...(embed.description === undefined
      ? {}
      : { description: cut(embed.description, EMBED_TEXT_MAX) }),
    ...(embed.footer === undefined ? {} : { footer: { text: cut(embed.footer.text, FOOTER_MAX) } }),
    ...(embed.author === undefined ? {} : { author: { name: cut(embed.author.name, 256) } }),
  };
  return { embeds: [limited], components: [playRow()] };
}

/**
 * "Fri 13:37": the weekday in the guild's timezone, then a Discord timestamp of the time, which each
 * reader sees in their own timezone.
 */
export function dayAndTime(epochMs: number, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone }).format(epochMs);
  return `${day} <t:${String(Math.floor(epochMs / 1000))}:t>`;
}
/** A Discord timestamp: the relative time ("in 3 days"). */
const relativeTime = (epochMs: number): string => `<t:${String(Math.floor(epochMs / 1000))}:R>`;

const TURN_ORDER_SHORT: Record<TurnOrder, string> = {
  left_to_right: 'creatures act left to right',
  right_to_left: 'creatures act right to left',
  speed: 'creatures act fastest first',
  serpentine: 'creatures snake through the rows',
};

export interface RevealPost {
  bossId: string;
  bossName: string;
  elementId: string;
  elementName: string;
  gimmicks: readonly { name: string; text: string }[];
  turnOrder: TurnOrder;
  /** UTC epoch milliseconds of the three fights. */
  schedule: { phase1: number; phase2: number; finale: number };
  /** The guild's timezone: the fights' weekdays are named in it. */
  timeZone: string;
  players: number;
  parties: number;
  /** The server's Boss Rank this week; null when the week has none (an old week, or nobody in yet). */
  rank: number | null;
  /** Set in a Festival week: the name of the Festival creature every winner gets. */
  festivalCreature: string | null;
}

/** Monday: the week's boss. */
export function formatBossReveal(post: RevealPost): PostMessage {
  const emoji = ELEMENT_EMOJI[post.elementId];
  const lines = [
    `${emoji === undefined ? '' : `${emoji} `}${escapeMarkdown(post.elementName)} · ${TURN_ORDER_SHORT[post.turnOrder]}`,
  ];
  if (post.festivalCreature !== null) {
    lines.push(
      `🎉 Festival week: ${escapeMarkdown(post.festivalCreature)} for every winner, and bonus Essence.`,
    );
  }
  const fields: EmbedField[] = [];
  if (post.gimmicks.length > 0) {
    fields.push(
      field(
        'Moves',
        post.gimmicks
          .map((g) => `**${escapeMarkdown(g.name)}**: ${escapeMarkdown(g.text)}`)
          .join('\n'),
        false,
      ),
    );
  }
  for (const [name, at] of [
    ['Phase 1', post.schedule.phase1],
    ['Phase 2', post.schedule.phase2],
    ['Finale', post.schedule.finale],
  ] as const) {
    fields.push(field(name, dayAndTime(at, post.timeZone)));
  }
  const players = `${String(post.players)} ${plural(post.players, 'player', 'players')} in`;
  return message({
    author: {
      name: `New raid week${post.rank === null ? '' : ` · Rank ${String(post.rank)}`}`,
    },
    title: escapeMarkdown(post.bossName),
    description: lines.join('\n'),
    color: POST_COLOURS.element[post.elementId] ?? POST_COLOURS.plain,
    thumbnail: { url: bossPortraitPath(post.bossId) },
    fields,
    footer: {
      text: post.parties > 1 ? `${players} · ${String(post.parties)} parties` : players,
    },
  });
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

/** A creature that was first on the server this week. */
export interface FirstPost {
  species: string;
  kind: 'catch' | 'evolve';
}

export interface PhasePost {
  phase: 'phase1' | 'phase2' | 'finale';
  bossId: string;
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
  /** Phase 1 only: the boss's counter-move for phase 2, in plain words. */
  counterMove: string | null;
  /** When the next fight starts: Phase 2 after Phase 1, the Finale after Phase 2, the next boss after it. */
  next: number;
  /** Finale only. */
  finale?: {
    /** Creatures first caught or evolved on the server this week by this party, in order. */
    firsts: readonly FirstPost[];
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
  if (rank.after > rank.before) {
    return `${lead}The server climbs to **Rank ${String(rank.after)}**.`;
  }
  if (rank.after < rank.before) {
    return `${lead}${rank.festival ? 'The Festival is over. ' : ''}The server eases to **Rank ${String(rank.after)}**.`;
  }
  return `${lead}The server stays at **Rank ${String(rank.after)}**.`;
}

const PHASE_TITLES = { phase1: 'Phase 1', phase2: 'Phase 2', finale: 'Finale' } as const;
const NEXT_FIGHT = { phase1: 'Phase 2', phase2: 'Finale' } as const;
/** How many first-on-server creatures one post names. */
const MAX_FIRSTS_LISTED = 6;
/** Cells of the HP bar. */
const HP_BAR_CELLS = 10;
const MEDALS = ['🥇', '🥈', '🥉'] as const;

/** "▰▰▰▰▰▰▱▱▱▱ 62% HP left": a bar never looks empty while the boss has HP, nor full when hurt. */
export function hpBar(percent: number): string {
  const p = Math.min(100, Math.max(0, Math.round(percent)));
  let filled = Math.round((p * HP_BAR_CELLS) / 100);
  if (p > 0) filled = Math.max(1, filled);
  if (p < 100) filled = Math.min(HP_BAR_CELLS - 1, filled);
  return `${'▰'.repeat(filled)}${'▱'.repeat(HP_BAR_CELLS - filled)} ${String(p)}% HP left`;
}

function ownedBy(creature: string, owner: string | null): string {
  return owner === null ? safeName(creature) : `${safeName(creature)} (${safeName(owner)})`;
}

function keyMomentField(moment: KeyMoment): EmbedField {
  return moment.kind === 'hit'
    ? field('Big hit', `${ownedBy(moment.creature, moment.owner)}\n${String(moment.damage)} damage`)
    : field(
        'Big combo',
        `${escapeMarkdown(moment.reaction)} by ${ownedBy(moment.creature, moment.owner)}\n+${String(moment.bonus)} bonus damage`,
      );
}

/** The headline and its colour. */
function outcome(post: PhasePost): { title: string; lines: string[]; color: number } {
  const boss = escapeMarkdown(post.bossName);
  const bar = hpBar(post.hpLeftPercent);
  if (post.phase === 'finale') {
    if (post.cleared) {
      return {
        title: `🏆 ${boss} is defeated!`,
        lines: post.enraged === true ? [`It flew into a rage, but the party held on.`] : [],
        color: POST_COLOURS.won,
      };
    }
    return {
      title: `💢 ${boss} survives`,
      lines: [bar, ...(post.enraged === true ? ['It flew into a rage when time ran out.'] : [])],
      color: POST_COLOURS.lost,
    };
  }
  if (post.cleared) {
    return {
      title:
        post.retreated === true ? `✅ ${boss} retreats` : `✅ ${PHASE_TITLES[post.phase]} cleared`,
      lines: [bar],
      color: POST_COLOURS.cleared,
    };
  }
  return { title: `❌ ${boss} holds firm`, lines: [bar], color: POST_COLOURS.lost };
}

function firstsValue(firsts: readonly FirstPost[]): string {
  const names = firsts
    .slice(0, MAX_FIRSTS_LISTED)
    .map((f) => `${escapeMarkdown(f.species)}${f.kind === 'evolve' ? ' (evolved)' : ''}`);
  const more = firsts.length - MAX_FIRSTS_LISTED;
  return more > 0 ? `${names.join(', ')} and ${String(more)} more` : names.join(', ');
}

/** Friday, Saturday and Sunday: one party's result. */
export function formatPhasePost(post: PhasePost): PostMessage {
  const head = outcome(post);
  const lines = [...head.lines];
  const fields: EmbedField[] = [];
  if (post.top.length > 0) {
    fields.push(
      field(
        'Top fighters',
        post.top
          .slice(0, MEDALS.length)
          .map((c, i) => `${MEDALS[i] ?? ''} ${safeName(c.name)}`)
          .join('\n'),
      ),
    );
  }
  if (post.keyMoment !== null) fields.push(keyMomentField(post.keyMoment));
  if (post.phase === 'finale') {
    if (post.reaction !== null) {
      fields.push(
        field(
          'Top reaction',
          `${escapeMarkdown(post.reaction.name)} ×${String(post.reaction.count)}`,
        ),
      );
    }
    const festival = post.finale?.festival;
    if (festival != null && festival.winners.length > 0) {
      lines.push(
        `🎉 ${escapeMarkdown(festival.creature)} joins ${festival.winners.map((n) => safeName(n)).join(', ')}.`,
      );
    }
    if (post.finale?.rank != null) lines.push(rankLine(post.finale.rank));
    lines.push(`Next boss ${relativeTime(post.next)}.`);
    const firsts = post.finale?.firsts ?? [];
    if (firsts.length > 0) fields.push(field('🆕 New on the server', firstsValue(firsts), false));
  } else {
    fields.push(field('Next fight', `${NEXT_FIGHT[post.phase]}\n${relativeTime(post.next)}`));
    if (post.counterMove !== null) {
      fields.push(field('⚠️ Counter-move for Phase 2', escapeMarkdown(post.counterMove), false));
    }
  }
  const party = post.party === null ? '' : ` · Party ${String(post.party)}`;
  return message({
    author: {
      name: `${post.phase === 'finale' ? 'Raid finale' : `Raid · ${PHASE_TITLES[post.phase]}`}${party}`,
    },
    title: head.title,
    ...(lines.length > 0 ? { description: lines.join('\n') } : {}),
    color: head.color,
    thumbnail: { url: bossPortraitPath(post.bossId) },
    fields,
  });
}
