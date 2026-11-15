import { describe, expect, it } from 'vitest';
import { embedChars, embedText, goodbyeMessage } from '../../src/reset/goodbye-dm';
import type { Settler, SettlerCreature } from '../../src/reset/record-schema';
import { buildSettlersRecord } from '../../src/reset/settlers-record';
import { HELSINKI, nextGuild } from '../raid-helpers';
import { runCore } from '../helpers';
import { HOSTILE, KEY, seedWorld } from './world';

const HEX = 'a'.repeat(64);
const DOT = '·';

function creature(_i: number, nickname: string | null): SettlerCreature {
  return {
    species: 'cindle',
    speciesName: 'Cindle',
    line: 'cindle',
    level: 5,
    shiny: false,
    nickname,
    origin: 'trip',
    caughtDay: '2027-01-01',
    quirk: null,
  };
}

function settler(creatures: SettlerCreature[], over: Partial<Settler['feats']> = {}): Settler {
  return {
    id: 'abc',
    idHash: HEX,
    name: 'Ann',
    firstPlayedDay: '2027-01-01',
    creatures,
    feats: {
      deepestDepth: 18,
      firsts: ['Mossling', 'Lanternfin'],
      blueprints: 31,
      creatures: creatures.length,
      highestLevel: {
        creature: { species: 'cindle', speciesName: 'Cindle', nickname: 'Pebbles' },
        level: 31,
      },
      totalLevels: 612,
      bestCrafter: {
        creature: { species: 'ashmole', speciesName: 'Ashmole', nickname: 'Ember' },
        level: 9,
      },
      bestExplorer: {
        creature: { species: 'zipmouse', speciesName: 'Zipmouse', nickname: 'Fizz' },
        rank: 7,
      },
      ...over,
    },
  };
}

const embedOf = (s: Settler) => goodbyeMessage(s).embeds[0];

/** Discord's limits, all of them. */
function expectWithinLimits(s: Settler): void {
  const body = goodbyeMessage(s);
  const embed = body.embeds[0];
  expect(body.embeds).toHaveLength(1);
  expect(embed.title.length).toBeLessThanOrEqual(256);
  expect((embed.description ?? '').length).toBeLessThanOrEqual(4096);
  expect(embed.fields.length).toBeLessThanOrEqual(25);
  for (const f of embed.fields) {
    expect(f.name.length).toBeGreaterThan(0);
    expect(f.value.length).toBeGreaterThan(0);
    expect(f.name.length).toBeLessThanOrEqual(256);
    expect(f.value.length).toBeLessThanOrEqual(1024);
  }
  expect(embedChars(embed)).toBeLessThanOrEqual(6000);
  expect(body.allowed_mentions).toEqual({ parse: [] });
  expect('content' in body).toBe(false);
}

