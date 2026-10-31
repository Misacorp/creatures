/**
 * The content gate of combat v2 (docs/design/combat/content-as-data.md, section 6): the rules the shipped pack has to meet,
 * one `it` per rule, so the gate reads in one place. The loader (`load.ts`) already refuses a broken pack; the tests here
 * read the SHIPPED data and state each rule, and they hold the rules the loader cannot (names, every keyword used, the
 * number of answers). The broken-pack cases are in `combat-v2.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { content } from '../src';
import { talentContent } from '../src/content';
import { gearContent } from '../src/content/gear';
import { combatV2, type BossMoveDef, type CardDef } from '../src/combat-v2';
import linesJson from '../src/content/data/gear-lines.json';

const pack = combatV2;

// ---------------------------------------------------------------------------------------------------------------------
// Names (P-06)
// ---------------------------------------------------------------------------------------------------------------------

/** A player-facing name and where it is. `thing` is what it names: two places with the same thing are one thing seen twice. */
interface Place {
  readonly name: string;
  readonly where: string;
  readonly thing: string;
}

/** A stable text of a value (object keys sorted), to tell whether two moves have the same numbers. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${k}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A move is one thing by its id and numbers: the same id with the same numbers on several bosses is one move. */
const moveThing = (m: BossMoveDef): string => `move ${m.id} ${stable(m)}`;

/** The moves a card adds (`move` operations). */
const cardMoves = (c: CardDef): BossMoveDef[] =>
  c.ops.flatMap((o) => (o.op === 'move' ? [o.move] : []));

/** Every player-facing name of combat v2, except the lab baseline card `plain`. */
function combatPlaces(): Place[] {
  const out: Place[] = [];
  const add = (kind: string, name: string, where: string, thing = `${kind} ${where}`) =>
    out.push({ name, where: `${kind} ${where}`, thing });
  const addMove = (kind: string, m: BossMoveDef, owner: string) =>
    add(kind, m.name, `${owner} / ${m.id}`, moveThing(m));
  const addBuildUp = (owner: string, e: NonNullable<(typeof pack.foes)[string]['escalation']>) => {
    add('Build-up', e.name, owner);
    if (e.phase !== undefined) {
      add('Build-up phase', e.phase.name, owner);
      for (const m of e.phase.moves) addMove('phase move', m, owner);
    }
  };

  // A Knack family is a rule, and its keyword is the word the texts use for it (Seal, Reach, Taunt ...): one thing seen twice.
  for (const name of Object.keys(pack.families)) add('Knack family', name, name, `rule ${name}`);
  for (const k of Object.values(pack.knacks)) add('Knack', k.name, k.id);
  for (const t of Object.values(pack.talents)) add('talent', t.name, t.id);
  for (const k of Object.values(pack.keywords)) {
    const ofFamily = Object.hasOwn(pack.families, k.name);
    add('keyword', k.name, k.name, ofFamily ? `rule ${k.name}` : `keyword ${k.name}`);
  }
  for (const c of Object.values(pack.cards)) {
    if (c.id === 'plain') continue;
    // A card that adds a move may give the move its own name: the card and its move are one thing.
    const same = cardMoves(c).find((m) => m.name === c.name);
    add('card', c.name, c.id, same === undefined ? `card ${c.id}` : moveThing(same));
    for (const m of cardMoves(c)) addMove('card move', m, c.id);
  }
  for (const b of Object.values(pack.raidBosses)) {
    for (const m of b.moves) addMove('raid boss move', m, b.id);
    if (b.escalation !== undefined) addBuildUp(b.id, b.escalation);
  }
  for (const f of Object.values(pack.foes)) {
    for (const m of f.moves) addMove('foe move', m, f.id);
    if (f.signature !== undefined) addMove('foe signature move', f.signature, f.id);
    if (f.escalation !== undefined) addBuildUp(f.id, f.escalation);
  }
  return out;
}

