/**
 * `pnpm housing new-set`, `remove-set` as pure plans (`docs/design/housing-workshop.md`, "Adding a set"). A plan reads
 * the files a set touches through `read` and returns the new text of every file that must change (`null` deletes
 * it); the command in `scripts/housing-new-set.mts` reads the real files, writes the result and runs prettier and
 * the generators. Planning twice gives the same result as planning once: every edit first looks for what it adds.
 *
 * The files a set touches (paths from the repository root):
 *  - `packages/game/src/content/data/housing/{sets,pieces,skins}.json`: the set and its keepsake, nine pieces, a
 *    wallpaper and a floor. Prices are derived from the set's tier and materials, drops from its `sources`: there
 *    is nothing per piece to write.
 *  - `apps/activity/src/sprites/workshop/styles/<id>.ts`: the style (copied from `--from`).
 *  - `apps/activity/src/sprites/data/house/<id>.ts`: the art pack, `setPack` with no overrides, and placeholder skins.
 *  - `apps/activity/src/sprites/concepts/house-<id>.ts`: the art library's wrapper (feeds `docs/art/`).
 *  - `apps/activity/src/sprites/workshop/sets.ts`: the list of sets (and so the lock and `housing sheet <id>`).
 *  - `apps/activity/src/sprites/workshop/shipped-art.json` and `docs/art/`: generated (`housing lock`, `art library`).
 *  - `docs/compendium/housing.md`: the set, keepsake, pieces and skins rows, marked draft.
 */
import { SET_FORMS } from './style';

export const PATHS = {
  sets: 'packages/game/src/content/data/housing/sets.json',
  pieces: 'packages/game/src/content/data/housing/pieces.json',
  skins: 'packages/game/src/content/data/housing/skins.json',
  setsTs: 'apps/activity/src/sprites/workshop/sets.ts',
  compendium: 'docs/compendium/housing.md',
  style: (id: string): string => `apps/activity/src/sprites/workshop/styles/${id}.ts`,
  pack: (id: string): string => `apps/activity/src/sprites/data/house/${id}.ts`,
  concept: (id: string): string => `apps/activity/src/sprites/concepts/house-${id}.ts`,
  /** The set's sheet in the art catalogue, which `pnpm art library` writes but never deletes. */
  sheet: (id: string): string => `docs/art/house-${id}.png`,
} as const;

/**
 * The shipped sets: never removed by `remove-set`, and `new-set` refuses their ids (`cosy`, the starter set, has no
 * style). The first night's nine, then each set made with `new-set` once it is finished (the `furniture-set` skill).
 */
export const SHIPPED_SET_IDS: readonly string[] = [
  'cosy',
  'tidepool',
  'moonlit',
  'emberhold',
  'rootwood',
  'stormglass',
  'fenkeeper',
  'ancient',
  'lantern-night',
  'quiet-verge',
  'fairground',
  'schoolhouse',
];

/** The style `new-set` copies when `--from` is not given. */
export const DEFAULT_FROM = 'plain-pine';

export type SetMaterial = { material: string } | { family: 'wood' | 'stone' | 'metal' | 'cloth' };

export interface SetSpec {
  id: string;
  name: string;
  /** The motif and palette line of the set (content `theme`). */
  theme: string;
  from: string;
  element: string | null;
  tier: 1 | 2;
  primary: SetMaterial;
  accent: SetMaterial;
  moments: string[];
  places: string[];
  bosses: string[];
}

/** What a plan needs to know that is not in the files it edits. */
export interface PlanContext {
  /** Names of destinations and bosses, by id, for the blueprint hint. */
  placeNames: Readonly<Record<string, string>>;
  bossNames: Readonly<Record<string, string>>;
  /** The source of the style file `--from` names (only needed when the set's style does not exist yet). */
  fromSource: string | undefined;
}

export type Read = (path: string) => string | undefined;
/** New text by path; `null` means delete the file. Only paths that change are present. */
export type Changes = Map<string, string | null>;

