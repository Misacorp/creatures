import {
  parseContentIds,
  parseScalars,
  renderTable,
  type ParsedIds,
  type Scalar,
  type Unit,
} from './scalars';

/**
 * The patch notes draft (docs/design/balance-loop.md, section 3): what changed between two git
 * refs, from the generated registries and the balance log. Pure: git and files come in through
 * `GitRunner` and the text arguments, so tests need no repository.
 */

/** Runs git with an argument array (never a shell string) and returns stdout; throws on failure. */
export type GitRunner = (args: readonly string[]) => string;

export const SCALARS_PATH = 'docs/balance/scalars.md';
export const CONTENT_IDS_PATH = 'docs/balance/content-ids.md';
export const LOG_PATH = 'docs/balance/log.md';

// --- Refs ---

/** Branch names, tags, short and full SHAs, and `~N` / `^` suffixes. No leading dash, no spaces. */
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@~^-]{0,99}$/;

/** Returns `ref` when it is a safe git ref, else throws. */
export function validateRef(ref: string): string {
  if (!REF_PATTERN.test(ref) || ref.includes('..') || ref.includes('//') || ref.endsWith('/')) {
    throw new Error(`Not a usable git ref: "${ref}"`);
  }
  return ref;
}

/** `from..to` (both sides validated), or `..to` / `from..` to take a default for the empty side. */
export function parseRange(arg: string): { from: string | null; to: string | null } {
  const at = arg.indexOf('..');
  if (at < 0) throw new Error(`Expected a range like balance-2026-10-20..HEAD, got "${arg}"`);
  const from = arg.slice(0, at);
  const to = arg.slice(at + 2);
  return {
    from: from === '' ? null : validateRef(from),
    to: to === '' ? null : validateRef(to),
  };
}

export interface ResolvedFrom {
  ref: string;
  /** Why this ref was chosen, printed in the draft. */
  basis: string;
}

