// The simulated month (phase 5 step 10, docs/design/valley/phase5-plan.md, Q61): wipes a staging valley, makes the bots, plays 28 game days
// of them through the dev tools and compares the live numbers with the lab.
//
//   VALLEY_MONTH_TOKEN=<session token> node apps/worker/scripts/valley-month.mjs staging
//   VALLEY_MONTH_TOKEN=<session token> node apps/worker/scripts/valley-month.mjs http://localhost:8787     (wrangler dev)
//   options: --out <file>      where the live report goes (default valley-live-report.json in the current directory)
//            --pace-ms <n>     wait between calls (default 1200: the per-player rate limit is a burst of 30, then one a second)
//            --seeds <n>       the lab's seeds (default 20)
//            --keep            do not wipe the valley or make bots first (continue a month already started)
//            --no-rerun        do not play the month a second time when something disagrees
//
// WHAT IT DOES TO THE SERVER: `valley-fresh` wipes EVERY player's progress in the guild (the one that owns the token too), `valley-bots` moves
// the dev clock to the next Monday and makes seven bots, 28 `valley-sim-day` calls move it a month on. Run it only on staging, only when
// Misa asks. The token is a session token of someone who manages the Discord server (the dev tools' gate); it is read from the environment,
// sent only to the host named on the command line (https staging, or an http loopback address) and never printed or written.
//
// The compare step needs the repo: `pnpm --filter @creatures/econ compare <file>`. A miss (an expected quantity outside 10% of the lab's
// median, a drawn one outside its 10th to 90th percentile over the seeds) plays the month once more on a fresh valley (phase 5 plan,
// section 4, item 3); the answer of the second month is the one that counts. Exit code 0: nothing disagrees; 1: something does; 2: unusable.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const STAGING = 'https://creatures-staging.misacorp.dev';
const DAYS = 28;
/** The dev tools this script calls: nothing else is ever requested. */
const TOOLS = new Set(['valley-fresh', 'valley-bots', 'valley-sim-day', 'valley-report']);

/** The base URL the script may talk to: staging, or an http address on this machine. Anything else is refused (never production). */
export function baseOf(arg) {
  if (arg === 'staging') return STAGING;
  let url;
  try {
    url = new URL(arg ?? '');
  } catch {
    return null;
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'http:' && loopback && url.username === '' && url.password === '') {
    return url.origin;
  }
  return null;
}

