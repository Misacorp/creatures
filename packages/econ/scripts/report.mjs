// Runs the economy lab report CLI (src/cli.ts) without a build step.
//
// Why Vite: the workspace packages export TypeScript sources with extensionless imports, which
// Node's own type stripping cannot resolve, and `tsx` is not installed. Vite is already a
// devDependency of the repo (pinned in the catalog); its SSR module loader transforms the
// TypeScript on the fly and runs it in this process, so the CLI runs at native Node speed.
/* global console */
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let code;
try {
  const cli = await server.ssrLoadModule('/src/cli.ts');
  code = cli.main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  code = 1;
} finally {
  await server.close();
}
process.exitCode = code;
