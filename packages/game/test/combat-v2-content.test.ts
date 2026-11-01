/**
 * The content gate of combat v2 (docs/design/combat/content-as-data.md, section 6): the rules the shipped pack has to meet,
 * one `it` per rule, so the gate reads in one place. The loader (`load.ts`) already refuses a broken pack; the tests here
 * read the SHIPPED data and state each rule, and they hold the rules the loader cannot (names, every keyword used, the
 * number of answers). The broken-pack cases are in `combat-v2.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { content } from '../src';
import { talentContent } from '../src/content';
import { dungeonContent } from '../src/content/dungeon';
import { gearContent } from '../src/content/gear';
import {
  combatV2,
  moveLabel,
  type BossMoveDef,
  type CardDef,
  type MoveDef,
} from '../src/combat-v2';
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

/**
 * A move name is one thing: a library move, with one behaviour, whoever uses it (Misa, 2026-11-01), so every boss that has a
 * Storm Front has its own power for it. The library test below states what a name stands for.
 */
const moveThing = (m: BossMoveDef): string => `move ${m.name}`;

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
    add('Escalating', e.name, owner);
    if (e.phase !== undefined) {
      add('Escalating phase', e.phase.name, owner);
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
    // A card and the move it adds have different names (the move is named by its shape and target), so a card is its own thing.
    add('card', c.name, c.id);
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
  'great wave':
    "the rule card Great Wave and the Tidal Colossus's tide move Great Wave (the library's Wild Sweep of the tide, decision 2026-11-01); a naming question for Misa: rename the card or the move",
};

/**
 * Knacks (by id) that have the name of a shipped gear line today: a pending naming question. Empty since names batches 3 and 4
 * (2026-11-01): the Knack Guard's Shadow is now Reliably Covered, and the gear line Guard's shadow keeps its name.
 */
const KNACK_GEAR_CLASHES: Readonly<Record<string, string>> = {};

/**
 * Knacks (by id) that have the name of a combat v1 talent (`content/data/talents.json`). Not a naming question: the v1 talents go
 * away with v1 in phase 8 of the combat rework (docs/design/combat/README.md), and the clash goes with them. Nothing is renamed.
 */
const V1_TALENT_CLASHES: Readonly<Record<string, string>> = {
  'crown-of-embers': 'the v1 talent Crown of Embers; goes with v1 in phase 8',
  'lantern-glow': 'the v1 talent Lantern Glow; goes with v1 in phase 8',
};

/** The plain label of each library move, as the decision's table has it (`2026-11-01-combat-v2-move-library-a-themed`), by name. */
const DECISION_LABELS: Readonly<Record<string, string>> = {
  'Deafening Mist': 'Hush',
  'Bramble Hush': 'Hush',
  Hush: 'Hush',
  'Briar Pincer': 'Pincer',
  'Anvil Fall': 'Front Slam',
  'Belly Flop': 'Front Slam',
  'Volcanic Meteor': 'Payoff Slam',
  'Static Strike': 'Payoff Slam',
  'Bog Lob': 'Payoff Slam',
  'Payoff Slam': 'Payoff Slam',
  'Slag Spill': 'Nemesis Slam',
  'Vengeful Roots': 'Nemesis Slam',
  Thunderclap: 'Nemesis Slam',
  Riptide: 'Wild Lance',
  'Scorch Lane': 'Wild Lance',
  'Grasping Vines': 'Wild Lance',
  'Lightning Bolt': 'Wild Lance',
  'Mud Slide': 'Wild Lance',
  'Deepwater Spear': 'Nemesis Lance',
  'Sluice Pull': 'Front Lance',
  Undertow: 'Front Sweep',
  'Thorn Wall': 'Front Sweep',
  Backflow: 'Rear Sweep',
  'Spiky Spine': 'Rear Sweep',
  'Peat Wave': 'Rear Sweep',
  'Rogue Wave': 'Payoff Sweep',
  'Great Wave': 'Wild Sweep',
  'Sinking Mud': 'Wild Sweep',
  'Wild Sweep': 'Wild Sweep',
  Spray: 'Barrage',
  'Cinder Fall': 'Barrage',
  'Thorn Rain': 'Barrage',
  'Forked Lightning': 'Barrage',
  'Mud Spit': 'Barrage',
  Deluge: 'Quake',
  Eruption: 'Quake',
  'Storm Front': 'Quake',
  'Sink Down': 'Quake',
  'Ember Leap': 'Leaping Strike',
  'Thorn Lash': 'Leaping Strike',
  'Arc Lash': 'Leaping Strike',
  Thunderbolt: 'Payoff Strike',
  Sinkhole: 'Vulture Strike',
  Crush: 'Nemesis Strike',
  'Judgement Bolt': 'One-shot',
  'Ash Cloud': 'Checker',
  'Bramble Cross': 'Cross',
};

