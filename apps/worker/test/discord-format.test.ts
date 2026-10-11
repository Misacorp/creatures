import { content, type Gimmick } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE_CHARS,
  describeGimmick,
  discordTime,
  escapeMarkdown,
  formatBossReveal,
  formatPhasePost,
  safeName,
  truncateMessage,
  type PhasePost,
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

  it('is applied to every message type', () => {
    const long = 'x'.repeat(40);
    const reveal = formatBossReveal({
      ...REVEAL,
      gimmicks: Array.from({ length: 200 }, () => ({ name: long, text: long })),
    });
    expect(reveal.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    const phase = formatPhasePost({
      ...PHASE,
      finale: {
        jackpot: Array.from({ length: 200 }, () => '*'.repeat(32)),
        firsts: [],
      },
    });
    expect(phase.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    expect(phase.endsWith('\u2026')).toBe(true);
  });
});

describe('discordTime', () => {
  it('gives the full date and the relative time for the same second', () => {
    expect(discordTime(1_800_000_123_456)).toBe('<t:1800000123:F> (<t:1800000123:R>)');
  });
});

describe('describeGimmick', () => {
  it('says what every content gimmick does in plain words', () => {
    const texts = content.bosses.flatMap((b) => b.gimmicks.map((g) => describeGimmick(g)));
    expect(texts).toEqual([
      'hits the front zone every 3 rounds',
      'throws the first reaction back at your team, every round',
      'silences the creatures at both ends of the row for 1 turn, every 2 rounds',
      'strikes your highest Attack creature every round',
    ]);
  });

  it('handles plurals and every op', () => {
    const base = { id: 'g', name: 'G' };
    const cases: [Gimmick, string][] = [
      [
        { ...base, op: 'silence_ends', turns: 2, trigger: { every: 4 } },
        'silences the creatures at both ends of the row for 2 turns, every 4 rounds',
      ],
      [
        { ...base, op: 'hit_zone', zone: 'back', power: 5000, trigger: { eachRound: true } },
        'hits the back zone every round',
      ],
    ];
    for (const [gimmick, text] of cases) expect(describeGimmick(gimmick)).toBe(text);
  });
});

const REVEAL: RevealPost = {
  bossName: 'Tidal Colossus',
  elementName: 'Tide',
  gimmicks: [{ name: 'Undertow', text: 'hits the front zone every 3 rounds' }],
  turnOrder: 'left_to_right',
  schedule: {
    phase1: Date.parse('2027-01-15T11:37:00Z'),
    phase2: Date.parse('2027-01-16T11:37:00Z'),
    finale: Date.parse('2027-01-17T18:00:00Z'),
  },
  players: 7,
  parties: 1,
  rank: 4,
  festivalCreature: null,
};

describe('formatBossReveal', () => {
  it('matches the Monday post', () => {
    expect(formatBossReveal(REVEAL)).toBe(
      [
        '**A new raid week begins: Tidal Colossus**',
        'Element: Tide. Creatures act from left to right.',
        'Boss Rank 4.',
        'Undertow: hits the front zone every 3 rounds.',
        'Phase 1: <t:1800013020:F> (<t:1800013020:R>)',
        'Phase 2: <t:1800099420:F> (<t:1800099420:R>)',
        'Finale: <t:1800208800:F> (<t:1800208800:R>)',
        '7 players are in this week.',
      ].join('\n'),
    );
  });

  it('says nothing about the rank when the week has none, and announces a Festival', () => {
    const none = formatBossReveal({ ...REVEAL, rank: null });
    expect(none).not.toContain('Rank');
    const festival = formatBossReveal({ ...REVEAL, rank: 7, festivalCreature: 'Lanternfin' });
    expect(festival).toContain('Boss Rank 7.');
    expect(festival).toContain('Festival week: Lanternfin for every winner, bonus Essence.');
    // The creature name is escaped like every other name.
    const nasty = formatBossReveal({ ...REVEAL, festivalCreature: '@everyone *x*' });
    expect(nasty).not.toMatch(/@(?!\u200B)/);
    expect(nasty).toContain('\\*x\\*');
    expect(formatBossReveal({ ...REVEAL, rank: 7 })).not.toContain('Festival');
  });

  it('handles one player, several parties and other turn orders', () => {
    const one = formatBossReveal({ ...REVEAL, players: 1, turnOrder: 'speed', gimmicks: [] });
    expect(one).toContain('Creatures act fastest first.');
    expect(one).toContain('1 player is in this week.');
    const many = formatBossReveal({
      ...REVEAL,
      players: 31,
      parties: 3,
      turnOrder: 'right_to_left',
    });
    expect(many).toContain('31 players are in this week, in 3 parties.');
    expect(many).toContain('Creatures act from right to left.');
  });
});

