// Pure logic for `pnpm decisions` (scripts/decisions.mjs): parsing and rendering the topic files, ids,
// statuses, the generated README index and the legacy (single file) parser. Only node: built-ins.
// The one fs-touching part is loadState/buildPlan/writePlan, which take the repo root as a parameter
// so tests can run on a temp directory.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DIR = 'docs/design/decisions';
export const LEGACY_FILE = 'docs/design/decisions.md';
export const TODO_MARK = '<!-- TODO: decision and reasoning -->';
/** Between the current and the superseded entries of a topic file (fix writes it, parsing drops it). */
export const SEPARATOR_COMMENT =
  '<!-- Superseded entries below: kept for history, no longer in force. -->';
export const SEPARATOR_HEADING = '# Superseded';
const TOPIC_NOTE = '<!-- Maintained with `pnpm decisions`; see README.md. Newest first. -->';

/** An error with a message meant for the person running the tool (no stack trace). */
export class UserError extends Error {}

export const STUB = `# Design decisions (moved)

Design decisions now live in \`docs/design/decisions/\`, one file per topic. Start with its [README.md](decisions/README.md), the index.

Query them with \`pnpm decisions\` (try \`pnpm decisions help\`).

Do not add entries to this file. CI rejects them.

If you are resolving a merge conflict in this file, or your branch added entries here before the split, run \`pnpm decisions migrate\`. It moves your branch's entries into the topic files, asks you which topic each new one belongs to, and restores this stub.

Old references such as "decisions.md 2026-10-24, Some title" still resolve: \`pnpm decisions show "Some title"\`.
`;

const README_HEADER = `# Design decisions

This folder holds the project's design decisions, one file per topic. Read this index first, then only the topic file or files your work touches.

## How to use it

Look things up:

- \`pnpm decisions list --topic <topic>\` lists a topic's current entries.
- \`pnpm decisions search <regex>\` searches titles and bodies.
- \`pnpm decisions show <id or heading text>\` prints whole entries.

Record a decision:

- Run \`pnpm decisions new --topic <topic> --title "..." [--supersedes id] [--amends id] [--misa]\`, then write the body (\`**Decision.**\` and \`**Reasoning.**\`).
- Or write a \`## YYYY-MM-DD: Title\` entry by hand at the top of the topic file and run \`pnpm decisions fix\`.
- \`fix\` sorts the entries, fills in IDs, derives statuses and rewrites this index. CI runs \`pnpm decisions check\`.
- Game-feel decisions confirmed by Misa carry **[Misa]** in the title.

The old \`docs/design/decisions.md\` is now a stub. A branch that still has entries there runs \`pnpm decisions migrate\`.
`;

// ---------------------------------------------------------------------------------------------
// Text helpers

