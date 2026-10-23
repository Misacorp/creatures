#!/usr/bin/env node
// Retro digest: reads a Claude Code session transcript (JSON lines) and prints a short Markdown digest
// for the `retro` skill: the human's messages, permission denials, failed tool calls, hook feedback,
// compactions, subagent work, the most edited files and failing check output. Node only, no packages.
// Usage: node .claude/skills/retro/digest.mjs <session.jsonl>
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import process from 'node:process';

const path = process.argv[2];
if (path === undefined) {
  console.error('Usage: node .claude/skills/retro/digest.mjs <session.jsonl>');
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

const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
for await (const line of lines) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  const ts = entry.timestamp;
  if (typeof ts === 'string') {
    first ??= ts;
    last = ts;
  }
  if (entry.type === 'system' && /compact/i.test(String(entry.subtype ?? ''))) {
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
    else if (kind === 'compaction') compactions.push(`${when(ts)} (summary handed over)`);
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
  `Span: ${first ?? '?'} to ${last ?? '?'} (UTC)`,
  `Human messages: ${String(human.length)}; hook feedback: ${String(hooks.length)}; permission denials: ${String(denials.length)}; failed tool calls: ${String(errors.length)}; compactions: ${String(compactions.length)}; subagents launched: ${String(agents.length)}, follow-up messages to them: ${String(followUps)}, reports back: ${String(agentReports)}`,
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
process.stdout.write(out.join('\n'));
