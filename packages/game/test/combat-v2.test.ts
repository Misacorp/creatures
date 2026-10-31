import { describe, expect, it } from 'vitest';
import { content } from '../src';
import { dungeonContent } from '../src/content/dungeon';
import { ADDITIVE_FIELDS, combatV2, loadCombatV2 } from '../src/combat-v2';
import cards from '../src/combat-v2/data/cards.json';
import foes from '../src/combat-v2/data/foes.json';
import forms from '../src/combat-v2/data/forms.json';
import keywords from '../src/combat-v2/data/keywords.json';
import knacks from '../src/combat-v2/data/knacks.json';
import raidBosses from '../src/combat-v2/data/raid-bosses.json';
import rules from '../src/combat-v2/data/rules.json';
import talents from '../src/combat-v2/data/talents.json';

type Fx = Record<string, unknown>;
/** The raw files, loosely typed so a test can break them. */
interface Files {
  rules: Record<string, unknown>;
  knacks: {
    families: { name: string; text: string }[];
    knacks: { id: string; name: string; family: string; text: string; intent: string; fx: Fx }[];
  };
  forms: { id: string; armour: number; ownKnacks: string[] }[];
  talents: {
    talents: { id: string; name: string; text: string; roles: string[]; intent: string; fx: Fx }[];
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
  foes: { scale: Fx; curve: Fx; foes: RawBoss[] };
  keywords: { name: string; means: string; not: string; step: string }[];
}
interface RawMove {
  id: string;
  name: string;
  every: number;
  turn?: number;
  pattern: Fx;
  powerBp: number;
  silenceTurns?: number;
}
interface RawBoss {
  id: string;
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
      knacks,
      forms,
      talents,
      cards,
      raidBosses,
      foes,
      keywords,
    }) as unknown as Files;
    edit(r);
    return loadCombatV2(r, content.creatures, {
      bosses: content.bosses,
      foes: dungeonContent.foes,
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

  it('every card has at least one answer, from a Knack family or a talent (the baseline and the raid-only cards excepted)', () => {
    for (const c of Object.values(combatV2.cards)) {
      for (const a of c.answers)
        expect(a in combatV2.families || a in combatV2.talents, `${c.id}: ${a}`).toBe(true);
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

  it('rejects a card answer that is neither a Knack family nor a talent', () => {
    expect(broken((r) => card(r, 'thick-hide').answers.push('Not A Family'))).toThrow(
      /card "thick-hide" has the answer "Not A Family", which is no Knack family and no talent/,
    );
    // A Knack id is not a family.
    expect(broken((r) => card(r, 'thick-hide').answers.push('tunnel-through'))).toThrow(
      /no Knack family/,
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
      /foe "flicker-swarm": move "buzz-cloud" is on boss turn 1, past its 1 rows/,
    );
    expect(
      broken((r) => {
        const b = raid(r, 'cinder-wyrm');
        b.moves.push(clone(first(b.moves)));
      }),
    ).toThrow(/raid boss "cinder-wyrm" has two moves "coil-crush"/);
  });

  it('rejects a raid boss with more than two damaging moves on one boss turn of a round', () => {
    expect(
      broken((r) => {
        const b = raid(r, 'storm-sovereign');
        for (const id of ['x', 'y', 'z'])
          b.moves.push({ ...clone(first(b.moves)), id, name: id.toUpperCase(), every: 1, turn: 1 });
      }),
    ).toThrow(/raid boss "storm-sovereign" has more than two damaging moves on boss turn 1/);
  });

  it('a silence is not a damaging move', () => {
    expect(
      broken((r) => {
        const b = raid(r, 'thornmother');
        for (const id of ['x', 'y', 'z'])
          b.moves.push({
            id,
            name: id.toUpperCase(),
            every: 1,
            turn: 1,
            pattern: { anchor: 'front', shape: 'rowEnds', n: 1 },
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