/** Reads a file as text with LF line endings. */
export function readText(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** The hash legacy.json stores: the body with whitespace runs collapsed, trimmed. */
export function bodyHash(body) {
  return sha256(body.replace(/\s+/g, ' ').trim());
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}

/** `## 2026-10-10: Title` or `### ...` becomes `2026-10-10: Title`. */
export function normaliseHeading(text) {
  return text.replace(/^#+\s*/, '').trim();
}

// ---------------------------------------------------------------------------------------------
// IDs

/** Title to the slug part of an id: first six words, ascii only. */
export function slugify(title) {
  const words = title
    .replaceAll('**', '')
    .replaceAll('`', '')
    .replaceAll('[Misa]', '')
    .replaceAll('(Misa)', '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .slice(0, 6);
  return words.join('-') || 'entry';
}

/** A fresh id, unique against `used` (which it adds to). */
export function makeId(date, title, used) {
  const base = `${date}-${slugify(title)}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

// ---------------------------------------------------------------------------------------------
// Scanning markdown into entries

const DATED = /^(#{2,3}) (\d{4}-\d{2}-\d{2}): (\S.*)$/;
const LOOKS_DATED = /^#{2,3}\s+\d{4}-\d/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Splits a markdown document at dated headings. `mode` is 'legacy' (`##` and `###` start an entry)
 * or 'topic' (only `##`; a dated `###` is a problem). Headings inside code fences are ignored.
 * Returns the lines before the first entry, the entries (each with the raw lines after its
 * heading) and problems.
 */
export function scanDocument(text, mode) {
  const head = [];
  const entries = [];
  const problems = [];
  let current = null;
  let fence = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && !fenceMatch[2].trim()) {
        fence = null;
      }
    } else if (fence === null) {
      const m = DATED.exec(line);
      const isEntry = m && (mode === 'legacy' || m[1] === '##');
      if (isEntry) {
        current = { level: m[1].length, date: m[2], title: m[3].trim(), lines: [] };
        entries.push(current);
        continue;
      }
      if (mode === 'topic') {
        // The separator between current and superseded entries is generated; it is not body text.
        if (line === SEPARATOR_COMMENT || line === SEPARATOR_HEADING) continue;
        if (m) problems.push(`dated ### heading (use ##): ${line}`);
      }
      if (!m && LOOKS_DATED.test(line)) problems.push(`malformed dated heading: ${line}`);
    }
    (current ? current.lines : head).push(line);
  }
  return { head, entries, problems };
}

/** The legacy file's entries: { date, title, heading, body, hash } in source order. */
export function parseLegacy(text) {
  return scanDocument(text, 'legacy').entries.map((e) => {
    const body = trimBlankLines(e.lines).join('\n');
    return {
      date: e.date,
      title: e.title,
      heading: `${e.date}: ${e.title}`,
      body,
      hash: bodyHash(body),
    };
  });
}

const META_START = /^(ID|Status|Supersedes|Amends): /;

function ticked(value) {
  return [...value.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

/** Reads a meta line into { id, supersedes, amends }. Status is derived, so it is ignored. */
export function parseMeta(line) {
  const meta = { id: null, supersedes: [], amends: [] };
  for (const part of line.split(' · ')) {
    const m = /^(\w+): (.*)$/.exec(part.trim());
    if (!m) continue;
    if (m[1] === 'ID') meta.id = m[2].replaceAll('`', '').trim() || null;
    else if (m[1] === 'Supersedes') meta.supersedes = ticked(m[2]);
    else if (m[1] === 'Amends') meta.amends = ticked(m[2]);
  }
  return meta;
}

/** Reads a topic file's text into entries: { date, title, id, supersedes, amends, body }. */
export function parseTopicFile(text) {
  const scanned = scanDocument(text, 'topic');
  const entries = scanned.entries.map((e) => {
    const lines = e.lines;
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    let meta = { id: null, supersedes: [], amends: [] };
    if (i < lines.length && META_START.test(lines[i])) {
      meta = parseMeta(lines[i]);
      i++;
    }
    const body = trimBlankLines(lines.slice(i)).join('\n');
    return { date: e.date, title: e.title, ...meta, body };
  });
  return { entries, problems: scanned.problems };
}

// ---------------------------------------------------------------------------------------------
// Statuses

/** Who supersedes and who amends each id: Map id -> { superseded: string[], amended: string[] }. */
export function deriveStatuses(entries) {
  const info = new Map();
  const slot = (id) => {
    if (!info.has(id)) info.set(id, { superseded: [], amended: [] });
    return info.get(id);
  };
  for (const e of entries) {
    for (const target of e.supersedes) slot(target).superseded.push(e.id);
    for (const target of e.amends) slot(target).amended.push(e.id);
  }
  for (const v of info.values()) {
    v.superseded.sort();
    v.amended.sort();
  }
  return info;
}

const listOf = (ids) => ids.map((id) => `\`${id}\``).join(', ');

export function statusText(info) {
  if (info && info.superseded.length) return `superseded by ${listOf(info.superseded)}`;
  if (info && info.amended.length) return `current, amended by ${listOf(info.amended)}`;
  return 'current';
}

export const isCurrent = (info) => !info || info.superseded.length === 0;

// ---------------------------------------------------------------------------------------------
// Rendering

export function renderMeta(entry, status) {
  const parts = [`ID: \`${entry.id}\``, `Status: ${status}`];
  if (entry.supersedes.length) parts.push(`Supersedes: ${listOf(entry.supersedes)}`);
  if (entry.amends.length) parts.push(`Amends: ${listOf(entry.amends)}`);
  return parts.join(' · ');
}

export function renderEntry(entry, status) {
  const lines = [`## ${entry.date}: ${entry.title}`, '', renderMeta(entry, status)];
  if (entry.body) lines.push('', entry.body);
  return lines.join('\n');
}

/** A topic file. `current` and `superseded` are entry lists already in order; `statusOf(entry)`. */
export function renderTopicFile(topic, current, superseded, statusOf) {
  const blocks = [`# ${topic.title}`, topic.scope, TOPIC_NOTE];
  for (const e of current) blocks.push(renderEntry(e, statusOf(e)));
  if (superseded.length) blocks.push(SEPARATOR_COMMENT, SEPARATOR_HEADING);
  for (const e of superseded) blocks.push(renderEntry(e, statusOf(e)));
  return `${blocks.join('\n\n')}\n`;
}

/** A title as index text: no bold markers, brackets escaped. */
export function plainTitle(title) {
  return title.replaceAll('**', '').replace(/[[\]]/g, '\\$&');
}

/**
 * The README index. `sections` is [{ topic, file, text, current, superseded, infoOf }] in topic order.
 */
export function renderReadme(sections) {
  const blocks = [README_HEADER.trimEnd()];
  for (const s of sections) {
    blocks.push(`## ${s.topic.title}`, `[${s.file}](${s.file}): ${s.topic.scope}`);
    // One short line per entry in force: this index is read at the start of most tasks, so it holds
    // no links or ids (\`pnpm decisions show "<title>"\` prints an entry with both).
    const bullets = s.current.map((e) => {
      const amended = s.infoOf(e).amended;
      const tail = amended.length ? ` (amended by ${listOf(amended)})` : '';
      return `- ${e.date} ${plainTitle(e.title)}${tail}`;
    });
    if (bullets.length) blocks.push(bullets.join('\n'));
    if (s.superseded.length) {
      const n = s.superseded.length;
      blocks.push(`Superseded: ${n} ${n === 1 ? 'entry' : 'entries'} (see the topic file).`);
    }
  }
  return `${blocks.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------------------------
// Loading the folder and planning what the files should contain

export function loadTopics(root) {
  const path = join(root, DIR, 'topics.json');
  if (!existsSync(path)) throw new UserError(`${DIR}/topics.json is missing.`);
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new UserError(`${DIR}/topics.json is not valid JSON.`);
  }
  const ids = new Set();
  const ok =
    Array.isArray(data) &&
    data.every((t) => {
      const valid =
        t &&
        typeof t.id === 'string' &&
        /^[a-z][a-z0-9-]*$/.test(t.id) &&
        typeof t.title === 'string' &&
        typeof t.scope === 'string' &&
        !ids.has(t.id);
      ids.add(t?.id);
      return valid;
    });
  if (!ok) throw new UserError(`${DIR}/topics.json must be a list of unique { id, title, scope }.`);
  return data;
}

/** Reads every topic file. Entries may still lack ids and be unsorted. */
export function loadState(root) {
  const topics = loadTopics(root);
  const problems = [];
  const missingFiles = [];
  const byTopic = new Map();
  for (const topic of topics) {
    const rel = `${DIR}/${topic.id}.md`;
    const abs = join(root, rel);
    let entries = [];
    if (existsSync(abs)) {
      const parsed = parseTopicFile(readText(abs));
      entries = parsed.entries;
      for (const p of parsed.problems) problems.push(`${rel}: ${p}`);
    } else {
      missingFiles.push(rel);
    }
    byTopic.set(topic.id, entries);
  }
  const known = new Set(topics.map((t) => `${t.id}.md`));
  const dir = join(root, DIR);
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    if (name.endsWith('.md') && name !== 'README.md' && !known.has(name)) {
      problems.push(`${DIR}/${name} is not a topic in topics.json.`);
    }
  }
  return { root, topics, byTopic, problems, missingFiles };
}

/** Every id in use, as a Set. */
export function usedIds(state) {
  const used = new Set();
  for (const entries of state.byTopic.values()) for (const e of entries) if (e.id) used.add(e.id);
  return used;
}

/** Gives entries without an id one, in topic then file order. */
export function assignIds(state) {
  const used = usedIds(state);
  for (const entries of state.byTopic.values()) {
    for (const e of entries) if (!e.id) e.id = makeId(e.date, e.title, used);
  }
}

/**
 * Turns the loaded state into what every file should contain: ids filled, entries ordered (current
 * newest first, then superseded newest first), statuses derived, README rendered. Also returns the
 * problems that fix cannot repair. Mutates the state's entries (ids).
 */
export function finalise(state) {
  assignIds(state);
  const problems = [...state.problems];
  const all = [...state.byTopic.values()].flat();
  const seen = new Map();
  for (const e of all) seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
  for (const [id, n] of seen) if (n > 1) problems.push(`duplicate id: ${id}`);
  for (const e of all) {
    for (const [kind, ids] of [
      ['Supersedes', e.supersedes],
      ['Amends', e.amends],
    ]) {
      for (const id of ids) {
        if (id === e.id) problems.push(`${e.id}: ${kind} refers to itself.`);
        else if (!seen.has(id)) problems.push(`${e.id}: ${kind} unknown id ${id}.`);
      }
    }
  }
  const info = deriveStatuses(all);
  const infoOf = (e) => info.get(e.id) ?? { superseded: [], amended: [] };
  const statusOf = (e) => statusText(infoOf(e));
  const outputs = new Map();
  const sections = [];
  const sortedByTopic = new Map();
  for (const topic of state.topics) {
    // Array.prototype.sort is stable, so entries of one date keep their relative order.
    const sorted = [...state.byTopic.get(topic.id)].sort((a, b) => b.date.localeCompare(a.date));
    const current = sorted.filter((e) => isCurrent(infoOf(e)));
    const superseded = sorted.filter((e) => !isCurrent(infoOf(e)));
    const file = `${topic.id}.md`;
    const text = renderTopicFile(topic, current, superseded, statusOf);
    outputs.set(`${DIR}/${file}`, text);
    sections.push({ topic, file, text, current, superseded, infoOf });
    sortedByTopic.set(topic.id, [...current, ...superseded]);
  }
  outputs.set(`${DIR}/README.md`, renderReadme(sections));
  return { ...state, problems, outputs, sections, infoOf, statusOf, sortedByTopic, all };
}

export function buildPlan(root) {
  return finalise(loadState(root));
}

/** Files whose content differs from the plan (relative paths, in plan order). */
export function changedFiles(root, plan) {
  const changed = [];
  for (const [rel, text] of plan.outputs) {
    const abs = join(root, rel);
    if (!existsSync(abs) || readText(abs) !== text) changed.push(rel);
  }
  return changed;
}

export function writeFileMaking(root, rel, text) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

/** Writes the files that differ; returns their paths. */
export function writePlan(root, plan) {
  const changed = changedFiles(root, plan);
  for (const rel of changed) writeFileMaking(root, rel, plan.outputs.get(rel));
  return changed;
}
