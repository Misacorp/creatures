#!/usr/bin/env node
// SessionStart hook: makes the owner the author of this checkout's commits, so a squash merge on GitHub
// adds no "Co-authored-by" line for an agent identity (CLAUDE.md, Pull requests). Sets the repository-local
// author.name and author.email from .claude/owner.json (github, commitEmail). The committer stays the
// session's own identity (user.name, user.email), so a cloud session's commits keep their verified
// signature. Worktrees share it (`--local` writes the common config). Clears a local user.* that an
// earlier version set to the owner. Does nothing without a valid email. Never fails the session.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** { name, email } from the owner file, or null when it has no usable commit email. */
export function identityFrom(owner) {
  const email = owner?.commitEmail;
  if (typeof email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+$/.test(email)) return null;
  const name = typeof owner.github === 'string' ? owner.github.trim() : '';
  return { name, email };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  const input = JSON.parse(raw || '{}');
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const who = identityFrom(readJson(join(root, '.claude', 'owner.json')));
  if (!who) return;
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const current = (key) => {
    try {
      return git('config', '--local', '--get', key).trim();
    } catch {
      return '';
    }
  };
  if (current('author.email') !== who.email) git('config', '--local', 'author.email', who.email);
  if (who.name && current('author.name') !== who.name)
    git('config', '--local', 'author.name', who.name);
  // An earlier version made the owner the committer too; give that back to the session.
  if (current('user.email') === who.email) {
    git('config', '--local', '--unset', 'user.email');
    if (current('user.name') === who.name) git('config', '--local', '--unset', 'user.name');
  }
}

if (process.argv[1]?.endsWith('git-identity.mjs')) {
  main().catch(() => {
    // A hook must never break the session.
  });
}
