import { content, type Gimmick } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_CHARS,
  describeGimmick,
  discordTime,
  escapeMarkdown,
  formatBossReveal,
  dayAndTime,
  formatPhasePost,
  hpBar,
  PLAY_BUTTON_ID,
  safeName,
  truncateMessage,
  type PhasePost,
  type PostEmbed,
  type PostMessage,
  type RankPost,
  type RevealPost,
} from '../src/discord-format';

const ZWSP = '\u200B';

describe('escapeMarkdown', () => {
  it.each(['\\', '*', '_', '~', '`', '|', '>', '#', '-', '[', ']', '(', ')', ':'])(
    'backslash-escapes %s',
    (char) => {
      expect(escapeMarkdown(char)).toBe(`\\${char}`);
      expect(escapeMarkdown(`a${char}b`)).toBe(`a\\${char}b`);
    },
  );

  it('leaves ordinary text alone', () => {
    expect(escapeMarkdown('Misa the Great 42')).toBe('Misa the Great 42');
    expect(escapeMarkdown('Zoë 日本語 😀')).toBe('Zoë 日本語 😀');
  });

  it('breaks @everyone and @here', () => {
    expect(escapeMarkdown('@everyone')).toBe(`@${ZWSP}everyone`);
    expect(escapeMarkdown('@here')).toBe(`@${ZWSP}here`);
    expect(escapeMarkdown('x@everyone@here')).toBe(`x@${ZWSP}everyone@${ZWSP}here`);
  });

  it('breaks user, role and channel mentions', () => {
    expect(escapeMarkdown('<@123>')).toBe(`<@${ZWSP}123\\>`);
    expect(escapeMarkdown('<@!123>')).toBe(`<@${ZWSP}!123\\>`);
    expect(escapeMarkdown('<@&123>')).toBe(`<@${ZWSP}&123\\>`);
    expect(escapeMarkdown('<#123>')).toBe('<\\#123\\>');
  });

  it('breaks custom emoji and timestamps typed by a player', () => {
    expect(escapeMarkdown('<:wave:123456789012345678>')).toBe('<\\:wave\\:123456789012345678\\>');
    expect(escapeMarkdown('<t:1700000000:R>')).toBe('<t\\:1700000000\\:R\\>');
  });

  it('breaks links', () => {
    expect(escapeMarkdown('https://example.com')).toBe('https\\://example.com');
    expect(escapeMarkdown('[click](https://x.y)')).toBe('\\[click\\]\\(https\\://x.y\\)');
  });

  it('turns line breaks into spaces so a name cannot start a markdown line', () => {
    expect(escapeMarkdown('a\n# b\r\n> c')).toBe('a \\# b \\> c');
  });

  it('handles a name made entirely of markdown', () => {
    const name = '**__~~`||>>##--[[]]((::))\\\\';
    const escaped = escapeMarkdown(name);
    // Every character is protected: removing the escapes gives the name back.
    expect(escaped.replace(/\\(.)/g, '$1')).toBe(name);
    expect(escaped).toHaveLength(name.length * 2);
  });
});

describe('safeName', () => {
  it('cuts very long names by code points before escaping, never mid-escape', () => {
    const name = '*'.repeat(500);
    const safe = safeName(name);
    expect(safe).toBe(`${'\\*'.repeat(31)}\u2026`);
    const emoji = safeName('😀'.repeat(100));
    expect(Array.from(emoji)).toHaveLength(32);
    expect(emoji.endsWith('\u2026')).toBe(true);
  });

  it('keeps names that fit and falls back for empty ones', () => {
    expect(safeName('Alice')).toBe('Alice');
    expect(safeName('a'.repeat(32))).toBe('a'.repeat(32));
    expect(safeName('   ')).toBe('Unknown');
  });
});