function tryGit(git: GitRunner, args: readonly string[]): string | null {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

/**
 * The default start of the range: the latest `balance-*` tag reachable from `to`. With no such tag
 * yet, `origin/main` (what production has, when it is not `to` itself), else the root commit.
 */
export function defaultFrom(git: GitRunner, to: string): ResolvedFrom {
  const tag = tryGit(git, ['describe', '--tags', '--abbrev=0', '--match', 'balance-*', to]);
  if (tag !== null && tag !== '') {
    return { ref: validateRef(tag), basis: `latest balance-* tag (${tag})` };
  }
  const main = tryGit(git, ['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']);
  const head = tryGit(git, ['rev-parse', '--verify', '--quiet', `${to}^{commit}`]);
  if (main !== null && main !== '' && main !== head) {
    return { ref: 'origin/main', basis: 'origin/main (no balance-* tag yet)' };
  }
  const roots = (tryGit(git, ['rev-list', '--max-parents=0', to]) ?? '').split('\n');
  const root = roots[roots.length - 1] ?? '';
  if (root === '') throw new Error(`Cannot find a starting point before ${to}`);
  return {
    ref: validateRef(root),
    basis: 'the root commit (no balance-* tag yet, and origin/main is not behind this ref)',
  };
}

/** The text of `path` at `ref`, or null when the file does not exist there. */
export function showFile(git: GitRunner, ref: string, path: string): string | null {
  const spec = `${validateRef(ref)}:${path}`;
  try {
    return git(['show', spec]);
  } catch {
    return null;
  }
}

// --- Diffs ---

export interface ScalarChange {
  path: string;
  system: string;
  unit: Unit;
  from: string;
  to: string;
  /** Percent change for a single number, for example `+12.5%`; null for arrays or a zero start. */
  delta: string | null;
  meaning: string;
  targets: string[];
}

export interface ScalarDiff {
  changed: ScalarChange[];
  added: Scalar[];
  removed: Scalar[];
}

export function percentDelta(from: string, to: string): string | null {
  if (!/^-?\d+(\.\d+)?$/.test(from) || !/^-?\d+(\.\d+)?$/.test(to)) return null;
  const a = Number(from);
  const b = Number(to);
  if (a === 0) return null;
  const pct = Math.round(((b - a) / Math.abs(a)) * 1000) / 10;
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

/** Diffs two registries by path, in the order of the newer one (removed rows last). */
export function diffScalars(base: readonly Scalar[], head: readonly Scalar[]): ScalarDiff {
  const before = new Map(base.map((s) => [s.path, s]));
  const after = new Map(head.map((s) => [s.path, s]));
  const changed: ScalarChange[] = [];
  const added: Scalar[] = [];
  for (const s of head) {
    const old = before.get(s.path);
    if (old === undefined) added.push(s);
    else if (old.value !== s.value) {
      changed.push({
        path: s.path,
        system: s.system,
        unit: s.unit,
        from: old.value,
        to: s.value,
        delta: percentDelta(old.value, s.value),
        meaning: s.meaning,
        targets: s.targets,
      });
    }
  }
  const removed = base.filter((s) => !after.has(s.path));
  return { changed, added, removed };
}

export interface ContentSectionDiff {
  title: string;
  added: { id: string; name: string }[];
  removed: { id: string; name: string }[];
  renamed: { id: string; from: string; to: string }[];
}

/** Diffs the content id lists by section and id; sections without changes are left out. */
export function diffContentIds(
  base: readonly ParsedIds[],
  head: readonly ParsedIds[],
): ContentSectionDiff[] {
  const titles = [...head.map((s) => s.title)];
  for (const s of base) if (!titles.includes(s.title)) titles.push(s.title);
  const out: ContentSectionDiff[] = [];
  for (const title of titles) {
    const before = new Map(
      (base.find((s) => s.title === title)?.items ?? []).map((i) => [i.id, i]),
    );
    const afterItems = head.find((s) => s.title === title)?.items ?? [];
    const after = new Map(afterItems.map((i) => [i.id, i]));
    const diff: ContentSectionDiff = { title, added: [], removed: [], renamed: [] };
    for (const item of afterItems) {
      const old = before.get(item.id);
      if (old === undefined) diff.added.push(item);
      else if (old.name !== item.name)
        diff.renamed.push({ id: item.id, from: old.name, to: item.name });
    }
    for (const item of before.values()) if (!after.has(item.id)) diff.removed.push(item);
    if (diff.added.length + diff.removed.length + diff.renamed.length > 0) out.push(diff);
  }
  return out;
}

// --- Balance log and pull requests ---

export interface LogEntry {
  id: string;
  title: string;
  status: string;
  /** Field name to text, for example `Action`. */
  fields: Record<string, string>;
}

/** The entries of `docs/balance/log.md` (the template entry B-000 is skipped). */
export function parseBalanceLog(markdown: string): LogEntry[] {
  const entries: LogEntry[] = [];
  let current: LogEntry | null = null;
  let field: string | null = null;
  for (const line of markdown.split('\n')) {
    const head = /^### (B-\d{3,}): (.*?)(?: \((open|closed)\))?\s*$/.exec(line);
    if (head !== null) {
      current = { id: head[1] ?? '', title: head[2] ?? '', status: head[3] ?? '', fields: {} };
      field = null;
      if (current.id !== 'B-000') entries.push(current);
      continue;
    }
    if (line.startsWith('#')) {
      current = null;
      field = null;
      continue;
    }
    if (current === null) continue;
    const f = /^- \*\*([A-Za-z][A-Za-z -]*):\*\*\s*(.*)$/.exec(line);
    if (f !== null) {
      field = f[1] ?? '';
      current.fields[field] = (f[2] ?? '').trim();
    } else if (field !== null && line.trim() !== '') {
      current.fields[field] = `${current.fields[field] ?? ''} ${line.trim()}`.trim();
    }
  }
  return entries;
}

export interface PullRequest {
  number: number;
  subject: string;
}

/** Pull requests named as `(#NN)` in commit subjects (GitHub's squash merge titles). */
export function pullRequestsIn(subjects: readonly string[]): PullRequest[] {
  const seen = new Set<number>();
  const out: PullRequest[] = [];
  for (const subject of subjects) {
    for (const m of subject.matchAll(/\(#(\d+)\)/g)) {
      const number = Number(m[1]);
      if (!seen.has(number)) {
        seen.add(number);
        out.push({ number, subject });
      }
    }
  }
  return out;
}

/** The log entries whose Action names one of the pull requests (as `#NN`, not a longer number). */
export function logEntriesFor(
  entries: readonly LogEntry[],
  prs: readonly PullRequest[],
): LogEntry[] {
  const numbers = new Set(prs.map((p) => p.number));
  return entries.filter((e) => {
    for (const m of (e.fields['Action'] ?? '').matchAll(/#(\d+)(?!\d)/g)) {
      if (numbers.has(Number(m[1]))) return true;
    }
    return false;
  });
}

// --- The draft ---

export interface PatchNotesDraft {
  range: { from: string; to: string; fromBasis: string };
  pullRequests: PullRequest[];
  balanceLog: LogEntry[];
  numbers: {
    /** False when the registry did not exist at the start ref: `current` lists today's values. */
    baseline: boolean;
    changed: ScalarChange[];
    added: Scalar[];
    removed: Scalar[];
    current: Scalar[];
  };
  content: {
    baseline: boolean;
    sections: ContentSectionDiff[];
  };
}

export interface DraftInputs {
  from: ResolvedFrom;
  to: string;
  /** Commit subjects in the range. */
  subjects: readonly string[];
  baseScalars: string | null;
  headScalars: string | null;
  baseIds: string | null;
  headIds: string | null;
  headLog: string | null;
}

export function buildDraft(inputs: DraftInputs): PatchNotesDraft {
  const head = inputs.headScalars === null ? [] : parseScalars(inputs.headScalars);
  const prs = pullRequestsIn(inputs.subjects);
  const log = inputs.headLog === null ? [] : parseBalanceLog(inputs.headLog);
  const diff =
    inputs.baseScalars === null ? null : diffScalars(parseScalars(inputs.baseScalars), head);
  const sections =
    inputs.baseIds === null || inputs.headIds === null
      ? []
      : diffContentIds(parseContentIds(inputs.baseIds), parseContentIds(inputs.headIds));
  return {
    range: { from: inputs.from.ref, to: inputs.to, fromBasis: inputs.from.basis },
    pullRequests: prs,
    balanceLog: logEntriesFor(log, prs),
    numbers: {
      baseline: diff !== null,
      changed: diff?.changed ?? [],
      added: diff?.added ?? [],
      removed: diff?.removed ?? [],
      current: diff === null ? head : [],
    },
    content: { baseline: inputs.baseIds !== null, sections },
  };
}

// --- Markdown ---

function code(text: string): string {
  return `\`${text}\``;
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

function scalarRows(rows: readonly Scalar[]): string {
  return renderTable(
    ['Path', 'Value', 'Unit', 'Meaning'],
    rows.map((s) => [code(s.path), code(s.value), s.unit, s.meaning]),
  );
}

/** The draft as Markdown, for the patch-notes skill to read. */
export function renderDraftMarkdown(draft: PatchNotesDraft): string {
  const out: string[] = [
    '# Patch notes draft',
    `Range: ${code(`${draft.range.from}..${draft.range.to}`)}. Start chosen as ${draft.range.fromBasis}.`,
    'Generated by `pnpm patch-notes` for the patch-notes skill. A draft for the writer, not for players: do not commit it.',
  ];

  out.push('## Pull requests');
  out.push(
    draft.pullRequests.length === 0
      ? 'None found in the commit subjects of this range.'
      : draft.pullRequests.map((p) => `- #${p.number}: ${p.subject}`).join('\n'),
  );

  out.push('## Balance log entries');
  if (draft.balanceLog.length === 0) {
    out.push('No log entry names one of these pull requests in its Action.');
  } else {
    for (const e of draft.balanceLog) {
      const lines = [`### ${e.id}: ${e.title}${e.status === '' ? '' : ` (${e.status})`}`, ''];
      for (const name of ['Finding', 'Hypothesis', 'Action', 'Expected', 'Outcome']) {
        const text = e.fields[name];
        if (text !== undefined && text !== '') lines.push(`- **${name}:** ${text}`);
      }
      out.push(lines.join('\n'));
    }
  }

  out.push('## Content changes');
  if (!draft.content.baseline) {
    out.push(
      'No baseline: `docs/balance/content-ids.md` does not exist at the start of the range.',
    );
  } else if (draft.content.sections.length === 0) {
    out.push('No content was added, removed or renamed.');
  } else {
    for (const s of draft.content.sections) {
      const lines = [`### ${s.title}`, ''];
      for (const i of s.added) lines.push(`- Added: ${i.name} (${code(i.id)})`);
      for (const i of s.removed) lines.push(`- Removed: ${i.name} (${code(i.id)})`);
      for (const i of s.renamed) lines.push(`- Renamed: ${i.from} to ${i.to} (${code(i.id)})`);
      out.push(lines.join('\n'));
    }
  }

  out.push('## Number changes');
  const n = draft.numbers;
  if (!n.baseline) {
    out.push(
      `No baseline: \`docs/balance/scalars.md\` does not exist at ${code(draft.range.from)}, so there is nothing to compare. The current values (${plural(n.current.length, 'scalar')}) follow.`,
    );
    if (n.current.length > 0) out.push(scalarRows(n.current));
  } else {
    out.push(
      `${plural(n.changed.length, 'value')} changed, ${n.added.length} added, ${n.removed.length} removed.`,
    );
    if (n.changed.length > 0) {
      out.push(
        renderTable(
          ['Path', 'From', 'To', 'Change', 'Unit', 'Meaning', 'Sim targets'],
          n.changed.map((c) => [
            code(c.path),
            code(c.from),
            code(c.to),
            c.delta ?? '',
            c.unit,
            c.meaning,
            c.targets.map(code).join(', '),
          ]),
        ),
      );
    }
    if (n.added.length > 0) out.push(`### Added\n\n${scalarRows(n.added)}`);
    if (n.removed.length > 0) out.push(`### Removed\n\n${scalarRows(n.removed)}`);
  }
  return `${out.join('\n\n')}\n`;
}
