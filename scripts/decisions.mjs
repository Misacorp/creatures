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
  formatProblem,
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
const BOOL_FLAGS = new Set(['all', 'misa', 'quiet', 'dry-run', 'help']);

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
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1)); // Everything after -- is a plain argument.
      break;
    }
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

/** True for a real calendar date written YYYY-MM-DD (2026-02-31 is not). */
export function isRealDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

/** Today's date in Helsinki as YYYY-MM-DD. */
export function todayHelsinki(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Stops a command that would write when a topic file has problems fix cannot repair. */
function refuseIfBroken(state) {
  if (state.fatal > 0) {
    throw new UserError(`Nothing was written. Fix these first:\n${state.problems.join('\n')}`);
  }
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
  refuseIfBroken(state);
  if (!state.topics.some((t) => t.id === topicId)) {
    throw new UserError(
      `Unknown topic "${topicId}". Topics: ${state.topics.map((t) => t.id).join(', ')}.`,
    );
  }
  const date = args.flags.date ?? todayHelsinki();
  if (!isRealDate(date)) {
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

const MARKER_LINE = /^(<{7}|\|{7}|>{7})( .*)?$|^={7}$/;
const STUB_FIRST_LINE = STUB.split('\n')[0];

function gitOut(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * The last old-format version of the file reachable from `start` along first parents:
 * { sha, text, label }, or null if there is none (or no git).
 */
function lastOldFormat(root, start) {
  let shas;
  try {
    shas = gitOut(root, [
      'rev-list',
      '--first-parent',
      '--max-count=1000',
      start,
      '--',
      LEGACY_FILE,
    ])
      .split('\n')
      .filter(Boolean);
  } catch {
    return null; // Not a git repository, or no commits yet.
  }
  for (const sha of shas) {
    let text;
    try {
      text = gitShow(root, sha);
    } catch {
      continue; // The file does not exist in this commit.
    }
    if (text.startsWith(STUB_FIRST_LINE)) continue;
    return { sha, text, label: `commit ${gitOut(root, ['log', '-1', '--format=%h %s', sha])}` };
  }
  return null;
}

/**
 * The old file as it was where the branch left main: the last old-format version at the merge
 * base of `sha` and the other side (the merge in progress, the merge parent, or origin/main).
 * Returns Map heading -> body hash, or null when no base can be found.
 */
function findBaseHashes(root, sha) {
  if (!sha) return null;
  for (const other of ['MERGE_HEAD', 'HEAD^2', 'origin/main']) {
    let base;
    try {
      base = gitOut(root, ['merge-base', sha, other]);
    } catch {
      continue;
    }
    const version = lastOldFormat(root, base);
    if (version) return new Map(parseLegacy(version.text).map((e) => [e.heading, e.hash]));
  }
  return null;
}

/** Parses an old-format text; an unclosed code fence would swallow later entries, so stop. */
function parseSource(text, name) {
  const problems = [];
  const entries = parseLegacy(text, problems);
  if (problems.length) throw new UserError(formatProblem(problems[0], name));
  return entries;
}

/**
 * Where the legacy entries come from: { entries, labels, base }. `base` maps each heading to its
 * body hash in the version the branch started from (null when unknown). With --from, one file or
 * git ref. Without: the branch's own last old-format commit (reliable, unlike a merged
 * working-tree file) plus entries that exist only in the working-tree file (appended after the
 * merge).
 */
function readMigrationSource(ctx, from) {
  if (from) {
    const path = resolve(ctx.cwd, from);
    if (existsSync(path) && statSync(path).isFile()) {
      return { entries: parseSource(readText(path), from), labels: [`file ${from}`], base: null };
    }
    const entries = parseSource(gitShow(ctx.root, from), `${from}:${LEGACY_FILE}`);
    let sha = null;
    try {
      sha = gitOut(ctx.root, ['rev-parse', '--verify', '-q', `${from}^{commit}`]);
    } catch {
      // Not a commit; no base.
    }
    return { entries, labels: [`git ref ${from}`], base: findBaseHashes(ctx.root, sha) };
  }
  const entries = [];
  const labels = [];
  const primary = lastOldFormat(ctx.root, 'HEAD');
  if (primary) {
    entries.push(...parseSource(primary.text, `${primary.sha.slice(0, 7)}:${LEGACY_FILE}`));
    labels.push(primary.label);
  }
  const path = join(ctx.root, LEGACY_FILE);
  if (existsSync(path)) {
    const clean = readText(path)
      .split('\n')
      .filter((l) => !MARKER_LINE.test(l))
      .join('\n');
    const have = new Set(entries.map((e) => e.heading));
    const extra = parseSource(clean, LEGACY_FILE).filter((e) => !have.has(e.heading));
    if (extra.length) {
      entries.push(...extra);
      labels.push(`working tree ${LEGACY_FILE} (${extra.length} entries not in the commit)`);
    }
  }
  return { entries, labels, base: findBaseHashes(ctx.root, primary?.sha ?? null) };
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
function classify(source, legacy, state, base) {
  const byId = new Map();
  const byHeading = new Map();
  for (const entries of state.byTopic.values()) {
    for (const e of entries) {
      byId.set(e.id, e);
      if (!byHeading.has(`${e.date}: ${e.title}`)) byHeading.set(`${e.date}: ${e.title}`, e);
    }
  }
  const result = { skipped: 0, updates: [], conflicts: [], unknown: [], fresh: [], ids: new Map() };
  for (const src of source) {
    const old = legacy?.[src.heading];
    if (old && old.hash === src.hash) {
      result.skipped++;
    } else if (old) {
      const target = byId.get(old.id);
      if (!target) {
        result.conflicts.push({ src, why: `entry ${old.id} is gone from the topic files` });
      } else if (bodyHashOf(target) === src.hash) {
        result.skipped++; // Already applied.
      } else if (!base) {
        result.unknown.push({ src, target });
      } else if (base.get(src.heading) === src.hash) {
        result.skipped++; // The branch did not touch it: the difference is main's own edit.
      } else if (base.get(src.heading) === old.hash && bodyHashOf(target) === old.hash) {
        result.updates.push({ src, target });
      } else {
        result.conflicts.push({ src, target, why: 'both sides changed it' });
      }
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
  const { entries: source, labels, base } = readMigrationSource(ctx, args.flags.from);
  ctx.out(
    `Reading old decisions from ${labels.join(' and ') || 'nothing (no old version found)'}.`,
  );
  const legacy = readLegacyJson(ctx.root);
  const state = loadState(ctx.root);
  refuseIfBroken(state);
  assignIds(state);
  const found = classify(source, legacy, state, base);

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
    `${found.conflicts.length} in conflict, ${found.unknown.length} undecided.`;
  if (args.flags['dry-run']) {
    ctx.out(`Dry run, nothing written: ${summary}`);
    return found.conflicts.length || found.unknown.length ? 1 : 0;
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
  if (found.unknown.length) {
    ctx.err(
      `Could not tell whether your branch edited these (no common base found), so they were not applied; check by hand: ${found.unknown.map((u) => u.target.id).join(', ')}`,
    );
  }
  ctx.out(
    `Next: git add ${LEGACY_FILE} ${DIR}/ and finish the merge or commit. Then run pnpm decisions check.`,
  );
  return found.conflicts.length || found.unknown.length || plan.problems.length ? 1 : 0;
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
    const args = parseArgs(argv);
    const command = args.flags.help ? 'help' : (args.positionals.shift() ?? 'help');
    const handler = COMMANDS[command];
    if (!handler) {
      (command === 'help' ? ctx.out : ctx.err)(USAGE);
      return command === 'help' ? 0 : 1;
    }
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