describe('truncateMessage', () => {
  it('returns messages that fit unchanged', () => {
    expect(truncateMessage('hello')).toBe('hello');
    const exact = 'a'.repeat(MAX_MESSAGE_CHARS);
    expect(truncateMessage(exact)).toBe(exact);
  });

  it('cuts to 2000 characters and ends with an ellipsis', () => {
    const out = truncateMessage('a'.repeat(3000));
    expect(out).toHaveLength(MAX_MESSAGE_CHARS);
    expect(out.endsWith('\u2026')).toBe(true);
  });

  it('never cuts inside an escape sequence', () => {
    // The cut would fall between a backslash and the character it protects.
    for (const pad of [1997, 1998, 1999]) {
      const out = truncateMessage(`${'a'.repeat(pad)}\\*\\*\\*\\*`);
      expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
      const body = out.slice(0, -1);
      expect((/\\+$/.exec(body)?.[0].length ?? 0) % 2).toBe(0);
    }
    // An escaped backslash at the end is a complete pair and stays.
    const out = truncateMessage(`${'a'.repeat(1997)}\\\\${'b'.repeat(10)}`);
    expect(out.endsWith('\\\\\u2026')).toBe(true);
  });

  it('never cuts a surrogate pair in half', () => {
    const out = truncateMessage(`${'a'.repeat(1998)}${'😀'.repeat(5)}`);
    expect(out).toHaveLength(MAX_MESSAGE_CHARS - 1);
    expect(Array.from(out).every((c) => c.length === 1 || c.length === 2)).toBe(true);
    expect(out.endsWith('a\u2026')).toBe(true);
  });

  it('drops an unfinished timestamp', () => {
    const out = truncateMessage(`${'a'.repeat(1985)} <t:1700000000:F> (<t:1700000000:R>)`);
    expect(out).not.toMatch(/<t:[^>]*$/);
    expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  });
});

describe('discordTime', () => {
  it('gives the full date and the relative time for the same second', () => {
    expect(discordTime(1_800_000_123_456)).toBe('<t:1800000123:F> (<t:1800000123:R>)');
  });
});

