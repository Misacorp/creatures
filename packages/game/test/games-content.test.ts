import { describe, expect, it } from 'vitest';
import {
  GAMES_KINDS,
  GAMES_SAY_KEYS,
  fillGamesSay,
  gamesContent,
  GAMES_RETIRED,
  gamesEventDef,
  gamesEventInfo,
  gamesEventName,
  gamesFavourHelp,
  GAMES_FAVOURS,
  MAX_FAVOUR_HELP,
  gamesSayTemplate,
  loadGames,
} from '../src/index';
import gamesJson from '../src/content/data/games-events.json';

/** A deep copy of the shipped file to break on purpose. */
function raw(): {
  events: Record<string, unknown>[];
  say: Record<string, string>;
  favourHelp: Record<string, string>;
} {
  return JSON.parse(JSON.stringify(gamesJson)) as {
    events: Record<string, unknown>[];
    say: Record<string, string>;
    favourHelp: Record<string, string>;
  };
}

describe('the shipped Games content', () => {
  it('has every kind, a team event and a template for every key the engine emits', () => {
    const kinds = new Set(gamesContent.events.map((e) => e.kind));
    for (const k of GAMES_KINDS) expect(kinds.has(k), k).toBe(true);
    expect(gamesContent.events.some((e) => e.team === 3)).toBe(true);
    for (const key of Object.values(GAMES_SAY_KEYS).flat()) {
      expect(gamesContent.say[key], key).toBeDefined();
    }
  });

  it('looks events up by id and lets a skin reword a line', () => {
    const frost = gamesEventDef('frost-bath');
    const sauna = gamesEventDef('sauna-showdown');
    expect(frost?.kind).toBe('endure');
    expect(gamesEventDef('nope')).toBeUndefined();
    if (frost === undefined || sauna === undefined) return;
    expect(gamesSayTemplate(gamesContent, frost, 'endure.start')).not.toBe(
      gamesSayTemplate(gamesContent, sauna, 'endure.start'),
    );
    // A key the skin does not reword falls back to the kind's line.
    expect(gamesSayTemplate(gamesContent, frost, 'endure.half')).toBe(
      gamesContent.say['endure.half'],
    );
  });

  it('the daily team event is a real team sport, played at once: five of them', () => {
    expect(
      gamesContent.events
        .filter((e) => e.team === 3)
        .map((e) => e.id)
        .sort(),
    ).toEqual(['bucket-brigade', 'crate-tower', 'kite-flight', 'log-carry', 'pumpkin-push']);
    // Every team event is one of the kinds that play all teams at once.
    for (const e of gamesContent.events.filter((x) => x.team === 3)) {
      expect(['haul', 'fill', 'stack', 'kite']).toContain(e.kind);
    }
  });

  it('retired events are out of the pool but keep a name for stored days', () => {
    for (const id of ['sauna-stack', 'shark-relay']) {
      expect(gamesEventDef(id)).toBeUndefined();
      expect(GAMES_RETIRED[id]?.team).toBe(3);
      expect(gamesEventInfo(id)?.id).toBe(id);
    }
    expect(gamesEventName('sauna-stack')).toBe('Sauna Stack');
    expect(gamesEventName('shark-relay')).toBe('Shark Relay');
    expect(gamesEventName('log-carry')).toBe('Log Carry');
    expect(gamesEventName('never-was')).toBe('never-was');
    expect(gamesEventInfo('toString')).toBeUndefined();
    // A retired id is never reused by a live event.
    for (const e of gamesContent.events) expect(GAMES_RETIRED[e.id]).toBeUndefined();
  });

  it('says what every favour means in one short plain line, the same in every event', () => {
    expect(Object.keys(gamesContent.favourHelp).sort()).toEqual([...GAMES_FAVOURS].sort());
    for (const f of GAMES_FAVOURS) {
      const help = gamesFavourHelp(f);
      expect(help, f).toBeDefined();
      expect([...(help ?? '')].length, f).toBeLessThanOrEqual(MAX_FAVOUR_HELP);
      expect(help, f).toMatch(/^[A-Z][^.]* have an advantage here\.$/u);
    }
    expect(gamesFavourHelp('small')).toBe('Small creatures have an advantage here.');
    expect(gamesFavourHelp('ember')).toBe('Ember creatures have an advantage here.');
    expect(gamesFavourHelp('guard')).toBe('Guards have an advantage here.');
    // Not a favour, or an inherited key: no help.
    expect(gamesFavourHelp('luck')).toBeUndefined();
    expect(gamesFavourHelp('toString')).toBeUndefined();
    // No event carries its own notes any more.
    for (const e of [...gamesContent.events, ...Object.values(GAMES_RETIRED)]) {
      expect(Object.hasOwn(e, 'favourNotes'), e.id).toBe(false);
    }
  });

  it('fills {a}, {b} and {n} and leaves a missing one as it is', () => {
    expect(fillGamesSay('{a} shoves {b}! {n}', { a: 'Mudlump', b: 'Zipmouse', n: 3 })).toBe(
      'Mudlump shoves Zipmouse! 3',
    );
    expect(fillGamesSay('{a} and {b}', { a: 'Solo' })).toBe('Solo and {b}');
  });
});

