#!/usr/bin/env node
// Lore check for the `lore` skill: finds player-facing text that tells instead of hints.
// Node only, no packages. Word lists: docs/compendium/story/sealed.json.
//
// Usage (from the repo root):
//   node .claude/skills/lore/check.mjs <draft.txt|.md ...>   check draft fragments, one per line
//   node .claude/skills/lore/check.mjs --changed             check text added to the content data since origin/main
//   node .claude/skills/lore/check.mjs --content             survey all shipped content text (legacy hits are a report, not a failure)
//   node .claude/skills/lore/check.mjs --ledger              count clues per fact in docs/compendium/story/ledger.md
//   node .claude/skills/lore/check.mjs --fact S05            print one fact from truth.md and its ledger rows, and nothing else
//
// Exit code 1 when a draft or changed line hits a sealed or banned pattern, or a rationed word goes over its limit.
// A clean run proves little: it only catches the wording a writer reaches for first. The blind reader test is the real one.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const STORY = 'docs/compendium/story';
const DATA = 'packages/game/src/content/data';
// Keys whose values players never read (ids, art briefs, colours).
const SKIP_KEYS =
  /^(id|ids|slug|key|hex|palette|appearance|sprite|icon|art|tag|slot|element|role|rarity|kind|set|place|from|to|notes?|theme)$/i;

const args = process.argv.slice(2);
const lists = JSON.parse(readFileSync(join(STORY, 'sealed.json'), 'utf8'));
const compile = (rows) => rows.map((r) => ({ ...r, re: new RegExp(r.pattern, 'i') }));
const sealed = compile(lists.sealed);
const banned = compile(lists.banned);
const rationed = compile(lists.rationed);

