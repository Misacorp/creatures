#!/usr/bin/env node
// SessionStart hook (matcher "compact|clear"): reminds Claude to offer a /retro of the stretch that the
// compaction or /clear just closed, if it has none yet. It only adds a line of context; it never runs
// the retro or blocks anything. After /clear it reads the path retro-mark.mjs left for this project.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

/** How long a /clear's note stays useful. */
const PENDING_MS = 24 * 60 * 60 * 1000;

function context(transcript, segment) {
  return [
    'Retro reminder (from the retro-nudge hook, not from Misa):',
    `the stretch of session work just closed may have no retro yet (transcript: ${transcript}, digest with --segment ${segment}).`,
    'If docs/retros/ has no retro covering it, offer Misa once, in one short line, to run /retro on it.',
    'Do not run it unasked, and do not repeat the offer.',
  ].join(' ');
}

try {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  const input = JSON.parse(raw);
  let text = null;
  if (input.source === 'compact' && typeof input.transcript_path === 'string') {
    // The same transcript continues: the stretch before the compaction is the previous segment.
    text = context(input.transcript_path, 'previous');
  } else if (input.source === 'clear' && typeof input.cwd === 'string') {
    const slug = input.cwd.replace(/[^A-Za-z0-9]+/g, '-');
    const file = join(homedir(), '.claude', 'retro-pending', `${slug}.json`);
    if (existsSync(file)) {
      const note = JSON.parse(readFileSync(file, 'utf8'));
      rmSync(file, { force: true });
      const fresh = Date.now() - Date.parse(note.at) < PENDING_MS;
      if (fresh && typeof note.transcript === 'string') text = context(note.transcript, 'current');
    }
  }
  if (text !== null) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
      }),
    );
  }
} catch {
  // A hook must never break the session.
}
