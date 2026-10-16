// Runs the raid curve study CLI (src/curve-cli.ts) without a build step, the same way journey.mjs and
// run.mjs run theirs (Vite's SSR loader transforms the TypeScript sources on the fly).
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
  const cli = await server.ssrLoadModule('/src/curve-cli.ts');
  code = cli.main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  code = 1;
} finally {
  await server.close();
}
process.exitCode = code;
