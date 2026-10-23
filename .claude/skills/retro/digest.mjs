#!/usr/bin/env node
// Retro digest: reads a Claude Code session transcript (JSON lines) and prints a short Markdown digest
// for the `retro` skill: the human's messages, permission denials, failed tool calls, hook feedback,
// compactions, subagent work, the most edited files and failing check output. Node only, no packages.
// Usage: node .claude/skills/retro/digest.mjs <session.jsonl> [--segment current|previous|all]
//        [--since <ISO>] [--until <ISO>] [--retros <dir>]
// The window: `current` (default) is everything since the latest compaction, `previous` the stretch
// between the last two compactions (what a compaction just summarised), `all` the whole transcript.
// Whatever an earlier retro of the same session already covered (its "Covers:" line in --retros,
// default docs/retros) is skipped, so each retro sees only what happened since the last one.
import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import process from 'node:process';

const args = process.argv.slice(2);
const path = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const segment = option('segment') ?? 'current';
if (path === undefined || !['current', 'previous', 'all'].includes(segment)) {
  console.error(
    'Usage: node .claude/skills/retro/digest.mjs <session.jsonl> [--segment current|previous|all] [--since <ISO>] [--until <ISO>] [--retros <dir>]',
  );
  process.exit(2);
}

/** Cuts text to one line of at most `max` characters, with obvious secrets masked. */
function clip(text, max = 220) {
  const flat = String(text)
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const masked = flat
    .replace(/\b(ghp|gho|ghs|github_pat|sk|xox[abpr])[-_A-Za-z0-9]{12,}/g, '[secret]')
    .replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g, '[long-token]');
  return masked.length > max ? `${masked.slice(0, max - 1)}…` : masked;
}

/** "10-23 14:05" from an ISO timestamp (UTC). */
const when = (ts) => (typeof ts === 'string' ? `${ts.slice(5, 10)} ${ts.slice(11, 16)}` : '?');

const textOf = (content) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter((b) => b && b.type === 'text')
          .map((b) => b.text)
          .join(' ')
      : '';

const resultText = (block) =>
  typeof block.content === 'string'
    ? block.content
    : Array.isArray(block.content)
      ? block.content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join(' ')
      : '';

const human = [];
const hooks = [];
const denials = [];
const errors = [];
const checks = [];
const agents = [];
const compactions = [];
const toolCounts = new Map();
const editCounts = new Map();
let followUps = 0;
let agentReports = 0;
let first = null;
let last = null;

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