describe('combat v2 content gate: unique names (P-06)', () => {
  it('a name appears once in combat v2, except a move name shared by several moves (see the shape rule below)', () => {
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

  /** The moves of the raid bosses and foes (with signatures and phases). */
  const bossMoves = (): BossMoveDef[] => [
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
  /** Every move of the pack: the bosses' and foes' and the ones the cards add. */
  const allMoves = (): BossMoveDef[] => [
    ...bossMoves(),
    ...Object.values(pack.cards).flatMap(cardMoves),
  ];

  /** The boss and foe moves with the element of their owner, and the card moves with none. */
  const movesWithOwners = (): {
    owner: string;
    element: string | undefined;
    move: BossMoveDef;
  }[] => [
    ...Object.values(pack.raidBosses).flatMap((b) =>
      [...b.moves, ...(b.escalation?.phase?.moves ?? [])].map((move) => ({
        owner: `raid boss ${b.id}`,
        element: content.bosses.find((s) => s.id === b.id)?.element,
        move,
      })),
    ),
    ...Object.values(pack.foes).flatMap((f) =>
      [
        ...f.moves,
        ...(f.signature ? [f.signature] : []),
        ...(f.escalation?.phase?.moves ?? []),
      ].map((move) => ({
        owner: `foe ${f.id}`,
        element: dungeonContent.foes.find((s) => s.id === f.id)?.element,
        move,
      })),
    ),
    ...Object.values(pack.cards).flatMap((c) =>
      cardMoves(c).map((move) => ({ owner: `card ${c.id}`, element: undefined, move })),
    ),
  ];

  it('every move of a boss, foe or card is a library move: its name, shape and anchor are the library’s (a name stands for one behaviour)', () => {
    for (const { owner, move } of movesWithOwners()) {
      const lib = pack.moves[move.id];
      expect(lib, `${owner}: ${move.id} is in the library`).toBeDefined();
      expect(move.name, `${owner}: ${move.id}`).toBe(lib?.name);
      expect(move.pattern.shape, `${owner}: ${move.id}`).toBe(lib?.shape);
      expect(move.pattern.anchor, `${owner}: ${move.id}`).toBe(lib?.anchor);
      expect(move.silenceTurns !== undefined, `${owner}: ${move.id} silences`).toBe(lib?.silences);
      expect(move.oneShotBp !== undefined, `${owner}: ${move.id} one-shot`).toBe(
        lib?.oneShot === true,
      );
    }
    // Guard the rule itself: moves are shared (a Barrage of one element on several bosses), so the loop is not empty.
    expect(movesWithOwners().length).toBeGreaterThan(60);
  });

  it('a boss or foe uses only the moves of its element, and a card only moves with no element', () => {
    for (const { owner, element, move } of movesWithOwners())
      expect(pack.moves[move.id]?.element, `${owner}: ${move.id}`).toBe(element);
  });

  it('a behaviour has one name per element: no two library moves share a label and an element', () => {
    const seen = new Map<string, string>();
    for (const m of Object.values(pack.moves)) {
      const key = `${m.element ?? 'card'} ${moveLabel(m)}`;
      expect(seen.get(key), `${m.id} repeats the ${key} of ${seen.get(key) ?? ''}`).toBeUndefined();
      seen.set(key, m.id);
    }
    // Guard the rule itself: the library has several elements' Barrages and Quakes, so the loop compares real neighbours.
    expect([...seen.keys()].filter((k) => k.endsWith(' Barrage'))).toHaveLength(5);
  });

  it('no raid boss or foe has two moves of one behaviour, counting its phase, its signature and the moves its cards add', () => {
    const labelsOf = (moves: readonly BossMoveDef[]): string[] =>
      moves.map((m) => moveLabel({ ...(pack.moves[m.id] as MoveDef) }));
    const repeated = (labels: readonly string[]): string[] =>
      labels.filter((l, i) => labels.indexOf(l) !== i);
    // A phase move with the id of an own move replaces it (the engine's `withPhase`).
    const afterPhase = (own: readonly BossMoveDef[], phase: readonly BossMoveDef[]) => [
      ...own.map((m) => phase.find((p) => p.id === m.id) ?? m),
      ...phase.filter((p) => !own.some((m) => m.id === p.id)),
    ];
    const owners: [string, BossMoveDef[], BossMoveDef[], string[]][] = [
      ...Object.values(pack.raidBosses).map(
        (b) =>
          [
            `raid boss ${b.id}`,
            [...b.moves],
            [...(b.escalation?.phase?.moves ?? [])],
            [...b.cards],
          ] as [string, BossMoveDef[], BossMoveDef[], string[]],
      ),
      ...Object.values(pack.foes).map(
        (f) =>
          [
            `foe ${f.id}`,
            [...f.moves, ...(f.signature ? [f.signature] : [])],
            [...(f.escalation?.phase?.moves ?? [])],
            [...f.cards],
          ] as [string, BossMoveDef[], BossMoveDef[], string[]],
      ),
    ];
    for (const [owner, own, phase, cards] of owners) {
      const fromCards = cards.flatMap((c) => cardMoves(pack.cards[c] as CardDef));
      for (const state of [own, afterPhase(own, phase)])
        expect(repeated(labelsOf([...state, ...fromCards])), owner).toEqual([]);
    }
    // The moves a phase replaces are real: Thornmother's Second Bloom makes her one Thorn Rain stronger.
    const rain = pack.raidBosses['thornmother'];
    const own = rain?.moves.find((m) => m.id === 'thorn-rain');
    const later = rain?.escalation?.phase?.moves.find((m) => m.id === 'thorn-rain');
    expect(own && later && later.powerBp * 10 > own.powerBp * 10 && later.every <= own.every).toBe(
      true,
    );
  });

  it('every library move is used by a boss, a foe or a card', () => {
    const used = new Set(allMoves().map((m) => m.id));
    expect(Object.keys(pack.moves).filter((id) => !used.has(id))).toEqual([]);
  });

  it('every library move has a name nobody else has and a label that says what it does (the decision’s table)', () => {
    const names = Object.values(pack.moves).map((m) => m.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const m of Object.values(pack.moves))
      expect(m.id, m.name).toBe(
        m.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
      );
    const labels = Object.fromEntries(Object.values(pack.moves).map((m) => [m.name, moveLabel(m)]));
    expect(labels).toMatchObject(DECISION_LABELS);
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
  // The boss's Escalating meter; an Escalating boss shows its own name in the text, and no text says the word itself.
  'Escalating',
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

  it('new words are keywords: the shapes, the anchors and Escalating', () => {
    for (const k of [
      'Scatter',
      'Leap',
      'Cross',
      'Checker',
      'Wind-up',
      'Most hurt',
      'Back-most',
      'Escalating',
    ])
      expect(pack.keywords, k).toHaveProperty(k);
    expect(pack.keywords).not.toHaveProperty('Build-up');
    expect(pack.keywords['Escalating']?.means).toMatch(/Mired slows it/);
    expect(pack.keywords['Escalating']?.means).toMatch(/weekend/);
  });

  it('no boss or foe move and no card has the name of a reaction', () => {
    const reactions = new Set(content.reactions.map((r) => r.name.toLowerCase()));
    for (const name of [...moveNames, ...Object.values(pack.cards).map((c) => c.name)])
      expect(reactions.has(name.toLowerCase()), name).toBe(false);
  });

  it('a card is not named like a move: the card Bramble Bind adds the move Hush, and no boss move has a card’s name', () => {
    const moves = [...raidMoves, ...foeMoves].map((m) => m.name.toLowerCase());
    for (const c of Object.values(pack.cards)) {
      // The card Great Wave and the tide move Great Wave are a known clash (KNOWN_CLASHES): a naming question for Misa.
      if (!Object.hasOwn(KNOWN_CLASHES, c.name.toLowerCase()))
        expect(moves, `${c.name}: a boss move with the name of a card`).not.toContain(
          c.name.toLowerCase(),
        );
      for (const m of cardMoves(c))
        expect(m.name.toLowerCase(), `${c.id}: its move`).not.toBe(c.name.toLowerCase());
    }
    expect(cardMoves(pack.cards['bramble-bind']!).map((m) => m.name)).toEqual(['Hush']);
  });

  it('Molten Shell grows armour and Wisp Fog grows dodge, as their names say', () => {
    expect(pack.foes['slag-tyrant']?.escalation?.name).toBe('Molten Shell');
    expect(pack.foes['slag-tyrant']?.escalation?.grow.armour).toBeGreaterThan(0);
    expect(pack.foes['drift-wisp']?.escalation?.name).toBe('Wisp Fog');
    expect(pack.foes['drift-wisp']?.escalation?.grow.dodgeBp).toBeGreaterThan(0);
  });
});