/** @returns {{where: string, text: string}[]} */
function stringsOfJson(file) {
  const out = [];
  const walk = (value, path, key) => {
    if (typeof value === 'string') {
      if (!SKIP_KEYS.test(key ?? '') && /\s/.test(value))
        out.push({ where: `${file} ${path}`, text: value });
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${v?.id ?? i}]`, key));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value))
        if (!SKIP_KEYS.test(k)) walk(v, `${path}.${k}`, k);
    }
  };
  walk(JSON.parse(readFileSync(file, 'utf8')), '', undefined);
  return out;
}

function jsonFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsonFiles(path);
    return name.endsWith('.json') ? [path] : [];
  });
}

function contentTexts() {
  return jsonFiles(DATA).flatMap(stringsOfJson);
}

function changedTexts() {
  const diff = execFileSync('git', ['diff', '-U0', 'origin/main', '--', DATA], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = [];
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(6);
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      // Only the string values of an added line: a key is not player text.
      for (const m of line.matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)) {
        if (/\s/.test(m[1])) out.push({ where: file, text: m[1] });
      }
    }
  }
  return out;
}

function draftTexts(files) {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((text, i) => ({ where: `${file}:${i + 1}`, text: text.trim() }))
      // Skip headings, table rules, comments and lines marked as dev notes ("> ...").
      .filter((l) => l.text && !/^(#|>|<!--|\|\s*-)/.test(l.text)),
  );
}

function scan(texts, { strict }) {
  let failed = false;
  const report = (label, row, hit) =>
    console.log(
      `${label}  ${hit.where}\n        "${hit.text.slice(0, 160)}"\n        ${row.fact ? `${row.fact}: ` : ''}${row.why}`,
    );
  for (const t of texts) {
    for (const row of sealed) {
      if (row.re.test(t.text)) {
        report('SEALED', row, t);
        failed = true;
      }
    }
    for (const row of banned) {
      if (row.re.test(t.text)) {
        report(strict ? 'TELLS ' : 'legacy', row, t);
        if (strict) failed = true;
      }
    }
  }
  return failed;
}

function ration() {
  let failed = false;
  const all = contentTexts();
  for (const row of rationed) {
    const count = all.filter((t) => row.re.test(t.text)).length;
    const over = count > row.max;
    console.log(
      `${over ? 'OVER  ' : 'ration'}  /${row.pattern}/ used ${count} / ${row.max}${over ? `: ${row.why}` : ''}`,
    );
    failed ||= over;
  }
  return failed;
}

function ledger() {
  const rows = readFileSync(join(STORY, 'ledger.md'), 'utf8')
    .split('\n')
    .filter((l) => /^\|\s*S\d+/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()))
    .map((c) => ({ fact: c[1], grade: c[2], kind: c[3], status: c.at(-2) }));
  const facts = [
    ...readFileSync(join(STORY, 'truth.md'), 'utf8').matchAll(/^### (S\d+)\. (.+)$/gm),
  ];
  let thin = 0;
  for (const [, id, title] of facts) {
    const mine = rows.filter((r) => r.fact === id);
    const live = mine.filter((r) => r.status === 'shipped').length;
    const kinds = new Set(mine.map((r) => r.kind)).size;
    const keys = mine.filter((r) => r.grade === 'key').length;
    const flags = [
      kinds < 3 ? 'needs 3 kinds of surface' : '',
      keys > 1 ? 'more than one key' : '',
    ].filter(Boolean);
    if (flags.length) thin += 1;
    console.log(
      `${id}  ${String(mine.length).padStart(2)} clues (${live} shipped), ${kinds} kinds, ${keys} key  ${title}${flags.length ? `  <- ${flags.join('; ')}` : ''}`,
    );
  }
  console.log(
    `\n${thin} of ${facts.length} facts are not yet findable. That is fine for a sealed chapter and a gap for an open one (arc.md).`,
  );
}

function fact(id) {
  const truth = readFileSync(join(STORY, 'truth.md'), 'utf8');
  const start = truth.search(new RegExp(`^### ${id}\\. `, 'm'));
  if (!/^S\d+$/.test(id ?? '') || start < 0) {
    console.log(
      `No fact ${id}. Facts: ${[...truth.matchAll(/^### (S\d+)\. /gm)].map((m) => m[1]).join(' ')}`,
    );
    process.exit(2);
  }
  const rest = truth.slice(start + 4);
  const end = rest.search(/^##+ /m);
  console.log(`### ${(end < 0 ? rest : rest.slice(0, end)).trim()}\n`);
  const rows = readFileSync(join(STORY, 'ledger.md'), 'utf8')
    .split('\n')
    .filter(
      (l) =>
        new RegExp(`^\\|\\s*${id}\\b`).test(l) ||
        new RegExp(`\\|[^|]*\\b${id}\\b[^|]*\\|\\s*[^|]*\\|\\s*$`).test(l),
    );
  console.log(rows.length ? `Ledger rows:\n${rows.join('\n')}` : 'No ledger rows yet.');
  const leads = truth
    .split('\n')
    .filter((l) => l.startsWith('|') && new RegExp(`\\b${id}\\b`).test(l));
  if (leads.length)
    console.log(
      `\nPlanned false leads (a reader who suspects one of these is on track):\n${leads.join('\n')}`,
    );
  const saved = readFileSync(join(STORY, 'arc.md'), 'utf8')
    .split('\n')
    .filter((l) => /^\|\s*B\d/.test(l))
    .map((l) => `- ${l.split('|')[4].trim()}`);
  console.log(`\nImages saved for beats (do not use, for any fact):\n${saved.join('\n')}`);
}

let failed = false;
if (args.includes('--fact')) {
  fact(args[args.indexOf('--fact') + 1]);
  process.exit(0);
} else if (args.includes('--ledger')) {
  ledger();
} else if (args.includes('--content')) {
  scan(contentTexts(), { strict: false });
  failed = ration();
} else if (args.includes('--changed')) {
  const texts = changedTexts();
  failed = scan(texts, { strict: true });
  failed = ration() || failed;
  console.log(`${texts.length} added text value(s) checked.`);
} else if (args.length > 0 && !args.some((x) => x.startsWith('-'))) {
  const texts = draftTexts(args);
  failed = scan(texts, { strict: true });
  console.log(`${texts.length} draft line(s) checked.`);
} else {
  console.log(
    'Usage: node .claude/skills/lore/check.mjs <draft files> | --changed | --content | --ledger | --fact S05',
  );
  process.exit(2);
}
if (failed) process.exit(1);
console.log('ok');