describe('the goodbye DM', () => {
  it("reads like the plan's draft, as an embed", () => {
    const names = ['Pebbles', 'Ember', 'Fizz'];
    const creatures = [
      ...names.map((n, i) => creature(i, n)),
      ...Array.from({ length: 39 }, (_, i) => creature(i, null)),
    ];
    const s = settler(creatures);
    const body = goodbyeMessage(s);
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.components).toEqual([]);
    const embed = body.embeds[0];
    expect(embed.title).toBe('You were one of the first settlers');
    expect(embed.description).toBe(
      'The valley is starting over, and it will remember you. Here is what it keeps:',
    );
    expect(embed.color).toBe(0xf2b33d);
    expect(embed.fields).toEqual([
      { name: 'First on the server', value: 'Mossling and Lanternfin', inline: true },
      { name: 'Deepest dungeon', value: 'Cleared depth 18', inline: true },
      {
        name: 'Collection',
        value: `42 creatures ${DOT} 612 levels ${DOT} 31 blueprints`,
        inline: true,
      },
      { name: 'Highest level', value: 'Pebbles the Cindle, level 31', inline: true },
      { name: 'Best crafter', value: 'Ember the Ashmole, Crafting 9', inline: true },
      { name: 'Best explorer', value: 'Fizz the Zipmouse, Explorer 7', inline: true },
      {
        name: 'Your creatures',
        value: `Pebbles, Ember, Fizz${', Cindle'.repeat(38)} and Cindle`,
        inline: false,
      },
    ]);
    expectWithinLimits(s);
  });

  it('skips the feats a settler has nothing for', () => {
    const s = settler([creature(0, null)], {
      deepestDepth: null,
      firsts: [],
      blueprints: 0,
      bestCrafter: null,
      bestExplorer: null,
    });
    const fields = embedOf(s).fields;
    expect(fields.map((f) => f.name)).toEqual(['Collection', 'Highest level', 'Your creatures']);
    expect(fields[0]?.value).toBe(`1 creature ${DOT} 612 levels`);
    // A settler with no creatures and nothing else: only the greeting.
    const bare = settler([], {
      deepestDepth: null,
      firsts: [],
      blueprints: 0,
      creatures: 0,
      highestLevel: null,
      totalLevels: 0,
      bestCrafter: null,
      bestExplorer: null,
    });
    expect(embedOf(bare).fields).toEqual([]);
    expectWithinLimits(bare);
  });

  it('stays within every Discord limit for a huge roster of hostile nicknames, ending in "and N more"', () => {
    const nick = HOSTILE.repeat(3);
    const creatures = Array.from({ length: 2000 }, (_, i) =>
      creature(i, i % 2 === 0 ? nick : `n${String(i)}`),
    );
    const hostileFeats = {
      firsts: Array.from({ length: 40 }, () => nick),
      highestLevel: {
        creature: { species: 'cindle', speciesName: 'Cindle', nickname: nick },
        level: 31,
      },
      bestCrafter: {
        creature: { species: 'cindle', speciesName: nick, nickname: nick },
        level: 9,
      },
      bestExplorer: {
        creature: { species: 'cindle', speciesName: nick, nickname: nick },
        rank: 7,
      },
    };
    const s = settler(creatures, hostileFeats);
    expectWithinLimits(s);
    const last = embedOf(s).fields.at(-1);
    expect(last?.name).toBe('Your creatures');
    expect(last?.inline).toBe(false);
    expect(last?.value).toMatch(/ and \d+ more$/);
  });

  it('fills the 1,024 limit of the creature field and says how many are left', () => {
    const creatures = Array.from({ length: 2000 }, (_, i) => creature(i, `Name${String(i)}`));
    const value = embedOf(settler(creatures)).fields.at(-1)?.value ?? '';
    expect(value.length).toBeLessThanOrEqual(1024);
    expect(value.length).toBeGreaterThan(1000);
    const more = Number(/ and (\d+) more$/.exec(value)?.[1]);
    expect(value.split(', ')).toHaveLength(2000 - more);
  });

  it('makes hostile text inert: no live mention, @everyone, channel link or markdown', () => {
    const cases: [string, string[]][] = [
      ['**BIG** @everyone @here', ['\\*\\*BIG\\*\\*', '@​everyone', '@​here']],
      ['<@12345678901234567>', ['<@​12345678901234567\\>']],
      ['<#42> <&7>', ['<\\#42\\>']],
      ['<:x:1>', ['<\\:x\\:1\\>']],
      ['[a](http://x.t)', ['\\[a\\]\\(http\\:']],
      ['`c` ~~s~~ > q\n# h', ['\\`c\\`', '\\~\\~s\\~\\~', '\\> q \\# h']],
    ];
    for (const [nick, expected] of cases) {
      const s = settler([creature(0, nick)], {
        highestLevel: {
          creature: { species: 'cindle', speciesName: 'Cindle', nickname: nick },
          level: 3,
        },
      });
      const text = embedText(embedOf(s));
      for (const part of expected) expect(text, nick).toContain(part);
      // Every @ is followed by a zero-width space, so it never resolves; a hostile line break never starts a new line.
      expect(text, nick).not.toMatch(/@(?!​)/);
      // Title, description, six fields and the creature field: one line each.
      expect(text.split('\n'), nick).toHaveLength(9);
    }
  });

  it('a seeded world: one preview', async () => {
    await runCore(nextGuild(), async (ctx) => {
      seedWorld(ctx);
      const record = await buildSettlersRecord(ctx.sql, {
        tz: HELSINKI,
        now: ctx.clock.t,
        hmacKey: KEY,
      });
      const ann = record.settlers[0];
      if (ann === undefined) throw new Error('no settler');
      const body = goodbyeMessage(ann);
      expectWithinLimits(ann);
      const value = (name: string) => body.embeds[0].fields.find((f) => f.name === name)?.value;
      expect(value('First on the server')).toBe('Cindle, Sproutle and Zipmouse');
      expect(value('Deepest dungeon')).toBe('Cleared depth 18');
      expect(value('Collection')).toContain('44 levels');
      expect(value('Collection')).toContain('2 blueprints');
      expect(value('Highest level')).toBe('Pebbles the Pyrelynx, level 20');
      expect(JSON.stringify(body)).toContain('"allowed_mentions":{"parse":[]}');
    });
  });
});
