import { describe, expect, it } from 'vitest';
import { content } from '../src';
import { dungeonContent } from '../src/content/dungeon';
import { gearContent } from '../src/content/gear';
import { ADDITIVE_FIELDS, combatV2, loadCombatV2, moveLabel, type MoveDef } from '../src/combat-v2';
import cards from '../src/combat-v2/data/cards.json';
import foes from '../src/combat-v2/data/foes.json';
import forms from '../src/combat-v2/data/forms.json';
import keywords from '../src/combat-v2/data/keywords.json';
import moves from '../src/combat-v2/data/moves.json';
import knacks from '../src/combat-v2/data/knacks.json';
import raidBosses from '../src/combat-v2/data/raid-bosses.json';
import raidTrack from '../src/combat-v2/data/raid-track.json';
import rules from '../src/combat-v2/data/rules.json';
import talents from '../src/combat-v2/data/talents.json';

type Fx = Record<string, unknown>;
/** The raw files, loosely typed so a test can break them. */
interface Files {
  rules: Record<string, unknown>;
  moves: RawLibraryMove[];
  knacks: {
    families: { name: string; text: string }[];
    knacks: { id: string; name: string; family: string; text: string; intent: string; fx: Fx }[];
  };
  forms: { id: string; armour: number; ownKnacks: string[] }[];
  talents: {
    talents: {
      id: string;
      name: string;
      text: string;
      roles: string[];
      intent: string;
      gearLine?: string;
      fx: Fx;
    }[];
    pools: Record<string, string[]>;
  };
  cards: {
    id: string;
    name: string;
    asks: string;
    raidOnly?: boolean;
    ops: Fx[];
    answers: string[];
  }[];
  raidBosses: RawBoss[];
  raidTrack: RawTrack;
  foes: { scale: Fx; curve: Fx; foes: RawBoss[] };
  keywords: { name: string; means: string; not: string; step: string }[];
}
/** A boss's use of a library move. */
interface RawMove {
  id: string;
  every: number;
  turn?: number;
  powerBp: number;
  n?: number;
  silenceTurns?: number;
  windUp?: boolean;
  oneShotBp?: number;
  name?: string;
  pattern?: Fx;
}
/** A move of the library. */
interface RawLibraryMove {
  id: string;
  name: string;
  element?: string;
  shape: string;
  anchor: string;
  silences: boolean;
  oneShot?: boolean;
}
interface RawSlot {
  slot: number;
  boss: string;
  hp: number;
  atk: number;
  armour: number;
  strengthBp: number;
  cards: number;
  buildUp: boolean;
  extraCards: string[];
}
interface RawTrack {
  order: string[];
  slots: RawSlot[];
}
interface RawBoss {
  id: string;
  rows?: number;
  piece?: { rows: number };
  moves: RawMove[];
  cards: string[];
  asks: string;
}

/** A deep copy of plain data. */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** The first entry of a list (the data always has one). */
function first<T>(list: readonly T[]): T {
  const x = list[0];
  if (x === undefined) throw new Error('empty list');
  return x;
}
const byId = <T extends { id: string }>(list: readonly T[], id: string): T => {
  const x = list.find((e) => e.id === id);
  if (x === undefined) throw new Error(`no ${id}`);
  return x;
};
const raid = (r: Files, id: string): RawBoss => byId(r.raidBosses, id);
const slotOf = (r: Files, n: number): RawSlot => {
  const s = r.raidTrack.slots[n - 1];
  if (s === undefined) throw new Error(`no slot ${String(n)}`);
  return s;
};
const foe = (r: Files, id: string): RawBoss => byId(r.foes.foes, id);
const card = (r: Files, id: string) => byId(r.cards, id);
const pool = (r: Files, line: string): string[] => {
  const p = r.talents.pools[line];
  if (p === undefined) throw new Error(`no pool for ${line}`);
  return p;
};

/** Loads a pack the test has broken (it edits a clone of the raw JSON). */
function broken(edit: (r: Files) => void): () => unknown {
  return () => {
    const r = clone({
      rules,
      moves,
      knacks,
      forms,
      talents,
      cards,
      raidBosses,
      raidTrack,
      foes,
      keywords,
    }) as unknown as Files;
    edit(r);
    return loadCombatV2(r, content.creatures, {
      bosses: content.bosses,
      foes: dungeonContent.foes,
      gearLines: gearContent.lines,
    });
  };
}

