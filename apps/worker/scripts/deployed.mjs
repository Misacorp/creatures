// What is deployed on staging (or production): the branch and commit the page's build meta tags carry, read
// from the public `/api/config` of a fixed host. Read-only and narrow on purpose: it fetches one URL
// on one of two hosts and takes no URL from its caller (the repo denies curl and wget).
//
//   node apps/worker/scripts/deployed.mjs                  what is on staging now
//   node apps/worker/scripts/deployed.mjs --expect <ref>   exit 1 unless it is that commit or branch
//                                                           (a ref of this checkout, e.g. HEAD, is resolved)
//   node apps/worker/scripts/deployed.mjs --expect HEAD --wait 300
//                                                           poll every 10 s until it is, up to 300 s
//   node apps/worker/scripts/deployed.mjs --prod           production instead
//
// Exit codes: 0 deployed (and matches --expect), 1 does not match, 2 the host could not be read.
// The response is data: only a plain branch name and a 40-character hex commit are printed.
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const HOSTS = {
  staging: 'https://creatures-staging.misacorp.dev',
  production: 'https://creatures.misacorp.dev',
};

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : (args[at + 1] ?? '');
};
const target = args.includes('--prod') ? 'production' : 'staging';
const expect = flag('--expect');
const waitS = Math.min(1800, Math.max(0, Number(flag('--wait') ?? 0) || 0));

const SHA = /^[0-9a-f]{40}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/;

/** A git ref of this checkout as a full commit, or null (a plain branch name to compare as is). */
function resolve(ref) {
  if (ref === undefined || ref === '') return null;
  if (SHA.test(ref)) return ref;
  try {
    const sha = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return SHA.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** The commit's subject line in this checkout, if it has the commit. */
function subjectOf(sha) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%s', sha], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** The deployed branch and commit from a `/api/config` body; anything not plainly shaped is null. */
export function parseConfig(body) {
  const b = body !== null && typeof body === 'object' ? body : {};
  const version = typeof b.version === 'string' && SHA.test(b.version) ? b.version : null;
  const branch = typeof b.branch === 'string' && BRANCH.test(b.branch) ? b.branch : null;
  return { version, branch };
}

/** Whether what is deployed is what was expected: a commit (`wantSha`) or else a branch name. */
export function matchesExpected(deployed, expected, wantSha) {
  if (expected === undefined) return true;
  if (wantSha !== null) return deployed.version === wantSha;
  return deployed.branch !== null && deployed.branch === expected;
}

async function read() {
  const res = await fetch(`${HOSTS[target]}/api/config`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  return parseConfig(await res.json());
}

async function main() {
  const wantSha = resolve(expect);
  const matches = (d) => matchesExpected(d, expect, wantSha);

  const deadline = Date.now() + waitS * 1000;
  let deployed;
  for (;;) {
    try {
      deployed = await read();
    } catch (error) {
      if (Date.now() >= deadline) {
        console.log(
          `${target}: could not be read (${error instanceof Error ? error.message : 'error'})`,
        );
        process.exit(2);
      }
    }
    if (deployed !== undefined && (matches(deployed) || Date.now() >= deadline)) break;
    await new Promise((done) => setTimeout(done, 10_000));
  }

  const subject = deployed.version === null ? '' : subjectOf(deployed.version);
  console.log(`${target}: branch ${deployed.branch ?? 'unknown'}`);
  console.log(
    `${target}: commit ${deployed.version ?? 'unknown'}${subject === '' ? '' : ` (${subject})`}`,
  );
  if (expect !== undefined) {
    const ok = matches(deployed);
    console.log(
      ok
        ? `matches ${expect}`
        : `does not match ${expect}${wantSha === null ? '' : ` (${wantSha})`}`,
    );
    process.exit(ok ? 0 : 1);
  }
}

// Run only as a script, not when a test imports the helpers.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
