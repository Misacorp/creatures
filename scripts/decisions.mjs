#!/usr/bin/env node
// `pnpm decisions <command>`: query, add and check the design decisions in docs/design/decisions/.
// Plain Node, no dependencies. Run `pnpm decisions help` for the commands. The pure logic is in
// decisions-lib.mjs; every command takes the repo root (`--root`, default: this repo) so tests can
// run on a temp directory.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  DIR,
  LEGACY_FILE,
  STUB,
  TODO_MARK,
  UserError,
  assignIds,
  bodyHash,
  buildPlan,
  changedFiles,
  finalise,
  isCurrent,
  loadState,
  makeId,
  parseLegacy,
  readText,
  renderEntry,
  usedIds,
  writeFileMaking,
  writePlan,
} from './decisions-lib.mjs';

const VALUE_FLAGS = new Set([
  'root',
  'topic',
  'title',
  'date',
  'supersedes',
  'amends',
  'from',
  'assign',
  'assign-file',
]);
const BOOL_FLAGS = new Set(['all', 'misa', 'quiet', 'dry-run']);

const USAGE = `Usage: pnpm decisions <command>

  topics                          topics with their counts
  list [--topic t] [--all]        current entries (--all: superseded too)
  show <id or heading>...         full entries
  search <regex> [--topic t] [--all]
  new --topic t --title "..." [--date YYYY-MM-DD] [--supersedes a,b] [--amends c] [--misa]
  fix [--quiet]                   sort, fill ids, derive statuses, rewrite README.md
  check                           what CI runs; never writes
  migrate [--from <file|git ref>] [--assign 1=gear,2=ui | --assign-file f.json] [--dry-run]
                                  move entries from the old docs/design/decisions.md

Every command accepts --root <dir> (default: this repository).`;

/** Splits argv into { positionals, flags }. */
export function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (BOOL_FLAGS.has(name)) flags[name] = true;
    else if (VALUE_FLAGS.has(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new UserError(`--${name} needs a value.`);
      flags[name] = value;
    } else throw new UserError(`Unknown option --${name}. Try: pnpm decisions help`);
  }
  return { positionals, flags };
}

const splitList = (value) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------------------------
// Queries

/** Every entry as { entry, topic, file, current } in topic order, current first. */
function listEntries(plan) {
  const result = [];
  for (const topic of plan.topics) {
    for (const entry of plan.sortedByTopic.get(topic.id)) {
      result.push({
        entry,
        topic,
        file: `${DIR}/${topic.id}.md`,
        current: isCurrent(plan.infoOf(entry)),
      });
    }
  }
  return result;
}

function requireTopic(plan, id) {
  if (id !== undefined && !plan.topics.some((t) => t.id === id)) {
    throw new UserError(
      `Unknown topic "${id}". Topics: ${plan.topics.map((t) => t.id).join(', ')}.`,
    );
  }
}

function cmdTopics(ctx) {
  const plan = buildPlan(ctx.root);
  for (const topic of plan.topics) {
    const entries = plan.sortedByTopic.get(topic.id);
    const current = entries.filter((e) => isCurrent(plan.infoOf(e))).length;
    ctx.out(
      `${topic.id}  ${topic.title}  ${current} current, ${entries.length - current} superseded`,
    );
  }
  return 0;
}

function cmdList(ctx, args) {
  const plan = buildPlan(ctx.root);
  requireTopic(plan, args.flags.topic);
  for (const { entry, topic, current } of listEntries(plan)) {
    if (args.flags.topic && topic.id !== args.flags.topic) continue;
    if (!current && !args.flags.all) continue;
    ctx.out(`${entry.date}  ${entry.id}  ${entry.title}`);
  }
  return 0;
}