const MATERIAL_FAMILIES = ['wood', 'stone', 'metal', 'cloth'] as const;
const MOMENTS = ['trip', 'scout', 'dungeon', 'raid', 'games'];

/** "trial-oak" to "Trial Oak". */
export function titleOf(id: string): string {
  return id
    .split('-')
    .map((w) => `${w.slice(0, 1).toUpperCase()}${w.slice(1)}`)
    .join(' ');
}

/** "trial-oak" to "TRIAL_OAK", the name of the style and pack constants. */
export function constOf(id: string): string {
  return id.toUpperCase().replace(/-/g, '_');
}

/** Checks a set id: kebab-case, short enough that `<id>-curtains` is an id (32 characters). */
export function idProblem(id: string): string | undefined {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) return `"${id}" is not lowercase kebab-case`;
  if (id.length > 23) return `"${id}" is too long: "<id>-curtains" must fit 32 characters`;
  return undefined;
}

function parseMaterial(text: string, flag: string): SetMaterial {
  const family = /^family:(.+)$/.exec(text)?.[1];
  if (family !== undefined) {
    if (!(MATERIAL_FAMILIES as readonly string[]).includes(family))
      throw new Error(`${flag}: family "${family}" is not one of ${MATERIAL_FAMILIES.join(', ')}`);
    return { family: family as 'wood' | 'stone' | 'metal' | 'cloth' };
  }
  return { material: text };
}

function list(text: string | undefined): string[] {
  return text === undefined || text === '' ? [] : text.split(',').map((s) => s.trim());
}

/**
 * The spec from the command's id and flags. Defaults are the plainest set that validates: tier 1, no element, a
 * wood family primary and a stone family accent (so no new luxury material is needed), any place and boss.
 * Throws a message for a bad id or flag.
 */
export function parseSpec(
  id: string,
  flags: Readonly<Record<string, string | undefined>>,
): SetSpec {
  const bad = idProblem(id);
  if (bad !== undefined) throw new Error(bad);
  const tier = Number(flags['--tier'] ?? '1');
  if (tier !== 1 && tier !== 2) throw new Error('--tier is 1 or 2');
  const moments = list(flags['--moments'] ?? 'trip,scout,raid');
  for (const m of moments)
    if (!MOMENTS.includes(m))
      throw new Error(`--moments: "${m}" is not one of ${MOMENTS.join(', ')}`);
  const element = flags['--element'];
  return {
    id,
    name: flags['--name'] ?? titleOf(id),
    theme: flags['--theme'] ?? 'TODO: the motif and palette of the set, one line.',
    from: flags['--from'] ?? DEFAULT_FROM,
    element: element === undefined || element === 'none' ? null : element,
    tier,
    primary: parseMaterial(flags['--primary'] ?? 'family:wood', '--primary'),
    accent: parseMaterial(flags['--accent'] ?? 'family:stone', '--accent'),
    moments,
    places: list(flags['--places']),
    bosses: list(flags['--bosses']),
  };
}

// ---- JSON ----

type Json = Record<string, unknown>;

function parseList(path: string, text: string | undefined): Json[] {
  if (text === undefined) throw new Error(`${path} is missing`);
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error(`${path} is not a list`);
  return data as Json[];
}

const stringify = (rows: readonly Json[]): string => `${JSON.stringify(rows, null, 2)}\n`;