describe('describeGimmick', () => {
  it('says what every content gimmick does in plain words', () => {
    const gimmicks = content.bosses.flatMap((b) => b.gimmicks);
    const texts = gimmicks.map((g) => describeGimmick(g));
    expect(texts.length).toBeGreaterThanOrEqual(4);
    // Every gimmick gets its own plain sentence with its rhythm; the exact wording of each op is
    // pinned below with fixed numbers, so tuning the content does not break this.
    for (const [i, text] of texts.entries()) {
      const gimmick = gimmicks[i];
      expect(text, gimmick?.id).toMatch(/^[a-z].* every (round|\d+ rounds)$/);
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('NaN');
    }
  });

  it('handles plurals and every op', () => {
    const base = { id: 'g', name: 'G' };
    const cases: [Gimmick, string][] = [
      [
        { ...base, op: 'silence_ends', scope: 'row', turns: 2, trigger: { every: 4 } },
        'silences the creatures at both ends of the row for 2 turns, every 4 rounds',
      ],
      [
        { ...base, op: 'silence_ends', scope: 'rows', turns: 1, trigger: { every: 2 } },
        'silences the creatures at both ends of each row for 1 turn, every 2 rounds',
      ],
      [
        { ...base, op: 'hit_zone', zone: 'back', power: 5000, trigger: { eachRound: true } },
        'hits the back zone every round',
      ],
    ];
    for (const [gimmick, text] of cases) expect(describeGimmick(gimmick)).toBe(text);
  });

  it('says the attack patterns, the chain jumps and the charge in plain words', () => {
    const base = { id: 'g', name: 'G', trigger: { every: 3 } };
    const sweep = {
      op: 'sweep' as const,
      rows: ['front', 'middle', 'all'] as ('front' | 'middle' | 'back' | 'all' | 'payoffs')[],
      power: 6000,
    };
    const barrage = {
      op: 'barrage',
      shells: { min: 2, max: 4, shareBp: 3000 },
      power: 5000,
    } as const;
    const slam = { op: 'slam', aim: 'strongest', power: 15_000, splashBp: 4000 } as const;
    const lance = { op: 'lance', lane: 'random', power: 9000, falloffBp: 6000 } as const;
    const pincer = { op: 'pincer', scope: 'rows', power: 7000 } as const;
    const cases: [Gimmick, string][] = [
      [
        { ...base, ...sweep },
        'sweeps the front row, then the middle row, then every row every 3 rounds',
      ],
      [{ ...base, ...barrage }, 'rains shells on up to 4 random creatures every 3 rounds'],
      [
        { ...base, ...barrage, shells: { min: 1, max: 1, shareBp: 1000 } },
        'rains shells on up to 1 random creature every 3 rounds',
      ],
      [
        { ...base, ...slam },
        'slams your highest Attack creature, and the blow splashes the creatures beside it every 3 rounds',
      ],
      [
        { ...base, ...slam, aim: 'front' },
        'slams the front creature, and the blow splashes the creatures beside it every 3 rounds',
      ],
      [
        { ...base, ...slam, aim: 'left' },
        'slams the left-most creature, and the blow splashes the creatures beside it every 3 rounds',
      ],
      [
        { ...base, ...slam, aim: 'random' },
        'slams a random creature, and the blow splashes the creatures beside it every 3 rounds',
      ],
      [
        { ...base, ...slam, aim: 'payoff' },
        'slams your highest Attack Payoff, and the blow splashes the creatures beside it every 3 rounds',
      ],
      [
        { ...base, ...sweep, rows: ['payoffs'] },
        'sweeps the row with the most Payoffs every 3 rounds',
      ],
      [
        { ...base, ...sweep, rows: ['back', 'payoffs'] },
        'sweeps the back row, then the row with the most Payoffs every 3 rounds',
      ],
      [{ ...base, ...lance }, 'drives a lance down a random lane, front to back every 3 rounds'],
      [
        { ...base, ...lance, lane: 'strongest' },
        'drives a lance down the lane of your highest Attack creature every 3 rounds',
      ],
      [{ ...base, ...pincer }, 'pinches the first and last creature of every row every 3 rounds'],
      [
        { ...base, ...pincer, scope: 'row' },
        'pinches the first and last creature of the row every 3 rounds',
      ],
      [
        { ...base, op: 'strike_highest_atk', power: 12_000, jumps: 2 },
        'strikes your highest Attack creature, then jumps on to 2 more every 3 rounds',
      ],
      [
        { ...base, op: 'strike_highest_atk', power: 12_000, jumps: 0 },
        'strikes your highest Attack creature every 3 rounds',
      ],
      [
        { ...base, op: 'charge', then: pincer },
        'winds up one round ahead, then pinches the first and last creature of every row, every 3 rounds',
      ],
      [
        { ...base, op: 'charge', then: sweep },
        'winds up one round ahead, then sweeps the front row, then the middle row, then every row, every 3 rounds',
      ],
    ];
    for (const [gimmick, text] of cases) expect(describeGimmick(gimmick)).toBe(text);
  });
});

const REVEAL: RevealPost = {
  bossId: 'tidal-colossus',
  bossName: 'Tidal Colossus',
  elementId: 'tide',
  elementName: 'Tide',
  gimmicks: [{ name: 'Undertow', text: 'hits the front zone every 3 rounds' }],
  turnOrder: 'left_to_right',
  schedule: {
    phase1: Date.parse('2027-01-15T11:37:00Z'),
    phase2: Date.parse('2027-01-16T11:37:00Z'),
    finale: Date.parse('2027-01-17T18:00:00Z'),
  },
  timeZone: 'Europe/Helsinki',
  players: 7,
  parties: 1,
  rank: 4,
  festivalCreature: null,
};

