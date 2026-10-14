import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { analyse } from './live-analyze';
import { parseReport } from './live-report';
import { renderLive } from './live-render';
import { repoRoot } from './scalars-cli';

// The test tsconfig has no Node types; this global exists in Node.
declare const console: { log(text: string): void; error(text: string): void };

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const defaultIo: Io = {
  out: (text) => {
    console.log(text);
  },
  err: (text) => {
    console.error(text);
  },
};

/** The balance log, relative to the repo root. */
export const LOG_FILE = 'docs/balance/log.md';

const USAGE = `Usage: pnpm analyze <report.json> [--out docs/balance]
Reads the ops report (GET /api/ops/report?format=json), writes <out>/live-YYYY-MM-DD.md and a sibling .json of derived numbers (the date is the report's "to"). The report is validated and treated as data only.`;

/** Reads the balance log under `root`, or null when it is not there. */
export function readLog(root: string): string | null {
  const path = resolve(root, LOG_FILE);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** The two output files of an analysis, as text keyed by file name. */
export function analysisFiles(
  reportText: string,
  logText: string | null,
): { name: string; markdown: string; json: string } {
  const report = parseReport(reportText);
  const analysis = analyse(report, logText);
  return {
    name: `live-${report.to}`,
    markdown: renderLive(analysis),
    json: `${JSON.stringify(analysis, null, 2)}\n`,
  };
}

/** Runs the CLI; returns the exit code. `root` is where the balance log is read from. */
export function main(
  argv: readonly string[],
  io: Io = defaultIo,
  root: string = repoRoot(),
): number {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { out: { type: 'string' }, help: { type: 'boolean' } },
      strict: true,
      allowPositionals: true,
    });
    if (values['help'] === true) {
      io.out(USAGE);
      return 0;
    }
    if (positionals.length !== 1 || positionals[0] === undefined) throw new Error(USAGE);
    const outDir = resolve(
      typeof values['out'] === 'string' ? values['out'] : resolve(root, 'docs/balance'),
    );
    const files = analysisFiles(readFileSync(resolve(positionals[0]), 'utf8'), readLog(root));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, `${files.name}.md`), files.markdown);
    writeFileSync(resolve(outDir, `${files.name}.json`), files.json);
    io.out(`wrote ${files.name}.md and ${files.name}.json in ${outDir}`);
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