/** The blueprint hint: "A blueprint from the Tidepools or the Tidal Colossus." */
export function blueprintHint(
  spec: SetSpec,
  ctx: Pick<PlanContext, 'placeNames' | 'bossNames'>,
): string {
  const names = [
    ...spec.places.map((p) => `the ${ctx.placeNames[p] ?? p}`),
    ...spec.bosses.map((b) => `the ${ctx.bossNames[b] ?? b}`),
  ];
  if (names.length === 0) {
    const what: Record<string, string> = {
      trip: 'trips',
      scout: 'scouts',
      dungeon: 'the dungeon',
      raid: 'raids',
      games: 'the Valley Games',
    };
    const from = spec.moments.map((m) => what[m] ?? m);
    return `A blueprint from ${from.length > 1 ? `${from.slice(0, -1).join(', ')} or ${String(from.at(-1))}` : (from[0] ?? 'trips')}.`;
  }
  return `A blueprint from ${names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${String(names.at(-1))}` : (names[0] ?? '')}.`;
}

export function setEntry(spec: SetSpec): Json {
  return {
    id: spec.id,
    name: spec.name,
    element: spec.element,
    tier: spec.tier,
    primary: spec.primary,
    accent: spec.accent,
    sources: { moments: spec.moments, places: spec.places, bosses: spec.bosses },
    keepsake: {
      name: `${spec.name} Keepsake`,
      line: `TODO: one line about the ${spec.name} keepsake.`,
    },
    theme: spec.theme,
    line: `TODO: one line about the ${spec.name} set.`,
  };
}

export function pieceEntries(spec: SetSpec, hint: string): Json[] {
  return SET_FORMS.map((form) => ({
    id: `${spec.id}-${form}`,
    name: `${spec.name} ${titleOf(form)}`,
    form,
    set: spec.id,
    unlock: { kind: 'drop' },
    line: `TODO: one line about the ${spec.name} ${form}.`,
    hint,
  }));
}

export function skinEntries(spec: SetSpec, hint: string): Json[] {
  return [
    { kind: 'wall', label: 'Wallpaper' },
    { kind: 'floor', label: 'Floor' },
  ].map(({ kind, label }) => ({
    id: `${spec.id}-${kind}`,
    name: `${spec.name} ${label}`,
    kind,
    set: spec.id,
    unlock: { kind: 'drop' },
    hint,
  }));
}

/** `rows` with the entries not yet in it added after the last row whose `set` is a real set (or at the end); `undefined` when all are there. */
function addRows(rows: Json[], add: readonly Json[], afterSets: boolean): Json[] | undefined {
  const fresh = add.filter((a) => !rows.some((r) => r['id'] === a['id']));
  if (fresh.length === 0) return undefined;
  let at = rows.length;
  if (afterSets) {
    at = 0;
    rows.forEach((r, i) => {
      if (r['set'] !== null && r['set'] !== undefined) at = i + 1;
    });
  }
  return [...rows.slice(0, at), ...fresh, ...rows.slice(at)];
}

// ---- TypeScript files ----

const FROM_STYLE_DIRS = ['styles', 'sample'];

/** Where the source of a style to copy lives, relative to the repository root. */
export function fromPaths(from: string): string[] {
  return FROM_STYLE_DIRS.map((d) => `apps/activity/src/sprites/workshop/${d}/${from}.ts`);
}

/**
 * The new style file: a copy of the `--from` style with the set's id, name and constant, and a header listing what the
 * artist still has to decide. Throws when the copied source is not shaped like the shipped styles.
 */
export function styleSource(spec: SetSpec, fromSource: string): string {
  const decl = /export const (\w+): Style = \{/.exec(fromSource);
  if (decl === null) throw new Error(`style "${spec.from}": no "export const X: Style = {" found`);
  const body = fromSource.slice(fromSource.indexOf(decl[0]));
  let out = body
    .replace(decl[0], `export const ${constOf(spec.id)}: Style = {`)
    .replace(/(\n {2}id: )'[^']*'/, `$1'${spec.id}'`)
    .replace(/(\n {2}name: )'[^']*'/, `$1${JSON.stringify(spec.name)}`);
  const note = (key: string, text: string): void => {
    out = out.replace(new RegExp(`\\n( {2})${key}:`), `\n$1// TODO(artist): ${text}\n$1${key}:`);
  };
  note(
    'palette',
    "the set's own colours (8 to 10 and the ink `k`); the ramps below name its keys.",
  );
  note(
    'leg',
    "the variants: leg, foot, trim, top, motif, weave, lamp, rug, picture, shelf. Pick the ones that make the set's silhouette.",
  );
  note('motif', 'the one motif that appears on every piece (docs/design/housing.md section 5).');
  note('shelf', 'what stands on the shelf, left to right.');
  const header = `/**
 * The ${spec.name} style (\`docs/design/housing-workshop.md\`): ${spec.theme}
 * Made by \`pnpm housing new-set ${spec.id}\` from the ${spec.from} style: a starting point, not a design.
 * TODO(artist): palette, variants and motif below; then \`pnpm housing sheet ${spec.id}\`, look, repeat.
 */
import type { Style } from '../style';

`;
  return `${header}${out}`;
}