/** The one embed of a post, after checking the post has the play button. */
function embedOf(message: PostMessage): PostEmbed {
  expect(message.components).toEqual([
    {
      type: 1,
      components: [{ type: 2, style: 1, label: 'Play Leet Creatures', custom_id: PLAY_BUTTON_ID }],
    },
  ]);
  expect(message.embeds).toHaveLength(1);
  return message.embeds[0] as PostEmbed;
}

/** Every piece of text a reader sees in a post. */
const textOf = (message: PostMessage): string =>
  JSON.stringify(message.embeds.map((e) => [e.author, e.title, e.description, e.fields, e.footer]));

describe('formatBossReveal', () => {
  it('matches the Monday post', () => {
    expect(embedOf(formatBossReveal(REVEAL))).toEqual({
      author: { name: 'New raid week · Rank 4' },
      title: 'Tidal Colossus',
      description: '🌊 Tide · creatures act left to right',
      color: 0x3fa7d6,
      thumbnail: { url: '/discord/bosses/tidal-colossus.png' },
      fields: [
        { name: 'Moves', value: '**Undertow**: hits the front zone every 3 rounds', inline: false },
        { name: 'Phase 1', value: 'Fri <t:1800013020:t>', inline: true },
        { name: 'Phase 2', value: 'Sat <t:1800099420:t>', inline: true },
        { name: 'Finale', value: 'Sun <t:1800208800:t>', inline: true },
      ],
      footer: { text: '7 players in' },
    });
  });

  it('says nothing about the rank when the week has none, and announces a Festival', () => {
    expect(embedOf(formatBossReveal({ ...REVEAL, rank: null })).author).toEqual({
      name: 'New raid week',
    });
    const festival = embedOf(
      formatBossReveal({ ...REVEAL, rank: 7, festivalCreature: 'Lanternfin' }),
    );
    expect(festival.author?.name).toBe('New raid week · Rank 7');
    expect(festival.description).toContain(
      '🎉 Festival week: Lanternfin for every winner, and bonus Essence.',
    );
    // The creature name is escaped like every other name.
    const nasty = textOf(formatBossReveal({ ...REVEAL, festivalCreature: '@everyone *x*' }));
    expect(nasty).not.toMatch(/@(?!\u200B)/);
    expect(nasty).toContain('\\\\*x\\\\*');
    expect(textOf(formatBossReveal({ ...REVEAL, rank: 7 }))).not.toContain('Festival');
  });

  it('handles one player, several parties, other turn orders and no moves', () => {
    const one = embedOf(
      formatBossReveal({ ...REVEAL, players: 1, turnOrder: 'speed', gimmicks: [] }),
    );
    expect(one.description).toBe('🌊 Tide · creatures act fastest first');
    expect(one.footer).toEqual({ text: '1 player in' });
    expect(one.fields.map((f) => f.name)).toEqual(['Phase 1', 'Phase 2', 'Finale']);
    const many = embedOf(
      formatBossReveal({ ...REVEAL, players: 31, parties: 3, turnOrder: 'right_to_left' }),
    );
    expect(many.footer).toEqual({ text: '31 players in · 3 parties' });
    expect(many.description).toContain('creatures act right to left');
    const snake = embedOf(formatBossReveal({ ...REVEAL, turnOrder: 'serpentine' }));
    expect(snake.description).toContain('creatures snake through the rows');
  });

  it('names the weekday in the guild\u2019s timezone', () => {
    // 23:30 UTC on a Thursday is already Friday in Helsinki.
    const late = Date.parse('2027-01-14T23:30:00Z');
    expect(dayAndTime(late, 'Europe/Helsinki')).toBe('Fri <t:1799969400:t>');
    expect(dayAndTime(late, 'UTC')).toBe('Thu <t:1799969400:t>');
  });

  it('takes the colour of the element, and a plain one for an unknown element', () => {
    const ember = embedOf(
      formatBossReveal({ ...REVEAL, elementId: 'ember', elementName: 'Ember' }),
    );
    expect(ember.color).toBe(0xe8743b);
    expect(ember.description?.startsWith('🔥 Ember')).toBe(true);
    const odd = embedOf(formatBossReveal({ ...REVEAL, elementId: 'void', elementName: 'Void' }));
    expect(odd.color).toBe(0x6b3fa0);
    expect(odd.description?.startsWith('Void')).toBe(true);
  });

  it('keeps within the embed limits however many moves there are', () => {
    const long = 'x'.repeat(40);
    const embed = embedOf(
      formatBossReveal({
        ...REVEAL,
        gimmicks: Array.from({ length: 200 }, () => ({ name: long, text: long })),
      }),
    );
    expect(embed.fields[0]?.value.length).toBeLessThanOrEqual(1024);
    expect(embed.fields[0]?.value.endsWith('…')).toBe(true);
  });
});

