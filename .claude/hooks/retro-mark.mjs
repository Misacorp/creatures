#!/usr/bin/env node
// SessionEnd hook (matcher "clear"): remembers where the closing session's transcript is, so the fresh
// session that /clear starts can offer a retro of it (retro-nudge.mjs). Writes only a path and a time,
// under ~/.claude/retro-pending/ (outside the repo). Never fails the session: any error is ignored.
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

try {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  const input = JSON.parse(raw);
  if (typeof input.transcript_path === 'string' && typeof input.cwd === 'string') {
    const dir = join(homedir(), '.claude', 'retro-pending');
    mkdirSync(dir, { recursive: true });
    const slug = input.cwd.replace(/[^A-Za-z0-9]+/g, '-');
    writeFileSync(
      join(dir, `${slug}.json`),
      JSON.stringify({ transcript: input.transcript_path, at: new Date().toISOString() }),
    );
  }
} catch {
  // A hook must never break the session.
}