/** The art pack file: the style through `setPack` with no overrides, and placeholder skins and keepsake. */
export function packSource(spec: SetSpec): string {
  const C = constOf(spec.id);
  return `/**
 * House furniture pack: ${spec.name}. Made by \`pnpm housing new-set ${spec.id}\`: the nine pieces are drawn from the
 * style (\`../../workshop/styles/${spec.id}.ts\`) with no overrides; the wallpaper, floor and keepsake are placeholders
 * in the style's palette.
 * TODO(artist): draw the wallpaper (16x52), floor (16x8) and keepsake (12x12) by hand in a \`HAND\` pack (see
 * \`tidepool.ts\`), and add overrides (with a reason) where a form cannot say what the set needs.
 */
import type { HouseArtPack } from '../../../housing/house-art';
import { setPack, type SetSource } from '../../workshop/pack';
import { placeholderHand } from '../../workshop/placeholder';
import { ${C} } from '../../workshop/styles/${spec.id}';

/** TODO(artist): placeholder wallpaper, floor and keepsake. */
const HAND: HouseArtPack = placeholderHand(${C});

export const SOURCE: SetSource = { style: ${C}, hand: HAND };

export const HOUSE_ART: HouseArtPack = setPack(SOURCE);
`;
}

/** The concept wrapper file. */
export function conceptSource(spec: SetSpec): string {
  return `/**
 * Player housing, the ${spec.name} furniture set (concept wrapper; the art is \`../data/house/${spec.id}.ts\`). Made by
 * \`pnpm housing new-set ${spec.id}\`; it feeds the art library (\`docs/art/\`) and the studio. Nothing in the game
 * imports this folder.
 */
import { HOUSE_ART } from '../data/house/${spec.id}';
import { houseSetConcept } from '../workshop/set-concept';
import type { ConceptSet } from './index';

export const HOUSE_${constOf(spec.id)}: ConceptSet = houseSetConcept(
  '${spec.id}',
  ${JSON.stringify(spec.name)},
  HOUSE_ART,
  ${JSON.stringify(spec.theme)},
);
`;
}

const importLine = (id: string): string =>
  `import { SOURCE as ${constOf(id)} } from '../data/house/${id}';`;
const entryLine = (id: string): string => `  ${id.includes('-') ? `'${id}'` : id}: ${constOf(id)},`;

/** `sets.ts` with the set's import and entry added (unchanged when both are there). */
export function addToSetsTs(src: string, id: string): string {
  let out = src;
  if (!out.includes(importLine(id))) {
    const imports = [
      ...out.matchAll(/^import \{ SOURCE as \w+ \} from '\.\.\/data\/house\/[\w-]+';$/gm),
    ];
    const last = imports.at(-1);
    if (last === undefined) throw new Error('sets.ts: no SOURCE imports found');
    const end = (last.index ?? 0) + last[0].length;
    out = `${out.slice(0, end)}\n${importLine(id)}${out.slice(end)}`;
  }
  if (!out.includes(entryLine(id))) {
    const open = out.indexOf('export const SHIPPED_SETS');
    const close = out.indexOf('\n};', open);
    if (open < 0 || close < 0) throw new Error('sets.ts: SHIPPED_SETS not found');
    out = `${out.slice(0, close)}\n${entryLine(id)}${out.slice(close)}`;
  }
  return out;
}

/** `sets.ts` without the set's import and entry. */
export function removeFromSetsTs(src: string, id: string): string {
  return src
    .split('\n')
    .filter((line) => line !== importLine(id) && line !== entryLine(id))
    .join('\n');
}