const NEXT = Date.parse('2027-01-16T11:37:00Z');

const PHASE: PhasePost = {
  phase: 'phase1',
  bossId: 'tidal-colossus',
  bossName: 'Tidal Colossus',
  party: null,
  cleared: true,
  retreated: true,
  hpLeftPercent: 78,
  top: [
    { name: 'Alice', contribution: 1234 },
    { name: 'Bob', contribution: 800 },
    { name: 'Carol', contribution: 55 },
    { name: 'Dave', contribution: 1 },
  ],
  reaction: { name: 'Steam', count: 4 },
  keyMoment: { kind: 'hit', round: 3, creature: 'Flamy', owner: 'Alice', damage: 320 },
  counterMove: 'Tidal Colossus now resists Steam by 50% (the reaction used most).',
  next: NEXT,
};

const FINALE: PhasePost = {
  ...PHASE,
  phase: 'finale',
  retreated: false,
  hpLeftPercent: 0,
  counterMove: null,
  next: Date.parse('2027-01-18T11:37:00Z'),
  finale: { firsts: [] },
};

describe('hpBar', () => {
  it('fills a cell for every tenth, never empty while the boss lives nor full once hurt', () => {
    expect(hpBar(62)).toBe('▰▰▰▰▰▰▱▱▱▱ 62% HP left');
    expect(hpBar(0)).toBe('▱▱▱▱▱▱▱▱▱▱ 0% HP left');
    expect(hpBar(1)).toBe('▰▱▱▱▱▱▱▱▱▱ 1% HP left');
    expect(hpBar(99)).toBe('▰▰▰▰▰▰▰▰▰▱ 99% HP left');
    expect(hpBar(100)).toBe('▰▰▰▰▰▰▰▰▰▰ 100% HP left');
  });
});

