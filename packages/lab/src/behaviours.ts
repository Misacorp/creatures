/**
 * "Similar behaviours": the content grouped by what it does, so overlaps show every time the report runs (retro 2026-11-01, proposal 2;
 * Misa: two or more effects can be pretty different in power if a few parameters are tweaked, so keep grouping the similar ones).
 * Three views, each a table of the groups with two or more members:
 *
 * - Knacks and talents, grouped by the set of effect fields they use (the keys of `fx`, numbers ignored), and the pairs whose sets are
 *   one field apart.
 * - Boss and foe moves of the library, grouped by behaviour label (`moveLabel`) and element.
 * - Rule cards, grouped by the kind of operation they run.
 *
 * Pure: it reads the content and returns the markdown, no fights are played, so it costs nothing.
 */
import { combatV2, moveLabel, type MoveDef } from '@creatures/game/combat-v2';
import type { CardOp } from '@creatures/engine/v2';
import { CARDS } from './cards';
import { KNACKS } from './knacks';
import { TALENTS } from './talents';

/** A Knack or a talent as the grouping sees it. */
interface Effect {
  readonly kind: 'Knack' | 'Talent';
  readonly id: string;
  readonly name: string;
  /** The Knack's family; a talent has none. */
  readonly family: string | null;
  /** The `fx` keys, sorted. */
  readonly fields: readonly string[];
  readonly fx: Readonly<Record<string, unknown>>;
}

/** Every Knack, then every talent. */
function effects(): Effect[] {
  const of = (kind: Effect['kind'], d: { id: string; name: string; family?: string; fx: object }) =>
    ({
      kind,
      id: d.id,
      name: d.name,
      family: d.family ?? null,
      fields: Object.keys(d.fx).sort(),
      fx: d.fx as Record<string, unknown>,
    }) satisfies Effect;
  return [
    ...Object.values(KNACKS).map((k) => of('Knack', k)),
    ...Object.values(TALENTS).map((t) => of('Talent', t)),
  ];
}

const label = (e: Effect) => `${e.kind === 'Talent' ? 'talent ' : ''}${e.name}`;

/** An `fx` value on one line: a number as it is, anything else as compact JSON. */
const show = (value: unknown): string =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : JSON.stringify(value);

/** A member's numbers: `field value` for each field. */
const numbers = (e: Effect): string =>
  e.fields.map((f) => `${f} ${show(e.fx[f])}`).join(', ') || 'none';

const cell = (text: string) => text.replace(/\|/g, '\\|');

/** What the members of a group share beyond the fields: one name, one family (a talent has none). */
function shared(group: readonly Effect[]): string {
  const names = new Set(group.map((e) => e.name.trim().toLowerCase()));
  const families = new Set(group.map((e) => e.family ?? 'talent'));
  const name = names.size === 1 ? 'one name' : 'different names';
  const family =
    families.size === 1
      ? `one family (${[...families][0]})`
      : `${families.size} families (${[...families].join(', ')})`;
  return `${name}; ${family}`;
}

/** Whether two field sets are one field apart: one has an extra field, or each has one the other lacks (sets of two or more). */
function oneApart(a: readonly string[], b: readonly string[]): string | null {
  const onlyA = a.filter((f) => !b.includes(f));
  const onlyB = b.filter((f) => !a.includes(f));
  if (onlyA.length + onlyB.length === 1) return `${onlyA[0] ?? onlyB[0]} only on one side`;
  if (onlyA.length === 1 && onlyB.length === 1 && a.length >= 2)
    return `${onlyA[0]} against ${onlyB[0]}`;
  return null;
}

export interface SimilarBehaviours {
  readonly markdown: string[];
  readonly data: Record<string, unknown>;
}

/** The Knacks and talents that use the same effect fields, and the pairs one field apart. */
function effectGroups(): SimilarBehaviours {
  const all = effects();
  const byFields = new Map<string, Effect[]>();
  for (const e of all) {
    const key = e.fields.join(' + ');
    byFields.set(key, [...(byFields.get(key) ?? []), e]);
  }
  const groups = [...byFields].filter(([, g]) => g.length >= 2);
  const md: string[] = [
    '### Knacks and talents',
    '',
    `Grouped by the set of effect fields they use (numbers ignored), ${all.length} in all. A group of two or more is a candidate to look at: the same fields with other numbers can be the same effect under two names, or two effects that drift apart in power.`,
    '',
  ];
  if (groups.length === 0) md.push('No two use the same set of fields.', '');
  else
    md.push(
      '| Fields | Members and their numbers | Shared |',
      '| --- | --- | --- |',
      ...groups.map(
        ([fields, g]) =>
          `| ${cell(fields)} | ${cell(g.map((e) => `${label(e)} (${numbers(e)})`).join('; '))} | ${cell(shared(g))} |`,
      ),
      '',
    );
  // Pairs one field apart (by field set: every member of one set against every member of the other).
  const sets = [...byFields];
  const near: { a: Effect[]; b: Effect[]; why: string }[] = [];
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) {
      const [, a] = sets[i] as [string, Effect[]];
      const [, b] = sets[j] as [string, Effect[]];
      const why = oneApart((a[0] as Effect).fields, (b[0] as Effect).fields);
      if (why) near.push({ a, b, why });
    }
  md.push(
    `Pairs whose field sets differ by one field (${near.length}): the smaller one may be the larger one's idea with a part left out.`,
    '',
  );
  if (near.length > 0)
    md.push(
      '| One | Other | Differ by |',
      '| --- | --- | --- |',
      ...near.map(
        (n) =>
          `| ${cell(n.a.map((e) => `${label(e)} (${numbers(e)})`).join('; '))} | ${cell(n.b.map((e) => `${label(e)} (${numbers(e)})`).join('; '))} | ${cell(n.why)} |`,
      ),
      '',
    );
  return {
    markdown: md,
    data: {
      effectGroups: groups.map(([fields, g]) => ({
        fields,
        members: g.map((e) => `${e.kind}:${e.id}`),
      })),
      effectNear: near.map((n) => ({
        a: n.a.map((e) => `${e.kind}:${e.id}`),
        b: n.b.map((e) => `${e.kind}:${e.id}`),
        why: n.why,
      })),
    },
  };
}