/** The names with more than one thing: name (lower case) to the places that use it. */
function clashes(places: readonly Place[]): Map<string, Place[]> {
  const byName = new Map<string, Place[]>();
  for (const p of places) {
    const key = p.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  return new Map([...byName].filter(([, list]) => new Set(list.map((p) => p.thing)).size > 1));
}

/** The text a failing test shows for a clash. */
const describeClash = ([name, list]: [string, Place[]]): string =>
  `"${name}": ${list.map((p) => p.where).join('; ')}`;

/**
 * Names that clash today and are a pending naming question for Misa. Each entry names the decision it waits for, and the test
 * fails when an entry no longer clashes, so the list is the to-do and never stale. Key: the name, lower case.
 */
const KNOWN_CLASHES: Readonly<Record<string, string>> = {
  // The card Great Wave adds a move "Great Wave" (power 18000); the Tidal Colossus has its own move "Great Wave" (power 13900).
  // Same name, different numbers. Waits for the next names batch to Misa, which renames one of the two moves.
  'great wave': 'the next names batch to Misa (docs/design/combat/content-as-data.md, section 7)',
};

/**
 * Knacks (by id) that have the name of a shipped gear line today: a pending naming question. The Knack Guard's Shadow gives +10% while
 * a living Guard stands beside it and costs 10 armour; the gear line Guard's shadow gives more Attack in the same place. Same name,
 * not the same effect. Waits for the next names batch to Misa (rename one, or make them one effect).
 */
const KNACK_GEAR_CLASHES: Readonly<Record<string, string>> = {
  'guards-shadow': "the gear line Guard's shadow; the next names batch to Misa",
};

/**
 * Knacks (by id) that have the name of a combat v1 talent (`content/data/talents.json`). Not a naming question: the v1 talents go
 * away with v1 in phase 8 of the combat rework (docs/design/combat/README.md), and the clash goes with them. Nothing is renamed.
 */
const V1_TALENT_CLASHES: Readonly<Record<string, string>> = {
  'crown-of-embers': 'the v1 talent Crown of Embers; goes with v1 in phase 8',
  'lantern-glow': 'the v1 talent Lantern Glow; goes with v1 in phase 8',
};

describe('combat v2 content gate: unique names (P-06)', () => {
  it('a name appears once in combat v2, except a card and the move it adds, and one move reused with the same numbers', () => {
    const found = clashes(combatPlaces());
    const unexpected = [...found].filter(([name]) => !Object.hasOwn(KNOWN_CLASHES, name));
    expect(unexpected.map(describeClash), 'names used for two things').toEqual([]);
  });

  it('the known clashes are all still clashes (an allowlisted name that stops clashing leaves the list)', () => {
    const found = clashes(combatPlaces());
    for (const name of Object.keys(KNOWN_CLASHES))
      expect(found.has(name), `"${name}" no longer clashes: remove it from KNOWN_CLASHES`).toBe(
        true,
      );
  });

  it('one move id reused on several bosses or foes has the same numbers every time', () => {
    const byId = new Map<string, Set<string>>();
    const all: BossMoveDef[] = [
      ...Object.values(pack.raidBosses).flatMap((b) => [
        ...b.moves,
        ...(b.escalation?.phase?.moves ?? []),
      ]),
      ...Object.values(pack.foes).flatMap((f) => [
        ...f.moves,
        ...(f.signature ? [f.signature] : []),
        ...(f.escalation?.phase?.moves ?? []),
      ]),
    ];
    for (const m of all) byId.set(m.id, (byId.get(m.id) ?? new Set()).add(stable(m)));
    const differing = [...byId].filter(([, forms]) => forms.size > 1).map(([id]) => id);
    expect(differing, 'a move id with two sets of numbers').toEqual([]);
  });

  /** The shipped gear lines by raw id (`attunement`, not `tide-attunement`), with their names. */
  const lines = linesJson as readonly { id: string; name: string }[];
  const lineIdsByName = (name: string): string[] =>
    lines.filter((l) => l.name.toLowerCase() === name.toLowerCase()).map((l) => l.id);

  it('a talent that shares its name with a shipped gear line is that line (`gearLine`), and a `gearLine` is a shipped line', () => {
    const shippedIds = new Set(gearContent.lines.map((l) => l.id));
    for (const t of Object.values(pack.talents)) {
      const sameName = lineIdsByName(t.name);
      if (sameName.length > 0)
        expect(sameName, `${t.name} (${t.id}) has the name of a gear line`).toContain(t.gearLine);
      if (t.gearLine !== undefined)
        expect(shippedIds.has(t.gearLine), `${t.id}: ${t.gearLine}`).toBe(true);
    }
  });

  it('a Knack shares no name with a shipped gear line, a talent or (until phase 8) a combat v1 talent', () => {
    const talentNames = new Set(Object.values(pack.talents).map((t) => t.name.toLowerCase()));
    const v1Names = new Set([...talentContent.byId.values()].map((t) => t.name.toLowerCase()));
    const gear: string[] = [];
    const v1: string[] = [];
    for (const k of Object.values(pack.knacks)) {
      if (lineIdsByName(k.name).length > 0) gear.push(k.id);
      expect(talentNames.has(k.name.toLowerCase()), `Knack ${k.id} has the name of a talent`).toBe(
        false,
      );
      if (v1Names.has(k.name.toLowerCase())) v1.push(k.id);
    }
    expect(gear, 'Knacks with the name of a gear line (see KNACK_GEAR_CLASHES)').toEqual(
      Object.keys(KNACK_GEAR_CLASHES),
    );
    expect(v1, 'Knacks with the name of a v1 talent (see V1_TALENT_CLASHES)').toEqual(
      Object.keys(V1_TALENT_CLASHES),
    );
  });

  it('a combat v2 talent shares no name with a combat v1 talent', () => {
    const v1Names = new Set([...talentContent.byId.values()].map((t) => t.name.toLowerCase()));
    const same = Object.values(pack.talents).filter((t) => v1Names.has(t.name.toLowerCase()));
    expect(same.map((t) => t.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------------------------------------------------

/** The keywords a text uses, `{Like} {This}`. */
const wordsIn = (text: string): string[] =>
  [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');

/** Every text a player reads that may use a keyword, with where it is. */
function keywordTexts(): { where: string; text: string }[] {
  return [
    ...Object.entries(pack.families).map(([name, text]) => ({ where: `family ${name}`, text })),
    ...Object.values(pack.knacks).map((k) => ({ where: `Knack ${k.id}`, text: k.text })),
    ...Object.values(pack.talents).map((t) => ({ where: `talent ${t.id}`, text: t.text })),
    ...Object.values(pack.cards).map((c) => ({ where: `card ${c.id}`, text: c.asks })),
    ...Object.values(pack.raidBosses).map((b) => ({ where: `raid boss ${b.id}`, text: b.asks })),
    ...Object.values(pack.foes).map((f) => ({ where: `foe ${f.id}`, text: f.asks })),
    ...Object.values(pack.keywords).flatMap((k) => [
      { where: `keyword ${k.name} (means)`, text: k.means },
      { where: `keyword ${k.name} (not)`, text: k.not },
    ]),
  ];
}

/**
 * Keywords that no text uses on purpose: words the board shows without any text using them. Each is in `keywords.json` so the
 * player can look it up (the glossary) and the rules have one definition. A keyword that a text starts to use leaves the set,
 * so the set cannot go stale.
 */
const BOARD_KEYWORDS: ReadonlySet<string> = new Set<string>([
  // The board marks a hit that armour stopped.
  'Blocked',
  // The boss's attack shapes and anchors: the board shows them on the slots a move will hit (the lab's `shapeText`), no text names them.
  'Scatter',
  'Leap',
  'Cross',
  'Checker',
  'Most hurt',
  'Back-most',
  // The boss's Build-up meter; a Build-up shows its own name in the text, and no text says the word itself.
  'Build-up',
]);

describe('combat v2 content gate: keywords', () => {
  it('every {Keyword} in a Knack, talent, card, boss, foe or keyword text is a keyword', () => {
    const undefinedWords = keywordTexts().flatMap(({ where, text }) =>
      wordsIn(text)
        .filter((w) => !Object.hasOwn(pack.keywords, w))
        .map((w) => `${where} uses {${w}}`),
    );
    expect(undefinedWords).toEqual([]);
  });

  it('every keyword is used by a text, or is a BOARD_KEYWORDS word', () => {
    const used = new Set(
      keywordTexts()
        .filter((t) => !t.where.startsWith('keyword '))
        .flatMap((t) => wordsIn(t.text)),
    );
    const unused = Object.keys(pack.keywords).filter((k) => !used.has(k));
    expect(
      unused.filter((k) => !BOARD_KEYWORDS.has(k)),
      'keywords no text uses',
    ).toEqual([]);
    expect(
      [...BOARD_KEYWORDS].filter((k) => used.has(k) || !Object.hasOwn(pack.keywords, k)),
      'BOARD_KEYWORDS words that a text uses now, or that are no keyword: remove them',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The cards with exactly one written answer today. The design (P-13 and the plan) asks for two, from different families; a second
 * answer needs a real tool that works, so none is invented here. The list must match exactly: a card that gets its second answer
 * has to leave it.
 */
const ONE_ANSWER_CARDS: readonly string[] = [
  'stone-skin',
  'clean-scales',
  'reflective-hide',
  'elusive',
  'bramble-bind',
  'wither',
  'payoff-hunter',
  'grudge',
  'fizzle',
  'shake-it-off',
  'breakwater',
];

describe('combat v2 content gate: every card has answers', () => {
  const answerable = Object.values(pack.cards).filter(
    (c) => c.id !== 'plain' && c.raidOnly !== true,
  );

  it('every card except the baseline and the raid-only cards has at least one answer, each a Knack family or a talent', () => {
    for (const c of answerable) {
      expect(c.answers.length, `card ${c.id}`).toBeGreaterThanOrEqual(1);
      for (const a of c.answers)
        expect(
          Object.hasOwn(pack.families, a) || Object.hasOwn(pack.talents, a),
          `card ${c.id}: answer "${a}"`,
        ).toBe(true);
      expect(new Set(c.answers).size, `card ${c.id} repeats an answer`).toBe(c.answers.length);
    }
  });

  it('the cards with one answer are the ONE_ANSWER_CARDS list, no more and no fewer (the design asks for two)', () => {
    const one = answerable.filter((c) => c.answers.length === 1).map((c) => c.id);
    expect(one).toEqual([...ONE_ANSWER_CARDS]);
  });

  it('the baseline card has no answer, and the raid-only cards are the two the raid weekend uses', () => {
    expect(pack.cards['plain']?.answers).toEqual([]);
    expect(
      Object.values(pack.cards)
        .filter((c) => c.raidOnly === true)
        .map((c) => c.id),
    ).toEqual(['adapts', 'adapts-element']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Forms and Knacks
// ---------------------------------------------------------------------------------------------------------------------

/** The Knacks a form can equip (R11): its own and, when its stage 1 form has the same role, that form's. */
function knacksOf(formId: string): string[] {
  const form = content.creatures.find((c) => c.id === formId);
  if (form === undefined) return [];
  const own = pack.forms[formId]?.ownKnacks ?? [];
  const parent =
    form.stage < 2
      ? undefined
      : content.creatures.find((c) => c.line === form.line && c.stage === form.stage - 1);
  const kept = parent !== undefined && parent.role === form.role ? knacksOf(parent.id) : [];
  return [...new Set([...kept, ...own])];
}

describe('combat v2 content gate: every form has its Knacks', () => {
  it('every shipped form has an entry and at least one Knack it can equip', () => {
    for (const c of content.creatures) {
      expect(pack.forms[c.id], `form ${c.id} has no entry`).toBeDefined();
      expect(knacksOf(c.id).length, `form ${c.id} has no Knack it can equip`).toBeGreaterThan(0);
    }
  });

  it('every Knack is on at least one form', () => {
    const onAForm = new Set(Object.values(pack.forms).flatMap((f) => f.ownKnacks));
    const orphans = Object.keys(pack.knacks).filter((id) => !onAForm.has(id));
    expect(orphans).toEqual([]);
  });

  it('every Knack has a family, and every family has a Knack', () => {
    for (const k of Object.values(pack.knacks))
      expect(Object.hasOwn(pack.families, k.family), `Knack ${k.id}: ${k.family}`).toBe(true);
    const used = new Set(Object.values(pack.knacks).map((k) => k.family));
    expect(Object.keys(pack.families).filter((f) => !used.has(f))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Moved from the lab: content tests that read nothing but the data
// ---------------------------------------------------------------------------------------------------------------------

describe('combat v2 content gate: talents and their pools', () => {
  /** The roles a line's forms have. */
  const lineRoles = (line: string): string[] => [
    ...new Set(content.creatures.filter((c) => c.line === line).map((c) => c.role)),
  ];

  it('every talent fits a role and is in a line pool (Culling Strike waits for a killing-blow talent)', () => {
    const pooled = new Set(Object.values(pack.pools).flat());
    for (const [id, t] of Object.entries(pack.talents)) {
      expect(t.id, id).toBe(id);
      expect(t.roles.length, id).toBeGreaterThan(0);
      expect(pooled.has(id), `${id} pool membership`).toBe(id !== 'cull');
    }
    expect(Object.keys(pack.talents).length).toBeGreaterThanOrEqual(28);
    // Retired in panel 3.
    for (const gone of ['lone-wolf', 'share-the-load', 'thick-skull', 'light-sleeper'])
      expect(pack.talents, gone).not.toHaveProperty(gone);
    expect(Object.keys(pack.talents).filter((id) => id.startsWith('flank-guard'))).toEqual([
      'flank-guard',
    ]);
  });

  it('every pool is 7 talents, every role in a line has 3 that fit, and lines never share a pool', () => {
    for (const [line, pool] of Object.entries(pack.pools)) {
      expect(pool, line).toHaveLength(7);
      for (const role of lineRoles(line))
        expect(
          pool.filter((id) => pack.talents[id]?.roles.some((r) => r === role)).length,
          `${line} ${role}`,
        ).toBeGreaterThanOrEqual(3);
    }
    const keys = Object.values(pack.pools).map((p) => [...p].sort().join());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('healing talents only where a Support has a heal, and debuff talents only on Mire lines', () => {
    for (const [line, pool] of Object.entries(pack.pools)) {
      const els = content.creatures.filter((c) => c.line === line).map((c) => c.element);
      if (pool.includes('triage') || pool.includes('overheal-spill'))
        expect(
          els.some((e) => e === 'tide' || e === 'grove'),
          line,
        ).toBe(true);
      if (pool.includes('heavy-hand') || pool.includes('clinging'))
        expect(
          els.every((e) => e === 'mire'),
          line,
        ).toBe(true);
    }
  });

  it('the names panel 3 chose are in: First Pounce, Unbothered and Rally Cry, and no Second Wind talent', () => {
    for (const id of ['first-pounce', 'unbothered', 'rally-cry'])
      expect(pack.talents, id).toHaveProperty(id);
    expect(Object.values(pack.talents).some((t) => t.name.toLowerCase() === 'second wind')).toBe(
      false,
    );
  });
});

describe('combat v2 content gate: names and words of the bosses (the compendium tone)', () => {
  const raidMoves = Object.values(pack.raidBosses).flatMap((r) => [
    ...r.moves,
    ...(r.escalation?.phase?.moves ?? []),
  ]);
  const foeMoves = Object.values(pack.foes).flatMap((f) => [
    ...f.moves,
    ...(f.signature ? [f.signature] : []),
  ]);
  const moveNames = [...raidMoves, ...foeMoves].map((m) => m.name);
  /** Everything a player reads in these files. */
  const texts = [
    ...Object.values(pack.raidBosses).flatMap((r) => [
      r.asks,
      r.escalation?.name ?? '',
      r.escalation?.phase?.name ?? '',
    ]),
    ...Object.values(pack.foes).flatMap((f) => [f.asks, f.escalation?.name ?? '']),
    ...moveNames,
    ...Object.values(pack.cards).flatMap((c) => [c.name, c.asks]),
    ...Object.entries(pack.keywords).flatMap(([k, v]) => [k, v.means]),
  ];

  it('the boss-move keyword is Wind-up; Charged is the Spark mark and is not a boss-move word', () => {
    expect(pack.keywords).toHaveProperty('Wind-up');
    expect(pack.keywords).not.toHaveProperty('Charged');
    expect(content.reactions.map((r) => r.markName)).toContain('Charged');
    for (const t of texts) expect(t, t).not.toMatch(/\bcharged\b/i);
  });

  it('nothing says wounded, and the words that are scary, collide with the raid or are the boss’s own name for it stay out', () => {
    for (const t of texts) {
      expect(t, t).not.toMatch(/\bwounded\b/i);
      expect(t, t).not.toMatch(/\b(choking|swallow|adapts|phase)\b/i);
      expect(t, t).not.toMatch(/\bweakest\b/i);
    }
  });

  it('new words are keywords: the shapes, the anchors and the Build-up', () => {
    for (const k of [
      'Scatter',
      'Leap',
      'Cross',
      'Checker',
      'Wind-up',
      'Most hurt',
      'Back-most',
      'Build-up',
    ])
      expect(pack.keywords, k).toHaveProperty(k);
    expect(pack.keywords['Build-up']?.means).toMatch(/Mired slows it/);
    expect(pack.keywords['Build-up']?.means).toMatch(/weekend/);
  });

  it('no boss or foe move and no card has the name of a reaction', () => {
    const reactions = new Set(content.reactions.map((r) => r.name.toLowerCase()));
    for (const name of [...moveNames, ...Object.values(pack.cards).map((c) => c.name)])
      expect(reactions.has(name.toLowerCase()), name).toBe(false);
  });

  it('the Bramble Bind card is the only Bramble Bind, and a card that is a move too is one thing under one name', () => {
    const bramble = [...raidMoves, ...foeMoves].filter((m) => m.name === 'Bramble Bind');
    expect(bramble).toEqual([]);
    for (const c of Object.values(pack.cards)) {
      const same = [...raidMoves, ...foeMoves].filter((m) => m.name === c.name);
      // A boss move with a card's name is the move that card adds, with the card's id.
      for (const m of same) expect(m.id, `${c.name}: boss move and card`).toBe(c.id);
    }
  });

  it('Molten Shell grows armour and Wisp Fog grows dodge, as their names say', () => {
    expect(pack.foes['slag-tyrant']?.escalation?.name).toBe('Molten Shell');
    expect(pack.foes['slag-tyrant']?.escalation?.grow.armour).toBeGreaterThan(0);
    expect(pack.foes['drift-wisp']?.escalation?.name).toBe('Wisp Fog');
    expect(pack.foes['drift-wisp']?.escalation?.grow.dodgeBp).toBeGreaterThan(0);
  });
});
