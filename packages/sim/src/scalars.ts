import ts from 'typescript';

/**
 * The scalars registry (docs/design/balance-loop.md, section 1): every number that tunes the game,
 * one row each, with its unit, meaning, system and the sim targets it moves. This module is pure
 * (no file or git access): `scalars-cli.ts` feeds it the real `RULES`, content and source texts.
 */

export type Unit = 'bp' | 'ms' | 'hours' | 'minutes' | 'days' | 'weeks' | 'count';

export interface Scalar {
  /** For example `RULES.gear.skill.xpPerHour` or `content.bosses.tidal-colossus.baseHp`. */
  path: string;
  /** The value as text: an integer, or `[a, b, c]` for a short array of numbers. */
  value: string;
  unit: Unit;
  /** First sentence of the comment on the field (or on its nearest commented parent). May be empty. */
  meaning: string;
  /** Top-level RULES key, or the content file, that the scalar belongs to (a table heading). */
  system: string;
  /** Sim target ids or id patterns (`raid-*`) from the hand-maintained map. */
  targets: string[];
}

/** A group of content items (the array of a data file) whose numeric fields are knobs. */
export interface ContentCollection {
  /** Name in the path: `content.<name>.<id>.<field>`. */
  name: string;
  /** Table heading, the data file. */
  system: string;
  items: unknown;
  /** Keys that are numbers but not knobs (for example a species' `stage`). */
  ignoreKeys?: readonly string[];
}

export interface ScalarInputs {
  rules: unknown;
  /** Source text of the file that defines `RULES`, for the field comments. */
  rulesSource: string;
  collections: readonly ContentCollection[];
  /** Source texts of the content schemas, for the comments on content fields. */
  schemaSources: readonly string[];
  /** Path prefix to sim target ids (or `prefix-*` patterns). */
  targetMap: Readonly<Record<string, readonly string[]>>;
}

/** Arrays of at most this many numbers share one row; longer ones get a row per element. */
export const INLINE_ARRAY_MAX = 8;
/** Longest meaning text, in characters. */
export const MEANING_MAX = 140;
/** A first sentence shorter than this is joined with the next one. */
const MIN_MEANING = 40;

// --- Comments from the TypeScript source ---

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) {
    e = e.expression;
  }
  return e;
}

function nameOf(node: ts.Node): string | undefined {
  const name = (node as { name?: ts.Node }).name;
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function cleanBlock(raw: string): string {
  return raw
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
    .join('\n')
    .trim();
}

function isDirective(text: string): boolean {
  return /^(eslint|prettier|@ts-|istanbul|c8 )/.test(text.trim());
}

/**
 * The comment that belongs to `node`: the JSDoc or line comments right above it, else a comment
 * after it on the same line. Empty when there is none.
 */
function commentOf(node: ts.Node, text: string): string {
  const leading = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  const last = leading[leading.length - 1];
  if (last !== undefined) {
    if (last.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      const body = cleanBlock(text.slice(last.pos, last.end));
      if (body !== '' && !isDirective(body)) return body;
    } else {
      const lines: string[] = [];
      for (let i = leading.length - 1; i >= 0; i--) {
        const r = leading[i];
        if (r === undefined || r.kind !== ts.SyntaxKind.SingleLineCommentTrivia) break;
        lines.unshift(text.slice(r.pos + 2, r.end).trim());
      }
      const body = lines.join(' ').trim();
      if (body !== '' && !isDirective(body)) return body;
    }
  }
  let p = node.getEnd();
  if (text[p] === ',') p += 1;
  const trailing = ts.getTrailingCommentRanges(text, p) ?? [];
  const first = trailing[0];
  if (first !== undefined) {
    const raw = text.slice(first.pos, first.end);
    const body =
      first.kind === ts.SyntaxKind.SingleLineCommentTrivia ? raw.slice(2).trim() : cleanBlock(raw);
    if (body !== '' && !isDirective(body)) return body;
  }
  return '';
}

/**
 * Comments on the fields of the object literal assigned to the top-level constant `rootName`,
 * keyed by the dotted names (`RULES.raid.scaling.hpExponent`). Array elements share their array's
 * path, so the fields of `phases: [{ id, rounds }]` are `RULES.raid.phases.rounds`; the first
 * comment found for a path wins.
 */
export function buildRulesDocs(source: string, rootName: string): Map<string, string> {
  const sf = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  const docs = new Map<string, string>();
  const visitObject = (obj: ts.ObjectLiteralExpression, path: readonly string[]): void => {
    for (const prop of obj.properties) {
      const name = nameOf(prop);
      if (name === undefined) continue;
      const here = [...path, name];
      const comment = commentOf(prop, source);
      const key = here.join('.');
      if (comment !== '' && !docs.has(key)) docs.set(key, comment);
      if (!ts.isPropertyAssignment(prop)) continue;
      const init = unwrap(prop.initializer);
      if (ts.isObjectLiteralExpression(init)) visitObject(init, here);
      else if (ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          const e = unwrap(el);
          if (ts.isObjectLiteralExpression(e)) visitObject(e, here);
        }
      }
    }
  };
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== rootName || !decl.initializer) continue;
      const init = unwrap(decl.initializer);
      if (ts.isObjectLiteralExpression(init)) visitObject(init, [rootName]);
    }
  }
  return docs;
}