describe('loadGames rejects broken content', () => {
  const broken = (change: (d: ReturnType<typeof raw>) => void): (() => unknown) => {
    const d = raw();
    change(d);
    return () => loadGames(d);
  };

  it('a duplicate id, a scene of another kind, a team score on a solo event', () => {
    expect(
      broken((d) => {
        d.events.push({ ...(d.events[0] as Record<string, unknown>) });
      }),
    ).toThrow(/duplicate id/);
    expect(
      broken((d) => {
        (d.events[0] as Record<string, unknown>)['scene'] = 'ice-floe';
      }),
    ).toThrow(/not a endure scene/);
    expect(
      broken((d) => {
        (d.events[0] as Record<string, unknown>)['teamScore'] = 'sum';
      }),
    ).toThrow(/teamScore/);
  });

  it('an at-once team kind that is not a team event, a stack that topples less than nothing', () => {
    for (const kind of ['fill', 'stack', 'kite'] as const) {
      expect(
        broken((d) => {
          const e = d.events.find((x) => x['kind'] === kind) as Record<string, unknown>;
          e['team'] = 1;
          delete e['teamScore'];
        }),
      ).toThrow(/is a team event/);
    }
    expect(
      broken((d) => {
        const e = d.events.find((x) => x['kind'] === 'stack') as Record<string, unknown>;
        const params = e['params'] as Record<string, number>;
        params['toppleMin'] = 3;
        params['toppleMax'] = 2;
      }),
    ).toThrow(/toppleMin > toppleMax/);
  });

  it('a haul that is not a team event', () => {
    expect(
      broken((d) => {
        const haul = d.events.find((e) => e['kind'] === 'haul') as Record<string, unknown>;
        haul['team'] = 1;
        delete haul['teamScore'];
      }),
    ).toThrow(/a haul is a team event/);
  });

  it('an unknown or missing number in params (strict)', () => {
    expect(
      broken((d) => {
        ((d.events[0] as Record<string, unknown>)['params'] as Record<string, unknown>)['extra'] =
          1;
      }),
    ).toThrow(/schema/);
    expect(
      broken((d) => {
        delete ((d.events[0] as Record<string, unknown>)['params'] as Record<string, unknown>)[
          'heatRiseBp'
        ];
      }),
    ).toThrow(/schema/);
  });

  it('commentary: a missing template, an unknown key, an unknown placeholder, a control character', () => {
    expect(
      broken((d) => {
        delete d.say['chase.duck'];
      }),
    ).toThrow(/chase.duck/);
    expect(
      broken((d) => {
        d.say['chase.moonwalk'] = 'Hi';
      }),
    ).toThrow(/not a key/);
    expect(
      broken((d) => {
        d.say['chase.duck'] = '{who} ducks';
      }),
    ).toThrow(/placeholder/);
    expect(
      broken((d) => {
        d.say['chase.duck'] = 'ducks‮';
      }),
    ).toThrow(/schema/);
    expect(
      broken((d) => {
        (d.events[1] as Record<string, unknown>)['say'] = { 'chase.duck': 'wrong kind' };
      }),
    ).toThrow(/not a endure key/);
  });

  it('a favour without help, help for no favour, help too long, a per-event note', () => {
    expect(
      broken((d) => {
        delete d.favourHelp['ember'];
      }),
    ).toThrow(/favourHelp/);
    expect(
      broken((d) => {
        d.favourHelp['luck'] = 'Lucky ones have an advantage here.';
      }),
    ).toThrow(/favourHelp/);
    expect(
      broken((d) => {
        d.favourHelp['ember'] = 'x'.repeat(MAX_FAVOUR_HELP + 1);
      }),
    ).toThrow(/favourHelp/);
    expect(
      broken((d) => {
        (d.events[0] as Record<string, unknown>)['favourNotes'] = { ember: 'Old note.' };
      }),
    ).toThrow(/favourNotes/);
  });

  it('a pool without a team event', () => {
    expect(
      broken((d) => {
        d.events = d.events.filter((e) => e['team'] !== 3);
      }),
    ).toThrow(/team event/);
  });
});