// ---- Compendium ----

const cells = (row: string): string[] =>
  row
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

/** The line index just after the table that follows the first line matching `heading`. */
function tableEnd(lines: readonly string[], heading: RegExp): number {
  const h = lines.findIndex((l) => heading.test(l));
  if (h < 0) throw new Error(`compendium: no heading ${String(heading)}`);
  let i = h + 1;
  while (i < lines.length && !(lines[i] ?? '').startsWith('|')) i++;
  while (i < lines.length && (lines[i] ?? '').startsWith('|')) i++;
  return i;
}

/** Where a set's wallpaper or floor row goes: after the last set skin of the Skins table (else at its end). */
function skinRowsEnd(lines: readonly string[]): number {
  const start = lines.findIndex((l) => l === '## Skins');
  const end = tableEnd(lines, /^## Skins$/);
  let at = end;
  for (let i = start; i < end; i++) {
    const c = (lines[i] ?? '').startsWith('|') ? cells(lines[i] ?? '') : [];
    if ((c[1] === 'wall' || c[1] === 'floor') && /^A blueprint from/.test(c[2] ?? '')) at = i + 1;
  }
  return at;
}

const row = (...c: string[]): string => `| ${c.join(' | ')} |`;

const hasRow = (lines: readonly string[], first: string, at = 0): boolean =>
  lines.some((l) => l.startsWith('|') && cells(l)[at] === first);

/** The compendium with the set's rows added, marked draft. Prettier realigns the tables afterwards. */
export function addToCompendium(md: string, spec: SetSpec, hint: string): string {
  let lines = md.split('\n');
  const insert = (at: number, add: string[]): void => {
    lines = [...lines.slice(0, at), ...add, ...lines.slice(at)];
  };
  const element = spec.element === null ? 'None' : titleOf(spec.element);
  const keepsake = `${spec.name} Keepsake`;
  if (!hasRow(lines, spec.name)) {
    insert(tableEnd(lines, /^## Sets$/), [
      row(spec.name, element, `${keepsake}: TODO line`, `draft: ${spec.theme}`),
    ]);
  }
  if (!hasRow(lines, keepsake)) {
    insert(tableEnd(lines, /^### Keepsakes$/), [
      row(keepsake, spec.name, `TODO: one line about the ${spec.name} keepsake. (draft)`),
    ]);
  }
  if (!lines.includes(`### ${spec.name} set`)) {
    const at = lines.findIndex((l) => l === '## Wild pieces');
    if (at < 0) throw new Error('compendium: no "## Wild pieces" heading');
    insert(at, [
      `### ${spec.name} set`,
      '',
      `Draft: TODO one line about the ${spec.name} set. \`(content)\``,
      '',
      '| Piece | Form | Line `(content)` |',
      '| ----- | ---- | ---------------- |',
      ...SET_FORMS.map((f) =>
        row(
          `${spec.name} ${titleOf(f)}`,
          titleOf(f),
          `TODO: one line about the ${spec.name} ${f}.`,
        ),
      ),
      '',
    ]);
  }
  const skinRows = [
    ['Wallpaper', 'wall'],
    ['Floor', 'floor'],
  ] as const;
  for (const [label, kind] of skinRows) {
    const name = `${spec.name} ${label}`;
    if (hasRow(lines, name)) continue;
    insert(skinRowsEnd(lines), [row(name, kind, hint)]);
  }
  return lines.join('\n');
}

/** The compendium without the set's rows and section. */
export function removeFromCompendium(md: string, spec: Pick<SetSpec, 'id' | 'name'>): string {
  const keepsake = `${spec.name} Keepsake`;
  const lines = md.split('\n');
  const out: string[] = [];
  let skip = false;
  for (const l of lines) {
    if (l === `### ${spec.name} set`) {
      skip = true;
      continue;
    }
    if (skip && l.startsWith('#')) skip = false;
    if (skip) continue;
    if (l.startsWith('|')) {
      const c = cells(l);
      if (
        c[0] === spec.name ||
        c[0] === keepsake ||
        c[0] === `${spec.name} Wallpaper` ||
        c[0] === `${spec.name} Floor`
      )
        continue;
    }
    out.push(l);
  }
  return out.join('\n');
}

// ---- The plans ----

function put(changes: Changes, read: Read, path: string, next: string): void {
  if (read(path) !== next) changes.set(path, next);
}

/**
 * Everything `new-set` writes, as changes. Throws when the id is taken by a shipped set or a file the command
 * does not own, or when a copied style or a set already in the content disagrees with the spec.
 */
export function planNewSet(spec: SetSpec, read: Read, ctx: PlanContext): Changes {
  const bad = idProblem(spec.id);
  if (bad !== undefined) throw new Error(bad);
  if (SHIPPED_SET_IDS.includes(spec.id)) throw new Error(`"${spec.id}" is a shipped set.`);
  const changes: Changes = new Map();
  const hint = blueprintHint(spec, ctx);

  const edits: [string, readonly Json[], boolean][] = [
    [PATHS.sets, [setEntry(spec)], false],
    [PATHS.pieces, pieceEntries(spec, hint), true],
    [PATHS.skins, skinEntries(spec, hint), true],
  ];
  for (const [path, add, afterSets] of edits) {
    const next = addRows(parseList(path, read(path)), add, afterSets);
    if (next !== undefined) changes.set(path, stringify(next));
  }

  if (read(PATHS.style(spec.id)) === undefined) {
    if (ctx.fromSource === undefined)
      throw new Error(
        `No style to copy: "${spec.from}" (tried ${fromPaths(spec.from).join(', ')}).`,
      );
    changes.set(PATHS.style(spec.id), styleSource(spec, ctx.fromSource));
  }
  if (read(PATHS.pack(spec.id)) === undefined) changes.set(PATHS.pack(spec.id), packSource(spec));
  if (read(PATHS.concept(spec.id)) === undefined)
    changes.set(PATHS.concept(spec.id), conceptSource(spec));

  const setsTs = read(PATHS.setsTs);
  if (setsTs === undefined) throw new Error(`${PATHS.setsTs} is missing`);
  put(changes, read, PATHS.setsTs, addToSetsTs(setsTs, spec.id));

  const md = read(PATHS.compendium);
  if (md !== undefined) put(changes, read, PATHS.compendium, addToCompendium(md, spec, hint));
  return changes;
}

/** Everything `remove-set` undoes. Throws for a shipped set. Needs the set's name (from `sets.json`, else the title of the id). */
export function planRemoveSet(id: string, read: Read): Changes {
  if (SHIPPED_SET_IDS.includes(id))
    throw new Error(`"${id}" is a shipped set; remove-set only undoes new-set.`);
  const bad = idProblem(id);
  if (bad !== undefined) throw new Error(bad);
  const changes: Changes = new Map();
  const sets = parseList(PATHS.sets, read(PATHS.sets));
  const found = sets.find((s) => s['id'] === id)?.['name'];
  const name = typeof found === 'string' ? found : titleOf(id);
  for (const path of [PATHS.sets, PATHS.pieces, PATHS.skins]) {
    const rows = path === PATHS.sets ? sets : parseList(path, read(path));
    const kept = rows.filter((r) => r['set'] !== id && r['id'] !== id);
    if (kept.length !== rows.length) changes.set(path, stringify(kept));
  }
  for (const path of [PATHS.style(id), PATHS.pack(id), PATHS.concept(id), PATHS.sheet(id)])
    if (read(path) !== undefined) changes.set(path, null);
  const setsTs = read(PATHS.setsTs);
  if (setsTs !== undefined) put(changes, read, PATHS.setsTs, removeFromSetsTs(setsTs, id));
  const md = read(PATHS.compendium);
  if (md !== undefined)
    put(changes, read, PATHS.compendium, removeFromCompendium(md, { id, name }));
  return changes;
}