const PHASE: PhasePost = {
  phase: 'phase1',
  bossName: 'Tidal Colossus',
  party: null,
  cleared: true,
  hpLeftPercent: 78,
  top: [
    { name: 'Alice', contribution: 1234 },
    { name: 'Bob', contribution: 800 },
    { name: 'Carol', contribution: 55 },
    { name: 'Dave', contribution: 1 },
  ],
  reaction: { name: 'Steam', count: 4 },
  keyMoment: { kind: 'hit', round: 3, creature: 'Flamy', owner: 'Alice', damage: 320 },
  essenceFlat: 10,
  counterMove: 'Tidal Colossus now resists Steam by 50% (the reaction used most).',
};

describe('formatPhasePost', () => {
  it('matches the Friday post, with the counter-move', () => {
    expect(formatPhasePost(PHASE)).toBe(
      [
        '**Phase 1: Tidal Colossus**',
        'Cleared. The boss has 78% HP left.',
        'Top contributors: Alice (1234 contribution), Bob (800 contribution), Carol (55 contribution).',
        'Most used reaction: Steam (4 times).',
        'Key moment: in round 3, Flamy (Alice) hit for 320 damage.',
        'Essence: every player earned 10, plus a bonus share by contribution.',
        "The boss's counter-move for Phase 2: Tidal Colossus now resists Steam by 50% \\(the reaction used most\\).",
      ].join('\n'),
    );
  });

  it('matches the Saturday post: not cleared, a reaction as the key moment, a party label', () => {
    expect(
      formatPhasePost({
        ...PHASE,
        phase: 'phase2',
        party: 2,
        cleared: false,
        hpLeftPercent: 91,
        top: [{ name: 'Alice', contribution: 5 }],
        reaction: { name: 'Overload', count: 1 },
        keyMoment: {
          kind: 'reaction',
          round: 6,
          creature: 'Zap',
          owner: null,
          reaction: 'Overload',
          bonus: 540,
        },
        essenceFlat: null,
        counterMove: null,
      }),
    ).toBe(
      [
        '**Phase 2: Tidal Colossus (party 2)**',
        'Not cleared. The boss has 91% HP left.',
        'Top contributors: Alice (5 contribution).',
        'Most used reaction: Overload (1 time).',
        'Key moment: in round 6, Zap set off Overload for 540 bonus damage.',
      ].join('\n'),
    );
  });

  it('says so when no reaction happened and there is no key moment', () => {
    const text = formatPhasePost({ ...PHASE, reaction: null, keyMoment: null, top: [] });
    expect(text).toContain('No reactions were triggered.');
    expect(text).not.toContain('Key moment');
    expect(text).not.toContain('Top contributors');
  });

  it('matches the Sunday post: jackpot hits and first-on-server records', () => {
    expect(
      formatPhasePost({
        ...PHASE,
        phase: 'finale',
        hpLeftPercent: 0,
        essenceFlat: 25,
        counterMove: null,
        finale: {
          jackpot: ['Alice', 'Bob'],
          firsts: [
            { label: 'First jackpot', names: ['Alice', 'Bob'] },
            { label: 'Aurorix evolved', names: ['Carol'] },
          ],
        },
      }),
    ).toBe(
      [
        '**Finale: Tidal Colossus**',
        'Cleared. The boss is defeated.',
        'Top contributors: Alice (1234 contribution), Bob (800 contribution), Carol (55 contribution).',
        'Most used reaction: Steam (4 times).',
        'Key moment: in round 3, Flamy (Alice) hit for 320 damage.',
        'Essence: every player earned 25, plus a bonus share by contribution.',
        'Jackpot: Alice, Bob.',
        'First on the server this week:',
        'First jackpot: Alice, Bob',
        'Aurorix evolved: Carol',
      ].join('\n'),
    );
  });

  it('says there was no jackpot after a win, and nothing about it after a loss', () => {
    const won = formatPhasePost({
      ...PHASE,
      phase: 'finale',
      finale: { jackpot: [], firsts: [] },
    });
    expect(won).toContain('No jackpot this week.');
    const lost = formatPhasePost({
      ...PHASE,
      phase: 'finale',
      cleared: false,
      essenceFlat: null,
      finale: { jackpot: [], firsts: [] },
    });
    expect(lost).not.toContain('jackpot');
    expect(lost).toContain('Not cleared.');
  });

  const FINALE = { ...PHASE, phase: 'finale' as const, hpLeftPercent: 0, counterMove: null };

  it('says where the server\u2019s rank went', () => {
    const rank = (after: number, extra: Partial<RankPost> = {}) =>
      formatPhasePost({
        ...FINALE,
        finale: {
          jackpot: [],
          firsts: [],
          rank: { before: 4, after, festival: false, parties: 1, partiesWon: 1, ...extra },
        },
      });
    expect(rank(5)).toContain('The server climbs to Rank 5.');
    expect(rank(4)).toContain('Rank 4 stays.');
    expect(rank(3, { festival: true })).toContain(
      'The Festival is over. The server eases to Rank 3.',
    );
    // With several parties the post says how many won.
    expect(rank(5, { parties: 3, partiesWon: 2 })).toContain(
      '2 of 3 parties won. The server climbs to Rank 5.',
    );
    // Until every party has finished there is nothing to say.
    expect(
      formatPhasePost({ ...FINALE, finale: { jackpot: [], firsts: [], rank: null } }),
    ).not.toContain('Rank');
  });

  it('lists the Festival creature and who got it, with every name escaped', () => {
    const text = formatPhasePost({
      ...FINALE,
      finale: {
        jackpot: [],
        firsts: [],
        festival: { creature: 'Lanternfin', winners: ['Alice', '@everyone <@1> **b**'] },
      },
    });
    expect(text).toContain('Festival creature: Lanternfin for Alice, ');
    expect(text).not.toMatch(/@(?!\u200B)/);
    expect(text).not.toContain('**b**');
    // Nobody got it (a lost Festival): no line.
    expect(
      formatPhasePost({
        ...FINALE,
        finale: { jackpot: [], firsts: [], festival: { creature: 'Lanternfin', winners: [] } },
      }),
    ).not.toContain('Festival');
  });

  it('puts the rank and the Festival lines before the records, so a long post keeps them', () => {
    const firsts = Array.from({ length: 5 }, (_, i) => ({
      label: 'L'.repeat(30) + String(i),
      names: Array.from({ length: 15 }, () => 'N'.repeat(32)),
    }));
    const text = formatPhasePost({
      ...FINALE,
      finale: {
        jackpot: Array.from({ length: 15 }, () => 'J'.repeat(32)),
        firsts,
        rank: { before: 4, after: 5, festival: false, parties: 1, partiesWon: 1 },
        festival: { creature: 'Lanternfin', winners: ['Alice'] },
      },
    });
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    expect(text).toContain('The server climbs to Rank 5.');
    expect(text).toContain('Festival creature: Lanternfin for Alice.');
  });

  it('lists at most five records', () => {
    const firsts = Array.from({ length: 7 }, (_, i) => ({
      label: `Record ${String(i)}`,
      names: ['Alice'],
    }));
    const text = formatPhasePost({
      ...PHASE,
      phase: 'finale',
      finale: { jackpot: [], firsts },
    });
    expect(text).toContain('Record 4: Alice');
    expect(text).not.toContain('Record 5');
    expect(text).toContain('and 2 more.');
  });

  it('escapes every player-provided name', () => {
    const nasty = '@everyone <@123> **bold** [x](https://evil.test)';
    const text = formatPhasePost({
      ...PHASE,
      phase: 'finale',
      top: [{ name: nasty, contribution: 1 }],
      keyMoment: { kind: 'hit', round: 1, creature: nasty, owner: nasty, damage: 2 },
      finale: { jackpot: [nasty], firsts: [{ label: 'First jackpot', names: [nasty] }] },
    });
    // No mention can resolve: every @ is followed by a zero-width space.
    expect(text).not.toMatch(/@(?!\u200B)/);
    expect(text).not.toContain('**bold**');
    expect(text).not.toContain('](https://');
    expect(text).not.toContain('<@123>');
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  });

  it('escapes the boss, reaction and counter-move text too', () => {
    const text = formatPhasePost({
      ...PHASE,
      bossName: 'Boss_*',
      reaction: { name: 'Re_action', count: 2 },
      counterMove: 'It *adapts*.',
    });
    expect(text).toContain('Boss\\_\\*');
    expect(text).toContain('Re\\_action');
    expect(text).toContain('It \\*adapts\\*.');
  });
});