describe('combat v2 content', () => {
  it('the shipped pack loads and is complete', () => {
    expect(Object.keys(combatV2.knacks)).toHaveLength(knacks.knacks.length);
    expect(Object.keys(combatV2.talents)).toHaveLength(talents.talents.length);
    expect(Object.keys(combatV2.forms)).toHaveLength(content.creatures.length);
    expect(Object.keys(combatV2.families)).toHaveLength(knacks.families.length);
    expect(Object.keys(combatV2.cards)).toHaveLength(cards.length);
    expect(Object.keys(combatV2.raidBosses)).toHaveLength(content.bosses.length);
    expect(Object.keys(combatV2.foes)).toHaveLength(foes.foes.length);
    expect(Object.keys(combatV2.keywords)).toHaveLength(keywords.length);
    expect(combatV2.rules.maxStacks).toBe(3);
    for (const p of Object.values(combatV2.pools)) expect(p).toHaveLength(7);
  });

  it('keeps the order of the files', () => {
    expect(Object.keys(combatV2.knacks)).toEqual(knacks.knacks.map((k) => k.id));
    expect(Object.keys(combatV2.talents)).toEqual(talents.talents.map((t) => t.id));
    expect(Object.keys(combatV2.forms)).toEqual(forms.map((f) => f.id));
    expect(Object.keys(combatV2.families)).toEqual(knacks.families.map((f) => f.name));
    expect(Object.keys(combatV2.pools)).toEqual(Object.keys(talents.pools));
    expect(Object.keys(combatV2.cards)).toEqual(cards.map((c) => c.id));
    expect(Object.keys(combatV2.raidBosses)).toEqual(raidBosses.map((b) => b.id));
    expect(Object.keys(combatV2.foes)).toEqual(foes.foes.map((f) => f.id));
    expect(Object.keys(combatV2.keywords)).toEqual(keywords.map((k) => k.name));
  });

  it('is not part of the shipped game entry', async () => {
    const shipped = await import('../src');
    expect('combatV2' in shipped).toBe(false);
  });

  it('rejects a rules file with a missing or unknown field', () => {
    expect(broken((r) => delete r.rules['maxStacks'])).toThrow(
      /Invalid combat v2 content: rules.json/,
    );
    expect(broken((r) => (r.rules['extra'] = 1))).toThrow(/Invalid combat v2 content: rules.json/);
  });

  it('rejects an effect with an unknown field', () => {
    expect(broken((r) => (first(r.knacks.knacks).fx['notAnEffect'] = 1))).toThrow(
      /Invalid combat v2 content: knacks.json/,
    );
  });

  it('rejects a Knack whose family does not exist', () => {
    expect(broken((r) => (first(r.knacks.knacks).family = 'No Such Family'))).toThrow(
      /Knack "steady-mark" has the unknown family "No Such Family"/,
    );
  });

  it('rejects a duplicate Knack id', () => {
    expect(broken((r) => r.knacks.knacks.push(clone(first(r.knacks.knacks))))).toThrow(
      /duplicate Knack id "steady-mark"/,
    );
  });

  it('rejects a form that is not shipped', () => {
    expect(
      broken((r) => r.forms.push({ id: 'not-a-form', armour: 5, ownKnacks: ['steady-mark'] })),
    ).toThrow(/form "not-a-form" is not a shipped form/);
  });

  it('rejects a shipped form with no entry', () => {
    expect(broken((r) => r.forms.splice(0, 1))).toThrow(/shipped form "splashet" has no entry/);
  });

  it('rejects a form with no own Knack', () => {
    expect(broken((r) => (first(r.forms).ownKnacks = []))).toThrow(
      /Invalid combat v2 content: forms.json/,
    );
  });

  it('rejects a form that names a Knack that does not exist', () => {
    expect(broken((r) => first(r.forms).ownKnacks.push('no-such-knack'))).toThrow(
      /form "splashet" names the unknown Knack "no-such-knack"/,
    );
  });

  it('rejects a Knack that is on no form', () => {
    expect(
      broken((r) =>
        r.knacks.knacks.push({
          ...clone(first(r.knacks.knacks)),
          id: 'orphan',
          name: 'Orphan',
        }),
      ),
    ).toThrow(/Knack "orphan" is on no form/);
  });

  it('rejects a duplicate talent id', () => {
    expect(broken((r) => r.talents.talents.push(clone(first(r.talents.talents))))).toThrow(
      /duplicate talent id "sharp-claws"/,
    );
  });

  it('rejects a pool that names a talent that does not exist', () => {
    expect(broken((r) => (pool(r, 'splashet')[0] = 'no-such-talent'))).toThrow(
      /the pool of "splashet" names the unknown talent "no-such-talent"/,
    );
  });

  it('rejects a pool that does not hold seven talents', () => {
    expect(broken((r) => pool(r, 'splashet').pop())).toThrow(
      /the pool of "splashet" has 6 talents, expected 7/,
    );
    expect(broken((r) => pool(r, 'splashet').push('sharp-claws'))).toThrow(
      /the pool of "splashet" has 8 talents, expected 7/,
    );
  });

  it('rejects a pool that repeats a talent', () => {
    expect(broken((r) => (pool(r, 'splashet')[1] = first(pool(r, 'splashet'))))).toThrow(
      /the pool of "splashet" repeats a talent/,
    );
  });

  it('rejects a pool for a line that is not shipped', () => {
    expect(broken((r) => (r.talents.pools['no-such-line'] = clone(pool(r, 'splashet'))))).toThrow(
      /a talent pool is for "no-such-line", which is not a shipped line/,
    );
  });

  it('rejects a talent that uses a field that does not add up', () => {
    expect(broken((r) => (first(r.talents.talents).fx = { twinStrikeBp: 5_000 }))).toThrow(
      /talent "sharp-claws" uses "twinStrikeBp", which is not an additive effect field/,
    );
  });

  it('rejects a talent that uses seal', () => {
    expect(broken((r) => (first(r.talents.talents).fx = { seal: true }))).toThrow(
      /talent "sharp-claws" uses seal/,
    );
  });

  it('rejects a talent whose gear line is not a shipped one', () => {
    expect(broken((r) => (first(r.talents.talents).gearLine = 'no-such-line'))).toThrow(
      /talent "sharp-claws" names the gear line "no-such-line"/,
    );
  });

  it('every talent in the shipped pack uses additive fields only', () => {
    const allowed = new Set<string>(ADDITIVE_FIELDS);
    for (const t of Object.values(combatV2.talents)) {
      for (const f of Object.keys(t.fx)) expect(allowed.has(f), `${t.id} ${f}`).toBe(true);
    }
  });

  it('every shipped raid boss and every dungeon foe has its entry', () => {
    expect(Object.keys(combatV2.raidBosses).sort()).toEqual(content.bosses.map((b) => b.id).sort());
    expect(Object.keys(combatV2.foes).sort()).toEqual(dungeonContent.foes.map((f) => f.id).sort());
  });

  it('every card has at least one answer, from a Knack family, a Knack id or a talent (the baseline and the raid-only cards excepted)', () => {
    for (const c of Object.values(combatV2.cards)) {
      for (const a of c.answers)
        expect(
          a in combatV2.families || a in combatV2.talents || a in combatV2.knacks,
          `${c.id}: ${a}`,
        ).toBe(true);
      if (c.id === 'plain' || c.raidOnly) continue;
      expect(c.answers.length, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('the Knack, talent, card, boss and keyword texts use only defined keywords', () => {
    const words = (t: string) => [...t.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
    const texts = [
      ...Object.values(combatV2.knacks).map((k) => k.text),
      ...Object.values(combatV2.talents).map((t) => t.text),
      ...Object.values(combatV2.cards).map((c) => c.asks),
      ...Object.values(combatV2.raidBosses).map((b) => b.asks),
      ...Object.values(combatV2.foes).map((f) => f.asks),
      ...Object.values(combatV2.keywords).flatMap((k) => [k.means, k.not]),
    ];
    const used = new Set(texts.flatMap(words));
    for (const w of used) expect(w in combatV2.keywords, `{${w}}`).toBe(true);
    expect(used.size).toBeGreaterThan(10);
  });

  it('rejects a duplicate card id', () => {
    expect(broken((r) => r.cards.push(clone(first(r.cards))))).toThrow(/duplicate card id "plain"/);
  });

  it('rejects a card with an unknown operation, stat or field', () => {
    const bad = (op: Fx) => broken((r) => (card(r, 'thick-hide').ops = [op]));
    expect(bad({ op: 'nope' })).toThrow(/Invalid combat v2 content: cards.json/);
    expect(bad({ op: 'add', stat: 'hp', value: 1 })).toThrow(
      /Invalid combat v2 content: cards.json/,
    );
    expect(bad({ op: 'add', stat: 'armour', value: 1, extra: 1 })).toThrow(
      /Invalid combat v2 content: cards.json/,
    );
    expect(bad({ op: 'add', stat: 'armour', value: 1.5 })).toThrow(
      /Invalid combat v2 content: cards.json/,
    );
  });

  it('rejects a card answer that is no Knack family, Knack id or talent', () => {
    expect(broken((r) => card(r, 'thick-hide').answers.push('Not A Family'))).toThrow(
      /card "thick-hide" has the answer "Not A Family", which is no Knack family, Knack id or talent/,
    );
    // A Knack id is an answer on its own (it points at that Knack only, not at its whole family).
    expect(broken((r) => card(r, 'thick-hide').answers.push('tunnel-through'))).not.toThrow();
    expect(broken((r) => card(r, 'thick-hide').answers.push('tunnel-thru'))).toThrow(
      /no Knack family, Knack id or talent/,
    );
  });

  it('accepts a talent as an answer, and rejects a repeated answer', () => {
    expect(broken((r) => card(r, 'thick-hide').answers.push('sharp-claws'))).not.toThrow();
    expect(broken((r) => card(r, 'thick-hide').answers.push('Pierce'))).toThrow(
      /card "thick-hide" repeats an answer/,
    );
  });

  it('rejects a card with no answer, except the baseline and the raid-only cards', () => {
    expect(broken((r) => (card(r, 'thick-hide').answers = []))).toThrow(
      /card "thick-hide" has no answer/,
    );
    expect(broken((r) => (card(r, 'plain').answers = []))).not.toThrow();
    expect(broken((r) => (card(r, 'adapts').answers = []))).not.toThrow();
  });

  it('rejects a raid boss that is not shipped, or listed twice', () => {
    expect(broken((r) => (first(r.raidBosses).id = 'not-a-boss'))).toThrow(
      /raid boss "not-a-boss" is not a shipped boss/,
    );
    expect(broken((r) => r.raidBosses.push(clone(first(r.raidBosses))))).toThrow(
      /duplicate raid boss "tidal-colossus"/,
    );
  });

  it('gives every raid boss a piece of one full column and refuses any other shape, naming the boss', () => {
    for (const b of Object.values(combatV2.raidBosses)) expect(b.piece.rows).toBe(b.rows);
    expect(combatV2.raidBosses['storm-sovereign']?.piece.rows).toBe(2);
    expect(combatV2.raidBosses['cinder-wyrm']?.piece.rows).toBe(4);
    expect(broken((r) => (raid(r, 'storm-sovereign').piece = { rows: 1 }))).toThrow(
      /raid boss "storm-sovereign": its piece has 1 rows but the arena has 2/,
    );
    expect(broken((r) => delete raid(r, 'cinder-wyrm').piece)).toThrow(/piece/);
  });

  it('rejects a boss or foe that names a card that does not exist', () => {
    expect(broken((r) => raid(r, 'cinder-wyrm').cards.push('no-such-card'))).toThrow(
      /raid boss "cinder-wyrm" names the unknown card "no-such-card"/,
    );
    expect(broken((r) => foe(r, 'puddle-imp').cards.push('no-such-card'))).toThrow(
      /foe "puddle-imp" names the unknown card "no-such-card"/,
    );
  });

  it('rejects a foe that is not a shipped dungeon foe, or listed twice', () => {
    expect(broken((r) => (first(r.foes.foes).id = 'not-a-foe'))).toThrow(
      /foe "not-a-foe" is not a shipped dungeon foe/,
    );
    expect(broken((r) => r.foes.foes.push(clone(first(r.foes.foes))))).toThrow(
      /duplicate foe "puddle-imp"/,
    );
  });

  it('rejects a move on a boss turn the boss does not have, and two moves of one id', () => {
    expect(broken((r) => (first(raid(r, 'storm-sovereign').moves).turn = 2))).toThrow(
      /raid boss "storm-sovereign": move "thunderclap" is on boss turn 2, past its 2 rows/,
    );
    expect(broken((r) => (first(foe(r, 'flicker-swarm').moves).turn = 1))).toThrow(
      /foe "flicker-swarm": move "storm-front" is on boss turn 1, past its 1 rows/,
    );
    expect(
      broken((r) => {
        const b = raid(r, 'cinder-wyrm');
        b.moves.push(clone(first(b.moves)));
      }),
    ).toThrow(/raid boss "cinder-wyrm" has two moves "anvil-fall"/);
  });

  it('rejects a raid boss with more than two damaging moves on one boss turn of a round', () => {
    expect(
      broken((r) => {
        // Round 4 already has two damaging moves on boss turn 1.
        raid(r, 'storm-sovereign').moves.push({ id: 'arc-lash', every: 1, turn: 1, powerBp: 5000 });
      }),
    ).toThrow(/raid boss "storm-sovereign" has more than two damaging moves on boss turn 1/);
  });

  it('a silence is not a damaging move', () => {
    expect(
      broken((r) => {
        r.moves.push({
          id: 'static-hush',
          name: 'Static Hush',
          element: 'spark',
          shape: 'rowEnds',
          anchor: 'front',
          silences: true,
        });
        raid(r, 'storm-sovereign').moves.push({
          id: 'static-hush',
          every: 1,
          turn: 1,
          powerBp: 0,
          silenceTurns: 1,
        });
      }),
    ).not.toThrow();
  });

  it('rejects a duplicate keyword', () => {
    expect(broken((r) => r.keywords.push(clone(first(r.keywords))))).toThrow(
      /duplicate keyword "Mark"/,
    );
  });

  it('rejects a text that uses a keyword that is not defined', () => {
    expect(broken((r) => (first(r.knacks.knacks).text = 'It is {Not A Keyword}.'))).toThrow(
      /Knack "steady-mark" uses the undefined keyword \{Not A Keyword\}/,
    );
    expect(broken((r) => (first(r.talents.talents).text = 'It is {Nope}.'))).toThrow(
      /talent "sharp-claws" uses the undefined keyword \{Nope\}/,
    );
    expect(broken((r) => (card(r, 'thick-hide').asks = 'Is it {Nope}?'))).toThrow(
      /card "thick-hide" uses the undefined keyword \{Nope\}/,
    );
    expect(broken((r) => (first(r.keywords).means = 'See {Nope}.'))).toThrow(
      /keyword "Mark" uses the undefined keyword \{Nope\}/,
    );
  });
});

/** The track as the lab had it before it became data (`track.ts`: `SLOT_NUMBERS`, the ladder's strengths, `SLOT_CARDS`, `SLOT_EXTRA_CARDS`). */
const LAB_TRACK = [
  [1, 'tidal-colossus', 3_800, 70, 25, 1_833, 0, false, []],
  [2, 'cinder-wyrm', 7_500, 80, 42, 3_000, 1, false, []],
  [3, 'storm-sovereign', 13_100, 51, 7, 4_167, 2, true, []],
  [4, 'old-bogback', 28_200, 82, 19, 5_333, 2, true, []],
  [5, 'thornmother', 6_400, 153, 124, 6_500, 1, true, []],
  [6, 'tidal-colossus', 19_300, 88, 37, 7_200, 2, true, ['slippery', 'breakwater']],
  [7, 'cinder-wyrm', 10_200, 185, 48, 7_900, 2, true, []],
  [8, 'storm-sovereign', 7_000, 96, 5, 8_600, 2, true, ['lucky-strike']],
  [9, 'old-bogback', 32_800, 100, 33, 9_300, 2, true, []],
  [10, 'thornmother', 7_500, 102, 156, 10_000, 1, true, []],
  [11, 'tidal-colossus', 13_100, 142, 42, 10_000, 2, true, ['slippery', 'breakwater']],
  [12, 'cinder-wyrm', 11_500, 199, 49, 10_000, 2, true, []],
  [13, 'storm-sovereign', 14_300, 48, 10, 10_000, 2, true, ['lucky-strike']],
  [14, 'old-bogback', 32_700, 117, 31, 10_000, 2, true, []],
  [15, 'thornmother', 7_900, 107, 156, 10_000, 1, true, []],
] as const;

describe('combat v2 raid track', () => {
  it('loads the shipped track: the order of the bosses and slots 1 to 15', () => {
    expect(combatV2.raidTrack.order).toEqual([
      'tidal-colossus',
      'cinder-wyrm',
      'storm-sovereign',
      'old-bogback',
      'thornmother',
    ]);
    expect(combatV2.raidTrack.slots.map((s) => s.slot)).toEqual(LAB_TRACK.map((t) => t[0]));
  });

  it('holds the numbers, strengths, ramp and extra cards the lab had for slots 1 to 15', () => {
    const got = combatV2.raidTrack.slots.map((s) => [
      s.slot,
      s.boss,
      s.hp,
      s.atk,
      s.armour,
      s.strengthBp,
      s.cards,
      s.buildUp,
      s.extraCards,
    ]);
    expect(got).toEqual(LAB_TRACK.map((t) => [...t]));
  });

  it('puts no word of "wall" in the data', () => {
    expect(JSON.stringify(raidTrack)).not.toMatch(/wall/i);
  });

  it('rejects an order that names a boss that is not a raid boss', () => {
    expect(broken((r) => r.raidTrack.order.push('not-a-boss'))).toThrow(
      /raid track order names "not-a-boss", which is no raid boss/,
    );
  });

  it('rejects a slot whose boss is not the one the order puts there', () => {
    expect(broken((r) => (slotOf(r, 2).boss = 'thornmother'))).toThrow(
      /raid track slot 2 is "thornmother", but the order puts "cinder-wyrm" there/,
    );
    expect(broken((r) => (slotOf(r, 6).boss = 'cinder-wyrm'))).toThrow(
      /raid track slot 6 is "cinder-wyrm", but the order puts "tidal-colossus" there/,
    );
    expect(broken((r) => (slotOf(r, 3).boss = 'not-a-boss'))).toThrow(
      /raid track slot 3 names "not-a-boss", which is no raid boss/,
    );
  });

  it('follows a reordered track: slot n is order[(n - 1) % length]', () => {
    expect(
      broken((r) => {
        r.raidTrack.order.reverse();
        r.raidTrack.slots.forEach((s, i) => {
          s.boss = r.raidTrack.order[i % r.raidTrack.order.length] as string;
          s.cards = 0;
          s.extraCards = [];
        });
      }),
    ).not.toThrow();
  });

  it('rejects slots that are out of order or have a gap', () => {
    expect(broken((r) => r.raidTrack.slots.splice(3, 1))).toThrow(
      /raid track slot 5 is at place 4: slots run 1, 2, 3 ... with no gaps/,
    );
    expect(broken((r) => (slotOf(r, 1).slot = 2))).toThrow(/raid track slot 2 is at place 1/);
    expect(broken((r) => (r.raidTrack.slots = []))).toThrow(
      /Invalid combat v2 content: raid-track.json/,
    );
  });

  it('rejects more cards than the boss has', () => {
    // Thornmother has one card of her own, Old Bogback two.
    expect(broken((r) => (slotOf(r, 5).cards = 2))).toThrow(
      /raid track slot 5 has 2 cards, but "thornmother" has only 1/,
    );
    expect(broken((r) => (slotOf(r, 4).cards = 3))).toThrow(
      /raid track slot 4 has 3 cards, but "old-bogback" has only 2/,
    );
    expect(broken((r) => (slotOf(r, 5).cards = -1))).toThrow(/raid-track.json/);
  });

  it('rejects an extra card that does not exist, is one of the boss’s own, or repeats', () => {
    expect(broken((r) => slotOf(r, 8).extraCards.push('no-such-card'))).toThrow(
      /raid track slot 8 adds the unknown card "no-such-card"/,
    );
    const own = raidBosses.find((b) => b.id === 'storm-sovereign')?.cards[0] as string;
    expect(broken((r) => slotOf(r, 8).extraCards.push(own))).toThrow(
      new RegExp(`raid track slot 8 adds "${own}", which is one of "storm-sovereign"'s own cards`),
    );
    expect(broken((r) => slotOf(r, 8).extraCards.push('lucky-strike'))).toThrow(
      /raid track slot 8 adds "lucky-strike" twice/,
    );
  });

  it('rejects a strength outside 0 to 10000, a missing field and an unknown field', () => {
    expect(broken((r) => (slotOf(r, 1).strengthBp = 10_001))).toThrow(/raid-track.json/);
    expect(broken((r) => (slotOf(r, 1).strengthBp = -1))).toThrow(/raid-track.json/);
    expect(broken((r) => (slotOf(r, 1).strengthBp = 0))).not.toThrow();
    expect(broken((r) => (slotOf(r, 1).strengthBp = 10_000))).not.toThrow();
    expect(broken((r) => delete (slotOf(r, 1) as Partial<RawSlot>).hp)).toThrow(/raid-track.json/);
    expect(broken((r) => ((slotOf(r, 1) as unknown as Fx)['wall'] = true))).toThrow(
      /raid-track.json/,
    );
  });
});

describe('combat v2 move library', () => {
  const aMove = (r: Files, id: string): RawLibraryMove => byId(r.moves, id);

  it('the shipped pack resolves a use into the engine’s move: the name and the pattern’s shape and anchor are the library’s', () => {
    const spear = combatV2.raidBosses['tidal-colossus']?.moves.find(
      (m) => m.id === 'deepwater-spear',
    );
    expect(spear).toMatchObject({
      id: 'deepwater-spear',
      name: 'Deepwater Spear',
      pattern: { anchor: 'strongest', shape: 'columns', n: 2, perColumns: 4 },
    });
    // Wind-up is the engine's `charged`; a silence keeps its `silenceTurns`.
    expect(
      combatV2.raidBosses['tidal-colossus']?.moves.find((m) => m.id === 'riptide')?.charged,
    ).toBe(true);
    expect(
      combatV2.raidBosses['thornmother']?.moves.find((m) => m.id === 'bramble-hush'),
    ).toMatchObject({
      name: 'Bramble Hush',
      silenceTurns: 1,
    });
    // A card's move is the element-less library move.
    const op = combatV2.cards['bramble-bind']?.ops[0];
    expect(op?.op === 'move' ? op.move.name : '').toBe('Hush');
  });

  it('rejects a duplicate move id and a duplicate move name', () => {
    expect(broken((r) => r.moves.push(clone(first(r.moves))))).toThrow(
      /duplicate move id "deafening-mist"/,
    );
    expect(broken((r) => r.moves.push({ ...clone(first(r.moves)), id: 'other-mist' }))).toThrow(
      /duplicate move name "Deafening Mist"/,
    );
    expect(
      broken((r) =>
        r.moves.push({ ...clone(first(r.moves)), id: 'other-mist', name: 'deafening MIST' }),
      ),
    ).toThrow(/duplicate move name "deafening MIST"/);
  });

  it('rejects a use of a move that is not in the library', () => {
    expect(broken((r) => (first(raid(r, 'tidal-colossus').moves).id = 'no-such-move'))).toThrow(
      /raid boss "tidal-colossus" uses "no-such-move", which is not in the move library/,
    );
    expect(broken((r) => (first(foe(r, 'drift-wisp').moves).id = 'no-such-move'))).toThrow(
      /foe "drift-wisp" uses "no-such-move", which is not in the move library/,
    );
  });

  it('a boss or foe uses only the moves of its element, and a card only moves with no element', () => {
    expect(broken((r) => (first(raid(r, 'tidal-colossus').moves).id = 'anvil-fall'))).toThrow(
      /raid boss "tidal-colossus" \(tide\) uses "anvil-fall", which is a ember move: it uses only moves of its own element/,
    );
    expect(broken((r) => (first(foe(r, 'drift-wisp').moves).id = 'hush'))).toThrow(
      /foe "drift-wisp" \(tide\) uses "hush", which is a card move/,
    );
    const op = (r: Files): { move: { id: string } } =>
      card(r, 'bramble-bind').ops[0] as unknown as { move: { id: string } };
    expect(broken((r) => (op(r).move.id = 'deafening-mist'))).toThrow(
      /card "bramble-bind" adds "deafening-mist", a tide move: a card adds only moves with no element/,
    );
  });

  it('a silence needs silenceTurns, and only a silence has them; a one-shot needs oneShotBp and only it has it', () => {
    expect(broken((r) => delete first(foe(r, 'drift-wisp').moves).silenceTurns)).toThrow(
      /foe "drift-wisp": "deafening-mist" silences, so its use needs silenceTurns/,
    );
    expect(broken((r) => (first(foe(r, 'flicker-swarm').moves).silenceTurns = 1))).toThrow(
      /foe "flicker-swarm": "storm-front" does not silence, so its use has no silenceTurns/,
    );
    const own = (r: Files, id: string): RawMove => byId(raid(r, 'storm-sovereign').moves, id);
    expect(broken((r) => delete own(r, 'judgement-bolt').oneShotBp)).toThrow(
      /raid boss "storm-sovereign": "judgement-bolt" is a one-shot, so its use needs oneShotBp/,
    );
    expect(broken((r) => (own(r, 'thunderbolt').oneShotBp = 1))).toThrow(
      /raid boss "storm-sovereign": "thunderbolt" is not a one-shot, so its use has no oneShotBp/,
    );
    expect(aMove(clone({ moves }) as unknown as Files, 'judgement-bolt').oneShot).toBe(true);
  });

  it('a use cannot carry a name, a shape or an anchor, and a move needs a real shape and anchor', () => {
    expect(broken((r) => (first(raid(r, 'tidal-colossus').moves).name = 'Another Name'))).toThrow(
      /raid-bosses.json at "0.moves.0.name"/,
    );
    expect(
      broken((r) => (first(raid(r, 'tidal-colossus').moves).pattern = { shape: 'all' })),
    ).toThrow(/raid-bosses.json at "0.moves.0.pattern"/);
    expect(broken((r) => (first(r.moves).shape = 'blob'))).toThrow(/moves.json at "0.shape"/);
    expect(broken((r) => (first(r.moves).anchor = 'nobody'))).toThrow(/moves.json at "0.anchor"/);
    expect(broken((r) => (first(r.moves).element = 'water'))).toThrow(/moves.json at "0.element"/);
    expect(broken((r) => ((first(r.moves) as unknown as Fx)['power'] = 1))).toThrow(
      /moves.json at "0.power"/,
    );
  });

  const phaseOf = (r: Files, id: string): RawMove[] =>
    (raid(r, id) as unknown as { escalation: { phase: { moves: RawMove[] } } }).escalation.phase
      .moves;

  it('a phase move with the id of an own move replaces it (Second Bloom’s Thorn Rain); two phase moves of one id are refused', () => {
    // The shipped pack: Thornmother's Thorn Rain is replaced by a stronger one, and Thorn Wall is added.
    const thorn = combatV2.raidBosses['thornmother'];
    expect(thorn?.moves.filter((m) => m.id === 'thorn-rain')).toHaveLength(1);
    expect(thorn?.escalation?.phase?.moves.map((m) => m.id)).toEqual(['thorn-rain', 'thorn-wall']);
    expect(
      broken((r) =>
        phaseOf(r, 'thornmother').push({ id: 'spiky-spine', every: 2, turn: 2, powerBp: 9000 }),
      ),
    ).not.toThrow();
    expect(
      broken((r) => phaseOf(r, 'thornmother').push(clone(first(phaseOf(r, 'thornmother'))))),
    ).toThrow(/raid boss "thornmother" has two moves "thorn-rain"/);
  });

  it('a behaviour has one name per element: two moves with the same label and element are refused', () => {
    expect(
      broken((r) => {
        r.moves.push({
          id: 'static-slam',
          name: 'Static Slam',
          element: 'spark',
          shape: 'line3',
          anchor: 'strongest',
          silences: false,
        });
      }),
    ).toThrow(/moves "thunderclap" and "static-slam" share the label Nemesis Slam for spark/);
    // A row and several rows are one Sweep: the label decides, not the shape's spelling.
    expect(
      broken((r) => {
        r.moves.push({
          id: 'peat-line',
          name: 'Peat Line',
          element: 'mire',
          shape: 'row',
          anchor: 'back',
          silences: false,
        });
      }),
    ).toThrow(/moves "peat-wave" and "peat-line" share the label Rear Sweep for mire/);
    // Another element may have the behaviour under another name, and so may a card.
    expect(
      broken((r) => {
        r.moves.push({
          id: 'static-hush',
          name: 'Static Hush',
          element: 'spark',
          shape: 'rowEnds',
          anchor: 'front',
          silences: true,
        });
      }),
    ).not.toThrow();
    expect(
      broken((r) => {
        r.moves.push({
          id: 'card-slam',
          name: 'Card Slam',
          shape: 'line3',
          anchor: 'payoff',
          silences: false,
        });
      }),
    ).toThrow(/moves "payoff-slam" and "card-slam" share the label Payoff Slam for cards/);
  });

  it('a boss or foe never has two moves of one behaviour, counting the moves its cards add', () => {
    // Thornmother has Bramble Hush; the card Bramble Bind adds a Hush of its own: two Hushes.
    expect(broken((r) => raid(r, 'thornmother').cards.push('bramble-bind'))).toThrow(
      /raid boss "thornmother" has two Hush moves, "bramble-hush" and "hush"/,
    );
    expect(broken((r) => foe(r, 'bramble-hound').cards.push('bramble-bind'))).toThrow(
      /foe "bramble-hound" has two Hush moves, "bramble-hush" and "hush"/,
    );
    // A boss that has no Hush may take the card.
    expect(broken((r) => raid(r, 'storm-sovereign').cards.push('bramble-bind'))).not.toThrow();
    // An extra card of a track slot counts too.
    expect(broken((r) => slotOf(r, 5).extraCards.push('bramble-bind'))).toThrow(
      /raid track slot 5 \(thornmother\) has two Hush moves/,
    );
    expect(broken((r) => slotOf(r, 3).extraCards.push('bramble-bind'))).not.toThrow();
  });

  it('a landmark move is a different behaviour from the foe’s own moves, with its Wind-up', () => {
    // The Drowned Warden and the Fen Lurker used to repeat their own Quake at a landmark.
    for (const [id, name, label] of [
      ['drowned-warden', 'Rogue Wave', 'Payoff Sweep'],
      ['fen-lurker', 'Sinking Mud', 'Wild Sweep'],
    ] as const) {
      const f = combatV2.foes[id];
      expect(f?.signature?.name, id).toBe(name);
      expect(f?.signature?.charged, id).toBe(true);
      expect(
        f && f.signature && moveLabel({ ...(combatV2.moves[f.signature.id] as MoveDef) }),
        id,
      ).toBe(label);
    }
    expect(
      broken((r) => {
        const f = foe(r, 'drowned-warden') as unknown as { signature: RawMove };
        f.signature = { id: 'deluge', every: 4, turn: 0, powerBp: 100 };
      }),
    ).toThrow(/foe "drowned-warden" has two moves "deluge"/);
  });
});