/** Messages that look like the human's but are the harness talking. */
function classify(text) {
  if (text.startsWith('Stop hook feedback')) return 'hook';
  if (text.startsWith('This session is being continued')) return 'compaction';
  if (/^(\[SYSTEM NOTIFICATION|<task-notification|<local-command|<command-)/.test(text))
    return 'skip';
  if (text.startsWith('Another Claude session sent a message')) return 'agent';
  if (text.startsWith('Tool loaded') || text.startsWith('[Image:')) return 'skip';
  if (text.trim() === '') return 'skip';
  return 'human';
}

// Read every timestamped entry, then cut the window.
const entries = [];
const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
for await (const line of lines) {
  try {
    const entry = JSON.parse(line);
    if (typeof entry.timestamp === 'string') entries.push(entry);
  } catch {
    // A torn last line while the session is still writing: skip it.
  }
}
const sessionId = entries.find((e) => typeof e.sessionId === 'string')?.sessionId ?? 'unknown';
const boundaries = entries
  .filter((e) => e.type === 'system' && e.subtype === 'compact_boundary')
  .map((e) => e.timestamp);
let since = '';
let until = '\uffff';
if (segment === 'current' && boundaries.length > 0) since = boundaries.at(-1);
if (segment === 'previous' && boundaries.length > 0) {
  until = boundaries.at(-1);
  since = boundaries.length > 1 ? boundaries.at(-2) : '';
}
// Skip what an earlier retro of this session covered.
const retros = option('retros') ?? 'docs/retros';
if (existsSync(retros)) {
  for (const file of readdirSync(retros)) {
    if (!file.endsWith('.md')) continue;
    const text = readFileSync(join(retros, file), 'utf8');
    for (const m of text.matchAll(/Covers: (\S+) to (\S+) \(session ([\w-]+)\)/g)) {
      if (m[3] === sessionId && m[2] > since && m[2] < until) since = m[2];
    }
  }
}
since = option('since') ?? since;
until = option('until') ?? until;
let compactionsInWindow = 0;

for (const entry of entries) {
  const ts = entry.timestamp;
  if (ts < since || ts >= until) continue;
  first ??= ts;
  last = ts;
  if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
    compactionsInWindow += 1;
    compactions.push(when(ts));
  }
  const content = entry.message?.content;
  if (entry.type === 'user') {
    if (Array.isArray(content) && content.some((b) => b?.type === 'tool_result')) {
      for (const block of content) {
        if (block?.type !== 'tool_result') continue;
        const text = resultText(block);
        if (block.is_error === true) {
          if (/denied/i.test(text)) denials.push(`${when(ts)} ${clip(text, 180)}`);
          else errors.push(`${when(ts)} ${clip(text, 160)}`);
        } else if (/\b(FAIL|Tests\s+\d+ failed|AssertionError|ERR_PNPM)\b/.test(text)) {
          checks.push(
            `${when(ts)} ${clip(text.match(/.{0,80}(FAIL|failed|AssertionError|ERR_PNPM).{0,120}/s)?.[0] ?? text, 200)}`,
          );
        }
      }
      continue;
    }
    const text = textOf(content);
    const kind = classify(text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim());
    if (kind === 'human') human.push(`${when(ts)} ${clip(text, 400)}`);
    else if (kind === 'hook') hooks.push(`${when(ts)} ${clip(text, 140)}`);
    else if (kind === 'compaction') continue;
    else if (kind === 'agent') agentReports += 1;
  }
  if (entry.type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (block?.type !== 'tool_use') continue;
      bump(toolCounts, block.name);
      const input = block.input ?? {};
      if (block.name === 'Agent' || block.name === 'Task') {
        agents.push(`${when(ts)} ${clip(input.description ?? input.subagent_type ?? '?', 80)}`);
      }
      if (block.name === 'SendMessage') followUps += 1;
      if (
        (block.name === 'Edit' || block.name === 'Write') &&
        typeof input.file_path === 'string'
      ) {
        bump(editCounts, input.file_path.replace(/^.*?\/creatures\//, ''));
      }
    }
  }
}

const top = (map, n) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `- ${k}: ${String(v)}`);
const list = (items, max) => {
  const shown = items.slice(0, max).map((x) => `- ${x}`);
  if (items.length > max) shown.push(`- … ${String(items.length - max)} more`);
  return shown.length > 0 ? shown : ['- none'];
};

const out = [
  `# Retro digest`,
  '',
  `Transcript: ${path}`,
  `Window: ${segment}${option('since') || option('until') ? ' (with --since/--until)' : ''}; compactions in the whole transcript: ${String(boundaries.length)}`,
  `Covers: ${first ?? since} to ${last ?? until} (session ${sessionId})`,
  `(Copy the Covers line into the retro, so the next retro starts after it.)`,
  `Human messages: ${String(human.length)}; hook feedback: ${String(hooks.length)}; permission denials: ${String(denials.length)}; failed tool calls: ${String(errors.length)}; compactions: ${String(compactionsInWindow)}; subagents launched: ${String(agents.length)}, follow-up messages to them: ${String(followUps)}, reports back: ${String(agentReports)}`,
  '',
  `## The human's messages (in order)`,
  ...list(human, 400),
  '',
  `## Permission denials`,
  ...list(denials, 60),
  '',
  `## Failed tool calls (not denials)`,
  ...list(errors, 60),
  '',
  `## Failing checks seen in tool output`,
  ...list(checks, 40),
  '',
  `## Hook feedback`,
  ...list(hooks, 20),
  '',
  `## Compactions`,
  ...list(compactions, 20),
  '',
  `## Subagents launched`,
  ...list(agents, 80),
  '',
  `## Most edited files`,
  ...(editCounts.size > 0 ? top(editCounts, 20) : ['- none']),
  '',
  `## Tool use`,
  ...top(toolCounts, 25),
  '',
];
console.log(out.join('\n'));