describe('formatPhasePost', () => {
  it('matches the Friday post: the boss retreats, the next fight and the counter-move', () => {
    expect(embedOf(formatPhasePost(PHASE))).toEqual({
      author: { name: 'Raid · Phase 1' },
      title: '✅ Tidal Colossus retreats',
      description: '▰▰▰▰▰▰▰▰▱▱ 78% HP left',
      color: 0x57a85a,
      thumbnail: { url: '/discord/bosses/tidal-colossus.png' },
      fields: [
        { name: 'Top fighters', value: '🥇 Alice\n🥈 Bob\n🥉 Carol', inline: true },
        { name: 'Big hit', value: 'Flamy (Alice)\n320 damage', inline: true },
        { name: 'Next fight', value: 'Phase 2\n<t:1800099420:R>', inline: true },
        {
          name: '⚠️ Counter-move for Phase 2',
          value: 'Tidal Colossus now resists Steam by 50% \\(the reaction used most\\).',
          inline: false,
        },
      ],
    });
  });

  it('matches the Saturday post: not cleared, a combo as the big moment, a party label', () => {
    const embed = embedOf(
      formatPhasePost({
        ...PHASE,
        phase: 'phase2',
        party: 2,
        cleared: false,
        retreated: false,
        hpLeftPercent: 91,
        top: [{ name: 'Alice', contribution: 5 }],
        keyMoment: {
          kind: 'reaction',
          round: 6,
          creature: 'Zap',
          owner: null,
          reaction: 'Overload',
          bonus: 540,
        },
        counterMove: null,
      }),
    );
    expect(embed.author).toEqual({ name: 'Raid · Phase 2 · Party 2' });
    expect(embed.title).toBe('❌ Tidal Colossus holds firm');
    expect(embed.description).toBe('▰▰▰▰▰▰▰▰▰▱ 91% HP left');
    expect(embed.color).toBe(0xc0504d);
    expect(embed.fields).toEqual([
      { name: 'Top fighters', value: '🥇 Alice', inline: true },
      { name: 'Big combo', value: 'Overload by Zap\n+540 bonus damage', inline: true },
      { name: 'Next fight', value: 'Finale\n<t:1800099420:R>', inline: true },
    ]);
  });

  it('leaves out the columns it has nothing for', () => {
    const embed = embedOf(formatPhasePost({ ...PHASE, keyMoment: null, top: [] }));
    expect(embed.fields.map((f) => f.name)).toEqual(['Next fight', '⚠️ Counter-move for Phase 2']);
    // A phase never lists the top reaction, Essence or the weather.
    expect(textOf(formatPhasePost(PHASE))).not.toMatch(/Steam ×|Essence|Sky/);
  });

  it('reads a cleared phase without the retreat flag (older results) as cleared', () => {
    const embed = embedOf(formatPhasePost({ ...PHASE, retreated: false }));
    expect(embed.title).toBe('✅ Phase 1 cleared');
    expect(embed.description).toBe('▰▰▰▰▰▰▰▰▱▱ 78% HP left');
  });

  it('matches the Sunday post: the win, the rank, the next boss and the new creatures', () => {
    expect(
      embedOf(
        formatPhasePost({
          ...FINALE,
          finale: {
            firsts: [
              { species: 'Ashmole', kind: 'catch' },
              { species: 'Aurorix', kind: 'evolve' },
            ],
            rank: { before: 1, after: 2, festival: false, parties: 1, partiesWon: 1 },
          },
        }),
      ),
    ).toEqual({
      author: { name: 'Raid finale' },
      title: '🏆 Tidal Colossus is defeated!',
      description: 'The server climbs to **Rank 2**.\nNext boss <t:1800272220:R>.',
      color: 0xf2b33d,
      thumbnail: { url: '/discord/bosses/tidal-colossus.png' },
      fields: [
        { name: 'Top fighters', value: '🥇 Alice\n🥈 Bob\n🥉 Carol', inline: true },
        { name: 'Big hit', value: 'Flamy (Alice)\n320 damage', inline: true },
        { name: 'Top reaction', value: 'Steam ×4', inline: true },
        { name: '🆕 New on the server', value: 'Ashmole, Aurorix (evolved)', inline: false },
      ],
    });
  });

  it('shows a lost finale with the HP bar, and the enrage either way', () => {
    const lost = embedOf(
      formatPhasePost({ ...FINALE, cleared: false, hpLeftPercent: 12, enraged: true }),
    );
    expect(lost.title).toBe('💢 Tidal Colossus survives');
    expect(lost.color).toBe(0xc0504d);
    expect(lost.description).toBe(
      '▰▱▱▱▱▱▱▱▱▱ 12% HP left\nIt flew into a rage when time ran out.\nNext boss <t:1800272220:R>.',
    );
    const won = embedOf(formatPhasePost({ ...FINALE, enraged: true }));
    expect(won.description).toBe(
      'It flew into a rage, but the party held on.\nNext boss <t:1800272220:R>.',
    );
    // A phase never says it.
    expect(textOf(formatPhasePost({ ...PHASE, enraged: true }))).not.toContain('rage');
  });

  it('never mentions a jackpot, Essence or the weather, after a win or a loss', () => {
    for (const post of [FINALE, { ...FINALE, cleared: false }]) {
      const text = textOf(formatPhasePost(post)).toLowerCase();
      expect(text).not.toContain('jackpot');
      expect(text).not.toContain('essence');
      expect(text).not.toContain('sky');
    }
  });

  it('says where the server’s rank went', () => {
    const rank = (after: number, extra: Partial<RankPost> = {}) =>
      embedOf(
        formatPhasePost({
          ...FINALE,
          finale: {
            firsts: [],
            rank: { before: 4, after, festival: false, parties: 1, partiesWon: 1, ...extra },
          },
        }),
      ).description ?? '';
    expect(rank(5)).toContain('The server climbs to **Rank 5**.');
    expect(rank(4)).toContain('The server stays at **Rank 4**.');
    expect(rank(3, { festival: true })).toContain(
      'The Festival is over. The server eases to **Rank 3**.',
    );
    // With several parties the post says how many won.
    expect(rank(5, { parties: 3, partiesWon: 2 })).toContain(
      '2 / 3 parties won. The server climbs to **Rank 5**.',
    );
    // Until every party has finished there is nothing to say.
    expect(
      embedOf(formatPhasePost({ ...FINALE, finale: { firsts: [], rank: null } })).description,
    ).not.toContain('Rank');
  });

  it('names the Festival creature and who got it, with every name escaped', () => {
    const text = textOf(
      formatPhasePost({
        ...FINALE,
        finale: {
          firsts: [],
          festival: { creature: 'Lanternfin', winners: ['Alice', '@everyone <@1> **b**'] },
        },
      }),
    );
    expect(text).toContain('🎉 Lanternfin joins Alice, ');
    expect(text).not.toMatch(/@(?!\u200B)/);
    expect(text).not.toContain('**b**');
    // Nobody got it (a lost Festival): no line.
    expect(
      textOf(
        formatPhasePost({
          ...FINALE,
          finale: { firsts: [], festival: { creature: 'Lanternfin', winners: [] } },
        }),
      ),
    ).not.toContain('Lanternfin');
  });

  it('names at most six new creatures', () => {
    const firsts = Array.from({ length: 8 }, (_, i) => ({
      species: `Critter${String(i)}`,
      kind: 'catch' as const,
    }));
    const field = embedOf(formatPhasePost({ ...FINALE, finale: { firsts } })).fields.at(-1);
    expect(field?.value).toBe(
      'Critter0, Critter1, Critter2, Critter3, Critter4, Critter5 and 2 more',
    );
  });

  it('escapes every player-provided name and keeps within the embed limits', () => {
    const nasty = '@everyone <@123> **bold** [x](https://evil.test)';
    const message = formatPhasePost({
      ...FINALE,
      top: Array.from({ length: 3 }, () => ({ name: nasty, contribution: 1 })),
      keyMoment: { kind: 'hit', round: 1, creature: nasty, owner: nasty, damage: 2 },
      finale: {
        firsts: [],
        festival: { creature: 'Lanternfin', winners: Array.from({ length: 500 }, () => nasty) },
      },
    });
    const text = textOf(message);
    // No mention can resolve: every @ is followed by a zero-width space.
    expect(text).not.toMatch(/@(?!\u200B)/);
    expect(text).not.toContain('**bold**');
    expect(text).not.toContain('](https://');
    expect(text).not.toContain('<@123>');
    const embed = embedOf(message);
    expect(embed.description?.length).toBeLessThanOrEqual(4096);
    for (const f of embed.fields) expect(f.value.length).toBeLessThanOrEqual(1024);
  });

  it('escapes the boss, reaction and counter-move text too', () => {
    const text = textOf(
      formatPhasePost({ ...PHASE, bossName: 'Boss_*', counterMove: 'It *adapts*.' }),
    );
    expect(text).toContain('Boss\\\\_\\\\*');
    expect(text).toContain('It \\\\*adapts\\\\*.');
    expect(
      textOf(formatPhasePost({ ...FINALE, reaction: { name: 'Re_action', count: 2 } })),
    ).toContain('Re\\\\_action ×2');
  });
});
