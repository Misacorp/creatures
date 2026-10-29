// Loads a TypeScript module of the lab (src/...) without a build step, for the report CLI and its worker threads.
//
// Why Vite: the workspace packages export TypeScript sources with extensionless imports, which
// Node's own type stripping cannot resolve, and `tsx` is not installed. Vite is already a
// devDependency of the repo (pinned in the catalog); its SSR module loader transforms the
// TypeScript on the fly and runs it in this process, so the code runs at native Node speed.
import { URL, fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Returns the module at `path` (`/src/cli.ts`, say) and a function that closes the loader. */
export async function loadModule(path) {
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const mod = await server.ssrLoadModule(path);
    return { mod, close: () => server.close() };
  } catch (error) {
    await server.close();
    throw error;
  }
}
