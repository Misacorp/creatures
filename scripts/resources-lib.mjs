// The logic of `pnpm resources`: rename a resource in the library and in the content text.
// Pure Node, no dependencies. Every function takes the data directory so tests run on a temp copy.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const LIBRARY_FILE = 'resources.json';

/** A string value that is only an id or a key (`bait`, `tide-shard`): never prose, never rewritten. */
const PLAIN_ID = /^[a-z][a-z0-9_-]*$/;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The lower-case form of a name for mid-sentence use ("Tide Shard" -> "tide shard"). */
function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The replacements for one rename, longest first so "Tide Shards" goes before "Tide Shard": the plural
 * and the singular, each in its written form and with a lower-case first letter.
 */
export function replacements(oldRes, name, plural) {
  const pairs = [];
  for (const [from, to] of [
    [oldRes.plural, plural],
    [oldRes.name, name],
  ]) {
    if (from === to) continue;
    pairs.push([from, to]);
    if (lowerFirst(from) !== from) pairs.push([lowerFirst(from), lowerFirst(to)]);
  }
  return pairs
    .filter(([from], i, all) => all.findIndex(([f]) => f === from) === i)
    .sort((a, b) => b[0].length - a[0].length);
}

/** Rewrite one piece of prose; `pairs` come from `replacements`. Whole words only. */
export function rewriteText(text, pairs) {
  let out = text;
  for (const [from, to] of pairs) {
    out = out.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(from)}(?![\\p{L}\\p{N}])`, 'gu'),
      to,
    );
  }
  return out;
}

/**
 * Rewrite every JSON string value of a file's text (keys and plain ids are left alone), keeping the
 * file's layout. Returns the new text and the changed lines as `{ line, before, after }`.
 */
export function rewriteJsonText(source, pairs) {
  const changes = [];
  const lines = source.split('\n').map((line, index) => {
    const next = line.replace(/"((?:[^"\\]|\\.)*)"(\s*:)?/g, (whole, body, colon) => {
      if (colon !== undefined || PLAIN_ID.test(body)) return whole;
      return `"${rewriteText(body, pairs)}"`;
    });
    if (next !== line) changes.push({ line: index + 1, before: line.trim(), after: next.trim() });
    return next;
  });
  return { text: lines.join('\n'), changes };
}

/**
 * Rename resource `id`. `plural` defaults to the name when the old plural was the same word as the old
 * name, else the name with an "s". Returns every change: `{ file, line, before, after }` (the library's
 * own entry first). Writes nothing unless `write` is true.
 */
export function renameResource({ dataDir, id, name, plural, write }) {
  const libraryPath = join(dataDir, LIBRARY_FILE);
  const library = JSON.parse(readFileSync(libraryPath, 'utf8'));
  const entry = library.find((r) => r.id === id);
  if (entry === undefined) throw new Error(`No resource "${id}" in ${LIBRARY_FILE}.`);
  const newPlural = plural ?? (entry.plural === entry.name ? name : `${name}s`);
  const pairs = replacements(entry, name, newPlural);
  const changes = [];

  const libraryText = readFileSync(libraryPath, 'utf8');
  const next = library.map((r) => (r.id === id ? { ...r, name, plural: newPlural } : r));
  const nextText = `${JSON.stringify(next, null, 2)}\n`;
  if (nextText !== libraryText && nextText !== libraryText.trimEnd()) {
    changes.push({
      file: LIBRARY_FILE,
      line: 0,
      before: `${entry.name} / ${entry.plural}`,
      after: `${name} / ${newPlural}`,
    });
  }
  if (write) writeFileSync(libraryPath, nextText);

  for (const file of readdirSync(dataDir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    if (file === LIBRARY_FILE) continue;
    const path = join(dataDir, file);
    const { text, changes: fileChanges } = rewriteJsonText(readFileSync(path, 'utf8'), pairs);
    for (const change of fileChanges) changes.push({ file, ...change });
    if (write && fileChanges.length > 0) writeFileSync(path, text);
  }
  return changes;
}