/**
 * Comments on field names in schema files, only for names whose every declaration carries the
 * same comment (a name used in several places with different meanings gets no comment).
 */
export function buildFieldDocs(sources: readonly string[]): Map<string, string> {
  const seen = new Map<string, Set<string>>();
  for (const source of sources) {
    const sf = ts.createSourceFile('schema.ts', source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) ||
        ts.isPropertySignature(node) ||
        ts.isShorthandPropertyAssignment(node)
      ) {
        const name = nameOf(node);
        if (name !== undefined) {
          const set = seen.get(name) ?? new Set<string>();
          set.add(commentOf(node, source));
          seen.set(name, set);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const docs = new Map<string, string>();
  for (const [name, set] of seen) {
    const only = set.size === 1 ? [...set][0] : undefined;
    if (only !== undefined && only !== '') docs.set(name, only);
  }
  return docs;
}

/** One line for a table cell: the first sentence, markdown-safe, at most `MEANING_MAX` characters. */
export function oneLine(comment: string): string {
  let text = comment.replace(/\s+/g, ' ').trim();
  text = text.replace(/\{@link\s+([^}]*)\}/g, '$1');
  // The first sentence; a very short one ("Phase structure.") is followed by the next.
  let taken = '';
  let rest = text;
  while (rest !== '' && taken.length < MIN_MEANING) {
    const sentence = /^(.*?[.!?])(?=\s+[A-Z(`]|$)/.exec(rest);
    const next = sentence?.[1] ?? rest;
    taken = taken === '' ? next : `${taken} ${next}`;
    rest = rest.slice(next.length).trim();
  }
  text = taken
    .replace(/^[-+] /, '')
    .replace(/\|/g, '/')
    .replace(/ \* /g, ' x ')
    .replace(/[*\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if ((text.match(/`/g)?.length ?? 0) % 2 === 1) text = text.replace(/`/g, '');
  if (text.length > MEANING_MAX) {
    const cut = text.slice(0, MEANING_MAX - 3);
    const space = cut.lastIndexOf(' ');
    text = `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:(]+$/, '')}...`;
  }
  return text;
}

// --- Units ---

function unitOfKey(key: string): Unit | undefined {
  if (/Bp(?:Per[A-Z][A-Za-z]*)?$/.test(key) || key === 'bp') return 'bp';
  if (key === 'ms' || /Ms$/.test(key)) return 'ms';
  if (/PerHour$/.test(key)) return undefined;
  if (/^[Hh]ours?$/.test(key) || /[a-z]Hours?$/.test(key) || /[a-z]H$/.test(key)) return 'hours';
  if (/^minutes?$/.test(key) || /[a-z]Minutes?$/.test(key)) return 'minutes';
  if (/[a-z]Days$/.test(key) || key === 'days') return 'days';
  if (/[a-z]Weeks$/.test(key) || key === 'weeks') return 'weeks';
  return undefined;
}

/** The unit from the leaf's key name, else from the nearest parent key that names one, else count. */
export function inferUnit(keys: readonly string[]): Unit {
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i];
    if (k === undefined) continue;
    const u = unitOfKey(k);
    if (u !== undefined) return u;
  }
  return 'count';
}

// --- Walking ---

interface Seg {
  kind: 'key' | 'id' | 'index';
  text: string;
}

function renderPath(root: string, segs: readonly Seg[]): string {
  let out = root;
  for (const s of segs) out += s.kind === 'index' ? `[${s.text}]` : `.${s.text}`;
  return out;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function idsOf(items: readonly unknown[]): string[] | undefined {
  const ids: string[] = [];
  for (const item of items) {
    if (!isPlain(item) || typeof item['id'] !== 'string') return undefined;
    ids.push(item['id']);
  }
  return new Set(ids).size === ids.length ? ids : undefined;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatNumber(n: number): string {
  return String(n);
}

interface Leaf {
  segs: Seg[];
  value: string;
}

/** Every numeric leaf under `value`, in source order (arrays of up to 8 numbers become one leaf). */
function leaves(value: unknown, segs: Seg[], ignore: ReadonlySet<string>, out: Leaf[]): void {
  if (isNumber(value)) {
    out.push({ segs, value: formatNumber(value) });
    return;
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    if (items.length === 0) return;
    if (items.every(isNumber) && items.length <= INLINE_ARRAY_MAX) {
      out.push({ segs, value: `[${items.map((n) => formatNumber(n)).join(', ')}]` });
      return;
    }
    const ids = idsOf(items);
    items.forEach((item, i) => {
      const id = ids?.[i];
      const seg: Seg =
        id !== undefined ? { kind: 'id', text: id } : { kind: 'index', text: String(i) };
      leaves(item, [...segs, seg], ignore, out);
    });
    return;
  }
  if (isPlain(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (ignore.has(key)) continue;
      leaves(child, [...segs, { kind: 'key', text: key }], ignore, out);
    }
  }
}

/** True when `path` is `prefix` or lies under it (`.child` or `[i]`). */
export function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
}

/** Sim target ids and patterns for a scalar: every map entry whose prefix covers the path. */
export function targetsFor(
  path: string,
  map: Readonly<Record<string, readonly string[]>>,
): string[] {
  const found = new Set<string>();
  for (const [prefix, ids] of Object.entries(map)) {
    if (underPrefix(path, prefix)) for (const id of ids) found.add(id);
  }
  return [...found].sort();
}

/** The nearest comment for a RULES path: the field's own, then its parents', down to the system. */
function rulesMeaning(
  docs: ReadonlyMap<string, string>,
  rootName: string,
  segs: readonly Seg[],
): string {
  const names = [rootName, ...segs.filter((s) => s.kind === 'key').map((s) => s.text)];
  // The field's own comment, then its parents' below the system level (a system's own comment
  // describes the whole system, not one number in it).
  for (let n = names.length; n >= 3 || n === names.length; n--) {
    const doc = docs.get(names.slice(0, n).join('.'));
    if (doc !== undefined) return oneLine(doc);
  }
  return '';
}

function contentMeaning(docs: ReadonlyMap<string, string>, segs: readonly Seg[]): string {
  const keys = segs.filter((s) => s.kind === 'key').map((s) => s.text);
  for (let i = keys.length - 1; i >= 0; i--) {
    const doc = docs.get(keys[i] as string);
    if (doc !== undefined) return oneLine(doc);
  }
  return '';
}

/** Every scalar, grouped in a fixed order: the RULES systems in source order, then the content files. */
export function collectScalars(inputs: ScalarInputs): Scalar[] {
  const out: Scalar[] = [];
  const ruleDocs = buildRulesDocs(inputs.rulesSource, 'RULES');
  if (isPlain(inputs.rules)) {
    for (const [system, tree] of Object.entries(inputs.rules)) {
      const found: Leaf[] = [];
      leaves(tree, [{ kind: 'key', text: system }], new Set(), found);
      for (const leaf of found) {
        const path = renderPath('RULES', leaf.segs);
        out.push({
          path,
          value: leaf.value,
          unit: inferUnit(leaf.segs.filter((s) => s.kind === 'key').map((s) => s.text)),
          meaning: rulesMeaning(ruleDocs, 'RULES', leaf.segs),
          system: `RULES.${system}`,
          targets: targetsFor(path, inputs.targetMap),
        });
      }
    }
  }
  const fieldDocs = buildFieldDocs(inputs.schemaSources);
  for (const c of inputs.collections) {
    const found: Leaf[] = [];
    leaves(c.items, [{ kind: 'key', text: c.name }], new Set(c.ignoreKeys ?? []), found);
    for (const leaf of found) {
      const path = renderPath('content', leaf.segs);
      out.push({
        path,
        value: leaf.value,
        unit: inferUnit(leaf.segs.filter((s) => s.kind === 'key').map((s) => s.text)),
        meaning: contentMeaning(fieldDocs, leaf.segs),
        system: c.system,
        targets: targetsFor(path, inputs.targetMap),
      });
    }
  }
  return out;
}

// --- Markdown ---

function width(text: string): number {
  return [...text].length;
}

/** An aligned markdown table, laid out the way Prettier prints it (so format:check is happy). */
export function renderTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const widths = header.map((h, c) => Math.max(3, width(h), ...rows.map((r) => width(r[c] ?? ''))));
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, c) => cell + ' '.repeat((widths[c] ?? 0) - width(cell))).join(' | ')} |`;
  return [
    line(header),
    `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`,
    ...rows.map((r) => line(header.map((_, c) => r[c] ?? ''))),
  ].join('\n');
}

function code(text: string): string {
  return text === '' ? '' : `\`${text}\``;
}

export const SCALAR_HEADER = ['Path', 'Value', 'Unit', 'Meaning', 'Sim targets'] as const;

export const SCALARS_INTRO = `# Scalars registry

Generated by \`pnpm scalars\` (\`packages/sim/src/scalars.ts\`). Do not edit by hand: change the value in its source file, run \`pnpm scalars\` and commit the result. A test fails when this file is stale. The process is in \`docs/design/balance-loop.md\`.

The knobs are the numbers of \`RULES\` (\`packages/game/src/rules/config.ts\`) and the numeric fields of the content data files (\`packages/game/src/content/data\`). The unit comes from the key name (\`...Bp\` is basis points, \`ms\` milliseconds, \`...Hours\` hours, anything else a count). The meaning is the first sentence of the comment on the field, or on the nearest parent below the system that has one. Sim targets come from the hand-maintained map in \`packages/sim/scalar-targets.json\` (a path prefix to target ids from \`packages/sim/targets.json\`; \`raid-*\` means every target with that prefix). A short array of numbers (up to ${INLINE_ARRAY_MAX}) is one row, a longer one has a row per element.`;

/** The whole `docs/balance/scalars.md`. */
export function renderScalars(scalars: readonly Scalar[]): string {
  const systems: string[] = [];
  for (const s of scalars) if (!systems.includes(s.system)) systems.push(s.system);
  const sections = systems.map((system) => {
    const rows = scalars
      .filter((s) => s.system === system)
      .map((s) => [code(s.path), code(s.value), s.unit, s.meaning, s.targets.map(code).join(', ')]);
    return `## ${system}\n\n${renderTable(SCALAR_HEADER, rows)}`;
  });
  return `${SCALARS_INTRO}\n\n${scalars.length} scalars.\n\n${sections.join('\n\n')}\n`;
}

// --- Content ids ---

export interface IdSection {
  title: string;
  items: readonly { id: string; name: string }[];
}

export const IDS_INTRO = `# Content ids

Generated by \`pnpm scalars\` together with \`scalars.md\`. Do not edit by hand. The ids and names of the player-visible content, so that \`pnpm patch-notes\` can tell what was added, removed or renamed between two releases.`;

function cell(text: string): string {
  return text
    .replace(/\|/g, '/')
    .replace(/[*\\<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The whole `docs/balance/content-ids.md`. */
export function renderContentIds(sections: readonly IdSection[]): string {
  const body = sections.map(
    (s) =>
      `## ${s.title}\n\n${renderTable(
        ['Id', 'Name'],
        s.items.map((i) => [code(i.id), cell(i.name)]),
      )}`,
  );
  return `${IDS_INTRO}\n\n${body.join('\n\n')}\n`;
}

// --- Parsing the generated files back (for the patch notes) ---

/** Splits one table row into trimmed cells; undefined for a line that is not a table row. */
export function tableCells(line: string): string[] | undefined {
  if (!line.startsWith('|') || !line.endsWith('|')) return undefined;
  return line
    .slice(1, -1)
    .split(' | ')
    .map((c) => c.trim());
}

function stripCode(text: string): string {
  return text.replace(/`/g, '');
}

export function parseScalars(markdown: string): Scalar[] {
  const out: Scalar[] = [];
  let system = '';
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      system = line.slice(3).trim();
      continue;
    }
    const cells = tableCells(line);
    if (
      cells === undefined ||
      cells.length < 5 ||
      cells[0] === 'Path' ||
      /^-+$/.test(cells[0] ?? '')
    ) {
      continue;
    }
    out.push({
      path: stripCode(cells[0] ?? ''),
      value: stripCode(cells[1] ?? ''),
      unit: (cells[2] ?? 'count') as Unit,
      meaning: cells[3] ?? '',
      system,
      targets: (cells[4] ?? '')
        .split(',')
        .map((t) => stripCode(t).trim())
        .filter((t) => t !== ''),
    });
  }
  return out;
}

export interface ParsedIds {
  title: string;
  items: { id: string; name: string }[];
}

export function parseContentIds(markdown: string): ParsedIds[] {
  const out: ParsedIds[] = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      out.push({ title: line.slice(3).trim(), items: [] });
      continue;
    }
    const cells = tableCells(line);
    const current = out[out.length - 1];
    if (current === undefined || cells === undefined || cells.length < 2) continue;
    if (cells[0] === 'Id' || /^-+$/.test(cells[0] ?? '')) continue;
    current.items.push({ id: stripCode(cells[0] ?? ''), name: cells[1] ?? '' });
  }
  return out;
}