/** The entries a query names: an id, else an exact heading or title, else a substring. */
function findEntries(items, query) {
  const q = query.replace(/^#+\s*/, '').trim();
  const lower = q.toLowerCase();
  const byId = items.filter((i) => i.entry.id === q);
  if (byId.length) return byId;
  const exact = items.filter(
    (i) =>
      `${i.entry.date}: ${i.entry.title}`.toLowerCase() === lower ||
      i.entry.title.toLowerCase() === lower,
  );
  if (exact.length) return exact;
  return items.filter((i) => `${i.entry.date}: ${i.entry.title}`.toLowerCase().includes(lower));
}

function cmdShow(ctx, args) {
  if (!args.positionals.length)
    throw new UserError('Usage: pnpm decisions show <id or heading>...');
  const plan = buildPlan(ctx.root);
  const items = listEntries(plan);
  let code = 0;
  for (const query of args.positionals) {
    const found = findEntries(items, query);
    if (found.length === 0) {
      ctx.err(`No entry matches "${query}".`);
      code = 1;
    } else if (found.length > 1) {
      ctx.err(`"${query}" matches ${found.length} entries; be more specific (use an id):`);
      for (const f of found) ctx.err(`  ${f.entry.id}  ${f.entry.title}`);
      code = 1;
    } else {
      const { entry, file } = found[0];
      ctx.out(`${file}\n\n${renderEntry(entry, plan.statusOf(entry))}\n`);
    }
  }
  return code;
}

function cmdSearch(ctx, args) {
  if (args.positionals.length !== 1) throw new UserError('Usage: pnpm decisions search <regex>');
  let re;
  try {
    re = new RegExp(args.positionals[0], 'i');
  } catch {
    throw new UserError(`"${args.positionals[0]}" is not a valid regular expression.`);
  }
  const plan = buildPlan(ctx.root);
  requireTopic(plan, args.flags.topic);
  for (const { entry, topic, file, current } of listEntries(plan)) {
    if (args.flags.topic && topic.id !== args.flags.topic) continue;
    if (!current && !args.flags.all) continue;
    const lines = entry.body.split('\n').filter((l) => re.test(l));
    if (!re.test(entry.title) && lines.length === 0) continue;
    ctx.out(`${file}  ${entry.id}  ${entry.title}`);
    for (const line of lines) ctx.out(`  ${line.trim().slice(0, 200)}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------
// Writing

/** Today's date in Helsinki as YYYY-MM-DD. */
export function todayHelsinki(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function printProblems(ctx, problems) {
  for (const p of problems) ctx.err(`problem: ${p}`);
}

function cmdFix(ctx, args) {
  const plan = buildPlan(ctx.root);
  const changed = writePlan(ctx.root, plan);
  if (args.flags.quiet) {
    if (changed.length) ctx.out(`updated: ${changed.join(', ')}`);
  } else {
    for (const rel of changed) ctx.out(`updated ${rel}`);
  }
  printProblems(ctx, plan.problems);
  return plan.problems.length ? 1 : 0;
}

function cmdNew(ctx, args) {
  const { topic: topicId, title: rawTitle } = args.flags;
  if (!topicId || !rawTitle) throw new UserError('new needs --topic and --title.');
  const state = loadState(ctx.root);
  if (!state.topics.some((t) => t.id === topicId)) {
    throw new UserError(
      `Unknown topic "${topicId}". Topics: ${state.topics.map((t) => t.id).join(', ')}.`,
    );
  }
  const date = args.flags.date ?? todayHelsinki();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new UserError(`--date must be a real date like 2026-10-28, not "${date}".`);
  }
  let title = rawTitle.replace(/\s+/g, ' ').trim();
  if (!title) throw new UserError('--title is empty.');
  if (args.flags.misa && !title.includes('**[Misa]**')) title += ' **[Misa]**';
  assignIds(state);
  const used = usedIds(state);
  const supersedes = splitList(args.flags.supersedes);
  const amends = splitList(args.flags.amends);
  for (const id of [...supersedes, ...amends]) {
    if (!used.has(id)) throw new UserError(`Unknown entry id "${id}".`);
  }
  const id = makeId(date, title, used);
  state.byTopic.get(topicId).unshift({
    date,
    title,
    id,
    supersedes,
    amends,
    body: `**Decision.** ${TODO_MARK}\n\n**Reasoning.**`,
  });
  const plan = finalise(state);
  writePlan(ctx.root, plan);
  ctx.out(`${DIR}/${topicId}.md`);
  ctx.out(id);
  printProblems(ctx, plan.problems);
  return plan.problems.length ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Check

/** Problems with the legacy.json file, or [] when it is fine. */
function legacyProblems(root) {
  const path = join(root, DIR, 'legacy.json');
  if (!existsSync(path)) return [`${DIR}/legacy.json is missing.`];
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const ok =
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      Object.values(data).every((v) => v && typeof v.id === 'string' && typeof v.hash === 'string');
    return ok ? [] : [`${DIR}/legacy.json has the wrong shape.`];
  } catch {
    return [`${DIR}/legacy.json is not valid JSON.`];
  }
}

function stubProblems(root) {
  const path = join(root, LEGACY_FILE);
  if (!existsSync(path)) return [`${LEGACY_FILE} is missing (it must be the stub).`];
  const text = readText(path);
  if (text === STUB) return [];
  if (/^#{2,3} \d{4}-\d{2}-\d{2}: /m.test(text) || /^<{7}/m.test(text)) {
    return [
      `this branch still has entries in the old file ${LEGACY_FILE}: run \`pnpm decisions migrate\`.`,
    ];
  }
  return [`${LEGACY_FILE} is not the stub; run \`pnpm decisions migrate\` to restore it.`];
}

function cmdCheck(ctx) {
  const problems = [];
  let plan;
  try {
    plan = buildPlan(ctx.root);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    plan = null;
    problems.push(e.message);
  }
  if (plan) {
    problems.push(...plan.problems);
    for (const rel of plan.missingFiles)
      problems.push(`${rel} is missing (topic is in topics.json).`);
    for (const [topic, entries] of plan.byTopic) {
      for (const e of entries) {
        if (e.body.includes(TODO_MARK)) {
          problems.push(
            `${DIR}/${topic}.md: ${e.id} still has the TODO placeholder; write the entry.`,
          );
        }
      }
    }
    const changed = changedFiles(ctx.root, plan);
    if (changed.length) {
      problems.push(`out of date, run \`pnpm decisions fix\`: ${changed.join(', ')}`);
    }
  }
  problems.push(...stubProblems(ctx.root), ...legacyProblems(ctx.root));
  if (problems.length === 0) {
    ctx.out(`decisions ok: ${plan.all.length} entries in ${plan.topics.length} topics.`);
    return 0;
  }
  printProblems(ctx, problems);
  return 1;
}

// ---------------------------------------------------------------------------------------------
// Migrate

function gitShow(root, ref) {
  if (ref.startsWith('-')) throw new UserError(`"${ref}" is not a file or a git ref.`);
  try {
    return execFileSync('git', ['show', `${ref}:${LEGACY_FILE}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).replace(/\r\n/g, '\n');
  } catch {
    throw new UserError(`Cannot read ${LEGACY_FILE} from "${ref}" (not a file, not a git ref?).`);
  }
}

/** Where the legacy entries come from: { text, label }. */
function readMigrationSource(ctx, from) {
  if (from) {
    const path = resolve(ctx.cwd, from);
    if (existsSync(path) && statSync(path).isFile()) {
      return { text: readText(path), label: `file ${from}` };
    }
    return { text: gitShow(ctx.root, from), label: `git ref ${from}` };
  }
  const path = join(ctx.root, LEGACY_FILE);
  const text = existsSync(path) ? readText(path) : null;
  if (text !== null && !/^<{7}/m.test(text)) return { text, label: `working tree ${LEGACY_FILE}` };
  return {
    text: gitShow(ctx.root, 'HEAD'),
    label: `git HEAD (the working-tree file is ${text === null ? 'missing' : 'in conflict'})`,
  };
}

function readAssignments(ctx, args) {
  const map = new Map();
  const add = (n, topic) => map.set(String(n), String(topic));
  if (args.flags.assign) {
    for (const part of splitList(args.flags.assign)) {
      const m = /^(\d+)=([a-z][a-z0-9-]*)$/.exec(part);
      if (!m) throw new UserError(`Bad --assign part "${part}"; use number=topic.`);
      add(m[1], m[2]);
    }
  }
  if (args.flags['assign-file']) {
    const path = resolve(ctx.cwd, args.flags['assign-file']);
    let data;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      throw new UserError(`Cannot read ${args.flags['assign-file']} as JSON.`);
    }
    for (const [n, topic] of Object.entries(data ?? {})) add(n, topic);
  }
  return map;
}

function readLegacyJson(root) {
  const path = join(root, DIR, 'legacy.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new UserError(`${DIR}/legacy.json is not valid JSON; restore it from git.`);
  }
}

/** Sorts the source entries into skip, update, conflict and new. */
function classify(source, legacy, state) {
  const byId = new Map();
  const byHeading = new Map();
  for (const entries of state.byTopic.values()) {
    for (const e of entries) {
      byId.set(e.id, e);
      if (!byHeading.has(`${e.date}: ${e.title}`)) byHeading.set(`${e.date}: ${e.title}`, e);
    }
  }
  const result = { skipped: 0, updates: [], conflicts: [], fresh: [], ids: new Map() };
  for (const src of source) {
    const old = legacy?.[src.heading];
    if (old && old.hash === src.hash) {
      result.skipped++;
    } else if (old) {
      const target = byId.get(old.id);
      if (!target)
        result.conflicts.push({ src, why: `entry ${old.id} is gone from the topic files` });
      else if (bodyHashOf(target) === src.hash) result.skipped++;
      else if (bodyHashOf(target) === old.hash) result.updates.push({ src, target });
      else result.conflicts.push({ src, target, why: 'both sides changed it' });
    } else if (byHeading.has(src.heading)) {
      result.ids.set(src.heading, byHeading.get(src.heading).id);
      result.skipped++;
    } else {
      result.fresh.push(src);
    }
  }
  return result;
}

const bodyHashOf = (entry) => bodyHash(entry.body);

function cmdMigrate(ctx, args) {
  const { text, label } = readMigrationSource(ctx, args.flags.from);
  ctx.out(`Reading old decisions from ${label}.`);
  const source = parseLegacy(text);
  const legacy = readLegacyJson(ctx.root);
  const state = loadState(ctx.root);
  assignIds(state);
  const found = classify(source, legacy, state);

  if (legacy && source.length) {
    const inSource = new Set(source.map((s) => s.heading));
    const gone = Object.keys(legacy).filter((h) => !inSource.has(h));
    if (gone.length) {
      ctx.out(
        `Note: ${gone.length} migrated entries are not in the source (fine if it is the stub), e.g. ${gone[0]}`,
      );
    }
  }

  const assignments = readAssignments(ctx, args);
  const topicIds = state.topics.map((t) => t.id);
  for (const [n, topic] of assignments) {
    if (!topicIds.includes(topic)) {
      throw new UserError(
        `Unknown topic "${topic}" for entry ${n}. Topics: ${topicIds.join(', ')}.`,
      );
    }
    if (!(Number(n) >= 1 && Number(n) <= found.fresh.length)) {
      throw new UserError(`There is no new entry number ${n} (1-${found.fresh.length}).`);
    }
  }
  const unassigned = found.fresh.filter((_, i) => !assignments.has(String(i + 1)));
  if (unassigned.length) {
    ctx.err(`${found.fresh.length} new entries need a topic:`);
    found.fresh.forEach((f, i) => ctx.err(`${i + 1}. ${f.heading}`));
    ctx.err(`Topics: ${topicIds.join(', ')}`);
    ctx.err(
      `Nothing was changed. Rerun with an answer for every number, for example:\n  pnpm decisions migrate --assign ${found.fresh.map((_, i) => `${i + 1}=<topic>`).join(',')}`,
    );
    return 1;
  }

  // Apply: edits to existing entries, then new entries (prepended in source order, so a later
  // entry of the same date ends up above an earlier one).
  for (const { src, target } of found.updates) target.body = src.body;
  const used = usedIds(state);
  found.fresh.forEach((src, i) => {
    const id = makeId(src.date, src.title, used);
    found.ids.set(src.heading, id);
    state.byTopic.get(assignments.get(String(i + 1))).unshift({
      date: src.date,
      title: src.title,
      id,
      supersedes: [],
      amends: [],
      body: src.body,
    });
  });

  const plan = finalise(state);
  const stubChanged =
    !existsSync(join(ctx.root, LEGACY_FILE)) || readText(join(ctx.root, LEGACY_FILE)) !== STUB;
  const writeLegacy = legacy === null && source.length > 0;
  const summary =
    `${found.fresh.length} new, ${found.updates.length} updated, ${found.skipped} already migrated, ` +
    `${found.conflicts.length} in conflict.`;
  if (args.flags['dry-run']) {
    ctx.out(`Dry run, nothing written: ${summary}`);
    return found.conflicts.length ? 1 : 0;
  }

  const written = writePlan(ctx.root, plan);
  if (writeLegacy) {
    const data = {};
    for (const s of source) {
      data[s.heading] = { id: found.ids.get(s.heading), hash: s.hash };
    }
    writeFileMaking(ctx.root, `${DIR}/legacy.json`, `${JSON.stringify(data, null, 2)}\n`);
    written.push(`${DIR}/legacy.json`);
  }
  if (stubChanged) {
    writeFileMaking(ctx.root, LEGACY_FILE, STUB);
    written.push(LEGACY_FILE);
  }
  ctx.out(`Migrated: ${summary}`);
  for (const rel of written) ctx.out(`updated ${rel}`);
  printProblems(ctx, plan.problems);
  for (const c of found.conflicts) {
    ctx.err(`CONFLICT: "${c.src.heading}": ${c.why}. Merge it by hand in the topic file.`);
    ctx.err(`The branch's version of the body is:\n${c.src.body}\n(end of the branch's version)`);
  }
  ctx.out(
    `Next: git add ${LEGACY_FILE} ${DIR}/ and finish the merge or commit. Then run pnpm decisions check.`,
  );
  return found.conflicts.length || plan.problems.length ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------

const COMMANDS = {
  topics: cmdTopics,
  list: cmdList,
  show: cmdShow,
  search: cmdSearch,
  new: cmdNew,
  fix: cmdFix,
  check: cmdCheck,
  migrate: cmdMigrate,
};

/**
 * Runs the CLI. `io` is { out, err, cwd }; returns the exit code. Used by the entry point below
 * and directly by the tests.
 */
export function run(argv, io) {
  const ctx = { out: io.out, err: io.err, cwd: io.cwd, root: '' };
  try {
    const [command = 'help', ...rest] = argv;
    const handler = COMMANDS[command];
    if (!handler) {
      (command === 'help' || command === '--help' ? ctx.out : ctx.err)(USAGE);
      return command === 'help' || command === '--help' ? 0 : 1;
    }
    const args = parseArgs(rest);
    ctx.root = resolve(
      io.cwd,
      args.flags.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'),
    );
    return handler(ctx, args);
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    ctx.err(e.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), {
    out: (s) => console.log(s),
    err: (s) => console.error(s),
    cwd: process.cwd(),
  });
}