/** The library's moves by behaviour label and element. */
function moveGroups(): SimilarBehaviours {
  const moves = Object.values(combatV2.moves);
  const keyOf = (m: MoveDef) => `${m.element ?? 'card'}: ${moveLabel(m)}`;
  const same = new Map<string, MoveDef[]>();
  for (const m of moves) same.set(keyOf(m), [...(same.get(keyOf(m)) ?? []), m]);
  const clashes = [...same].filter(([, g]) => g.length >= 2);
  const byLabel = new Map<string, Map<string, MoveDef>>();
  for (const m of moves) {
    const l = moveLabel(m);
    const elements = byLabel.get(l) ?? new Map<string, MoveDef>();
    elements.set(m.element ?? 'card', m);
    byLabel.set(l, elements);
  }
  const shared = [...byLabel].filter(([, e]) => e.size >= 2);
  const md: string[] = [
    '### Boss and foe moves',
    '',
    `The library's ${moves.length} moves by behaviour label (target and shape, \`moveLabel\`) and element. One element should have one name per label: the content gate forbids two moves of a label on one boss and the loader forbids it for an element, so this is the library-wide check.`,
    '',
    clashes.length === 0
      ? 'Two moves of one label on one element: none.'
      : `Two moves of one label on one element (${clashes.length}):`,
    '',
  ];
  if (clashes.length > 0)
    md.push(
      '| Element: label | Moves |',
      '| --- | --- |',
      ...clashes.map(([k, g]) => `| ${cell(k)} | ${cell(g.map((m) => m.name).join(', '))} |`),
      '',
    );
  md.push(
    `Labels used by several elements (${shared.length}; fine, the same behaviour in each element's paint):`,
    '',
    '| Label | Moves by element |',
    '| --- | --- |',
    ...shared.map(
      ([l, e]) =>
        `| ${cell(l)} | ${cell([...e].map(([el, m]) => `${el}: ${m.name}`).join('; '))} |`,
    ),
    '',
  );
  return {
    markdown: md,
    data: {
      moveClashes: clashes.map(([k, g]) => ({ key: k, moves: g.map((m) => m.id) })),
      moveLabels: shared.map(([l, e]) => ({ label: l, elements: [...e.keys()] })),
    },
  };
}

/** The kind of an operation: its name, which is what a group of cards shares. */
const opKind = (o: CardOp): string => o.op;

/** An operation and its numbers on one line. */
function describeOp(o: CardOp): string {
  switch (o.op) {
    case 'add':
    case 'set':
      return `${o.op} ${o.stat} ${o.value}`;
    case 'raise':
      return `raise ${o.stat} ${o.bp} bp`;
    case 'flag':
      return `flag ${o.mod}`;
    case 'mod':
      return `mod ${o.mod} ${o.base}${o.plus !== undefined ? ` + ${o.plus}` : ''}${o.minus !== undefined ? ` - ${o.minus}` : ''}`;
    case 'cap':
      return `cap ${o.value}`;
    case 'move':
      return `move ${o.move.name} (${o.scale})`;
    case 'plain':
      return 'aim' in o
        ? `plain aim ${o.aim.shape}/${o.aim.anchor} + ${o.raiseBp} bp`
        : `plain replaced by ${o.replace.pattern.shape}/${o.replace.pattern.anchor} x${o.hits}`;
  }
}

/** The rule cards grouped by the kind of operation they run. */
function cardGroups(): SimilarBehaviours {
  const byKind = new Map<string, { card: string; ops: string[] }[]>();
  for (const c of CARDS)
    for (const k of new Set(c.ops.map(opKind))) {
      const ops = c.ops.filter((o) => opKind(o) === k).map(describeOp);
      byKind.set(k, [...(byKind.get(k) ?? []), { card: c.name, ops }]);
    }
  const groups = [...byKind].filter(([, g]) => g.length >= 2);
  const md: string[] = [
    '### Rule cards',
    '',
    `Grouped by the kind of operation (\`add\`, \`set\`, \`flag\`, ...) the ${CARDS.length} cards run. Two cards that run one operation on one stat are the same effect at other numbers; on different stats they are siblings to compare in power.`,
    '',
  ];
  if (groups.length === 0) md.push('No two cards run the same kind of operation.', '');
  else
    md.push(
      '| Operation | Cards and their operations |',
      '| --- | --- |',
      ...groups.map(
        ([k, g]) =>
          `| ${k} | ${cell(g.map((m) => `${m.card} (${m.ops.join('; ')})`).join('; '))} |`,
      ),
      '',
    );
  return {
    markdown: md,
    data: {
      cardGroups: groups.map(([k, g]) => ({ op: k, cards: g.map((m) => m.card) })),
    },
  };
}

/** The report's section: three tables of the content that behaves alike. */
export function similarBehaviours(): SimilarBehaviours {
  const parts = [effectGroups(), moveGroups(), cardGroups()];
  return {
    markdown: [
      '## Similar behaviours',
      '',
      'Content grouped by what it does, only groups of two or more. A group is not a fault: it is where to look when two things are named apart but may be one behaviour at different numbers (or one name for two behaviours).',
      '',
      ...parts.flatMap((p) => p.markdown),
    ],
    data: Object.assign({}, ...parts.map((p) => p.data)) as Record<string, unknown>,
  };
}
