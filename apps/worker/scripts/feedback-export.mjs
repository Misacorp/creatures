// Opens one public GitHub issue per new player report (docs/design/feedback.md). Run by
// `.github/workflows/feedback.yml` with plain `node` (no dependencies).
//
// Environment: OPS_TOKEN_PRODUCTION and OPS_TOKEN_STAGING (each sent only to its own game host; an
// empty one skips that target), GH_TOKEN (the workflow's GITHUB_TOKEN, issues: write) and
// GITHUB_REPOSITORY. The job log is public: it shows counts and issue numbers, never report text.
import { LABELS, TARGETS, issueFor, markerOf, parseReport } from './feedback-issue.mjs';

const BASES = {
  production: 'https://creatures.misacorp.dev',
  staging: 'https://creatures-staging.misacorp.dev',
};
const GITHUB_API = 'https://api.github.com';
const TIMEOUT_MS = 30_000;

const { GH_TOKEN, GITHUB_REPOSITORY } = process.env;
const opsTokens = {
  production: process.env.OPS_TOKEN_PRODUCTION ?? '',
  staging: process.env.OPS_TOKEN_STAGING ?? '',
};

if (typeof GH_TOKEN !== 'string' || GH_TOKEN === '') {
  console.log('::error::GH_TOKEN is not set.');
  process.exit(1);
}
if (typeof GITHUB_REPOSITORY !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPOSITORY)) {
  console.log('::error::GITHUB_REPOSITORY is not set or malformed.');
  process.exit(1);
}

function github(path, init = {}) {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'creatures-feedback-export',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function ops(target, path, init = {}) {
  return fetch(`${BASES[target]}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${opsTokens[target]}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Creates the labels the export and Misa use, when they are missing. */
async function ensureLabels() {
  for (const label of LABELS) {
    const res = await github(
      `/repos/${GITHUB_REPOSITORY}/labels/${encodeURIComponent(label.name)}`,
    );
    if (res.ok) continue;
    if (res.status !== 404) throw new Error(`label lookup HTTP ${res.status}`);
    const made = await github(`/repos/${GITHUB_REPOSITORY}/labels`, {
      method: 'POST',
      body: JSON.stringify(label),
    });
    // 422: someone made it in the meantime.
    if (!made.ok && made.status !== 422) throw new Error(`label create HTTP ${made.status}`);
  }
}

/** Issues already made for reports ("production 12" -> issue number), from the newest 100. */
async function exportedIssues() {
  const res = await github(
    `/repos/${GITHUB_REPOSITORY}/issues?labels=player-report&state=all&sort=created&direction=desc&per_page=100`,
  );
  if (!res.ok) throw new Error(`issue list HTTP ${res.status}`);
  const found = new Map();
  for (const issue of await res.json()) {
    const marker = markerOf(issue?.body);
    // Only issues this workflow wrote count; anyone can open an issue that copies a marker.
    if (marker !== null && issue?.user?.login === 'github-actions[bot]') {
      found.set(`${marker.target} ${marker.id}`, issue.number);
    }
  }
  return found;
}

async function exportTarget(target, known) {
  const res = await ops(target, '/api/ops/feedback/pending');
  if (res.status === 404) {
    console.log(
      `::warning::${target}: the feedback endpoint answered 404. Is OPS_TOKEN set on the ${target} Worker and deployed?`,
    );
    return { made: 0, failed: 0 };
  }
  if (!res.ok) throw new Error(`${target}: pending HTTP ${res.status}`);
  const answer = await res.json();
  const list = Array.isArray(answer?.reports) ? answer.reports : [];
  let made = 0;
  let failed = 0;
  for (const raw of list) {
    const report = parseReport(raw);
    if (report === null) {
      console.log(`::warning::${target}: skipped a report that did not pass the checks.`);
      failed += 1;
      continue;
    }
    let issue = known.get(`${target} ${report.id}`);
    if (issue === undefined) {
      const created = await github(`/repos/${GITHUB_REPOSITORY}/issues`, {
        method: 'POST',
        body: JSON.stringify(issueFor(target, report)),
      });
      if (!created.ok) {
        console.log(
          `::error::${target}: creating the issue for report ${report.id}: HTTP ${created.status}`,
        );
        failed += 1;
        continue;
      }
      issue = (await created.json()).number;
      made += 1;
    }
    const marked = await ops(target, '/api/ops/feedback/exported', {
      method: 'POST',
      body: JSON.stringify({ id: report.id, issue }),
    });
    if (!marked.ok) {
      console.log(
        `::error::${target}: marking report ${report.id} as exported: HTTP ${marked.status}`,
      );
      failed += 1;
      continue;
    }
    console.log(`${target}: report ${report.id} is issue #${issue}`);
  }
  return { made, failed };
}

let failures = 0;
try {
  await ensureLabels();
  const known = await exportedIssues();
  for (const target of TARGETS) {
    if (opsTokens[target] === '') {
      console.log(
        `::warning::${target}: its token is not set in the 'reports' environment; skipping.`,
      );
      continue;
    }
    try {
      const { made, failed } = await exportTarget(target, known);
      failures += failed;
      console.log(`${target}: ${made} new issue(s).`);
    } catch (err) {
      console.log(`::error::${err instanceof Error ? err.message : 'error'}`);
      failures += 1;
    }
  }
} catch (err) {
  console.log(`::error::${err instanceof Error ? err.message : 'error'}`);
  failures += 1;
}
if (failures > 0) process.exit(1);