/** One dev tool call. The token goes in the header only. Returns `{ status, body }` (body null when it is not JSON). */
export async function callTool(base, token, tool, body, fetchImpl = fetch) {
  if (!TOOLS.has(tool)) throw new Error(`not a tool of the month: ${tool}`);
  const res = await fetchImpl(`${base}/api/dev/${tool}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  });
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    // Not JSON (a Cloudflare error page): the status says enough.
  }
  return { status: res.status, body: parsed };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One game day: the whole day in one call; when that fails on the server (a 5xx: the Worker's CPU limit, plan risk 4) the same day is played
 * in calls of `split` visits. A 429 waits and tries again. Returns the day's answers (one per call).
 */
export async function playDay(base, token, paceMs, log, fetchImpl = fetch, sleepImpl = sleep) {
  const answers = [];
  let maxVisits;
  for (let attempt = 0; attempt < 60; attempt++) {
    const started = Date.now();
    const res = await callTool(
      base,
      token,
      'valley-sim-day',
      maxVisits === undefined ? {} : { maxVisits },
      fetchImpl,
    );
    const took = Date.now() - started;
    if (res.status === 429) {
      await sleepImpl(2000);
      continue;
    }
    if (res.status >= 500 && maxVisits === undefined) {
      log(`  a whole day failed with ${String(res.status)}; playing it in parts of 3 visits`);
      maxVisits = 3;
      continue;
    }
    const result = res.body?.result;
    if (res.status !== 200 || result === undefined) {
      throw new Error(`valley-sim-day answered ${String(res.status)}`);
    }
    answers.push({ ...result, ms: took });
    await sleepImpl(paceMs);
    if (result.done) return answers;
  }
  throw new Error('a game day did not finish');
}

/** The lines of `econ compare` as `{ verdict, profile, day, metric, rest }`; the summary line and anything else are left out. */
export function parseCompare(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^(agree|DISAGREE|info|skipped)\s+(\S+) day (\d+) (\w+): (.*)$/.exec(line);
    if (m) out.push({ verdict: m[1], profile: m[2], day: Number(m[3]), metric: m[4], rest: m[5] });
  }
  return out;
}

/** Agreement per profile: counts, and the misses with the lab's margin as the compare command printed it. */
export function summarise(judged) {
  const byProfile = new Map();
  for (const j of judged) {
    if (j.verdict !== 'agree' && j.verdict !== 'DISAGREE') continue;
    const entry = byProfile.get(j.profile) ?? { agree: 0, disagree: 0, misses: [] };
    if (j.verdict === 'agree') entry.agree += 1;
    else {
      entry.disagree += 1;
      entry.misses.push(`day ${String(j.day)} ${j.metric}: ${j.rest}`);
    }
    byProfile.set(j.profile, entry);
  }
  return byProfile;
}

function printSummary(byProfile, log) {
  for (const [profile, e] of [...byProfile].sort((a, b) => a[0].localeCompare(b[0]))) {
    log(`${profile}: ${String(e.agree)} agree, ${String(e.disagree)} disagree`);
    for (const miss of e.misses) log(`    MISS ${miss}`);
  }
}

async function playMonth(base, token, opts, log) {
  if (!opts.keep) {
    log('valley-fresh: wiping the guild and opening a day-0 valley');
    const fresh = await callTool(base, token, 'valley-fresh', {});
    if (fresh.status !== 200) throw new Error(`valley-fresh answered ${String(fresh.status)}`);
    await sleep(opts.paceMs);
    const bots = await callTool(base, token, 'valley-bots', {});
    if (bots.status !== 200) throw new Error(`valley-bots answered ${String(bots.status)}`);
    log(
      `valley-bots: ${String(bots.body?.result?.bots?.length ?? '?')} bots, day 0 is ${new Date(bots.body?.result?.startMs ?? 0).toISOString()}`,
    );
    await sleep(opts.paceMs);
  }
  const slowest = { ms: 0, day: 0 };
  let read = 0;
  let written = 0;
  for (let day = 1; day <= DAYS; day++) {
    const answers = await playDay(base, token, opts.paceMs, log);
    const visits = answers.reduce((n, a) => n + a.visits, 0);
    const ms = answers.reduce((n, a) => n + a.ms, 0);
    const rowsRead = answers.reduce((n, a) => n + a.rows.read, 0);
    const rowsWritten = answers.reduce((n, a) => n + a.rows.written, 0);
    read += rowsRead;
    written += rowsWritten;
    if (ms > slowest.ms) {
      slowest.ms = ms;
      slowest.day = day;
    }
    log(
      `day ${String(day).padStart(2)}/${String(DAYS)}: ${String(visits)} visits in ${String(answers.length)} call(s), ${String(ms)} ms, rows read ${String(rowsRead)}, written ${String(rowsWritten)}`,
    );
  }
  log(
    `the month: rows read ${String(read)}, written ${String(written)}; slowest day ${String(slowest.day)} (${String(slowest.ms)} ms)`,
  );
  const report = await callTool(base, token, 'valley-report', {});
  if (report.status !== 200 || report.body?.result === undefined) {
    throw new Error(`valley-report answered ${String(report.status)}`);
  }
  writeFileSync(opts.out, `${JSON.stringify(report.body.result.report)}\n`);
  log(
    `live report written to ${opts.out}; declined intents: ${JSON.stringify(report.body.result.month?.declined ?? {})}`,
  );
  return report.body.result;
}

function compare(opts, log) {
  const run = spawnSync(
    'pnpm',
    ['--filter', '@creatures/econ', 'compare', opts.out, '--seeds', String(opts.seeds)],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const judged = parseCompare(run.stdout ?? '');
  if (judged.length === 0) {
    log(run.stdout ?? '');
    log(run.stderr ?? '');
    throw new Error('econ compare gave nothing to read');
  }
  const byProfile = summarise(judged);
  printSummary(byProfile, log);
  return [...byProfile.values()].every((e) => e.disagree === 0);
}

export async function main(argv, env, log = console.log) {
  const base = baseOf(argv[0]);
  const flag = (name) => {
    const at = argv.indexOf(name);
    return at < 0 ? undefined : argv[at + 1];
  };
  const token = env.VALLEY_MONTH_TOKEN ?? '';
  if (base === null || token === '') {
    console.error(
      'usage: VALLEY_MONTH_TOKEN=<session token> valley-month.mjs <staging|http://localhost:PORT> [--out file] [--pace-ms n] [--seeds n] [--keep] [--no-rerun]',
    );
    return 2;
  }
  const opts = {
    out: flag('--out') ?? 'valley-live-report.json',
    paceMs: Math.max(0, Number(flag('--pace-ms') ?? 1200)),
    seeds: Math.max(1, Number(flag('--seeds') ?? 20)),
    keep: argv.includes('--keep'),
  };
  await playMonth(base, token, opts, log);
  let ok = compare(opts, log);
  if (!ok && !argv.includes('--no-rerun')) {
    log(
      'something disagrees: playing the month once more on a fresh valley (the second month counts)',
    );
    await playMonth(base, token, { ...opts, keep: false }, log);
    ok = compare(opts, log);
  }
  return ok ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 2;
    },
  );
}
