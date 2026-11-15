import { describe, expect, it } from 'vitest';
import { goodbyeMessage } from '../../src/reset/goodbye-dm';
import type { Settler, SettlerCreature } from '../../src/reset/record-schema';
import { buildSettlersRecord } from '../../src/reset/settlers-record';
import { HELSINKI, nextGuild } from '../raid-helpers';
import { runCore } from '../helpers';
import { HOSTILE, KEY, seedWorld } from './world';

const HEX = 'a'.repeat(64);

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

describe('the goodbye DM', () => {
  it("reads like the plan's draft", () => {
    const names = ['Pebbles', 'Ember', 'Fizz'];
    const creatures = [
      ...names.map((n, i) => creature(i, n)),
      ...Array.from({ length: 39 }, (_, i) => creature(i, null)),
    ];
    const body = goodbyeMessage(settler(creatures));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.content.split('\n')).toEqual([
      '**You were one of the first settlers.**',
      'The valley is starting over, and it will remember you. Here is what it keeps:',
      'First Mossling and Lanternfin on the server · Cleared depth 18 · 31 blueprints',
      '42 creatures, 612 levels in all · Highest: Pebbles the Cindle, level 31',
      'Best crafter: Ember the Ashmole, Crafting 9 · Best explorer: Fizz the Zipmouse, Explorer 7',
      `Your creatures: Pebbles, Ember, Fizz${', Cindle'.repeat(38)} and Cindle`,
    ]);
  });

  it('skips the feats a settler has nothing for', () => {
    const body = goodbyeMessage(
      settler([creature(0, null)], {
        deepestDepth: null,
        firsts: [],
        blueprints: 0,
        bestCrafter: null,
        bestExplorer: null,
      }),
    );
    const lines = body.content.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe('1 creature, 612 levels in all · Highest: Pebbles the Cindle, level 31');
    // A settler with no creatures and nothing else: only the greeting.
    const bare = goodbyeMessage(
      settler([], {
        deepestDepth: null,
        firsts: [],
        blueprints: 0,
        creatures: 0,
        highestLevel: null,
        totalLevels: 0,
        bestCrafter: null,
        bestExplorer: null,
      }),
    );
    expect(bare.content.split('\n')).toHaveLength(2);
  });

  it('stays within 2,000 characters for a huge roster of hostile nicknames, ending in "and N more"', () => {
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
    const body = goodbyeMessage(settler(creatures, hostileFeats));
    expect(body.content.length).toBeLessThanOrEqual(2000);
    expect(body.content).toMatch(/ and \d+ more$/);
    expect(body.content).toContain('Your creatures: ');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('makes hostile text inert: no live mention, @everyone, channel link or markdown', () => {
    const cases: [string, string[]][] = [
      ['**BIG** @everyone @here', ['\\*\\*BIG\\*\\*', '@\u200Beveryone', '@\u200Bhere']],
      ['<@12345678901234567>', ['<@\u200B12345678901234567\\>']],
      ['<#42> <&7>', ['<\\#42\\>']],
      ['<:x:1>', ['<\\:x\\:1\\>']],
      ['[a](http://x.t)', ['\\[a\\]\\(http\\:']],
      ['`c` ~~s~~ > q\n# h', ['\\`c\\`', '\\~\\~s\\~\\~', '\\> q \\# h']],
    ];
    for (const [nick, expected] of cases) {
      const body = goodbyeMessage(
        settler([creature(0, nick)], {
          highestLevel: {
            creature: { species: 'cindle', speciesName: 'Cindle', nickname: nick },
            level: 3,
          },
        }),
      );
      const text = body.content;
      for (const part of expected) expect(text, nick).toContain(part);
      // Every @ is followed by a zero-width space, so it never resolves; a hostile line break never starts a new line.
      expect(text, nick).not.toMatch(/@(?!\u200B)/);
      expect(text.split('\n'), nick).toHaveLength(6);
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
      expect(body.content).toContain('First Cindle, Sproutle and Zipmouse on the server');
      expect(body.content).toContain('Cleared depth 18');
      expect(body.content).toContain('2 blueprints');
      expect(body.content).toContain('4 creatures, 44 levels in all');
      expect(body.content).toContain('Highest: Pebbles the Pyrelynx, level 20');
    });
  });
});
